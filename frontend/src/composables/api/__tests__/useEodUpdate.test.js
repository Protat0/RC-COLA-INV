import { vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/services/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockProducts = ref([
  { product_id: 'p_rc',  product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', status: 'active', total_stock: 100, back_order: 0, loose_bottles: 8, case_size: 12 },
  { product_id: 'p_lm',  product_name: 'Mega Lemon',   flavor: 'Lemon',   pack_size: 'Mega', status: 'active', total_stock: 50,  back_order: 1, loose_bottles: 0, case_size: 12 },
  { product_id: 'p_or',  product_name: 'Mega Orange',  flavor: 'Orange',  pack_size: 'Mega', status: 'active', total_stock: 30,  back_order: 0, loose_bottles: 0, case_size: 12 },
])

vi.mock('@/composables/api/useProducts.js', () => ({
  useProducts: () => ({
    products: mockProducts,
    loading: ref(false),
    initializeProducts: vi.fn().mockResolvedValue(undefined),
  }),
}))

const mockAssortments = ref([
  {
    assortment_id: 'asrt_mega',
    name: 'Mega Assorted',
    price: 275,
    pack_size_label: 'Case of 12',
    items: [
      { product_id: 'p_rc', bottles: 4 },
      { product_id: 'p_lm', bottles: 4 },
      { product_id: 'p_or', bottles: 4 },
    ],
  },
])

vi.mock('@/composables/api/useAssortments.js', () => ({
  useAssortments: () => ({
    assortments: mockAssortments,
    loading: ref(false),
    error: ref(null),
    fetchAssortments: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { api } from '@/services/api.js'
import { useEodUpdate } from '../useEodUpdate.js'

describe('useEodUpdate — direct entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initEntries seeds every active product with zeroed direct fields', () => {
    const c = useEodUpdate()
    c.initEntries()
    expect(c.entries.value.p_rc).toEqual({ cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 })
    expect(c.entries.value.p_lm).toEqual({ cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 })
    expect(c.entries.value.p_or).toEqual({ cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 })
  })

  it('changedItems includes cases_out_total, loose_before, loose_after fields', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_rc.cases_out = 5
    c.entries.value.p_rc.loose_delta = -3
    const [item] = c.changedItems.value
    expect(item).toMatchObject({
      product_id: 'p_rc',
      cases_in: 0,
      cases_out_direct: 5,
      cases_broken: 0,
      cases_out_total: 5,
      loose_delta_direct: -3,
      loose_delta_from_assortment: 0,
      loose_delta_total: -3,
      stock_before: 100,
      stock_after: 95,
      loose_before: 8,
      loose_after: 5,
      needs_reconciliation: false,
    })
  })

  it('cases_in > 0 raises stock_after and appears in changedItems', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_lm.cases_in = 3
    const [item] = c.changedItems.value
    expect(item).toMatchObject({
      product_id: 'p_lm',
      cases_in: 3,
      cases_out_total: 0,
      stock_before: 50,
      stock_after: 53,
    })
  })

  it('needs_reconciliation flags when stock_after < 0', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_or.cases_out = 100
    const [item] = c.changedItems.value
    expect(item.stock_after).toBe(-70)
    expect(item.needs_reconciliation).toBe(true)
    expect(c.flaggedItems.value).toHaveLength(1)
  })

  it('loose_after clamps at 0 for negative loose_delta', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_rc.loose_delta = -20   // starts at 8, delta wants -20
    const [item] = c.changedItems.value
    expect(item.loose_before).toBe(8)
    expect(item.loose_delta_total).toBe(-20)
    expect(item.loose_after).toBe(0)         // clamped
  })
})

describe('useEodUpdate — assortment effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('setting assortedSales populates assortmentPreview per assortment', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.assortedSales.value = { asrt_mega: 1 }
    expect(c.assortmentPreview.value).toHaveLength(1)
    expect(c.assortmentPreview.value[0]).toMatchObject({
      assortment_id: 'asrt_mega',
      qty: 1,
    })
    expect(c.assortmentPreview.value[0].effects).toHaveLength(3)
  })

  it('assortmentEffects reflects loose-first drawdown against current loose_bottles', () => {
    // p_rc starts with loose_bottles: 8; 1 Mega sale needs 4 per flavor
    // → p_rc uses 4 from loose (no case broken)
    // → p_lm and p_or have 0 loose → each breaks 1 case, +8 loose each
    const c = useEodUpdate()
    c.initEntries()
    c.assortedSales.value = { asrt_mega: 1 }
    expect(c.assortmentEffects.value).toMatchObject({
      p_rc: { cases_broken: 0, loose_delta: -4 },
      p_lm: { cases_broken: 1, loose_delta: 8 },
      p_or: { cases_broken: 1, loose_delta: 8 },
    })
  })

  it('changedItems merges direct entries with assortment effects', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_lm.cases_in = 2   // direct in for Lemon
    c.assortedSales.value = { asrt_mega: 1 }
    const items = c.changedItems.value
    const lmItem = items.find(i => i.product_id === 'p_lm')
    expect(lmItem).toMatchObject({
      cases_in: 2,
      cases_out_direct: 0,
      cases_broken: 1,
      cases_out_total: 1,
      loose_delta_from_assortment: 8,
      stock_before: 50,
      stock_after: 51,   // 50 + 2 - 1
      loose_before: 0,
      loose_after: 8,
    })
  })

  it('assortment sale with qty 0 has no effect', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.assortedSales.value = { asrt_mega: 0 }
    expect(c.assortmentPreview.value).toEqual([])
    expect(c.assortmentEffects.value).toEqual({})
    expect(c.changedItems.value).toEqual([])
  })

  it('hasChanges is true when only assortedSales are set (no direct entries)', () => {
    const c = useEodUpdate()
    c.initEntries()
    expect(c.hasChanges.value).toBe(false)
    c.assortedSales.value = { asrt_mega: 1 }
    expect(c.hasChanges.value).toBe(true)
  })

  it('unknown assortment_id in assortedSales yields empty preview and effects (algorithm error swallowed)', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.assortedSales.value = { asrt_bogus: 1 }
    // Algorithm throws; composable swallows and returns empty result
    expect(c.assortmentPreview.value).toEqual([])
    expect(c.assortmentEffects.value).toEqual({})
    // changedItems should not include algorithm-derived rows
    expect(c.changedItems.value).toEqual([])
  })
})

