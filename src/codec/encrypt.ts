import crypto from 'crypto'

import type { Codec } from './codec.js'

const MIN_SECRET_LEN = 16
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16
const SCRYPT_N = 1 << 15
const SCRYPT_r = 8
const SCRYPT_p = 1
const SCRYPT_OPTS = { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 256 * 1024 * 1024 } as const

/** AES payload format: fixed key + per-token IV. */
const VERSION = 2

const scrypt = (secret: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, KEY_LEN, SCRYPT_OPTS, (err, dk) => (err ? reject(err) : resolve(dk as Buffer)))
  })

const concat = (...parts: Buffer[]) => Buffer.concat(parts)

/**
 * Create a codec that encrypts and decrypts strings using AES-256-GCM.
 *
 * @param secret The secret key used for encryption and decryption. Must be at least 16 characters long.
 * @returns A codec that can encode and decode strings.
 * @throws An error if the secret is not a string or is less than 16 characters long.
 */
export const createAesCodec = (secret: string): Codec<string, string> => {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LEN) {
    throw new Error(`AES secret must be a string of at least ${MIN_SECRET_LEN} characters`)
  }

  // Fixed label salt — key is stable for the life of the codec instance.
  const fixedSalt = Buffer.from('kysely-cursor-aes-v2', 'utf8')
  // Lazy so factory stays sync; first encode/decode awaits derivation.
  let keyPromise: Promise<Buffer> | undefined
  const getKey = () => {
    keyPromise ??= scrypt(secret, fixedSalt)
    return keyPromise
  }

  return {
    encode: async (plain: string): Promise<string> => {
      const key = await getKey()
      const iv = crypto.randomBytes(IV_LEN)
      const ver = Buffer.from([VERSION])

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(ver, { plaintextLength: Buffer.byteLength(plain, 'utf8') })

      const ciphertext = concat(cipher.update(plain, 'utf8'), cipher.final())
      const tag = cipher.getAuthTag()

      return concat(ver, iv, tag, ciphertext).toString('base64')
    },

    decode: async (payload: string): Promise<string> => {
      const buf = Buffer.from(payload, 'base64')
      const HEADER = 1 + IV_LEN + TAG_LEN
      if (buf.length < HEADER) throw new Error('Invalid payload: too short')

      const ver = buf[0]
      if (ver !== VERSION) throw new Error(`Unsupported version: ${ver}`)

      const iv = buf.subarray(1, 1 + IV_LEN)
      const tag = buf.subarray(1 + IV_LEN, HEADER)
      const ciphertext = buf.subarray(HEADER)

      const key = await getKey()
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAAD(buf.subarray(0, 1), { plaintextLength: ciphertext.length })
      decipher.setAuthTag(tag)

      const plaintext = concat(decipher.update(ciphertext), decipher.final())
      return plaintext.toString('utf8')
    },
  }
}
