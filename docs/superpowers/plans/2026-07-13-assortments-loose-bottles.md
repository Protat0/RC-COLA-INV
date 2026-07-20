# Assortments & Loose Bottles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back per-product loose bottle tracking and add a first-class "assorted sales" workflow — the distributor sells mixed-flavor packages (Mega Assorted, 240mL Assorted, etc.), and every such sale draws less than a full case per flavor, so leftover bottles accumulate as loose. An algorithm auto-computes cases-broken and loose-generated per assortment sale, with a loose-first drawdown so subsequent assortment sales consume the pool before breaking more cases.

**Architecture:** `loose_bottles: number` returns as a per-product scalar on `MOCK_PRODUCTS` (not tracked in the movements log — cases remain the trade unit for the event log). A new pure function `applyAssortedSales` in `frontend/src/utils/assortmentAlgorithm.js` takes `{ sales, assortments, products, initialLoose }` and returns per-product `casesBroken` and `looseChanges` plus a human-readable breakdown. The interceptor's POST `/stock/eod/` accepts a new `assorted_sales` array alongside `items`, runs the algorithm, generates `type: 'out'` movements tagged with an "Assortment fulfillment" note, mutates `product.loose_bottles`, and merges algorithm-derived cases_out with user-entered cases_out for stock accounting. The EOD Update page gets a new "Assorted Sales" section and a `loose_delta` input on each product row (for manual adjustments like breakage). Products page shows loose totals; Stock History shows current loose count per product.

**Tech Stack:** Vue 3 Options API with `setup()` function, Axios mock interceptor, Bootstrap 5, global CSS variables, Lucide Vue icons, Vitest + @vue/test-utils.

## Global Constraints

- Vue 3 Options API with `setup()` function returning all reactive state and methods — match the exact pattern in `frontend/src/pages/inventory/Products.vue`
- Tests: `shallowMount` with `global: { stubs: { Teleport: true } }`; Vitest globals are enabled (`globals: true` in `vitest.config.js`) — do NOT import `describe`, `it`, `expect`, `beforeEach` from `'vitest'`. Only `vi` needs to be imported.
- All colors via CSS variables only — never hardcoded hex. Use `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-accent`, `--text-inverse`, `--border-primary`, `--surface-card`, `--surface-secondary`, `--surface-elevated`, `--surface-tertiary`, `--status-warning`, `--status-warning-bg`, `--status-error`, `--status-success`, `--state-hover`
- Buttons use global semantic classes: `btn-add` (green), `btn-filter` (neutral), `btn-cancel`, `btn-submit` (blue), `btn-delete`. Rectangular shape via `border-radius: 0.3rem !important`
- **Cases are the trade unit; loose bottles are per-product state.** `total_stock` is measured in cases. `loose_bottles` is measured in bottles. `case_size` is bottles-per-case.
- **Assortment schema (exact):**
  ```ts
  {
    assortment_id: string,        // 'asrt_mega'
    name: string,                 // 'Mega Assorted'
    price: number,                // current price in ₱
    original_price?: number,      // crossed-out original if on promo; undefined otherwise
    pack_size_label: string,      // 'Case of 12' | 'Pack of 6' | ...
    items: [                      // composition — equal split assumed for the seed data
      { product_id: string, bottles: number }
    ],
  }
  ```
- **Product schema addition:** every `MOCK_PRODUCTS` entry gets `loose_bottles: number` (default 0)
- **Movement schema (unchanged from prior plan):** `{ movement_id, product_id, date, type: 'in'|'out'|'adjustment', quantity (positive), adjustment_direction?: 'increase'|'decrease', note: string|null, created_at }` — assortment-derived cases_out movements MUST have `note: 'Assortment fulfillment: <qty> × <name>'`
- **Algorithm signature (exact):**
  ```ts
  applyAssortedSales({
    sales:       [{ assortment_id: string, qty: number }],
    assortments: [{ assortment_id, items: [{ product_id, bottles }] }],
    products:    [{ product_id, case_size, ... }],
    initialLoose:{ [product_id: string]: number },
  }): {
    casesBroken:  { [product_id: string]: number },  // cases to break per product
    looseChanges: { [product_id: string]: number },  // delta from initialLoose per product
    breakdown:    [{                                  // audit trail — one entry per sale
      assortment_id: string,
      qty: number,
      effects: [{
        product_id: string,
        bottles_needed: number,
        from_loose: number,
        from_cases_broken: number,
        cases_broken: number,
      }],
    }],
  }
  ```
  Algorithm rules: loose-first drawdown per product across sales in order; `cases_needed = Math.ceil((bottles_needed - available_loose) / case_size)`; `new_loose = cases_needed * case_size - (bottles_needed - available_loose)`. Throw `Error` if any `sale.assortment_id` is unknown or any assortment's `item.product_id` is not in `products`. `sale.qty <= 0` sales are skipped silently.
- **EOD payload shape (extended):**
  ```ts
  {
    entry_date: string,
    items: [{ product_id, cases_in: number, cases_out: number, bo_delta: number, loose_delta: number }],
    assorted_sales: [{ assortment_id: string, qty: number }],
  }
  ```
  Where `loose_delta` is the user's manual adjustment to `loose_bottles` (positive = adds, negative = subtracts). `assorted_sales` MAY be omitted or empty.
- **Preview item shape (extended, exact):**
  ```ts
  {
    product_id, product_name, flavor, pack_size,
    cases_in, cases_out_direct, cases_broken, cases_out_total,
    bo_delta,
    loose_delta_direct, loose_delta_from_assortment, loose_delta_total,
    stock_before, stock_after,
    loose_before, loose_after,
    needs_reconciliation,  // stock_after < 0
  }
  ```
