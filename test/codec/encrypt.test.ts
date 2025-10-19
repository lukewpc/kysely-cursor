import { describe, expect, it } from 'vitest'

import { createAesCodec } from '~/codec/encrypt.js'

describe('createAesCodec (AES-256-GCM)', () => {
  it('roundtrips plaintext with the same secret', async () => {
    const codec = createAesCodec('secret')
    const input = 'hello 世界'
    const encrypted = await codec.encode(input)
    expect(typeof encrypted).toBe('string')
    expect(encrypted).not.toBe(input)
    const decrypted = await codec.decode(encrypted)
    expect(decrypted).toBe(input)
  })

  it('produces different ciphertext for the same input (random salt/iv)', async () => {
    const codec = createAesCodec('secret')
    const input = 'same input'
    const e1 = await codec.encode(input)
    const e2 = await codec.encode(input)
    expect(e1).not.toBe(e2)
  })

  it('rejects decode with a wrong secret', async () => {
    const codec1 = createAesCodec('secret-1')
    const codec2 = createAesCodec('secret-2')
    const payload = await codec1.encode('top-secret')
    await expect(codec2.decode(payload)).rejects.toThrow()
  })

  it('rejects unsupported version in payload', async () => {
    const codec = createAesCodec('secret')
    const headerOnly = Buffer.alloc(1 + 16 + 12 + 16) // ver + salt + iv + tag
    headerOnly.writeUInt8(0, 0) // unsupported version 0
    const payload = headerOnly.toString('base64')
    await expect(codec.decode(payload)).rejects.toThrow(/Unsupported version/)
  })

  it('rejects payload that is too short', async () => {
    const codec = createAesCodec('secret')
    const tooShort = Buffer.alloc(10).toString('base64')
    await expect(codec.decode(tooShort)).rejects.toThrow(/Invalid payload: too short/)
  })
})
