import { createAesCodec } from '~/codec/encrypt.js'

const SECRET = 'test-secret-16ch' // ≥ 16 chars
const SECRET_ALT = 'other-secret-16c'

describe('createAesCodec (AES-256-GCM)', () => {
  it('rejects empty or short secrets', () => {
    expect(() => createAesCodec('')).toThrow(/at least 16/)
    expect(() => createAesCodec('short')).toThrow(/at least 16/)
  })

  it('roundtrips plaintext with the same secret', async () => {
    const codec = createAesCodec(SECRET)
    const input = 'hello 世界'
    const encrypted = await codec.encode(input)
    expect(typeof encrypted).toBe('string')
    expect(encrypted).not.toBe(input)
    const decrypted = await codec.decode(encrypted)
    expect(decrypted).toBe(input)
  })

  it('produces different ciphertext for the same input (random iv)', async () => {
    const codec = createAesCodec(SECRET)
    const input = 'same input'
    const e1 = await codec.encode(input)
    const e2 = await codec.encode(input)
    expect(e1).not.toBe(e2)
  })

  it('writes version byte 2', async () => {
    const codec = createAesCodec(SECRET)
    const payload = Buffer.from(await codec.encode('x'), 'base64')
    expect(payload[0]).toBe(2)
  })

  it('rejects decode with a wrong secret', async () => {
    const codec1 = createAesCodec(SECRET)
    const codec2 = createAesCodec(SECRET_ALT)
    const payload = await codec1.encode('top-secret')
    await expect(codec2.decode(payload)).rejects.toThrow()
  })

  it('rejects unsupported version in payload (including legacy v1)', async () => {
    const codec = createAesCodec(SECRET)
    const headerOnly = Buffer.alloc(1 + 12 + 16) // ver + iv + tag
    headerOnly.writeUInt8(0, 0)
    await expect(codec.decode(headerOnly.toString('base64'))).rejects.toThrow(/Unsupported version/)

    headerOnly.writeUInt8(1, 0) // legacy per-token-scrypt format
    await expect(codec.decode(headerOnly.toString('base64'))).rejects.toThrow(/Unsupported version/)
  })

  it('rejects payload that is too short', async () => {
    const codec = createAesCodec(SECRET)
    const tooShort = Buffer.alloc(10)
    tooShort.writeUInt8(2, 0)
    await expect(codec.decode(tooShort.toString('base64'))).rejects.toThrow(/Invalid payload: too short/)
  })
})
