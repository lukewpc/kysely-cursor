import { type Stash, stashCodec } from '~/codec/stash.js'

describe('stashCodec', () => {
  it('stores value and returns a uuid key, then retrieves by key', async () => {
    const storage = new Map<string, string>()
    const stash: Stash = {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => {
        storage.set(key, value)
      },
    }

    const codec = stashCodec(stash)
    const key = await codec.encode('very-secret')
    expect(typeof key).toBe('string')
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(storage.get(key)).toBe('very-secret')

    const value = await codec.decode(key)
    expect(value).toBe('very-secret')
  })

  it('rejects when decoding an unknown key (null from get)', async () => {
    const storage = new Map<string, string>()
    const stash: Stash = {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => {
        storage.set(key, value)
      },
    }
    const codec = stashCodec(stash)
    await expect(codec.decode('00000000-0000-4000-8000-000000000000')).rejects.toThrow(/not found/i)
  })

  it('rejects when get returns undefined', async () => {
    const stash: Stash = {
      get: async () => undefined,
      set: async () => {},
    }
    const codec = stashCodec(stash)
    await expect(codec.decode('any-key')).rejects.toThrow(/not found/i)
  })
})