describe('useEodUpdate — submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success path posts the extended payload with assorted_sales and loose_delta', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { movements: [] } } })
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_rc.cases_out = 2
    c.entries.value.p_rc.loose_delta = -1
    c.assortedSales.value = { asrt_mega: 1 }
    await c.submitEod('2026-07-13')
    expect(api.post).toHaveBeenCalledWith('/stock/eod/', expect.objectContaining({
      entry_date: '2026-07-13',
      assorted_sales: [{ assortment_id: 'asrt_mega', qty: 1 }],
      items: expect.arrayContaining([
        expect.objectContaining({
          product_id: 'p_rc',
          cases_in: 0,
          cases_out: 2,        // DIRECT ONLY — algorithm cases go via assorted_sales
          bo_delta: 0,
          loose_delta: -1,
        }),
      ]),
    }))
    expect(c.submitted.value).toBe(true)
    expect(c.error.value).toBeNull()
  })

  it('empty assortedSales sends assorted_sales: []', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } })
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_lm.cases_out = 1
    await c.submitEod('2026-07-13')
    expect(api.post.mock.calls[0][1].assorted_sales).toEqual([])
  })

  it('error path leaves submitted false and sets error', async () => {
    api.post.mockRejectedValue(new Error('boom'))
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_rc.cases_out = 1
    await expect(c.submitEod('2026-07-13')).rejects.toThrow('boom')
    expect(c.submitted.value).toBe(false)
    expect(c.error.value).toBe('boom')
  })
})

describe('useEodUpdate — resetForm', () => {
  it('clears entries, assortedSales, submitted, lastSubmission, error', () => {
    const c = useEodUpdate()
    c.initEntries()
    c.entries.value.p_rc.cases_out = 5
    c.assortedSales.value = { asrt_mega: 2 }
    c.submitted.value = true
    c.error.value = 'x'
    c.resetForm()
    expect(c.submitted.value).toBe(false)
    expect(c.error.value).toBeNull()
    expect(c.assortedSales.value).toEqual({})
    expect(c.entries.value.p_rc.cases_out).toBe(0)
  })
})

describe('useEodUpdate — instances', () => {
  it('two instances have independent state', () => {
    const a = useEodUpdate()
    const b = useEodUpdate()
    a.initEntries()
    b.initEntries()
    a.entries.value.p_rc.cases_out = 5
    a.assortedSales.value = { asrt_mega: 3 }
    expect(b.entries.value.p_rc.cases_out).toBe(0)
    expect(b.assortedSales.value).toEqual({})
  })
})
