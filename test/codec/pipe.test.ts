import { base64UrlCodec } from '~/codec/base64Url.js'
import { type Codec, codecPipe } from '~/codec/codec.js'
import { createAesCodec } from '~/codec/encrypt.js'
import { type Stash, stashCodec } from '~/codec/stash.js'
import { superJsonCodec } from '~/codec/superJson.js'

describe('codecPipe', () => {
  it('runs encode left-to-right and decode right-to-left', async () => {
    const steps: string[] = []

    const makeCodec = (id: string): Codec<string, string> => ({
      encode: (v) => {
        steps.push(`enc-${id}`)
        return v + id
      },
      decode: (v) => {
        steps.push(`dec-${id}`)
        return v.slice(0, -id.length)
      },
    })

    const pipe = codecPipe(makeCodec('A'), makeCodec('B'), makeCodec('C'))
    const enc = await pipe.encode('X')
    expect(enc).toBe('XABC')
    const dec = await pipe.decode(enc)
    expect(dec).toBe('X')
    expect(steps).toEqual(['enc-A', 'enc-B', 'enc-C', 'dec-C', 'dec-B', 'dec-A'])
  })

  it('supports mixing sync and async codecs', async () => {
    const codec1: Codec<string, string> = {
      encode: (v) => v + '1',
      decode: (v) => v.slice(0, -1),
    }
    const codec2: Codec<string, string> = {
      encode: async (v) => v + '2',
      decode: async (v) => v.slice(0, -1),
    }
    const codec3: Codec<string, string> = {
      encode: (v) => v + '3',
      decode: (v) => v.slice(0, -1),
    }

    const pipe = codecPipe(codec1, codec2, codec3)
    const out = await pipe.encode('X')
    expect(out).toBe('X123')
    const back = await pipe.decode(out)
    expect(back).toBe('X')
  })

  it('propagates errors from encode', async () => {
    const ok: Codec<string, string> = {
      encode: (v) => v + 'ok',
      decode: (v) => v.slice(0, -2),
    }
    const boom: Codec<string, string> = {
      encode: () => {
        throw new Error('boom')
      },
      decode: (v) => v,
    }
    const pipe = codecPipe(ok, boom)
    await expect(pipe.encode('x')).rejects.toThrow('boom')
  })

  it('propagates errors from decode', async () => {
    const pass: Codec<string, string> = { encode: (v) => v, decode: (v) => v }
    const bad: Codec<string, string> = {
      encode: (v) => v,
      decode: () => {
        throw new Error('decode-fail')
      },
    }
    const pipe = codecPipe(pass, bad)
    await expect(pipe.decode('anything')).rejects.toThrow('decode-fail')
  })

  it('works end-to-end with real codecs (superjson -> base64 -> aes -> stash)', async () => {
    const storage = new Map<string, string>()
    const stash: Stash = {
      get: async (key) => {
        const v = storage.get(key)
        if (v === undefined) throw new Error('not found')
        return v
      },
      set: async (key, value) => {
        storage.set(key, value)
      },
    }

    const pipe = codecPipe(superJsonCodec, base64UrlCodec, createAesCodec('super-secret'), stashCodec(stash))
    const data = {
      data: new Date('2024-01-01T00:00:00.000Z'),
      name: 'Alice',
      n: 42n,
    }
    const encoded = await pipe.encode(data)
    const decoded = await pipe.decode(encoded)
    expect(decoded).toEqual(data)
  })
})
