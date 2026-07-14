import { vi } from 'vitest'

vi.mock('@/services/api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/services/api.js'
import { useAssortments } from '../useAssortments.js'

describe('useAssortments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes assortments, loading, error refs and a fetchAssortments method', () => {
    const c = useAssortments()
    expect(c.assortments.value).toEqual([])
    expect(c.loading.value).toBe(false)
    expect(c.error.value).toBeNull()
    expect(typeof c.fetchAssortments).toBe('function')
  })

  it('fetchAssortments calls GET /assortments/ and populates assortments', async () => {
    const seed = [
      { assortment_id: 'asrt_a', name: 'A', price: 10, pack_size_label: 'x', items: [] },
    ]
    api.get.mockResolvedValue({ data: { success: true, data: seed } })
    const c = useAssortments()
    await c.fetchAssortments()
    expect(api.get).toHaveBeenCalledWith('/assortments/')
    expect(c.assortments.value).toEqual(seed)
    expect(c.error.value).toBeNull()
    expect(c.loading.value).toBe(false)
  })

  it('sets error on rejection and leaves assortments empty', async () => {
    api.get.mockRejectedValue(new Error('network down'))
    const c = useAssortments()
    await expect(c.fetchAssortments()).rejects.toThrow('network down')
    expect(c.error.value).toBe('network down')
    expect(c.assortments.value).toEqual([])
  })

  it('two instances have independent state', async () => {
    const a = useAssortments()
    const b = useAssortments()
    a.assortments.value = [{ assortment_id: 'x' }]
    expect(b.assortments.value).toEqual([])
  })
})
