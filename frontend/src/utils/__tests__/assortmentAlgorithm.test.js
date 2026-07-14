import { vi } from 'vitest'
import { applyAssortedSales } from '../assortmentAlgorithm.js'

const MEGA = {
  assortment_id: 'asrt_mega',
  name: 'Mega Assorted',
  items: [
    { product_id: 'p_rc', bottles: 4 },
    { product_id: 'p_lm', bottles: 4 },
    { product_id: 'p_or', bottles: 4 },
  ],
}

const TWO_FORTY = {
  assortment_id: 'asrt_240',
  items: [
    { product_id: 'p_rc_240', bottles: 6 },
    { product_id: 'p_lm_240', bottles: 6 },
  ],
}

const PRODUCTS = [
  { product_id: 'p_rc',     case_size: 12 },
  { product_id: 'p_lm',     case_size: 12 },
  { product_id: 'p_or',     case_size: 12 },
  { product_id: 'p_rc_240', case_size: 24 },
  { product_id: 'p_lm_240', case_size: 24 },
]

describe('applyAssortedSales', () => {
  it('returns empty maps when there are no sales', () => {
    const result = applyAssortedSales({
      sales: [],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: {},
    })
    expect(result.casesBroken).toEqual({})
    expect(result.looseChanges).toEqual({})
    expect(result.breakdown).toEqual([])
  })

  it('single Mega sale with zero loose breaks 1 case per flavor and leaves 8 loose each', () => {
    const result = applyAssortedSales({
      sales: [{ assortment_id: 'asrt_mega', qty: 1 }],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: {},
    })
    expect(result.casesBroken).toEqual({ p_rc: 1, p_lm: 1, p_or: 1 })
    expect(result.looseChanges).toEqual({ p_rc: 8, p_lm: 8, p_or: 8 })
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0]).toMatchObject({
      assortment_id: 'asrt_mega',
      qty: 1,
    })
    expect(result.breakdown[0].effects).toHaveLength(3)
    expect(result.breakdown[0].effects[0]).toMatchObject({
      product_id: 'p_rc',
      bottles_needed: 4,
      from_loose: 0,
      from_cases_broken: 4,
      cases_broken: 1,
    })
  })

  it('loose-first drawdown: sale consumes existing loose without breaking cases', () => {
    const result = applyAssortedSales({
      sales: [{ assortment_id: 'asrt_mega', qty: 1 }],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: { p_rc: 8, p_lm: 8, p_or: 8 },
    })
    expect(result.casesBroken).toEqual({})
    expect(result.looseChanges).toEqual({ p_rc: -4, p_lm: -4, p_or: -4 })
    expect(result.breakdown[0].effects[0]).toMatchObject({
      product_id: 'p_rc',
      bottles_needed: 4,
      from_loose: 4,
      from_cases_broken: 0,
      cases_broken: 0,
    })
  })

  it('partial loose: draws from loose then breaks the minimum cases', () => {
    // p_rc has 2 loose, needs 4 → 2 from loose, need 2 more → break 1 case (12 bottles)
    // → 10 new loose from the broken case → net loose delta = 10 - 2 = +8
    const result = applyAssortedSales({
      sales: [{ assortment_id: 'asrt_mega', qty: 1 }],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: { p_rc: 2, p_lm: 0, p_or: 0 },
    })
    expect(result.casesBroken).toEqual({ p_rc: 1, p_lm: 1, p_or: 1 })
    expect(result.looseChanges).toEqual({ p_rc: 8, p_lm: 8, p_or: 8 })
    expect(result.breakdown[0].effects[0]).toMatchObject({
      product_id: 'p_rc',
      bottles_needed: 4,
      from_loose: 2,
      from_cases_broken: 2,
      cases_broken: 1,
    })
  })

  it('cycle boundary: 3 Mega sales from zero loose = 3 cases per flavor, zero final loose', () => {
    const result = applyAssortedSales({
      sales: [{ assortment_id: 'asrt_mega', qty: 3 }],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: {},
    })
    // qty 3 = 12 bottles per flavor → exactly 1 case (of 12) covers all 12 needed
    expect(result.casesBroken).toEqual({ p_rc: 1, p_lm: 1, p_or: 1 })
    expect(result.looseChanges).toEqual({ p_rc: 0, p_lm: 0, p_or: 0 })
  })

  it('multi-assortment sales: threads state through each sale in order', () => {
    const result = applyAssortedSales({
      sales: [
        { assortment_id: 'asrt_mega', qty: 1 },
        { assortment_id: 'asrt_240', qty: 1 },
      ],
      assortments: [MEGA, TWO_FORTY],
      products: PRODUCTS,
      initialLoose: {},
    })
    expect(result.casesBroken).toEqual({ p_rc: 1, p_lm: 1, p_or: 1, p_rc_240: 1, p_lm_240: 1 })
    expect(result.looseChanges).toEqual({
      p_rc: 8, p_lm: 8, p_or: 8, p_rc_240: 18, p_lm_240: 18,
    })
    expect(result.breakdown).toHaveLength(2)
    expect(result.breakdown[0].assortment_id).toBe('asrt_mega')
    expect(result.breakdown[1].assortment_id).toBe('asrt_240')
  })

  it('skips sales with qty <= 0', () => {
    const result = applyAssortedSales({
      sales: [
        { assortment_id: 'asrt_mega', qty: 0 },
        { assortment_id: 'asrt_mega', qty: -3 },
      ],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose: {},
    })
    expect(result.casesBroken).toEqual({})
    expect(result.looseChanges).toEqual({})
    expect(result.breakdown).toEqual([])
  })

  it('throws when a sale references an unknown assortment_id', () => {
    expect(() =>
      applyAssortedSales({
        sales: [{ assortment_id: 'asrt_missing', qty: 1 }],
        assortments: [MEGA],
        products: PRODUCTS,
        initialLoose: {},
      })
    ).toThrow(/asrt_missing/)
  })

  it('throws when an assortment item references an unknown product_id', () => {
    const badAssortment = {
      assortment_id: 'asrt_bad',
      items: [{ product_id: 'p_missing', bottles: 4 }],
    }
    expect(() =>
      applyAssortedSales({
        sales: [{ assortment_id: 'asrt_bad', qty: 1 }],
        assortments: [badAssortment],
        products: PRODUCTS,
        initialLoose: {},
      })
    ).toThrow(/p_missing/)
  })

  it('does not mutate initialLoose', () => {
    const initialLoose = { p_rc: 8, p_lm: 8, p_or: 8 }
    const snapshot = { ...initialLoose }
    applyAssortedSales({
      sales: [{ assortment_id: 'asrt_mega', qty: 2 }],
      assortments: [MEGA],
      products: PRODUCTS,
      initialLoose,
    })
    expect(initialLoose).toEqual(snapshot)
  })
})
