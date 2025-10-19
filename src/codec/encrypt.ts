import crypto from 'crypto'

import type { Codec } from './codec.js'

/**
 * AES-256-GCM string codec using scrypt-derived keys.
 *
 * ## Usage
 * ```ts
 * const codec = createAesCodec(process.env.SECRET!);
 *
 * const encrypted = await codec.encode("hello");
 * const decrypted = await codec.decode(encrypted);
 * ```
 *
 * ## Notes
 * - Uses `scrypt` (N=2^15, r=8, p=1) to derive a 256-bit key from `secret` + random 16-byte salt.
 * - Encrypts with random 12-byte IV and includes a 16-byte auth tag.
 * - Payload = Base64 of `[1-byte ver][salt][iv][tag][ciphertext]`.
 * - Tampering or wrong secret throws on decode.
 * - Works in Node.js with built-in `crypto`.
 *
 * @param secret - The secret key to use for the codec.
 * @returns The codec.
 */
export const createAesCodec = (secret: string): Codec<string, string> => {
  const VERSION = Buffer.from([1])
  const SALT_LEN = 16
  const IV_LEN = 12
  const TAG_LEN = 16
  const KEY_LEN = 32
  const SCRYPT_N = 1 << 15,
    SCRYPT_r = 8,
    SCRYPT_p = 1

  const kdf = (salt: Buffer) =>
    new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(
        secret,
        salt,
        KEY_LEN,
        { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 256 * 1024 * 1024 },
        (err, dk) => (err ? reject(err) : resolve(dk as Buffer)),
      )
    })

  const concat = (...parts: Buffer[]) => Buffer.concat(parts)

  return {
    encode: async (plain: string): Promise<string> => {
      const salt = crypto.randomBytes(SALT_LEN)
      const key = await kdf(salt)
      const iv = crypto.randomBytes(IV_LEN)

      try {
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
        const aad = concat(VERSION, salt)

        cipher.setAAD(aad, {
          plaintextLength: Buffer.byteLength(plain, 'utf8'),
        })

        const ciphertext = concat(cipher.update(plain, 'utf8'), cipher.final())
        const tag = cipher.getAuthTag()

        return concat(VERSION, salt, iv, tag, ciphertext).toString('base64')
      } finally {
        key.fill(0)
      }
    },

    decode: async (payload: string): Promise<string> => {
      const buf = Buffer.from(payload, 'base64')
      const HEADER = 1 + SALT_LEN + IV_LEN + TAG_LEN
      if (buf.length < HEADER) throw new Error('Invalid payload: too short')

      const ver = buf.subarray(0, 1)
      if (ver[0] !== 1) throw new Error(`Unsupported version: ${ver[0]}`)

      const salt = buf.subarray(1, 1 + SALT_LEN)
      const iv = buf.subarray(1 + SALT_LEN, 1 + SALT_LEN + IV_LEN)
      const tag = buf.subarray(1 + SALT_LEN + IV_LEN, HEADER)
      const ciphertext = buf.subarray(HEADER)

      const key = await kdf(salt)
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        const aad = concat(ver, salt)

        decipher.setAAD(aad, { plaintextLength: ciphertext.length })
        decipher.setAuthTag(tag)

        const plaintext = concat(decipher.update(ciphertext), decipher.final())
        return plaintext.toString('utf8')
      } finally {
        key.fill(0)
      }
    },
  }
}
