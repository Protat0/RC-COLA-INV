import { vi } from 'vitest'
import { ref } from 'vue'
import { api } from '@/services/api.js'

vi.mock('@/services/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

const MOCK_ACTIVE = [
  { product_id: 'prod_a', product_name: 'A', status: 'active', total_stock: 100, back_order: 0 },
  { product_id: 'prod_b', product_name: 'B', status: 'active', total_stock: 50,  back_order: 2 },
]
const MOCK_INACTIVE = { product_id: 'prod_c', product_name: 'C', status: 'inactive', total_stock: 10, back_order: 0 }

vi.mock('../useProducts.js', () => ({
  useProducts: vi.fn(() => ({
    products: ref([...MOCK_ACTIVE, MOCK_INACTIVE]),
    loading: ref(false),
    initializeProducts: vi.fn(),
  })),
}))

import { useEodUpdate } from '../useEodUpdate.js'

describe('useEodUpdate', () => {
  it('initEntries creates {cases_in, cases_out, bo_delta} for active products only', () => {
    const { entries, initEntries } = useEodUpdate()
    initEntries()
    expect(Object.keys(entries.value)).toHaveLength(2)
    expect(entries.value['prod_a']).toEqual({ cases_in: 0, cases_out: 0, bo_delta: 0 })
    expect(entries.value['prod_b']).toEqual({ cases_in: 0, cases_out: 0, bo_delta: 0 })
    expect(entries.value['prod_c']).toBeUndefined()
  })

  it('changedItems empty initially', () => {
    const { changedItems, initEntries } = useEodUpdate()
    initEntries()
    expect(changedItems.value).toHaveLength(0)
  })

  it('changedItems includes product when cases_in > 0', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_a'].cases_in = 20
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0]).toMatchObject({
      product_id: 'prod_a',
      cases_in: 20,
      cases_out: 0,
      bo_delta: 0,
      stock_before: 100,
      stock_after: 120,
      needs_reconciliation: false,
    })
  })

  it('changedItems includes product when cases_out > 0', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_a'].cases_out = 10
    expect(changedItems.value[0]).toMatchObject({
      product_id: 'prod_a',
      cases_out: 10,
      stock_before: 100,
      stock_after: 90,
      needs_reconciliation: false,
    })
  })

  it('changedItems includes product when bo_delta != 0 even if stock unchanged', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_b'].bo_delta = 1
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0].product_id).toBe('prod_b')
    expect(changedItems.value[0].bo_delta).toBe(1)
  })

  it('stock_after combines cases_in and cases_out correctly', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_a'].cases_in = 30
    entries.value['prod_a'].cases_out = 8
    expect(changedItems.value[0].stock_after).toBe(122)  // 100 + 30 - 8
  })

  it('needs_reconciliation true when stock_after < 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_a'].cases_out = 150  // stock is 100
    expect(changedItems.value[0].needs_reconciliation).toBe(true)
    expect(changedItems.value[0].stock_after).toBe(-50)
    expect(flaggedItems.value).toHaveLength(1)
  })

  it('needs_reconciliation false when stock_after === 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_a'].cases_out = 100
    expect(changedItems.value[0].needs_reconciliation).toBe(false)
    expect(flaggedItems.value).toHaveLength(0)
  })

  it('hasChanges reflects entries state', () => {
    const { entries, hasChanges, initEntries } = useEodUpdate()
    initEntries()
    expect(hasChanges.value).toBe(false)
    entries.value['prod_b'].cases_in = 5
    expect(hasChanges.value).toBe(true)
  })

  describe('submitEod', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('success path: posts correct payload, sets submitted and lastSubmission, clears error', async () => {
      const mockResponseData = { id: 1, entry_date: '2026-07-10', items: [] }
      api.post.mockResolvedValue({ data: { data: mockResponseData } })

      const { entries, submitted, lastSubmission, error, submitEod, initEntries } = useEodUpdate()
      initEntries()
      entries.value['prod_a'].cases_in = 5

      await submitEod('2026-07-10')

      expect(api.post).toHaveBeenCalledWith('/stock/eod/', {
        entry_date: '2026-07-10',
        items: [
          { product_id: 'prod_a', cases_in: 5, cases_out: 0, bo_delta: 0 },
        ],
      })
      expect(submitted.value).toBe(true)
      expect(lastSubmission.value).toEqual(mockResponseData)
      expect(error.value).toBeNull()
    })

    it('error path: api.post rejects, sets error, submitted stays false, lastSubmission stays null', async () => {
      api.post.mockRejectedValue(new Error('Network error'))

      const { submitted, lastSubmission, error, submitEod, initEntries } = useEodUpdate()
      initEntries()

      await expect(submitEod('2026-07-10')).rejects.toThrow('Network error')

      expect(submitted.value).toBe(false)
      expect(lastSubmission.value).toBeNull()
      expect(error.value).not.toBeNull()
    })

    it('empty entries path: submitEod sends items: [] when no non-zero entries', async () => {
      api.post.mockResolvedValue({ data: { data: {} } })

      const { submitEod, initEntries } = useEodUpdate()
      initEntries()

      await submitEod('2026-07-10')

      expect(api.post).toHaveBeenCalledWith('/stock/eod/', {
        entry_date: '2026-07-10',
        items: [],
      })
    })
  })

  it('per-instance state isolation: mutating a does not affect b', () => {
    const a = useEodUpdate()
    const b = useEodUpdate()
    a.initEntries()
    b.initEntries()

    a.entries.value['prod_a'].cases_out = 5

    expect(b.entries.value['prod_a'].cases_out).toBe(0)
    expect(a.changedItems.value.length).toBe(1)
    expect(b.changedItems.value.length).toBe(0)
  })
})
