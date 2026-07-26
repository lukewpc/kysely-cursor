import { base64UrlCodec } from '~/codec/base64Url.js'

describe('base64UrlCodec', () => {
  it('encodes a known string to base64url (no padding)', async () => {
    expect(await base64UrlCodec.encode('hello')).toBe('aGVsbG8')
  })

  it('decodes a known base64url string', async () => {
    expect(await base64UrlCodec.decode('aGVsbG8')).toBe('hello')
  })

  it('roundtrips unicode strings', async () => {
    const input = 'こんにちは 世界 🌍'
    const encoded = await base64UrlCodec.encode(input)
    const decoded = await base64UrlCodec.decode(encoded)
    expect(decoded).toBe(input)
  })

  it('rejects empty string on decode', () => {
    expect(() => base64UrlCodec.decode('')).toThrow(/Invalid base64url/)
  })

  it('rejects non-base64url characters (padding, +/)', () => {
    expect(() => base64UrlCodec.decode('aGVsbG8=')).toThrow(/Invalid base64url/)
    expect(() => base64UrlCodec.decode('aG+/')).toThrow(/Invalid base64url/)
  })
})