- **Route paths unchanged:** `/stock/eod`, `/stock/history`, `/products`
- **Sidebar unchanged**

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/data/mockData.js` | Modify | Add `loose_bottles` to every product; add 3 new Qute SKUs; flip EJ products to `active` with seed stock; export `MOCK_ASSORTMENTS` |
| `frontend/src/utils/assortmentAlgorithm.js` | Create | Pure `applyAssortedSales` function |
| `frontend/src/utils/__tests__/assortmentAlgorithm.test.js` | Create | Unit tests for algorithm |
| `frontend/src/services/mockInterceptor.js` | Modify | Add GET `/assortments/` handler; extend POST `/stock/eod/` to run algorithm and mutate `loose_bottles` |
| `frontend/src/composables/api/useAssortments.js` | Create | Composable to fetch assortments |
| `frontend/src/composables/api/__tests__/useAssortments.test.js` | Create | Unit tests |
| `frontend/src/composables/api/useEodUpdate.js` | Modify | Add `assortedSales` ref, `loose_delta` in entries, `assortmentEffects` + `assortmentPreview` computeds, extended `changedItems` shape, extended `submitEod` payload |
| `frontend/src/composables/api/__tests__/useEodUpdate.test.js` | Modify | Cover new refs, preview, and submit payload |
| `frontend/src/pages/stock/EodUpdate.vue` | Modify | Add "Assorted Sales" section on entry step; add `loose_delta` input to each product row; update preview step with loose changes and assortment breakdown |
| `frontend/src/pages/stock/__tests__/EodUpdate.test.js` | Modify | Cover new section + inputs |
| `frontend/src/pages/inventory/Products.vue` | Modify | Add "Loose btls" column to table; replace "Total" stat card with "Loose Bottles" |
| `frontend/src/pages/stock/StockHistory.vue` | Modify | Add "Loose" column (current count) right after product name |
| `frontend/src/pages/stock/__tests__/StockHistory.test.js` | Modify | Cover new column |

---

## Task 1: Data foundation — loose_bottles, missing SKUs, MOCK_ASSORTMENTS

**Files:**
- Modify: `frontend/src/data/mockData.js`

**Interfaces:**
- Produces: every `MOCK_PRODUCTS` entry has `loose_bottles: number`
- Produces: 3 new active Qute SKUs — `prod_lm_qute`, `prod_or_qute`, `prod_se_qute`
- Produces: EJ products (`prod_ej_fruit`, `prod_ej_berries`, `prod_ej_citrus`) with `status: 'active'` and non-zero seed stock
- Produces: `MOCK_ASSORTMENTS` exported array with 6 entries

- [ ] **Step 1: Add `loose_bottles: 0` field to every existing `MOCK_PRODUCTS` entry**

For each of the 20 existing product rows in `frontend/src/data/mockData.js`, insert `loose_bottles: 0,` immediately after `back_order: N,` (before `case_size: N`). Seed non-zero starting loose for the three Mega SKUs (residual from prior assorted sales) so the UI has visible data:

- `prod_rc_mega`: `loose_bottles: 8`
- `prod_lm_mega`: `loose_bottles: 8`
- `prod_or_mega`: `loose_bottles: 8`
- All 17 others: `loose_bottles: 0`

- [ ] **Step 2: Add 3 new Qute 237mL SKUs (Lemon, Orange, Seetrus)**

Insert immediately after `prod_rc_qute` (the existing RC Cola Qute row):

```js
  { product_id: 'prod_lm_qute',    product_name: 'Qute 237mL Lemon',   SKU: 'LM-QUTE',    flavor: 'Lemon',   pack_size: 'Qute 237mL',  status: 'active',   total_stock: 40,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_or_qute',    product_name: 'Qute 237mL Orange',  SKU: 'OR-QUTE',    flavor: 'Orange',  pack_size: 'Qute 237mL',  status: 'active',   total_stock: 35,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_se_qute',    product_name: 'Qute 237mL Seetrus', SKU: 'SE-QUTE',    flavor: 'Seetrus', pack_size: 'Qute 237mL',  status: 'active',   total_stock: 15,  low_stock_threshold: 10, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
```

- [ ] **Step 3: Activate EJ products and give them seed stock**

Change the three EJ rows (`prod_ej_fruit`, `prod_ej_berries`, `prod_ej_citrus`):
- `status: 'inactive'` → `status: 'active'`
- `total_stock: 0` → `total_stock: 24` (for each)
- `low_stock_threshold: 5` → `low_stock_threshold: 8` (for each)

`loose_bottles: 0` and `case_size: 12` stay as they are.

- [ ] **Step 4: Add `MOCK_ASSORTMENTS` export**

Append at the bottom of `mockData.js`, after `MOCK_STOCK_MOVEMENTS`:

```js
export const MOCK_ASSORTMENTS = [
  {
    assortment_id: 'asrt_mega',
    name: 'Mega Assorted',
    price: 275,
    original_price: 280,
    pack_size_label: 'Case of 12',
    items: [
      { product_id: 'prod_rc_mega', bottles: 4 },
      { product_id: 'prod_lm_mega', bottles: 4 },
      { product_id: 'prod_or_mega', bottles: 4 },
    ],
  },
  {
    assortment_id: 'asrt_240',
    name: '240mL Assorted',
    price: 199,
    original_price: 204,
    pack_size_label: 'Case of 24',
    items: [
      { product_id: 'prod_rc_240', bottles: 6 },
      { product_id: 'prod_lm_240', bottles: 6 },
      { product_id: 'prod_or_240', bottles: 6 },
      { product_id: 'prod_se_240', bottles: 6 },
    ],
  },
  {
    assortment_id: 'asrt_litro',
    name: 'Litro Assorted',
    price: 211,
    pack_size_label: 'Pack of 6',
    items: [
      { product_id: 'prod_rc_litro', bottles: 2 },
      { product_id: 'prod_lm_litro', bottles: 2 },
      { product_id: 'prod_or_litro', bottles: 2 },
    ],
  },
  {
    assortment_id: 'asrt_15l',
    name: '1.5L Assorted',
    price: 322,
    pack_size_label: 'Pack of 6',
    items: [
      { product_id: 'prod_rc_15l', bottles: 2 },
      { product_id: 'prod_lm_15l', bottles: 2 },
      { product_id: 'prod_or_15l', bottles: 2 },
    ],
  },
  {
    assortment_id: 'asrt_qute',
    name: 'Qute 237mL Assorted',
    price: 150,
    pack_size_label: 'Pack of 12',
    items: [
      { product_id: 'prod_rc_qute', bottles: 3 },
      { product_id: 'prod_lm_qute', bottles: 3 },
      { product_id: 'prod_or_qute', bottles: 3 },
      { product_id: 'prod_se_qute', bottles: 3 },
    ],
  },
  {
    assortment_id: 'asrt_ej',
    name: 'EJ 237mL Assorted',
    price: 171,
    pack_size_label: 'Pack of 12',
    items: [
      { product_id: 'prod_ej_fruit',   bottles: 4 },
      { product_id: 'prod_ej_berries', bottles: 4 },
      { product_id: 'prod_ej_citrus',  bottles: 4 },
    ],
  },
]
```

- [ ] **Step 5: Verify manually**

Re-read `mockData.js` and confirm:
1. All 23 products (20 original + 3 new Qute) have `loose_bottles` field.
2. Three Mega SKUs have `loose_bottles: 8`; all 20 others have `loose_bottles: 0`.
3. Three new Qute SKUs exist with `status: 'active'`.
4. Three EJ SKUs have `status: 'active'` and `total_stock: 24`.
5. `MOCK_ASSORTMENTS` has exactly 6 entries; every `product_id` inside `items` matches an existing `MOCK_PRODUCTS.product_id`.
6. Assortments 1 and 2 have `original_price`; assortments 3–6 do not (no promo).

Cross-check by running:
```bash
cd frontend && grep -c "product_id: " src/data/mockData.js
```
Expected: `23` (products) + `26` (assortment items: 3+4+3+3+4+3+1 from movement seed data... wait, MOCK_STOCK_MOVEMENTS also has product_id).

Better: grep the file for a specific known ID:
```bash
grep -c "prod_lm_qute" src/data/mockData.js
```
Expected: `2` — one in `MOCK_PRODUCTS`, one in `asrt_qute.items`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data/mockData.js
git commit -m "data: add loose_bottles field, 3 Qute SKUs, activate EJ, seed MOCK_ASSORTMENTS"
```

---

## Task 2: Assortment algorithm — pure function + TDD tests

**Files:**
- Create: `frontend/src/utils/assortmentAlgorithm.js`
- Create: `frontend/src/utils/__tests__/assortmentAlgorithm.test.js`

**Interfaces:**
- Consumes: `MOCK_ASSORTMENTS` and `MOCK_PRODUCTS` schemas from Task 1
- Produces: `applyAssortedSales({ sales, assortments, products, initialLoose })` → `{ casesBroken, looseChanges, breakdown }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/assortmentAlgorithm.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/__tests__/assortmentAlgorithm.test.js
```
Expected: `Error: Failed to resolve import "../assortmentAlgorithm.js"` — module does not exist yet. Tests fail at collection.

- [ ] **Step 3: Implement the algorithm**

Create `frontend/src/utils/assortmentAlgorithm.js`:

```js
// Pure function: computes cases-broken and loose-bottle deltas from a
// batch of assortment sales, using loose-first drawdown per product.
// Does not mutate any input.
//
// The math per flavor within one sale:
//   bottles_needed = item.bottles * sale.qty
//   available_loose = runningLoose[item.product_id] || 0
//   if available_loose >= bottles_needed:
//     draw entirely from loose; new_loose = available_loose - bottles_needed
//     cases_broken = 0
//   else:
//     shortfall = bottles_needed - available_loose
//     cases_broken = Math.ceil(shortfall / case_size)
//     bottles_from_cases = cases_broken * case_size
//     new_loose = bottles_from_cases - shortfall
//
// runningLoose is threaded across sales in the given order.

export function applyAssortedSales({ sales, assortments, products, initialLoose }) {
  const assortmentIndex = new Map(assortments.map(a => [a.assortment_id, a]))
  const productIndex = new Map(products.map(p => [p.product_id, p]))

  const runningLoose = { ...initialLoose }
  const casesBroken = {}
  const breakdown = []

  sales.forEach(sale => {
    if (!sale.qty || sale.qty <= 0) return

    const assortment = assortmentIndex.get(sale.assortment_id)
    if (!assortment) {
      throw new Error(`Unknown assortment_id: ${sale.assortment_id}`)
    }

    const effects = assortment.items.map(item => {
      const product = productIndex.get(item.product_id)
      if (!product) {
        throw new Error(`Assortment ${sale.assortment_id} references unknown product_id: ${item.product_id}`)
      }

      const bottlesNeeded = item.bottles * sale.qty
      const availableLoose = runningLoose[item.product_id] || 0
      let fromLoose
      let fromCasesBroken
      let casesForItem
      let newLoose

      if (availableLoose >= bottlesNeeded) {
        fromLoose = bottlesNeeded
        fromCasesBroken = 0
        casesForItem = 0
        newLoose = availableLoose - bottlesNeeded
      } else {
        fromLoose = availableLoose
        const shortfall = bottlesNeeded - availableLoose
        casesForItem = Math.ceil(shortfall / product.case_size)
        const bottlesFromCases = casesForItem * product.case_size
        fromCasesBroken = shortfall
        newLoose = bottlesFromCases - shortfall
      }

      runningLoose[item.product_id] = newLoose
      if (casesForItem > 0) {
        casesBroken[item.product_id] = (casesBroken[item.product_id] || 0) + casesForItem
      }

      return {
        product_id: item.product_id,
        bottles_needed: bottlesNeeded,
        from_loose: fromLoose,
        from_cases_broken: fromCasesBroken,
        cases_broken: casesForItem,
      }
    })

    breakdown.push({
      assortment_id: sale.assortment_id,
      qty: sale.qty,
      effects,
    })
  })

  const looseChanges = {}
  Object.keys(runningLoose).forEach(product_id => {
    const delta = runningLoose[product_id] - (initialLoose[product_id] || 0)
    if (delta !== 0) {
      looseChanges[product_id] = delta
    }
  })

  return { casesBroken, looseChanges, breakdown }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/__tests__/assortmentAlgorithm.test.js
```
Expected: `Tests 10 passed (10)`, no console warnings, pristine output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/assortmentAlgorithm.js frontend/src/utils/__tests__/assortmentAlgorithm.test.js
git commit -m "feat: add applyAssortedSales algorithm with loose-first drawdown"
```

---

## Task 3: Interceptor wire-up — GET /assortments/ + extend POST /stock/eod/

**Files:**
- Modify: `frontend/src/services/mockInterceptor.js`

**Interfaces:**
- Consumes: `MOCK_ASSORTMENTS`, `MOCK_PRODUCTS`, `MOCK_STOCK_MOVEMENTS` from Task 1; `applyAssortedSales` from Task 2
- Produces: GET `/assortments/` returns `{ success: true, data: MOCK_ASSORTMENTS }`
- Produces: POST `/stock/eod/` accepts extended payload; runs algorithm on `assorted_sales`; merges algorithm-derived cases_out with per-item cases_out; mutates `product.loose_bottles`; returns `{ success, data: { eod_id, entry_date, created_at, movements, back_order_changes, loose_changes, assortment_breakdown, status } }`

- [ ] **Step 1: Import `MOCK_ASSORTMENTS` and `applyAssortedSales`**

At the top of `frontend/src/services/mockInterceptor.js`, add to the imports:

```js
import {
  MOCK_PRODUCTS,
  MOCK_STOCK_MOVEMENTS,
  MOCK_ASSORTMENTS,
} from '@/data/mockData.js'
import { applyAssortedSales } from '@/utils/assortmentAlgorithm.js'
```

(Merge the `MOCK_ASSORTMENTS` addition with whatever import block is currently there — do not duplicate `MOCK_PRODUCTS` or `MOCK_STOCK_MOVEMENTS`.)

- [ ] **Step 2: Add GET `/assortments/` handler in `getHandler(url)`**

Find the `getHandler(url)` function (near where `/stock/movements/` is handled). Add this branch BEFORE the generic `return mockAdapter({ data: [], success: true })` fallback:

```js
  if (url.includes('/assortments/')) {
    return mockAdapter({ data: MOCK_ASSORTMENTS, success: true })
  }
```

- [ ] **Step 3: Extend POST `/stock/eod/` handler**

Replace the entire `if (url.includes('/stock/eod/')) { ... }` block inside `getPostHandler(config)` with:

```js
  if (url.includes('/stock/eod/')) {
    return (cfg) => {
      const body = JSON.parse(cfg.data || '{}')
      const items = body.items ?? []
      const assortedSales = body.assorted_sales ?? []
      const entryDate = body.entry_date
      if (!entryDate) {
        return Promise.reject(new Error('entry_date is required'))
      }

      // Run the assortment algorithm against current loose state
      const initialLoose = {}
      MOCK_PRODUCTS.forEach(p => {
        initialLoose[p.product_id] = p.loose_bottles ?? 0
      })
      let algoResult
      try {
        algoResult = applyAssortedSales({
          sales: assortedSales,
          assortments: MOCK_ASSORTMENTS,
          products: MOCK_PRODUCTS,
          initialLoose,
        })
      } catch (err) {
        return Promise.reject(err)
      }

      const created_at = new Date().toISOString()
      const movements = []
      const back_order_changes = []
      const loose_changes = []
      let flagged = false

      // Assortment name lookup for movement notes
      const assortmentNameById = new Map(
        MOCK_ASSORTMENTS.map(a => [a.assortment_id, a.name])
      )

      // Generate cases_out movements for the algorithm's per-product cases-broken,
      // one movement per (product, assortment sale) so notes stay auditable
      algoResult.breakdown.forEach(b => {
        const note = `Assortment fulfillment: ${b.qty} × ${assortmentNameById.get(b.assortment_id) || b.assortment_id}`
        b.effects.forEach(eff => {
          if (eff.cases_broken > 0) {
            movementCounter += 1
            const mv = {
              movement_id: `mv_${Date.now()}_${movementCounter}`,
              product_id: eff.product_id,
              date: entryDate,
              type: 'out',
              quantity: eff.cases_broken,
              note,
              created_at,
            }
            MOCK_STOCK_MOVEMENTS.push(mv)
            movements.push(mv)
            const product = MOCK_PRODUCTS.find(p => p.product_id === eff.product_id)
            if (product) {
              product.total_stock -= eff.cases_broken
              if (product.total_stock < 0) flagged = true
            }
          }
        })
      })

      // Apply per-product loose changes from the algorithm
      Object.entries(algoResult.looseChanges).forEach(([product_id, delta]) => {
        const product = MOCK_PRODUCTS.find(p => p.product_id === product_id)
        if (!product) return
        const oldLoose = product.loose_bottles ?? 0
        product.loose_bottles = Math.max(0, oldLoose + delta)
        loose_changes.push({
          product_id,
          old_loose: oldLoose,
          new_loose: product.loose_bottles,
          delta,
          source: 'assortment',
        })
      })

      // Process direct per-item entries (cases_in, cases_out, bo_delta, loose_delta)
      items.forEach(item => {
        const product = MOCK_PRODUCTS.find(p => p.product_id === item.product_id)
        if (!product) return

        const casesIn = Number(item.cases_in) || 0
        const casesOut = Number(item.cases_out) || 0
        const boDelta = Number(item.bo_delta) || 0
        const looseDelta = Number(item.loose_delta) || 0

        if (casesIn > 0) {
          movementCounter += 1
          const mv = {
            movement_id: `mv_${Date.now()}_${movementCounter}`,
            product_id: item.product_id,
            date: entryDate,
            type: 'in',
            quantity: casesIn,
            note: item.note ?? null,
            created_at,
          }
          MOCK_STOCK_MOVEMENTS.push(mv)
          movements.push(mv)
          product.total_stock += casesIn
        }

        if (casesOut > 0) {
          movementCounter += 1
          const mv = {
            movement_id: `mv_${Date.now()}_${movementCounter}`,
            product_id: item.product_id,
            date: entryDate,
            type: 'out',
            quantity: casesOut,
            note: item.note ?? null,
            created_at,
          }
          MOCK_STOCK_MOVEMENTS.push(mv)
          movements.push(mv)
          product.total_stock -= casesOut
          if (product.total_stock < 0) flagged = true
        }

        if (boDelta !== 0) {
          const oldBo = product.back_order
          product.back_order = Math.max(0, product.back_order + boDelta)
          back_order_changes.push({
            product_id: item.product_id,
            old_bo: oldBo,
            new_bo: product.back_order,
            delta: boDelta,
          })
        }

        if (looseDelta !== 0) {
          const oldLoose = product.loose_bottles ?? 0
          product.loose_bottles = Math.max(0, oldLoose + looseDelta)
          loose_changes.push({
            product_id: item.product_id,
            old_loose: oldLoose,
            new_loose: product.loose_bottles,
            delta: looseDelta,
            source: 'manual',
          })
        }
      })

      return Promise.resolve({
        data: {
          success: true,
          data: {
            eod_id: `eod_${Date.now()}`,
            entry_date: entryDate,
            created_at,
            movements,
            back_order_changes,
            loose_changes,
            assortment_breakdown: algoResult.breakdown,
            status: flagged ? 'flagged' : 'applied',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: cfg,
        request: {},
      })
    }
  }
```

- [ ] **Step 4: Verify manually**

There are no automated tests for the interceptor. Verify by re-reading and confirming:
1. `MOCK_ASSORTMENTS` and `applyAssortedSales` are imported.
2. GET `/assortments/` handler returns the full assortments array.
3. POST `/stock/eod/` reads `body.assorted_sales`, runs the algorithm, generates cases_out movements per assortment sale with a `note` starting with "Assortment fulfillment:", and mutates both `product.total_stock` and `product.loose_bottles`.
4. The response includes `loose_changes` and `assortment_breakdown` in addition to the pre-existing fields.
5. The `entry_date` guard still fires first.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/mockInterceptor.js
git commit -m "feat: interceptor accepts assorted_sales; mutates loose_bottles"
```

---

## Task 4: `useAssortments` composable

**Files:**
- Create: `frontend/src/composables/api/useAssortments.js`
- Create: `frontend/src/composables/api/__tests__/useAssortments.test.js`

**Interfaces:**
- Consumes: GET `/assortments/` from Task 3
- Produces: `useAssortments()` returning `{ assortments, loading, error, fetchAssortments }` with per-instance state

- [ ] **Step 1: Write the failing test**

Create `frontend/src/composables/api/__tests__/useAssortments.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useAssortments.test.js
```
Expected: import fails — `useAssortments.js` does not exist.

- [ ] **Step 3: Implement the composable**

Create `frontend/src/composables/api/useAssortments.js`:

```js
import { ref } from 'vue'
import { api } from '@/services/api.js'

// Per-instance state. Consumers that need shared state should coordinate
// at the page level, matching the pattern used by useEodUpdate.

export function useAssortments() {
  const assortments = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchAssortments = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await api.get('/assortments/')
      assortments.value = response.data?.data ?? []
      return assortments.value
    } catch (err) {
      error.value = err.message || 'Failed to load assortments'
      throw err
    } finally {
      loading.value = false
    }
  }

  return { assortments, loading, error, fetchAssortments }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useAssortments.test.js
```
Expected: `Tests 4 passed (4)`, pristine output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/api/useAssortments.js frontend/src/composables/api/__tests__/useAssortments.test.js
git commit -m "feat: add useAssortments composable"
```

---

## Task 5: Extend `useEodUpdate` — assortedSales, loose_delta, live preview

**Files:**
- Modify: `frontend/src/composables/api/useEodUpdate.js`
- Modify: `frontend/src/composables/api/__tests__/useEodUpdate.test.js`

**Interfaces:**
- Consumes: `applyAssortedSales` from Task 2, `useAssortments` from Task 4
- Produces: `useEodUpdate()` returning (in addition to existing): `assortments` (ref), `assortmentsLoading` (ref), `fetchAssortments` (method), `assortedSales` (ref), `assortmentEffects` (computed), `assortmentPreview` (computed). `entries[product_id]` gains `loose_delta`. `changedItems` items gain `cases_out_direct`, `cases_broken`, `cases_out_total`, `loose_delta_direct`, `loose_delta_from_assortment`, `loose_delta_total`, `loose_before`, `loose_after`. `submitEod` payload includes `assorted_sales` and `items[].loose_delta`.

- [ ] **Step 1: Rewrite the test file**

Overwrite `frontend/src/composables/api/__tests__/useEodUpdate.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js
```
Expected: many failures — `entries[id]` lacks `loose_delta`; `changedItems` items lack `cases_out_direct`/`cases_broken`/`loose_before`/`loose_after`; `assortedSales`, `assortmentEffects`, `assortmentPreview` refs/computeds do not exist.

- [ ] **Step 3: Rewrite the composable**

Overwrite `frontend/src/composables/api/useEodUpdate.js`:

```js
import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'
import { useAssortments } from './useAssortments.js'
import { applyAssortedSales } from '@/utils/assortmentAlgorithm.js'
import { sortByVariant } from '@/data/mockData.js'

// State (entries, submitted, lastSubmission, error, assortedSales) is scoped
// per component instance — each useEodUpdate() call produces fresh refs.
// Cross-route continuity relies on the mock interceptor mutating
// MOCK_STOCK_MOVEMENTS + product state in place.

export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()
  const {
    assortments,
    loading: assortmentsLoading,
    fetchAssortments,
  } = useAssortments()

  const entries = ref({})
  const assortedSales = ref({})     // { [assortment_id]: qty }
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active').sort(sortByVariant)
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 }
    })
    entries.value = map
  }

  // Convert assortedSales object into the algorithm's `sales` array
  const activeAssortedSales = computed(() =>
    Object.entries(assortedSales.value)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([assortment_id, qty]) => ({ assortment_id, qty: Number(qty) }))
  )

  // Run the algorithm live against the current products + loose state
  const algoResult = computed(() => {
    if (activeAssortedSales.value.length === 0 || assortments.value.length === 0) {
      return { casesBroken: {}, looseChanges: {}, breakdown: [] }
    }
    const initialLoose = {}
    activeProducts.value.forEach(p => {
      initialLoose[p.product_id] = p.loose_bottles ?? 0
    })
    try {
      return applyAssortedSales({
        sales: activeAssortedSales.value,
        assortments: assortments.value,
        products: activeProducts.value,
        initialLoose,
      })
    } catch {
      // Bad state (e.g. selected assortment references a missing product) —
      // return an empty result rather than exploding the preview. The UI
      // will still show the entries; the interceptor will surface any
      // real error on submit.
      return { casesBroken: {}, looseChanges: {}, breakdown: [] }
    }
  })

  const assortmentEffects = computed(() => {
    const effects = {}
    const { casesBroken, looseChanges } = algoResult.value
    Object.keys(casesBroken).forEach(pid => {
      effects[pid] = effects[pid] || { cases_broken: 0, loose_delta: 0 }
      effects[pid].cases_broken = casesBroken[pid]
    })
    Object.keys(looseChanges).forEach(pid => {
      effects[pid] = effects[pid] || { cases_broken: 0, loose_delta: 0 }
      effects[pid].loose_delta = looseChanges[pid]
    })
    return effects
  })

  const assortmentPreview = computed(() => {
    const nameById = new Map(assortments.value.map(a => [a.assortment_id, a.name]))
    return algoResult.value.breakdown.map(b => ({
      assortment_id: b.assortment_id,
      name: nameById.get(b.assortment_id) || b.assortment_id,
      qty: b.qty,
      effects: b.effects,
    }))
  })

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 }
        const effect = assortmentEffects.value[p.product_id] || { cases_broken: 0, loose_delta: 0 }
        const cases_in = entry.cases_in
        const cases_out_direct = entry.cases_out
        const cases_broken = effect.cases_broken
        const cases_out_total = cases_out_direct + cases_broken
        const bo_delta = entry.bo_delta
        const loose_delta_direct = entry.loose_delta
        const loose_delta_from_assortment = effect.loose_delta
        const loose_delta_total = loose_delta_direct + loose_delta_from_assortment
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before + cases_in - cases_out_total
        const loose_before = p.loose_bottles ?? 0
        const loose_after = Math.max(0, loose_before + loose_delta_total)
        const changed =
          cases_in !== 0 ||
          cases_out_direct !== 0 ||
          cases_broken !== 0 ||
          bo_delta !== 0 ||
          loose_delta_direct !== 0 ||
          loose_delta_from_assortment !== 0
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          flavor: p.flavor,
          pack_size: p.pack_size,
          cases_in,
          cases_out_direct,
          cases_broken,
          cases_out_total,
          bo_delta,
          loose_delta_direct,
          loose_delta_from_assortment,
          loose_delta_total,
          stock_before,
          stock_after,
          loose_before,
          loose_after,
          needs_reconciliation: stock_after < 0,
          _changed: changed,
        }
      })
      .filter(item => item._changed)
      .map(({ _changed, ...item }) => item)
  )

  const flaggedItems = computed(() =>
    changedItems.value.filter(i => i.needs_reconciliation)
  )

  const hasChanges = computed(() =>
    changedItems.value.length > 0 || activeAssortedSales.value.length > 0
  )

  const submitEod = async (entryDate) => {
    loading.value = true
    error.value = null
    try {
      // items payload uses DIRECT values only; the interceptor re-runs the
      // algorithm against server-side state to produce assortment cases.
      const itemsPayload = Object.entries(entries.value)
        .filter(([, e]) =>
          e.cases_in !== 0 ||
          e.cases_out !== 0 ||
          e.bo_delta !== 0 ||
          e.loose_delta !== 0
        )
        .map(([product_id, e]) => ({
          product_id,
          cases_in: e.cases_in,
          cases_out: e.cases_out,
          bo_delta: e.bo_delta,
          loose_delta: e.loose_delta,
        }))

      const payload = {
        entry_date: entryDate,
        items: itemsPayload,
        assorted_sales: activeAssortedSales.value,
      }
      const response = await api.post('/stock/eod/', payload)
      lastSubmission.value = response.data.data
      submitted.value = true
      return response.data
    } catch (err) {
      error.value = err.message || 'Failed to submit EOD update'
      throw err
    } finally {
      loading.value = false
    }
  }

  const resetForm = () => {
    submitted.value = false
    lastSubmission.value = null
    error.value = null
    assortedSales.value = {}
    initEntries()
  }

  return {
    products,
    activeProducts,
    entries,
    assortedSales,
    assortments,
    assortmentsLoading,
    fetchAssortments,
    assortmentEffects,
    assortmentPreview,
    loading,
    productsLoading,
    error,
    submitted,
    lastSubmission,
    changedItems,
    flaggedItems,
    hasChanges,
    initEntries,
    initializeProducts,
    submitEod,
    resetForm,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js
```
Expected: all tests pass, pristine output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/api/useEodUpdate.js frontend/src/composables/api/__tests__/useEodUpdate.test.js
git commit -m "feat: extend useEodUpdate with assortedSales, loose_delta, live algorithm preview"
```

---

## Task 6: Rewrite `EodUpdate.vue` — Assorted Sales section + loose_delta input + updated preview

**Files:**
- Modify: `frontend/src/pages/stock/EodUpdate.vue`
- Modify: `frontend/src/pages/stock/__tests__/EodUpdate.test.js`

**Interfaces:**
- Consumes: the extended `useEodUpdate` surface from Task 5
- Produces: EOD Update page at `/stock/eod` with an "Assorted Sales" section (qty input + live per-sale breakdown), four inputs per product row (cases in, cases out, bo delta, loose delta), preview showing both direct and assortment effects with reconciliation banner unchanged

- [ ] **Step 1: Rewrite the test file**

Overwrite `frontend/src/pages/stock/__tests__/EodUpdate.test.js`:

```js
import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 100, back_order: 0, loose_bottles: 8, case_size: 12 },
    { product_id: 'prod_b', product_name: '240mL Lemon',  flavor: 'Lemon',   pack_size: '240mL', total_stock: 50,  back_order: 1, loose_bottles: 0, case_size: 24 },
  ]),
  entries: ref({
    prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
    prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
  }),
  assortedSales: ref({}),
  assortments: ref([
    { assortment_id: 'asrt_mega', name: 'Mega Assorted', price: 275, pack_size_label: 'Case of 12', items: [
      { product_id: 'prod_a', bottles: 4 },
    ] },
  ]),
  assortmentsLoading: ref(false),
  fetchAssortments: vi.fn().mockResolvedValue(undefined),
  assortmentEffects: ref({}),
  assortmentPreview: ref([]),
  changedItems: ref([]),
  flaggedItems: ref([]),
  hasChanges: ref(false),
  loading: ref(false),
  productsLoading: ref(false),
  submitted: ref(false),
  lastSubmission: ref(null),
  error: ref(null),
  initEntries: vi.fn(),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
  submitEod: vi.fn().mockResolvedValue({ success: true }),
  resetForm: vi.fn(),
}

vi.mock('@/composables/api/useEodUpdate.js', () => ({
  useEodUpdate: () => mockComposable,
}))

import EodUpdate from '../EodUpdate.vue'

describe('EodUpdate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.submitted.value = false
    mockComposable.hasChanges.value = false
    mockComposable.flaggedItems.value = []
    mockComposable.changedItems.value = []
    mockComposable.assortedSales.value = {}
    mockComposable.assortmentPreview.value = []
    mockComposable.assortmentEffects.value = {}
    mockComposable.entries.value = {
      prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
      prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0, loose_delta: 0 },
    }
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('End of Day Stock Update')
  })

  it('starts with empty working set (sparse mode) and shows the picker', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="product-row"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="product-picker"]').exists()).toBe(true)
  })

  it('shows the Assorted Sales section on the entry step', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="assorted-sales-section"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Assorted Sales')
    const rows = wrapper.findAll('[data-testid="assortment-row"]')
    expect(rows).toHaveLength(1)
  })

  it('adding a product to the working set renders four inputs (cases in, out, bo, loose)', async () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    await wrapper.vm.addToWorkingSet('prod_a')
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('[data-testid="product-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('[data-testid="input-cases-in"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-cases-out"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-bo-delta"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-loose-delta"]').exists()).toBe(true)
  })

  it('renders assortment preview breakdown when assortmentPreview is populated', async () => {
    mockComposable.assortedSales.value = { asrt_mega: 1 }
    mockComposable.assortmentPreview.value = [{
      assortment_id: 'asrt_mega',
      name: 'Mega Assorted',
      qty: 1,
      effects: [
        { product_id: 'prod_a', bottles_needed: 4, from_loose: 4, from_cases_broken: 0, cases_broken: 0 },
      ],
    }]
    mockComposable.hasChanges.value = true
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="assortment-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mega Assorted')
  })

  it('preview button disabled when hasChanges is false', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation banner in preview when flaggedItems present', async () => {
    mockComposable.flaggedItems.value = [{
      product_id: 'prod_a', product_name: 'Mega RC Cola', cases_in: 0, cases_out_direct: 150,
      cases_broken: 0, cases_out_total: 150, bo_delta: 0,
      loose_delta_direct: 0, loose_delta_from_assortment: 0, loose_delta_total: 0,
      stock_before: 100, stock_after: -50, loose_before: 8, loose_after: 8,
      needs_reconciliation: true,
    }]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="recon-banner"]').exists()).toBe(true)
  })

  it('shows success view when submitted is true', () => {
    mockComposable.submitted.value = true
    mockComposable.lastSubmission.value = { movements: [], status: 'applied' }
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="success-view"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js
```
Expected: failures — no `[data-testid="assorted-sales-section"]`, no `[data-testid="assortment-row"]`, no `[data-testid="input-loose-delta"]`, no `[data-testid="assortment-preview"]`.

- [ ] **Step 3: Rewrite the page**

Overwrite `frontend/src/pages/stock/EodUpdate.vue`. Because the file is large, this step lists the complete file. The visual pattern extends the existing three-column entry with a fourth "Loose" input, adds a new "Assorted Sales" card above the product-picker, and adds an "Assortment breakdown" block to the preview.

```vue
<template>
  <div class="container-fluid pt-2 pb-5 eod-page surface-secondary">

    <!-- Success view -->
    <div v-if="submitted" data-testid="success-view" class="text-center py-5">
      <div class="surface-card border-theme rounded p-5 mx-auto" style="max-width: 480px;">
        <div class="mb-3" style="font-size: 3rem;">✓</div>
        <h5 class="mb-1">EOD Update Applied</h5>
        <p class="text-tertiary-medium mb-4">
          {{ lastSubmission?.movements?.length || 0 }} movement{{ (lastSubmission?.movements?.length || 0) === 1 ? '' : 's' }} recorded for {{ entryDate }}
          <span v-if="lastSubmission?.status === 'flagged'" class="d-block mt-1" style="color: var(--status-warning);">
            ⚠ Some products need reconciliation
          </span>
        </p>
        <div class="d-flex gap-2 justify-content-center">
          <button class="btn btn-filter btn-sm" style="border-radius: 0.3rem !important;" @click="$router.push('/stock/history')">View History</button>
          <button class="btn btn-add btn-sm" style="border-radius: 0.3rem !important;" @click="startNew">New EOD Entry</button>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h5 class="mb-0" style="color: var(--text-primary); font-weight: 700;">End of Day Stock Update</h5>
          <small style="color: var(--text-tertiary);">{{ formattedDate }}</small>
        </div>
        <input
          type="date"
          v-model="entryDate"
          class="form-control form-control-sm input-theme"
          style="width: auto;"
        />
      </div>

      <!-- Submit error banner -->
      <div
        v-if="error"
        class="surface-card border-theme rounded p-3 mb-3"
        style="border-color: var(--status-error); color: var(--status-error);"
      >
        {{ error }}
      </div>

      <!-- Reconciliation warning banner (preview only) -->
      <div
        v-if="step === 'preview' && flaggedItems.length > 0"
        data-testid="recon-banner"
        class="d-flex align-items-center gap-2 rounded p-3 mb-3"
        style="border: 1px solid var(--status-warning); color: var(--status-warning); background: var(--status-warning-bg);"
      >
        <span style="font-size: 1.25rem;">⚠</span>
        <div>
          <div style="font-weight: 700;">{{ flaggedItems.length }} product{{ flaggedItems.length === 1 ? '' : 's' }} would go negative</div>
          <div style="font-size: 0.85rem;">Review and adjust before submitting.</div>
        </div>
      </div>

      <!-- Entry step -->
      <template v-if="step === 'entry'">
        <!-- Assorted Sales section -->
        <div data-testid="assorted-sales-section" class="surface-card border-theme rounded p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0" style="color: var(--text-primary); font-weight: 700;">Assorted Sales</h6>
            <small style="color: var(--text-tertiary);">Mixed-flavor packages sold today</small>
          </div>
          <div v-if="assortments.length === 0" class="text-tertiary-medium" style="font-size: 0.85rem;">
            No assortments configured.
          </div>
          <div v-else class="d-flex flex-column gap-2">
            <div
              v-for="asrt in assortments"
              :key="asrt.assortment_id"
              data-testid="assortment-row"
              class="d-flex flex-wrap align-items-center gap-2 pb-2 border-bottom-theme"
            >
              <div class="flex-grow-1" style="min-width: 200px;">
                <div style="font-weight: 600; color: var(--text-primary);">{{ asrt.name }}</div>
                <div style="font-size: 0.8rem; color: var(--text-tertiary);">
                  {{ asrt.pack_size_label }} · ₱{{ asrt.price }}
                  <span
                    v-if="asrt.original_price && asrt.original_price !== asrt.price"
                    style="text-decoration: line-through; margin-left: 0.4rem;"
                  >₱{{ asrt.original_price }}</span>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <label class="mb-0" style="font-size: 0.8rem; color: var(--text-tertiary);">Qty</label>
                <input
                  type="number"
                  class="form-control form-control-sm input-theme"
                  style="width: 90px;"
                  min="0"
                  step="1"
                  :value="assortedSales[asrt.assortment_id] || 0"
                  @input="setAssortedQty(asrt.assortment_id, $event.target.value)"
                />
              </div>
            </div>
            <div v-if="assortmentPreview.length > 0" class="mt-2 rounded p-2" style="background: var(--surface-tertiary);">
              <div
                v-for="p in assortmentPreview"
                :key="p.assortment_id"
                style="font-size: 0.8rem; color: var(--text-secondary);"
              >
                <strong>{{ p.qty }} × {{ p.name }}:</strong>
                <span v-for="(eff, i) in p.effects" :key="i" class="ms-2">
                  {{ productNameById[eff.product_id] }} needs {{ eff.bottles_needed }}
                  <span v-if="eff.cases_broken > 0">— break {{ eff.cases_broken }} case</span>
                  <span v-if="eff.from_loose > 0">— {{ eff.from_loose }} from loose</span>{{ i < p.effects.length - 1 ? ';' : '' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Working set + picker -->
        <div class="surface-card border-theme rounded p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0" style="color: var(--text-primary); font-weight: 700;">Per-product entries</h6>
            <button
              class="btn btn-filter btn-sm"
              style="border-radius: 0.3rem !important;"
              @click="addAllToWorkingSet"
              :disabled="workingSet.length === activeProducts.length"
            >Show all</button>
          </div>
          <div data-testid="product-picker" class="mb-3">
            <label class="mb-1" style="font-size: 0.85rem; color: var(--text-tertiary);">Add product to working set</label>
            <select
              v-model="pickerSelection"
              class="form-select form-select-sm input-theme"
              @change="onPickerChange"
            >
              <option value="" disabled>Search / select…</option>
              <option
                v-for="p in productsNotInWorkingSet"
                :key="p.product_id"
                :value="p.product_id"
              >{{ p.product_name }}</option>
            </select>
          </div>

          <div v-if="workingSet.length === 0" class="text-tertiary-medium" style="font-size: 0.85rem;">
            No products in the working set yet. Add one above, or click "Show all".
          </div>

          <div v-else class="d-flex flex-column gap-2">
            <div
              v-for="product in workingSetProducts"
              :key="product.product_id"
              data-testid="product-row"
              class="d-flex flex-wrap align-items-center gap-2 pb-2 border-bottom-theme"
            >
              <div class="flex-grow-1" style="min-width: 180px;">
                <div style="font-weight: 600; color: var(--text-primary);">{{ product.product_name }}</div>
                <div style="font-size: 0.75rem; color: var(--text-tertiary);">
                  Stock {{ product.total_stock ?? 0 }} · Loose {{ product.loose_bottles ?? 0 }} · BO {{ product.back_order ?? 0 }}
                </div>
              </div>
              <div class="d-flex align-items-center gap-1">
                <label class="mb-0" style="font-size: 0.75rem; color: var(--text-tertiary);">In</label>
                <input
                  type="number"
                  data-testid="input-cases-in"
                  class="form-control form-control-sm input-theme"
                  style="width: 70px;"
                  min="0"
                  step="1"
                  v-model.number="entries[product.product_id].cases_in"
                />
              </div>
              <div class="d-flex align-items-center gap-1">
                <label class="mb-0" style="font-size: 0.75rem; color: var(--text-tertiary);">Out</label>
                <input
                  type="number"
                  data-testid="input-cases-out"
                  class="form-control form-control-sm input-theme"
                  style="width: 70px;"
                  min="0"
                  step="1"
                  v-model.number="entries[product.product_id].cases_out"
                />
              </div>
              <div class="d-flex align-items-center gap-1">
                <label class="mb-0" style="font-size: 0.75rem; color: var(--text-tertiary);">BO Δ</label>
                <input
                  type="number"
                  data-testid="input-bo-delta"
                  class="form-control form-control-sm input-theme"
                  style="width: 70px;"
                  step="1"
                  v-model.number="entries[product.product_id].bo_delta"
                />
              </div>
              <div class="d-flex align-items-center gap-1">
                <label class="mb-0" style="font-size: 0.75rem; color: var(--text-tertiary);">Loose Δ</label>
                <input
                  type="number"
                  data-testid="input-loose-delta"
                  class="form-control form-control-sm input-theme"
                  style="width: 70px;"
                  step="1"
                  v-model.number="entries[product.product_id].loose_delta"
                />
              </div>
              <div class="d-flex align-items-center gap-1" :style="afterStyle(product)">
                <label class="mb-0" style="font-size: 0.75rem;">After</label>
                <span style="font-weight: 600;">{{ computeAfter(product) }}</span>
              </div>
              <button
                class="btn btn-delete btn-sm"
                style="border-radius: 0.3rem !important;"
                @click="removeFromWorkingSet(product.product_id)"
              >Remove</button>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button
            class="btn btn-submit btn-sm"
            style="border-radius: 0.3rem !important;"
            data-testid="preview-btn"
            :disabled="!hasChanges"
            @click="goToPreview"
          >Preview</button>
        </div>
      </template>

      <!-- Preview step -->
      <template v-else-if="step === 'preview'">
        <div class="surface-card border-theme rounded p-3 mb-3">
          <h6 class="mb-3" style="color: var(--text-primary); font-weight: 700;">Preview — {{ formattedDate }}</h6>
          <div v-if="changedItems.length === 0" class="text-tertiary-medium" style="font-size: 0.85rem;">
            No changes to apply.
          </div>
          <div v-else class="table-responsive">
            <table class="table table-sm" style="color: var(--text-primary);">
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="text-end">Cases In</th>
                  <th class="text-end">Cases Out (direct + assortment)</th>
                  <th class="text-end">Stock Before → After</th>
                  <th class="text-end">Loose Before → After</th>
                  <th class="text-end">BO Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in changedItems"
                  :key="item.product_id"
                  :style="item.needs_reconciliation ? 'background: var(--status-warning-bg);' : ''"
                >
                  <td>{{ item.product_name }}</td>
                  <td class="text-end">{{ item.cases_in }}</td>
                  <td class="text-end">{{ item.cases_out_direct }}<span v-if="item.cases_broken > 0"> + {{ item.cases_broken }}</span> = {{ item.cases_out_total }}</td>
                  <td class="text-end" :style="item.needs_reconciliation ? 'color: var(--status-error); font-weight: 700;' : ''">
                    {{ item.stock_before }} → {{ item.stock_after }}
                  </td>
                  <td class="text-end">{{ item.loose_before }} → {{ item.loose_after }}</td>
                  <td class="text-end">{{ item.bo_delta }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="assortmentPreview.length > 0"
          data-testid="assortment-preview"
          class="surface-card border-theme rounded p-3 mb-3"
        >
          <h6 class="mb-2" style="color: var(--text-primary); font-weight: 700;">Assortment breakdown</h6>
          <div
            v-for="p in assortmentPreview"
            :key="p.assortment_id"
            class="mb-2 pb-2 border-bottom-theme"
          >
            <div style="font-weight: 600; color: var(--text-secondary);">{{ p.qty }} × {{ p.name }}</div>
            <ul class="mb-0" style="font-size: 0.8rem; color: var(--text-tertiary);">
              <li v-for="(eff, i) in p.effects" :key="i">
                {{ productNameById[eff.product_id] }}: needs {{ eff.bottles_needed }} — {{ eff.from_loose }} from loose, {{ eff.from_cases_broken }} from broken cases ({{ eff.cases_broken }} case{{ eff.cases_broken === 1 ? '' : 's' }})
              </li>
            </ul>
          </div>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button
            class="btn btn-cancel btn-sm"
            style="border-radius: 0.3rem !important;"
            @click="step = 'entry'"
          >Back</button>
          <button
            class="btn btn-submit btn-sm"
            style="border-radius: 0.3rem !important;"
            :disabled="loading || !hasChanges"
            @click="handleSubmit"
          >{{ loading ? 'Submitting…' : 'Apply EOD' }}</button>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useEodUpdate } from '@/composables/api/useEodUpdate.js'

export default {
  name: 'EodUpdate',
  setup() {
    const {
      activeProducts,
      entries,
      assortedSales,
      assortments,
      assortmentsLoading,
      fetchAssortments,
      assortmentEffects,
      assortmentPreview,
      loading,
      productsLoading,
      submitted,
      lastSubmission,
      error,
      changedItems,
      flaggedItems,
      hasChanges,
      initEntries,
      initializeProducts,
      submitEod,
      resetForm,
    } = useEodUpdate()

    const isoToday = () => new Date().toISOString().slice(0, 10)
    const entryDate = ref(isoToday())
    const step = ref('entry')

    const workingSet = ref([])
    const pickerSelection = ref('')

    const productNameById = computed(() => {
      const map = {}
      activeProducts.value.forEach(p => { map[p.product_id] = p.product_name })
      return map
    })

    const workingSetProducts = computed(() =>
      workingSet.value
        .map(id => activeProducts.value.find(p => p.product_id === id))
        .filter(Boolean)
    )
    const productsNotInWorkingSet = computed(() =>
      activeProducts.value.filter(p => !workingSet.value.includes(p.product_id))
    )

    const addToWorkingSet = (product_id) => {
      if (!workingSet.value.includes(product_id)) {
        workingSet.value.push(product_id)
      }
    }
    const removeFromWorkingSet = (product_id) => {
      workingSet.value = workingSet.value.filter(id => id !== product_id)
      if (entries.value[product_id]) {
        entries.value[product_id].cases_in = 0
        entries.value[product_id].cases_out = 0
        entries.value[product_id].bo_delta = 0
        entries.value[product_id].loose_delta = 0
      }
    }
    const addAllToWorkingSet = () => {
      workingSet.value = activeProducts.value.map(p => p.product_id)
    }
    const onPickerChange = () => {
      if (pickerSelection.value) {
        addToWorkingSet(pickerSelection.value)
        pickerSelection.value = ''
      }
    }

    const setAssortedQty = (assortment_id, raw) => {
      const n = Number(raw)
      if (!n || n <= 0) {
        const next = { ...assortedSales.value }
        delete next[assortment_id]
        assortedSales.value = next
      } else {
        assortedSales.value = { ...assortedSales.value, [assortment_id]: n }
      }
    }

    const computeAfter = (product) => {
      const entry = entries.value[product.product_id]
      const effect = assortmentEffects.value[product.product_id] || { cases_broken: 0 }
      if (!entry) return product.total_stock ?? 0
      return (product.total_stock ?? 0) + (entry.cases_in || 0) - (entry.cases_out || 0) - effect.cases_broken
    }

    const afterStyle = (product) => {
      const after = computeAfter(product)
      if (after < 0) return 'color: var(--status-error);'
      if (after === 0) return 'color: var(--status-warning);'
      return 'color: var(--status-success);'
    }

    const goToPreview = () => {
      step.value = 'preview'
    }
    const handleSubmit = async () => {
      try {
        await submitEod(entryDate.value)
      } catch (err) {
        console.error('EOD submit failed:', err)
      }
    }
    const startNew = () => {
      step.value = 'entry'
      entryDate.value = isoToday()
      workingSet.value = []
      pickerSelection.value = ''
      resetForm()
    }

    const formattedDate = computed(() => {
      try {
        const d = new Date(entryDate.value + 'T00:00:00')
        return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
      } catch {
        return entryDate.value
      }
    })

    onMounted(() => {
      initializeProducts().then(() => {
        initEntries()
      })
      fetchAssortments()
    })

    return {
      activeProducts,
      entries,
      assortedSales,
      assortments,
      assortmentsLoading,
      assortmentEffects,
      assortmentPreview,
      loading,
      productsLoading,
      submitted,
      lastSubmission,
      error,
      changedItems,
      flaggedItems,
      hasChanges,
      entryDate,
      formattedDate,
      step,
      workingSet,
      workingSetProducts,
      productsNotInWorkingSet,
      pickerSelection,
      productNameById,
      addToWorkingSet,
      removeFromWorkingSet,
      addAllToWorkingSet,
      onPickerChange,
      setAssortedQty,
      computeAfter,
      afterStyle,
      goToPreview,
      handleSubmit,
      startNew,
    }
  },
}
</script>

<style scoped>
.border-bottom-theme {
  border-bottom: 1px solid var(--border-primary);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js
```
Expected: all tests pass, pristine output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/stock/EodUpdate.vue frontend/src/pages/stock/__tests__/EodUpdate.test.js
git commit -m "feat: EOD Update page — assortments section + loose_delta input + preview breakdown"
```

---

## Task 7: Products page — Loose btls column + Loose Bottles stat card

**Files:**
- Modify: `frontend/src/pages/inventory/Products.vue`

**Interfaces:**
- Consumes: `product.loose_bottles` from Task 1
- Produces: Products page shows "Loose btls" column between "Case size" and "Back Order"; the "Total" stat card is replaced by "Loose Bottles" showing `totalLooseBottles`

- [ ] **Step 1: Read current Products.vue to locate touch points**

Read `frontend/src/pages/inventory/Products.vue` and identify:
1. The "Total" stat card (currently `title="Total" :value="productStats.total"`).
2. The `productStats` computed and the `totalBackOrdered` computed in `setup()`.
3. The `<th>` for "Back Order" (column header) and the `<td>` that renders `product.back_order`.
4. The `sortedFilteredProducts` computed and existing `handleSort` logic.

- [ ] **Step 2: Replace the "Total" stat card with "Loose Bottles"**

Find:

```html
<CardTemplate size="xs" border-color="success" border-position="start" title="Total" :value="productStats.total" subtitle="Products" />
```

Replace with:

```html
<CardTemplate size="xs" border-color="warning" border-position="start" title="Loose Bottles" :value="totalLooseBottles" subtitle="Across all products" />
```

- [ ] **Step 3: Add `totalLooseBottles` computed in `setup()`**

Immediately below the existing `totalBackOrdered` computed (in `setup()`), add:

```js
const totalLooseBottles = computed(() =>
  products.value.reduce((sum, p) => sum + (p.loose_bottles || 0), 0)
)
```

Add `totalLooseBottles` to the object returned from `setup()`.

- [ ] **Step 4: Add "Loose btls" column between "Case size" and "Back Order"**

Find:

```html
<th style="width: 90px; text-align: right;">Case size</th>
<th style="width: 110px; text-align: right;">Back Order</th>
```

Change to:

```html
<th style="width: 90px; text-align: right;">Case size</th>
<th style="width: 100px; text-align: right;">Loose btls</th>
<th style="width: 110px; text-align: right;">Back Order</th>
```

Find the cell block that renders case size + back order, and insert the loose-bottles cell between them:

```html
<td class="text-end">
  {{ product.case_size ?? '—' }}
</td>
<td class="text-end">
  <span :class="(product.loose_bottles ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
    {{ product.loose_bottles ?? 0 }}
  </span>
</td>
<td class="text-end">
  <span :class="(product.back_order ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
    {{ product.back_order ?? 0 }}
  </span>
</td>
```

- [ ] **Step 5: Verify no lingering references**

```bash
cd frontend && npx eslint src/pages/inventory/Products.vue
```

Expected: the same 2 pre-existing errors as before (`Products` multi-word, `bootstrap` global). No new errors.

```bash
grep -n "loose_bottles" src/pages/inventory/Products.vue
```

Expected: 3 matches — the `totalLooseBottles` computed, and the two `product.loose_bottles` references in the cell.

- [ ] **Step 6: Run full test suite for regressions**

```bash
cd frontend && npx vitest run
```

Expected: all previously-passing tests still pass. Products.vue has no tests of its own but is compiled during test collection.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/inventory/Products.vue
git commit -m "feat: Products page — Loose btls column + Loose Bottles stat card"
```

---

## Task 8: Stock History — Loose current-count column

**Files:**
- Modify: `frontend/src/pages/stock/StockHistory.vue`
- Modify: `frontend/src/pages/stock/__tests__/StockHistory.test.js`

**Interfaces:**
- Consumes: `product.loose_bottles` from Task 1
- Produces: Stock History matrix shows a "Loose" column immediately right of the sticky product-name column, displaying current per-product `loose_bottles` (not per-day — loose is a scalar state)

- [ ] **Step 1: Update the test file**

Overwrite `frontend/src/pages/stock/__tests__/StockHistory.test.js`. Only the mock products need the `loose_bottles` field and a new column-existence test is added. Preserve the existing test structure and mocks otherwise.

```js
import { vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const isoDay = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const mockMovements = ref([
  { movement_id: 'm1', product_id: 'prod_a', date: isoDay(-2), type: 'in',  quantity: 5, note: null, created_at: '' },
  { movement_id: 'm2', product_id: 'prod_a', date: isoDay(-1), type: 'out', quantity: 2, note: null, created_at: '' },
])

const mockMovementsComposable = {
  movements: mockMovements,
  loading: ref(false),
  error: ref(null),
  fetchMovements: vi.fn().mockResolvedValue(undefined),
  groupByProductAndDate: vi.fn(() => new Map()),
  computeRunningBalance: vi.fn(() => new Map()),
  computeDailyTotals: vi.fn(() => new Map()),
}

vi.mock('@/composables/api/useStockMovements.js', () => ({
  useStockMovements: () => mockMovementsComposable,
}))

const mockProductsComposable = {
  products: ref([
    { product_id: 'prod_a', product_name: 'Mega RC Cola', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 5, back_order: 0, loose_bottles: 8, status: 'active' },
    { product_id: 'prod_b', product_name: '240mL Lemon',  flavor: 'Lemon',   pack_size: '240mL', total_stock: 3, back_order: 1, loose_bottles: 0, status: 'active' },
  ]),
  loading: ref(false),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useProducts.js', () => ({
  useProducts: () => mockProductsComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('Stock History')
  })

  it('calls fetchMovements on mount', () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockMovementsComposable.fetchMovements).toHaveBeenCalled()
  })

  it('renders a row per active product', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const rows = wrapper.findAll('[data-testid="matrix-row"]')
    expect(rows).toHaveLength(2)
  })

  it('renders a Loose column with each row showing the product loose_bottles', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const headers = wrapper.findAll('th')
    const looseHeader = headers.find(h => h.text() === 'Loose')
    expect(looseHeader).toBeTruthy()
    const looseCells = wrapper.findAll('[data-testid="loose-cell"]')
    expect(looseCells).toHaveLength(2)
    expect(looseCells[0].text()).toBe('8')
    expect(looseCells[1].text()).toBe('0')
  })

  it('renders a date column per day in the range', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const dateHeaders = wrapper.findAll('[data-testid="date-header"]')
    expect(dateHeaders.length).toBe(14)
  })

  it('renders the aggregate footer row', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="aggregate-footer"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify the Loose-column test fails**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js
```
Expected: the "renders a Loose column" test fails; the others still pass.

- [ ] **Step 3: Add the Loose column to StockHistory.vue**

Open `frontend/src/pages/stock/StockHistory.vue`. In the matrix `<thead>` row, find the sticky product-name `<th class="sticky-col">Product</th>` and add a second sticky column immediately after it:

```html
<th class="sticky-col">Product</th>
<th class="text-end" style="width: 80px;">Loose</th>
```

In the matrix body, find the sticky product-name `<td class="sticky-col">{{ p.product_name }}</td>` line and insert:

```html
<td class="sticky-col">{{ p.product_name }}</td>
<td data-testid="loose-cell" class="text-end">
  <span :class="(p.loose_bottles ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
    {{ p.loose_bottles ?? 0 }}
  </span>
</td>
```

In the aggregate footer row, add an empty `<td></td>` for the Loose column so column alignment is preserved:

```html
<tr data-testid="aggregate-footer">
  <td class="sticky-col" style="font-weight: 700;">Daily totals</td>
  <td></td>
  <!-- existing daily-total cells follow -->
</tr>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js
```
Expected: all 6 tests pass, pristine output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/stock/StockHistory.vue frontend/src/pages/stock/__tests__/StockHistory.test.js
git commit -m "feat: Stock History — add per-product current loose count column"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Bring back `loose_bottles` field on products | Task 1 |
| Seed `MOCK_ASSORTMENTS` (6 assortments) | Task 1 |
| Add 3 missing Qute SKUs | Task 1 |
| Activate EJ products with seed stock | Task 1 |
| Pure `applyAssortedSales` algorithm | Task 2 |
| Algorithm tests (loose-first, cycle, error paths) | Task 2 |
| GET `/assortments/` endpoint | Task 3 |
| POST `/stock/eod/` accepts `assorted_sales` + `loose_delta` | Task 3 |
| Interceptor generates cases_out movements with "Assortment fulfillment" note | Task 3 |
| Interceptor mutates `product.loose_bottles` | Task 3 |
| `useAssortments` composable | Task 4 |
| `useEodUpdate` adds `assortedSales`, `loose_delta` in entries, live algorithm preview | Task 5 |
| EOD payload includes `assorted_sales` + `loose_delta` | Task 5 |
| EOD page "Assorted Sales" section with qty inputs | Task 6 |
| EOD page four inputs per product row (in/out/bo/loose) | Task 6 |
| Preview step shows both direct and assortment effects | Task 6 |
| Products page Loose btls column | Task 7 |
| Products page Loose Bottles stat card | Task 7 |
| Stock History Loose column | Task 8 |

**Placeholder scan:** No "TBD"; every step has full code or a specific expected output.

**Type consistency:**
- Assortment schema (`assortment_id`, `name`, `price`, `original_price?`, `pack_size_label`, `items`) — consistent across Tasks 1, 2, 3, 4, 5, 6.
- Algorithm output shape (`casesBroken`, `looseChanges`, `breakdown`) — consistent across Tasks 2, 3, 5.
- Extended EOD payload (`entry_date`, `items[].loose_delta`, `assorted_sales`) — consistent across Tasks 3, 5, 6.
- Preview item shape (`cases_out_direct`, `cases_broken`, `cases_out_total`, `loose_before`, `loose_after`, `loose_delta_from_assortment`, ...) — consistent between Task 5 composable and Task 6 template.
- Composable names (`useAssortments`, `useEodUpdate`) — consistent across all tasks.
- Route paths (`/assortments/`, `/stock/eod/`) — consistent across Tasks 3, 4.

Plan is internally consistent. Ready for execution.
