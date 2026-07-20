# Inventory Event-Log Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the EOD Update page and Stock History page around an event-log data model that mirrors how the RC Cola distributor's real spreadsheet works — deliveries in, dispatches out, back orders, and a derived running balance — with a sparse entry UX for EOD and a matrix view for history.

**Architecture:** Replace the current snapshot-based EOD (`{cases_sold, loose_bottles}`) with an event log (`MOCK_STOCK_MOVEMENTS`) whose entries have `type: 'in' | 'out' | 'adjustment'`. Each EOD submission becomes a batch of movements. The Stock History page reads directly from the movements log and renders a product × day matrix. Back Order (BO) is a separate per-product scalar carried in `product.back_order` and updated via EOD's `bo_delta` field. Loose bottles are removed entirely.

**Tech Stack:** Vue 3 Options API with `setup()` function, Axios mock interceptor, Bootstrap 5, global CSS variables, Lucide Vue icons, Vitest + @vue/test-utils.

## Global Constraints

- Vue 3 Options API with `setup()` function returning all reactive state and methods — match the exact pattern in `frontend/src/pages/inventory/Products.vue`
- Tests: `shallowMount` with `global: { stubs: { Teleport: true } }`; vitest globals are already enabled
- All colors via CSS variables only — never hardcoded hex. Use `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-accent`, `--text-inverse`, `--border-primary`, `--surface-card`, `--surface-secondary`, `--surface-elevated`, `--surface-tertiary`, `--status-warning`, `--status-warning-bg`, `--status-error`, `--status-success`, `--state-hover`
- Buttons use global semantic classes: `btn-add` (green), `btn-filter` (neutral), `btn-cancel`, `btn-submit` (blue), `btn-delete`. Rectangular shape via `border-radius: 0.3rem !important`
- **Cases are the unit of trade.** No fractional cases. No loose-bottle tracking. Delete every reference to `loose_bottles` from data, composables, templates, and CSS
- **Balance is derived, never entered.** `balance = product.total_stock + Σ(cases_in) − Σ(cases_out) ± Σ(adjustment)` for the timeframe in view. Users only enter `cases_in`, `cases_out`, and `bo_delta`
- **Movements are the source of truth for history.** The old `MOCK_EOD_HISTORY` and its GET `/stock/eod/history/` endpoint are deleted. Every historic view derives from `MOCK_STOCK_MOVEMENTS`
- **Movement schema (exact):**
  ```ts
  {
    movement_id: string,        // 'mv_<timestamp>_<counter>'
    product_id: string,
    date: string,               // 'YYYY-MM-DD'
    type: 'in' | 'out' | 'adjustment',
    quantity: number,           // positive integer; adjustment can encode direction via type semantics — always positive value here
    adjustment_direction?: 'increase' | 'decrease',  // only present when type === 'adjustment'
    note: string | null,
    created_at: string,         // ISO 8601 from `new Date().toISOString()`
  }
  ```
- **Product schema additions:** every `MOCK_PRODUCTS` entry must include `flavor: string`, `pack_size: string`, `back_order: number`. Remove `loose_bottles`, `category_id`, `category_name`, `subcategory_name`
- **Pack sizes (exact strings):** `'Mega'`, `'240mL'`, `'Litro'`, `'1.5L'`, `'Qute 237mL'`, `'237mL'`
- **Flavors (exact strings):** `'RC Cola'`, `'Lemon'`, `'Orange'`, `'Seetrus'`, `'EJ Mixed Fruit'`, `'EJ Mixed Berries'`, `'EJ Japanese Citrus'`
- Route paths unchanged: `/stock/eod` and `/stock/history`
- Sidebar unchanged (EOD Update + Stock History links stay under Inventory)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/data/mockData.js` | Modify | Replace `MOCK_PRODUCTS` with 20 real SKUs (flavor/pack_size/back_order); add `MOCK_STOCK_MOVEMENTS` seed data; remove `MOCK_EOD_HISTORY` |
| `frontend/src/services/mockInterceptor.js` | Modify | Add GET `/stock/movements/` handler; rewrite POST `/stock/eod/` handler to create movements + update back_order; delete GET `/stock/eod/history/` handler; delete `MOCK_EOD_HISTORY` import |
| `frontend/src/composables/api/useStockMovements.js` | Create | Fetch movements, group by product+date, compute per-day balances |
| `frontend/src/composables/api/__tests__/useStockMovements.test.js` | Create | Unit tests for movement fetching + balance computation |
| `frontend/src/composables/api/useEodUpdate.js` | Rewrite | New form model: cases_in / cases_out / bo_delta per product; live balance preview |
| `frontend/src/composables/api/__tests__/useEodUpdate.test.js` | Rewrite | Update tests to match new field shape |
| `frontend/src/pages/stock/EodUpdate.vue` | Rewrite | Three-column entry, sparse-mode product search, live balance display, preview → apply |
| `frontend/src/pages/stock/__tests__/EodUpdate.test.js` | Rewrite | Update selectors + test data |
| `frontend/src/pages/stock/StockHistory.vue` | Rewrite | Product × day matrix view with sticky first column, aggregate footer, date range picker, per-product drill-down |
| `frontend/src/pages/stock/__tests__/StockHistory.test.js` | Rewrite | Update tests for matrix rendering |
| `frontend/src/pages/inventory/Products.vue` | Modify | Replace "Loose btls" column with "Back Order"; add Pack Size filter dropdown; update total-loose stat card to total-back-order |

---

## Task 1: Data model + interceptor rewrite

**Files:**
- Modify: `frontend/src/data/mockData.js`
- Modify: `frontend/src/services/mockInterceptor.js`

**Interfaces:**
- Produces: `MOCK_PRODUCTS` — 20 SKUs, each with `product_id`, `product_name`, `SKU`, `flavor`, `pack_size`, `status`, `total_stock`, `low_stock_threshold`, `price`, `cost_price`, `back_order`, `case_size`
- Produces: `MOCK_STOCK_MOVEMENTS` — exported array (mutable) of ~15 seed movements across 5 days for 4 active products
- Produces: GET `/stock/movements/` — returns `{ success: true, data: MOCK_STOCK_MOVEMENTS }`; supports optional query params `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&product_id=...` (filter in the handler)
- Produces: POST `/stock/eod/` — payload `{ entry_date, items: [{ product_id, cases_in, cases_out, bo_delta }] }`. Handler splits each item into movements (one 'in' + one 'out' if both nonzero), updates `product.total_stock` and `product.back_order`, and returns `{ success: true, data: { eod_id, entry_date, created_at, movements: [...], back_order_changes: [...], status: 'applied' | 'flagged' } }`
- Deleted: `MOCK_EOD_HISTORY` export and GET `/stock/eod/history/` handler

- [ ] **Step 1: Rewrite `MOCK_PRODUCTS` in `mockData.js`**

Open `frontend/src/data/mockData.js`. Replace the entire `MOCK_PRODUCTS` array (and delete `MOCK_CATEGORIES` — no longer needed) with:

```js
export const MOCK_PRODUCTS = [
  // Mega
  { product_id: 'prod_rc_mega',    product_name: 'RC Cola Mega',       SKU: 'RC-MEGA',    flavor: 'RC Cola', pack_size: 'Mega',        status: 'active',   total_stock: 144, low_stock_threshold: 20, price: 55,  cost_price: 42, back_order: 0, case_size: 12 },
  { product_id: 'prod_lm_mega',    product_name: 'Lemon Mega',         SKU: 'LM-MEGA',    flavor: 'Lemon',   pack_size: 'Mega',        status: 'active',   total_stock: 59,  low_stock_threshold: 15, price: 55,  cost_price: 42, back_order: 0, case_size: 12 },
  { product_id: 'prod_or_mega',    product_name: 'Orange Mega',        SKU: 'OR-MEGA',    flavor: 'Orange',  pack_size: 'Mega',        status: 'active',   total_stock: 44,  low_stock_threshold: 15, price: 55,  cost_price: 42, back_order: 0, case_size: 12 },
  // 240mL
  { product_id: 'prod_rc_240',     product_name: 'RC Cola 240mL',      SKU: 'RC-240',     flavor: 'RC Cola', pack_size: '240mL',       status: 'active',   total_stock: 3,   low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, case_size: 24 },
  { product_id: 'prod_lm_240',     product_name: 'Lemon 240mL',        SKU: 'LM-240',     flavor: 'Lemon',   pack_size: '240mL',       status: 'active',   total_stock: 70,  low_stock_threshold: 20, price: 28,  cost_price: 22, back_order: 1, case_size: 24 },
  { product_id: 'prod_or_240',     product_name: 'Orange 240mL',       SKU: 'OR-240',     flavor: 'Orange',  pack_size: '240mL',       status: 'active',   total_stock: 13,  low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, case_size: 24 },
  { product_id: 'prod_se_240',     product_name: 'Seetrus 240mL',      SKU: 'SE-240',     flavor: 'Seetrus', pack_size: '240mL',       status: 'active',   total_stock: 0,   low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, case_size: 24 },
  // Litro
  { product_id: 'prod_rc_litro',   product_name: 'RC Cola Litro',      SKU: 'RC-LITRO',   flavor: 'RC Cola', pack_size: 'Litro',       status: 'active',   total_stock: 0,   low_stock_threshold: 5,  price: 65,  cost_price: 50, back_order: 0, case_size: 12 },
  { product_id: 'prod_lm_litro',   product_name: 'Lemon Litro',        SKU: 'LM-LITRO',   flavor: 'Lemon',   pack_size: 'Litro',       status: 'active',   total_stock: 31,  low_stock_threshold: 10, price: 65,  cost_price: 50, back_order: 0, case_size: 12 },
  { product_id: 'prod_or_litro',   product_name: 'Orange Litro',       SKU: 'OR-LITRO',   flavor: 'Orange',  pack_size: 'Litro',       status: 'active',   total_stock: 31,  low_stock_threshold: 10, price: 65,  cost_price: 50, back_order: 1, case_size: 12 },
  // 1.5L (inactive — no activity in 43-day source data)
  { product_id: 'prod_rc_15l',     product_name: 'RC Cola 1.5L',       SKU: 'RC-15L',     flavor: 'RC Cola', pack_size: '1.5L',        status: 'inactive', total_stock: 0,   low_stock_threshold: 5,  price: 90,  cost_price: 70, back_order: 0, case_size: 8 },
  { product_id: 'prod_lm_15l',     product_name: 'Lemon 1.5L',         SKU: 'LM-15L',     flavor: 'Lemon',   pack_size: '1.5L',        status: 'inactive', total_stock: 0,   low_stock_threshold: 5,  price: 90,  cost_price: 70, back_order: 0, case_size: 8 },
  { product_id: 'prod_or_15l',     product_name: 'Orange 1.5L',        SKU: 'OR-15L',     flavor: 'Orange',  pack_size: '1.5L',        status: 'inactive', total_stock: 0,   low_stock_threshold: 5,  price: 90,  cost_price: 70, back_order: 0, case_size: 8 },
  // Qute 237mL
  { product_id: 'prod_rc_qute',    product_name: 'RC Cola Qute 237mL', SKU: 'RC-QUTE',    flavor: 'RC Cola', pack_size: 'Qute 237mL',  status: 'active',   total_stock: 163, low_stock_threshold: 30, price: 25,  cost_price: 19, back_order: 0, case_size: 24 },
  // 237mL
  { product_id: 'prod_lm_237',     product_name: 'Lemon 237mL',        SKU: 'LM-237',     flavor: 'Lemon',   pack_size: '237mL',       status: 'active',   total_stock: 41,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, case_size: 24 },
  { product_id: 'prod_or_237',     product_name: 'Orange 237mL',       SKU: 'OR-237',     flavor: 'Orange',  pack_size: '237mL',       status: 'active',   total_stock: 49,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, case_size: 24 },
  { product_id: 'prod_se_237',     product_name: 'Seetrus 237mL',      SKU: 'SE-237',     flavor: 'Seetrus', pack_size: '237mL',       status: 'active',   total_stock: 20,  low_stock_threshold: 10, price: 25,  cost_price: 19, back_order: 0, case_size: 24 },
  // EJ 237mL (inactive)
  { product_id: 'prod_ej_fruit',   product_name: 'EJ Mixed Fruit 237mL',    SKU: 'EJ-FRUIT',   flavor: 'EJ Mixed Fruit',    pack_size: '237mL', status: 'inactive', total_stock: 0, low_stock_threshold: 5, price: 30, cost_price: 23, back_order: 0, case_size: 24 },
  { product_id: 'prod_ej_berries', product_name: 'EJ Mixed Berries 237mL',  SKU: 'EJ-BERRY',   flavor: 'EJ Mixed Berries',  pack_size: '237mL', status: 'inactive', total_stock: 0, low_stock_threshold: 5, price: 30, cost_price: 23, back_order: 0, case_size: 24 },
  { product_id: 'prod_ej_citrus',  product_name: 'EJ Japanese Citrus 237mL', SKU: 'EJ-CITRUS', flavor: 'EJ Japanese Citrus', pack_size: '237mL', status: 'inactive', total_stock: 0, low_stock_threshold: 5, price: 30, cost_price: 23, back_order: 0, case_size: 24 },
]
```

Delete the entire `MOCK_CATEGORIES` export. Delete the entire `MOCK_EOD_HISTORY` export.

- [ ] **Step 2: Add `MOCK_STOCK_MOVEMENTS` to `mockData.js`**

Append at the bottom of `mockData.js`:

```js
export const MOCK_STOCK_MOVEMENTS = [
  // 2026-07-03: RC Cola Mega — delivery in
  { movement_id: 'mv_20260703_001', product_id: 'prod_rc_mega', date: '2026-07-03', type: 'in',  quantity: 50, note: null, created_at: '2026-07-03T09:30:00.000Z' },
  { movement_id: 'mv_20260703_002', product_id: 'prod_lm_mega', date: '2026-07-03', type: 'in',  quantity: 20, note: null, created_at: '2026-07-03T09:30:00.000Z' },

  // 2026-07-04: dispatches out
  { movement_id: 'mv_20260704_001', product_id: 'prod_rc_mega', date: '2026-07-04', type: 'out', quantity: 12, note: null, created_at: '2026-07-04T17:00:00.000Z' },
  { movement_id: 'mv_20260704_002', product_id: 'prod_lm_240',  date: '2026-07-04', type: 'out', quantity: 5,  note: null, created_at: '2026-07-04T17:00:00.000Z' },

  // 2026-07-05: mixed activity + big customer order
  { movement_id: 'mv_20260705_001', product_id: 'prod_rc_qute', date: '2026-07-05', type: 'in',  quantity: 100, note: null, created_at: '2026-07-05T10:00:00.000Z' },
  { movement_id: 'mv_20260705_002', product_id: 'prod_rc_qute', date: '2026-07-05', type: 'out', quantity: 35,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_20260705_003', product_id: 'prod_rc_mega', date: '2026-07-05', type: 'out', quantity: 8,   note: null, created_at: '2026-07-05T17:00:00.000Z' },

  // 2026-07-06: physical count adjustment on Lemon Litro (found extra 3)
  { movement_id: 'mv_20260706_001', product_id: 'prod_lm_litro', date: '2026-07-06', type: 'adjustment', adjustment_direction: 'increase', quantity: 3, note: 'Physical count — found 3 extra cases', created_at: '2026-07-06T11:00:00.000Z' },
  { movement_id: 'mv_20260706_002', product_id: 'prod_or_240',   date: '2026-07-06', type: 'out',        quantity: 4, note: null, created_at: '2026-07-06T17:00:00.000Z' },

  // 2026-07-07: sales day
  { movement_id: 'mv_20260707_001', product_id: 'prod_rc_qute', date: '2026-07-07', type: 'out', quantity: 12, note: null, created_at: '2026-07-07T17:00:00.000Z' },
  { movement_id: 'mv_20260707_002', product_id: 'prod_lm_237',  date: '2026-07-07', type: 'out', quantity: 6,  note: null, created_at: '2026-07-07T17:00:00.000Z' },
  { movement_id: 'mv_20260707_003', product_id: 'prod_or_237',  date: '2026-07-07', type: 'out', quantity: 4,  note: null, created_at: '2026-07-07T17:00:00.000Z' },

  // 2026-07-08: bulk delivery + oversell
  { movement_id: 'mv_20260708_001', product_id: 'prod_rc_mega', date: '2026-07-08', type: 'in',  quantity: 40, note: null, created_at: '2026-07-08T09:00:00.000Z' },
  { movement_id: 'mv_20260708_002', product_id: 'prod_rc_240',  date: '2026-07-08', type: 'out', quantity: 5,  note: 'Oversold — needs reconciliation', created_at: '2026-07-08T17:00:00.000Z' },
]
```

- [ ] **Step 3: Rewrite `mockInterceptor.js`**

Open `frontend/src/services/mockInterceptor.js`. Replace the file entirely with:

```js
// Prototype mock interceptor — intercepts all axios calls and returns static data.
// To re-enable live API: remove the import in main.js.

import { api } from './api.js'
import {
  MOCK_PRODUCTS,
  MOCK_SALES_BY_ITEM,
  MOCK_MONTHLY_DATA,
  MOCK_TRANSACTIONS,
  MOCK_STOCK_MOVEMENTS,
} from '../data/mockData.js'

function mockAdapter(data, status = 200) {
  return (config) =>
    Promise.resolve({
      data,
      status,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
      request: {},
    })
}

function parseQuery(url) {
  const qIdx = url.indexOf('?')
  if (qIdx === -1) return {}
  const params = {}
  url.slice(qIdx + 1).split('&').forEach(pair => {
    const [k, v] = pair.split('=')
    if (k) params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : ''
  })
  return params
}

function getHandler(url) {
  // Stock movements list (filterable)
  if (url.includes('/stock/movements/')) {
    const q = parseQuery(url)
    let rows = MOCK_STOCK_MOVEMENTS.slice()
    if (q.product_id) rows = rows.filter(m => m.product_id === q.product_id)
    if (q.date_from) rows = rows.filter(m => m.date >= q.date_from)
    if (q.date_to)   rows = rows.filter(m => m.date <= q.date_to)
    return mockAdapter({ success: true, data: rows })
  }

  // Products list
  if (/\/products\/?(\?.*)?$/.test(url)) {
    return mockAdapter({
      data: MOCK_PRODUCTS,
      next_page_token: null,
      total_count: MOCK_PRODUCTS.length,
    })
  }

  // Single product by ID
  if (/\/products\/([^/?]+)\/?/.test(url)) {
    const id = url.match(/\/products\/([^/?]+)\//)?.[1]
    const product = MOCK_PRODUCTS.find((p) => p.product_id === id)
    return mockAdapter({ data: product || null })
  }

  // Sales by item
  if (url.includes('sales-display/by-item/') || url.includes('sales-display/pos-item-summary/')) {
    return mockAdapter(MOCK_SALES_BY_ITEM)
  }

  // Sales summary
  if (url.includes('sales-display/summary/')) {
    const totalRevenue = MOCK_SALES_BY_ITEM.reduce((s, i) => s + i.total_sales, 0)
    const totalCost = MOCK_SALES_BY_ITEM.reduce((s, i) => s + i.items_sold * i.cost_price, 0)
    return mockAdapter({
      total_revenue: totalRevenue,
      total_profit: totalRevenue - totalCost,
      total_transactions: MOCK_SALES_BY_ITEM.reduce((s, i) => s + i.items_sold, 0),
    })
  }

  // Monthly sales
  if (url.includes('sales-report/by-period/')) {
    return mockAdapter({ data: MOCK_MONTHLY_DATA })
  }

  // Recent sales
  if (url.includes('/sales/recent/')) {
    return mockAdapter({ success: true, data: MOCK_TRANSACTIONS })
  }

  // Invoices / sales fallback
  if (url.includes('/invoices/') || url.includes('/sales/') || url.includes('sales-display/')) {
    return mockAdapter({ data: [], success: true, total_transactions: 0 })
  }

  // Products stats fallback
  if (url.includes('/products/')) {
    return mockAdapter({ data: [] })
  }

  // Suppliers
  if (url.includes('/suppliers/')) {
    return mockAdapter({ data: [] })
  }

  return mockAdapter({ data: [], success: true })
}

let movementCounter = MOCK_STOCK_MOVEMENTS.length

function getPostHandler(config) {
  const url = config.url || ''

  if (url.includes('/stock/eod/')) {
    return (cfg) => {
      const body = JSON.parse(cfg.data || '{}')
      const items = body.items ?? []
      const entryDate = body.entry_date
      const created_at = new Date().toISOString()
      const movements = []
      const back_order_changes = []
      let flagged = false

      items.forEach(item => {
        const product = MOCK_PRODUCTS.find(p => p.product_id === item.product_id)
        if (!product) return

        const casesIn = Number(item.cases_in) || 0
        const casesOut = Number(item.cases_out) || 0
        const boDelta = Number(item.bo_delta) || 0

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

  return null
}

api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  const handler = method === 'post'
    ? getPostHandler(config)
    : getHandler(config.url || '')
  if (handler) {
    config.adapter = handler
  }
  return config
})
```

- [ ] **Step 4: Verify manually**

There are no automated tests for the interceptor itself. Verify by re-reading both files and confirming:
1. `MOCK_CATEGORIES` and `MOCK_EOD_HISTORY` are gone from `mockData.js`
2. `MOCK_STOCK_MOVEMENTS` is exported with 15 entries
3. `MOCK_PRODUCTS` has 20 entries with `flavor`, `pack_size`, `back_order` on every row
4. `mockInterceptor.js` imports `MOCK_STOCK_MOVEMENTS`, not `MOCK_EOD_HISTORY`
5. The `/stock/eod/history/` handler is removed
6. The `/stock/movements/` handler exists with query filtering

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/mockData.js frontend/src/services/mockInterceptor.js
git commit -m "feat: refactor mock data to event-log model with 20 real SKUs"
```

---

## Task 2: `useStockMovements` composable

**Files:**
- Create: `frontend/src/composables/api/useStockMovements.js`
- Create: `frontend/src/composables/api/__tests__/useStockMovements.test.js`

**Interfaces:**
- Consumes: `api` from `frontend/src/services/api.js` (GET only)
- Produces (all returned from `useStockMovements()`):
  - `movements` — `Ref<Movement[]>`
  - `loading` — `Ref<boolean>`
  - `error` — `Ref<string | null>`
  - `fetchMovements({ dateFrom, dateTo, productId }?)` — GET `/stock/movements/` with optional query params; sets `movements.value`
  - `groupByProductAndDate(movements, dates, products)` — returns `Map<product_id, Map<date, { in, out, adjustment, net }>>` where `in`/`out`/`adjustment` are summed positive integers and `net = in − out ± adjustment_direction`
  - `computeRunningBalance(product, movements, dates)` — returns `Map<date, number>`; walks `dates` in order applying movements, starts from `product.total_stock - Σ(all movements for this product after last date)` so the endpoint of the range matches current total_stock
  - `computeDailyTotals(movements, dates)` — returns `Map<date, { in, out, net }>`; sums across all products per date

`Movement` shape (matches the schema in Global Constraints).

- [ ] **Step 1: Write failing tests**

Create `frontend/src/composables/api/__tests__/useStockMovements.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/services/api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/services/api.js'
import { useStockMovements } from '../useStockMovements.js'

const MOCK_MOVEMENTS = [
  { movement_id: 'mv_1', product_id: 'prod_a', date: '2026-07-05', type: 'in',  quantity: 10, note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_2', product_id: 'prod_a', date: '2026-07-05', type: 'out', quantity: 3,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_3', product_id: 'prod_a', date: '2026-07-06', type: 'out', quantity: 2,  note: null, created_at: '2026-07-06T17:00:00.000Z' },
  { movement_id: 'mv_4', product_id: 'prod_b', date: '2026-07-05', type: 'in',  quantity: 5,  note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_5', product_id: 'prod_a', date: '2026-07-06', type: 'adjustment', adjustment_direction: 'increase', quantity: 1, note: null, created_at: '2026-07-06T11:00:00.000Z' },
]

describe('useStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchMovements returns data from api', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: MOCK_MOVEMENTS } })
    const { movements, fetchMovements } = useStockMovements()
    await fetchMovements()
    expect(api.get).toHaveBeenCalledWith('/stock/movements/', { params: {} })
    expect(movements.value).toHaveLength(5)
  })

  it('fetchMovements forwards dateFrom/dateTo/productId as query params', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: [] } })
    const { fetchMovements } = useStockMovements()
    await fetchMovements({ dateFrom: '2026-07-01', dateTo: '2026-07-31', productId: 'prod_a' })
    expect(api.get).toHaveBeenCalledWith('/stock/movements/', {
      params: { date_from: '2026-07-01', date_to: '2026-07-31', product_id: 'prod_a' },
    })
  })

  it('groupByProductAndDate produces per-product-per-date sums', () => {
    const { groupByProductAndDate } = useStockMovements()
    const grouped = groupByProductAndDate(MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'], [{ product_id: 'prod_a' }, { product_id: 'prod_b' }])
    const aOn5 = grouped.get('prod_a').get('2026-07-05')
    expect(aOn5).toEqual({ in: 10, out: 3, adjustment: 0, net: 7 })
    const aOn6 = grouped.get('prod_a').get('2026-07-06')
    expect(aOn6).toEqual({ in: 0, out: 2, adjustment: 1, net: -1 })
    const bOn5 = grouped.get('prod_b').get('2026-07-05')
    expect(bOn5).toEqual({ in: 5, out: 0, adjustment: 0, net: 5 })
    const bOn6 = grouped.get('prod_b').get('2026-07-06')
    expect(bOn6).toEqual({ in: 0, out: 0, adjustment: 0, net: 0 })
  })

  it('computeRunningBalance walks dates forward ending at current total_stock', () => {
    const product = { product_id: 'prod_a', total_stock: 6 }
    // net over [05, 06] = 7 + (-1) = 6, so start balance for the range = 0
    const { computeRunningBalance } = useStockMovements()
    const balances = computeRunningBalance(product, MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'])
    expect(balances.get('2026-07-05')).toBe(7)   // 0 + 7
    expect(balances.get('2026-07-06')).toBe(6)   // 7 + (-1)
  })

  it('computeDailyTotals sums across all products per date', () => {
    const { computeDailyTotals } = useStockMovements()
    const totals = computeDailyTotals(MOCK_MOVEMENTS, ['2026-07-05', '2026-07-06'])
    expect(totals.get('2026-07-05')).toEqual({ in: 15, out: 3, net: 12 })
    expect(totals.get('2026-07-06')).toEqual({ in: 0, out: 2, net: -1 })
  })

  it('adjustment with direction=decrease subtracts from net', () => {
    const decreaseMovements = [
      { movement_id: 'mv_x', product_id: 'prod_a', date: '2026-07-05', type: 'adjustment', adjustment_direction: 'decrease', quantity: 4, note: null, created_at: '2026-07-05T11:00:00.000Z' },
    ]
    const { groupByProductAndDate } = useStockMovements()
    const grouped = groupByProductAndDate(decreaseMovements, ['2026-07-05'], [{ product_id: 'prod_a' }])
    const cell = grouped.get('prod_a').get('2026-07-05')
    expect(cell).toEqual({ in: 0, out: 0, adjustment: -4, net: -4 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/composables/api/__tests__/useStockMovements.test.js`
Expected: FAIL — `Cannot find module '../useStockMovements.js'`

- [ ] **Step 3: Create the composable**

Create `frontend/src/composables/api/useStockMovements.js`:

```js
import { ref } from 'vue'
import { api } from '@/services/api.js'

export function useStockMovements() {
  const movements = ref([])
  const loading = ref(false)
  const error = ref(null)

  const fetchMovements = async ({ dateFrom, dateTo, productId } = {}) => {
    loading.value = true
    error.value = null
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo)   params.date_to = dateTo
      if (productId) params.product_id = productId
      const response = await api.get('/stock/movements/', { params })
      movements.value = response.data.data || []
    } catch (err) {
      error.value = err.message || 'Failed to load movements'
    } finally {
      loading.value = false
    }
  }

  const groupByProductAndDate = (mvs, dates, products) => {
    const map = new Map()
    products.forEach(p => {
      const inner = new Map()
      dates.forEach(d => inner.set(d, { in: 0, out: 0, adjustment: 0, net: 0 }))
      map.set(p.product_id, inner)
    })
    mvs.forEach(m => {
      const perProduct = map.get(m.product_id)
      if (!perProduct) return
      const cell = perProduct.get(m.date)
      if (!cell) return
      if (m.type === 'in') {
        cell.in += m.quantity
        cell.net += m.quantity
      } else if (m.type === 'out') {
        cell.out += m.quantity
        cell.net -= m.quantity
      } else if (m.type === 'adjustment') {
        const signed = m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        cell.adjustment += signed
        cell.net += signed
      }
    })
    return map
  }

  const computeRunningBalance = (product, mvs, dates) => {
    if (dates.length === 0) return new Map()
    const relevant = mvs.filter(m => m.product_id === product.product_id)
    const netInRange = relevant
      .filter(m => m.date >= dates[0] && m.date <= dates[dates.length - 1])
      .reduce((sum, m) => {
        if (m.type === 'in') return sum + m.quantity
        if (m.type === 'out') return sum - m.quantity
        if (m.type === 'adjustment') {
          return sum + (m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity)
        }
        return sum
      }, 0)
    const afterRangeNet = relevant
      .filter(m => m.date > dates[dates.length - 1])
      .reduce((sum, m) => {
        if (m.type === 'in') return sum + m.quantity
        if (m.type === 'out') return sum - m.quantity
        if (m.type === 'adjustment') {
          return sum + (m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity)
        }
        return sum
      }, 0)
    let running = (product.total_stock ?? 0) - netInRange - afterRangeNet
    const balances = new Map()
    dates.forEach(d => {
      const dayMovements = relevant.filter(m => m.date === d)
      dayMovements.forEach(m => {
        if (m.type === 'in') running += m.quantity
        else if (m.type === 'out') running -= m.quantity
        else if (m.type === 'adjustment') {
          running += m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        }
      })
      balances.set(d, running)
    })
    return balances
  }

  const computeDailyTotals = (mvs, dates) => {
    const totals = new Map()
    dates.forEach(d => totals.set(d, { in: 0, out: 0, net: 0 }))
    mvs.forEach(m => {
      const cell = totals.get(m.date)
      if (!cell) return
      if (m.type === 'in') {
        cell.in += m.quantity
        cell.net += m.quantity
      } else if (m.type === 'out') {
        cell.out += m.quantity
        cell.net -= m.quantity
      } else if (m.type === 'adjustment') {
        const signed = m.adjustment_direction === 'decrease' ? -m.quantity : m.quantity
        cell.net += signed
      }
    })
    return totals
  }

  return {
    movements,
    loading,
    error,
    fetchMovements,
    groupByProductAndDate,
    computeRunningBalance,
    computeDailyTotals,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd frontend && npx vitest run src/composables/api/__tests__/useStockMovements.test.js`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/api/useStockMovements.js frontend/src/composables/api/__tests__/useStockMovements.test.js
git commit -m "feat: add useStockMovements composable with grouping and balance derivation"
```

---

## Task 3: Rewrite `useEodUpdate` for cases_in / cases_out / bo_delta

**Files:**
- Rewrite: `frontend/src/composables/api/useEodUpdate.js`
- Rewrite: `frontend/src/composables/api/__tests__/useEodUpdate.test.js`

**Interfaces:**
- Consumes: `api` from `frontend/src/services/api.js`; `useProducts` from `./useProducts.js`
- Produces (all returned):
  - `products`, `activeProducts` — refs
  - `entries` — `Ref<{ [product_id]: { cases_in: number, cases_out: number, bo_delta: number } }>`
  - `changedItems` — `ComputedRef<Item[]>` where `Item = { product_id, product_name, cases_in, cases_out, bo_delta, stock_before, stock_after, needs_reconciliation }`; item is included when any of the three inputs is nonzero
  - `flaggedItems` — `changedItems.filter(i => i.needs_reconciliation)` (`stock_after < 0`)
  - `hasChanges` — bool
  - `loading`, `productsLoading`, `submitted`, `lastSubmission`, `error` — refs
  - `initEntries()` — initializes `entries` from active products with `{ cases_in: 0, cases_out: 0, bo_delta: 0 }` per product
  - `initializeProducts()` — from useProducts
  - `submitEod(entryDate)` — POST `/stock/eod/`; body `{ entry_date, items: changedItems.value.map(i => ({ product_id, cases_in, cases_out, bo_delta })) }`
  - `resetForm()` — clears submission state and re-inits entries

- [ ] **Step 1: Rewrite the test file**

Overwrite `frontend/src/composables/api/__tests__/useEodUpdate.test.js` with:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

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
    expect(changedItems.value[0].stock_after).toBe(90)
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
})
```

- [ ] **Step 2: Run tests to verify they fail against the old composable**

Run: `cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js`
Expected: FAIL — old composable uses `cases_sold`/`loose_bottles` keys and `entries['prod_a']` shape mismatches new expectations

- [ ] **Step 3: Rewrite the composable**

Overwrite `frontend/src/composables/api/useEodUpdate.js` with:

```js
import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'

// State (entries, submitted, lastSubmission, history, error) is scoped per
// component instance — each useEodUpdate() call produces fresh refs.
// Cross-route continuity relies on the mock interceptor mutating
// MOCK_STOCK_MOVEMENTS in place, which StockHistory.vue re-reads on mount.

export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()

  const entries = ref({})
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active')
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = { cases_in: 0, cases_out: 0, bo_delta: 0 }
    })
    entries.value = map
  }

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_in: 0, cases_out: 0, bo_delta: 0 }
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before + entry.cases_in - entry.cases_out
        const changed = entry.cases_in !== 0 || entry.cases_out !== 0 || entry.bo_delta !== 0
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          cases_in: entry.cases_in,
          cases_out: entry.cases_out,
          bo_delta: entry.bo_delta,
          stock_before,
          stock_after,
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

  const hasChanges = computed(() => changedItems.value.length > 0)

  const submitEod = async (entryDate) => {
    loading.value = true
    error.value = null
    try {
      const payload = {
        entry_date: entryDate,
        items: changedItems.value.map(i => ({
          product_id: i.product_id,
          cases_in: i.cases_in,
          cases_out: i.cases_out,
          bo_delta: i.bo_delta,
        })),
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
    initEntries()
  }

  return {
    products,
    activeProducts,
    entries,
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

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js`
Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/api/useEodUpdate.js frontend/src/composables/api/__tests__/useEodUpdate.test.js
git commit -m "feat: rewrite useEodUpdate for cases_in/cases_out/bo_delta model"
```

---

## Task 4: Rewrite `EodUpdate.vue` — three-column entry with live balance and sparse mode

**Files:**
- Rewrite: `frontend/src/pages/stock/EodUpdate.vue`
- Rewrite: `frontend/src/pages/stock/__tests__/EodUpdate.test.js`

**Interfaces:**
- Consumes: `useEodUpdate` from Task 3
- Produces: page at `/stock/eod`. Entry step shows only products in the user's working set (products they've added via search or the "Show all" toggle). Live-preview `stock_after` next to each product row. Preview step shows the summary matrix. Success step navigates or resets.

- [ ] **Step 1: Rewrite the test file**

Overwrite `frontend/src/pages/stock/__tests__/EodUpdate.test.js` with:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_a', product_name: 'RC Cola Mega', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 100, back_order: 0 },
    { product_id: 'prod_b', product_name: 'Lemon 240mL', flavor: 'Lemon', pack_size: '240mL',   total_stock: 50,  back_order: 1 },
  ]),
  entries: ref({
    prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0 },
    prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0 },
  }),
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
    mockComposable.entries.value = {
      prod_a: { cases_in: 0, cases_out: 0, bo_delta: 0 },
      prod_b: { cases_in: 0, cases_out: 0, bo_delta: 0 },
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

  it('adding a product to the working set renders a product row with three inputs', async () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    await wrapper.vm.addToWorkingSet('prod_a')
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('[data-testid="product-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('[data-testid="input-cases-in"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-cases-out"]').exists()).toBe(true)
    expect(rows[0].find('[data-testid="input-bo-delta"]').exists()).toBe(true)
  })

  it('preview button disabled when hasChanges is false', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation banner in preview when flaggedItems present', async () => {
    mockComposable.flaggedItems.value = [
      { product_id: 'prod_a', product_name: 'RC Cola Mega', cases_in: 0, cases_out: 150, bo_delta: 0, stock_before: 100, stock_after: -50, needs_reconciliation: true },
    ]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    wrapper.vm.step = 'preview'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="recon-banner"]').exists()).toBe(true)
  })

  it('shows success view when submitted is true', async () => {
    mockComposable.submitted.value = true
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="success-view"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail against the old page**

Run: `cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js`
Expected: FAIL — old page renders every active product row on mount; new tests expect empty working set

- [ ] **Step 3: Rewrite the page**

Overwrite `frontend/src/pages/stock/EodUpdate.vue` with:

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

      <!-- Reconciliation warning banner (preview only) -->
      <div
        v-if="step === 'preview' && flaggedItems.length > 0"
        data-testid="recon-banner"
        class="d-flex align-items-center gap-2 rounded p-3 mb-3"
        style="background: var(--status-warning-bg); border: 1px solid var(--status-warning); color: var(--status-warning);"
      >
        <span style="font-size: 1.1rem;">⚠</span>
        <span>
          <strong>{{ flaggedItems.length }} product{{ flaggedItems.length !== 1 ? 's' : '' }}</strong>
          will have negative stock and need reconciliation after this update.
        </span>
      </div>

      <!-- Loading -->
      <div v-if="productsLoading" class="text-center py-5">
        <div class="spinner-border" style="color: var(--text-accent);" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <!-- STEP: Entry -->
      <div v-else-if="step === 'entry'">
        <!-- Product picker (sparse-mode add-a-product control) -->
        <div data-testid="product-picker" class="surface-card border-theme rounded p-3 mb-3">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <label class="mb-0" style="font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap;">Add product to today's entry</label>
            <select
              class="form-select form-select-sm input-theme"
              style="max-width: 320px;"
              v-model="pickerSelection"
              @change="onPickerChange"
            >
              <option value="" disabled>— pick a product —</option>
              <option
                v-for="p in productsNotInWorkingSet"
                :key="p.product_id"
                :value="p.product_id"
              >
                {{ p.product_name }}
              </option>
            </select>
            <button
              class="btn btn-filter btn-sm"
              style="border-radius: 0.3rem !important;"
              @click="addAllActive"
              :disabled="workingSet.length === activeProducts.length"
              title="Add every active product to the entry"
            >Show all</button>
          </div>
        </div>

        <!-- Working-set table -->
        <div v-if="workingSet.length > 0" class="surface-card border-theme rounded" style="overflow: hidden;">
          <table class="table mb-0">
            <thead>
              <tr>
                <th style="color: var(--text-primary);">Product</th>
                <th class="text-center" style="width: 90px; color: var(--text-primary);">Bal</th>
                <th class="text-center" style="width: 120px; color: var(--text-primary);">Cases In</th>
                <th class="text-center" style="width: 120px; color: var(--text-primary);">Cases Out</th>
                <th class="text-center" style="width: 110px; color: var(--text-primary);">BO Δ</th>
                <th class="text-center" style="width: 110px; color: var(--text-primary);">After</th>
                <th style="width: 36px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="product in workingSetProducts"
                :key="product.product_id"
                data-testid="product-row"
              >
                <td style="color: var(--text-primary); font-weight: 500;">
                  <div>{{ product.product_name }}</div>
                  <small style="color: var(--text-tertiary);">{{ product.pack_size }} · BO: {{ product.back_order }}</small>
                </td>
                <td class="text-center">
                  <span :style="stockStyle(product)">{{ product.total_stock ?? 0 }}</span>
                </td>
                <td class="text-center">
                  <input
                    v-if="entries[product.product_id]"
                    data-testid="input-cases-in"
                    type="number"
                    min="0"
                    class="form-control form-control-sm text-center input-theme"
                    v-model.number="entries[product.product_id].cases_in"
                    style="border-radius: 0.3rem;"
                  />
                </td>
                <td class="text-center">
                  <input
                    v-if="entries[product.product_id]"
                    data-testid="input-cases-out"
                    type="number"
                    min="0"
                    class="form-control form-control-sm text-center input-theme"
                    v-model.number="entries[product.product_id].cases_out"
                    style="border-radius: 0.3rem;"
                  />
                </td>
                <td class="text-center">
                  <input
                    v-if="entries[product.product_id]"
                    data-testid="input-bo-delta"
                    type="number"
                    class="form-control form-control-sm text-center input-theme"
                    v-model.number="entries[product.product_id].bo_delta"
                    style="border-radius: 0.3rem;"
                  />
                </td>
                <td class="text-center fw-bold" :style="afterStyle(product)">
                  {{ computeAfter(product) }}
                </td>
                <td class="text-center">
                  <button
                    class="btn btn-cancel btn-sm"
                    style="border-radius: 0.3rem !important; padding: 0.15rem 0.4rem; font-size: 0.75rem;"
                    @click="removeFromWorkingSet(product.product_id)"
                    title="Remove from entry"
                  >✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Empty working set hint -->
        <div v-else class="text-center py-4" style="color: var(--text-tertiary); font-size: 0.9rem;">
          Add products above to record today's activity.
        </div>
      </div>

      <!-- STEP: Preview -->
      <div v-else-if="step === 'preview'">
        <div v-if="changedItems.length === 0" class="text-center py-4" style="color: var(--text-tertiary);">
          No changes to apply.
        </div>
        <div v-else class="surface-card border-theme rounded" style="overflow: hidden;">
          <table class="table mb-0">
            <thead>
              <tr>
                <th style="color: var(--text-primary);">Product</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">Before</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">In</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">Out</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">After</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">BO Δ</th>
                <th class="text-center" style="width: 130px; color: var(--text-primary);">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in changedItems"
                :key="item.product_id"
                :style="item.needs_reconciliation ? 'background: var(--status-warning-bg);' : ''"
              >
                <td style="color: var(--text-primary); font-weight: 500;">{{ item.product_name }}</td>
                <td class="text-center" style="color: var(--text-secondary);">{{ item.stock_before }}</td>
                <td class="text-center fw-bold" style="color: var(--status-success);">
                  <span v-if="item.cases_in > 0">+{{ item.cases_in }}</span>
                  <span v-else style="color: var(--text-tertiary);">—</span>
                </td>
                <td class="text-center fw-bold" style="color: var(--status-error);">
                  <span v-if="item.cases_out > 0">−{{ item.cases_out }}</span>
                  <span v-else style="color: var(--text-tertiary);">—</span>
                </td>
                <td class="text-center fw-bold" :style="item.needs_reconciliation ? 'color: var(--status-error);' : 'color: var(--status-success);'">
                  {{ item.stock_after }}
                </td>
                <td class="text-center" style="color: var(--text-secondary);">
                  <span v-if="item.bo_delta !== 0">{{ item.bo_delta > 0 ? '+' : '' }}{{ item.bo_delta }}</span>
                  <span v-else style="color: var(--text-tertiary);">—</span>
                </td>
                <td class="text-center">
                  <span
                    v-if="item.needs_reconciliation"
                    class="badge"
                    style="background: var(--status-warning); color: var(--text-inverse); font-size: 0.68rem;"
                  >Needs Recon.</span>
                  <span
                    v-else
                    class="badge"
                    style="background: var(--status-success); color: var(--text-inverse); font-size: 0.68rem;"
                  >OK</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
        <button
          v-if="step === 'preview'"
          class="btn btn-filter btn-sm"
          style="border-radius: 0.3rem !important;"
          @click="step = 'entry'"
        >← Back</button>
        <div v-else></div>

        <div class="d-flex gap-2">
          <button
            class="btn btn-cancel btn-sm"
            style="border-radius: 0.3rem !important;"
            @click="$router.push('/products')"
          >Cancel</button>
          <button
            v-if="step === 'entry'"
            data-testid="preview-btn"
            class="btn btn-submit btn-sm"
            style="border-radius: 0.3rem !important;"
            @click="step = 'preview'"
            :disabled="!hasChanges"
          >Preview Changes →</button>
          <button
            v-if="step === 'preview'"
            class="btn btn-add btn-sm"
            style="border-radius: 0.3rem !important;"
            @click="handleSubmit"
            :disabled="loading || changedItems.length === 0"
          >{{ loading ? 'Applying...' : 'Apply Changes' }}</button>
        </div>
      </div>
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
      changedItems,
      flaggedItems,
      hasChanges,
      loading,
      productsLoading,
      submitted,
      lastSubmission,
      error,
      initEntries,
      initializeProducts,
      submitEod,
      resetForm,
    } = useEodUpdate()

    const step = ref('entry')
    const entryDate = ref(new Date().toISOString().split('T')[0])
    const workingSet = ref([])
    const pickerSelection = ref('')

    const formattedDate = computed(() => {
      const d = new Date(entryDate.value + 'T00:00:00')
      return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    })

    const workingSetProducts = computed(() =>
      workingSet.value
        .map(id => activeProducts.value.find(p => p.product_id === id))
        .filter(Boolean)
    )

    const productsNotInWorkingSet = computed(() =>
      activeProducts.value.filter(p => !workingSet.value.includes(p.product_id))
    )

    const addToWorkingSet = (productId) => {
      if (!productId || workingSet.value.includes(productId)) return
      workingSet.value = [...workingSet.value, productId]
    }

    const removeFromWorkingSet = (productId) => {
      workingSet.value = workingSet.value.filter(id => id !== productId)
      if (entries.value[productId]) {
        entries.value[productId] = { cases_in: 0, cases_out: 0, bo_delta: 0 }
      }
    }

    const onPickerChange = () => {
      addToWorkingSet(pickerSelection.value)
      pickerSelection.value = ''
    }

    const addAllActive = () => {
      workingSet.value = activeProducts.value.map(p => p.product_id)
    }

    const computeAfter = (product) => {
      const entry = entries.value[product.product_id]
      if (!entry) return product.total_stock ?? 0
      return (product.total_stock ?? 0) + (entry.cases_in || 0) - (entry.cases_out || 0)
    }

    const stockStyle = (product) => {
      const stock = product.total_stock ?? 0
      if (stock === 0) return 'color: var(--status-error); font-weight: 700;'
      if (stock <= (product.low_stock_threshold || 15)) return 'color: var(--status-warning); font-weight: 700;'
      return 'color: var(--status-success);'
    }

    const afterStyle = (product) => {
      const after = computeAfter(product)
      if (after < 0) return 'color: var(--status-error);'
      if (after === 0) return 'color: var(--status-warning);'
      return 'color: var(--status-success);'
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
      entryDate.value = new Date().toISOString().split('T')[0]
      workingSet.value = []
      pickerSelection.value = ''
      resetForm()
    }

    onMounted(async () => {
      await initializeProducts()
      initEntries()
    })

    return {
      activeProducts,
      entries,
      changedItems,
      flaggedItems,
      hasChanges,
      loading,
      productsLoading,
      submitted,
      lastSubmission,
      error,
      step,
      entryDate,
      formattedDate,
      workingSet,
      workingSetProducts,
      productsNotInWorkingSet,
      pickerSelection,
      addToWorkingSet,
      removeFromWorkingSet,
      onPickerChange,
      addAllActive,
      computeAfter,
      stockStyle,
      afterStyle,
      handleSubmit,
      startNew,
    }
  }
}
</script>

<style scoped>
.eod-page {
  min-height: 100vh;
}

.table thead th {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid var(--border-primary);
}

.table tbody td {
  padding: 0.55rem 1rem;
  border-color: var(--border-primary);
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: none;
}
</style>
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js`
Expected: 6/6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/stock/EodUpdate.vue frontend/src/pages/stock/__tests__/EodUpdate.test.js
git commit -m "feat: rewrite EOD Update page with sparse entry and three-column model"
```

---

## Task 5: Rewrite `StockHistory.vue` as a matrix view

**Files:**
- Rewrite: `frontend/src/pages/stock/StockHistory.vue`
- Rewrite: `frontend/src/pages/stock/__tests__/StockHistory.test.js`

**Interfaces:**
- Consumes: `useStockMovements` (Task 2), `useProducts`
- Produces: page at `/stock/history` — a product × day matrix. Sticky first column (product name + current BO). Column per date in the selected range. Each cell shows either the day's `Bal` or a compact `+in/-out` badge (design choice: show `Bal` primarily, hover reveals delta). Aggregate footer row shows daily `In / Out / Net`. Date range picker in the header defaults to last 14 days ending today.

- [ ] **Step 1: Rewrite the test file**

Overwrite `frontend/src/pages/stock/__tests__/StockHistory.test.js` with:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const MOCK_MOVEMENTS = [
  { movement_id: 'mv_1', product_id: 'prod_a', date: '2026-07-05', type: 'in',  quantity: 10, note: null, created_at: '2026-07-05T09:00:00.000Z' },
  { movement_id: 'mv_2', product_id: 'prod_a', date: '2026-07-05', type: 'out', quantity: 3,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_3', product_id: 'prod_b', date: '2026-07-06', type: 'out', quantity: 2,  note: null, created_at: '2026-07-06T17:00:00.000Z' },
]

const mockMovementsComposable = {
  movements: ref(MOCK_MOVEMENTS),
  loading: ref(false),
  error: ref(null),
  fetchMovements: vi.fn().mockResolvedValue(undefined),
  groupByProductAndDate: vi.fn((mvs, dates, products) => {
    const map = new Map()
    products.forEach(p => {
      const inner = new Map()
      dates.forEach(d => inner.set(d, { in: 0, out: 0, adjustment: 0, net: 0 }))
      map.set(p.product_id, inner)
    })
    mvs.forEach(m => {
      const perProduct = map.get(m.product_id)
      if (!perProduct) return
      const cell = perProduct.get(m.date)
      if (!cell) return
      if (m.type === 'in')  { cell.in += m.quantity;  cell.net += m.quantity }
      if (m.type === 'out') { cell.out += m.quantity; cell.net -= m.quantity }
    })
    return map
  }),
  computeRunningBalance: vi.fn(() => new Map([['2026-07-05', 7], ['2026-07-06', 5]])),
  computeDailyTotals: vi.fn(() => new Map([
    ['2026-07-05', { in: 10, out: 3, net: 7 }],
    ['2026-07-06', { in: 0, out: 2, net: -2 }],
  ])),
}

const mockProductsComposable = {
  products: ref([
    { product_id: 'prod_a', product_name: 'RC Cola Mega', flavor: 'RC Cola', pack_size: 'Mega', total_stock: 5, back_order: 0, status: 'active' },
    { product_id: 'prod_b', product_name: 'Lemon 240mL', flavor: 'Lemon', pack_size: '240mL',   total_stock: 3, back_order: 1, status: 'active' },
  ]),
  loading: ref(false),
  initializeProducts: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useStockMovements.js', () => ({
  useStockMovements: () => mockMovementsComposable,
}))
vi.mock('@/composables/api/useProducts.js', () => ({
  useProducts: () => mockProductsComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMovementsComposable.movements.value = MOCK_MOVEMENTS
  })

  it('renders a row per active product in the matrix', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="matrix-row"]')).toHaveLength(2)
  })

  it('renders a date column per day in the range', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    // Default range = 14 days
    const dateHeaders = wrapper.findAll('[data-testid="date-header"]')
    expect(dateHeaders.length).toBe(14)
  })

  it('renders the aggregate footer row', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="aggregate-footer"]').exists()).toBe(true)
  })

  it('shows empty state when no movements load', async () => {
    mockMovementsComposable.movements.value = []
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('calls fetchMovements on mount', async () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockMovementsComposable.fetchMovements).toHaveBeenCalled()
  })

  it('shows load-error banner when error is set', async () => {
    mockMovementsComposable.error.value = 'Network Error'
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="error-banner"]').exists()).toBe(true)
    mockMovementsComposable.error.value = null
  })
})
```

- [ ] **Step 2: Run tests to verify they fail against the old page**

Run: `cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js`
Expected: FAIL — old page uses `useEodUpdate`, expects `history-entry` testids etc.

- [ ] **Step 3: Rewrite the page**

Overwrite `frontend/src/pages/stock/StockHistory.vue` with:

```vue
<template>
  <div class="container-fluid pt-2 pb-5 surface-secondary" style="min-height: 100vh;">

    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div>
        <h5 class="mb-0" style="color: var(--text-primary); font-weight: 700;">Stock History</h5>
        <small style="color: var(--text-tertiary);">Product × day matrix of movements</small>
      </div>
      <div class="d-flex align-items-center gap-2">
        <label class="mb-0" style="font-size: 0.8rem; color: var(--text-secondary);">From</label>
        <input type="date" v-model="dateFrom" class="form-control form-control-sm input-theme" style="width: auto;" @change="reloadRange" />
        <label class="mb-0" style="font-size: 0.8rem; color: var(--text-secondary);">To</label>
        <input type="date" v-model="dateTo" class="form-control form-control-sm input-theme" style="width: auto;" @change="reloadRange" />
        <button class="btn btn-add btn-sm" style="border-radius: 0.3rem !important;" @click="$router.push('/stock/eod')">+ New EOD</button>
      </div>
    </div>

    <!-- Load-error banner -->
    <div
      v-if="error"
      data-testid="error-banner"
      class="surface-card border-theme rounded p-3 mb-3"
      style="border-color: var(--status-error); color: var(--status-error);"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" style="color: var(--text-accent);" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="movements.length === 0"
      data-testid="empty-state"
      class="text-center py-5"
    >
      <div class="surface-card border-theme rounded p-5 mx-auto" style="max-width: 400px;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
        <p style="color: var(--text-tertiary);">No stock movements recorded in this range.</p>
        <button
          class="btn btn-add btn-sm mt-2"
          style="border-radius: 0.3rem !important;"
          @click="$router.push('/stock/eod')"
        >Record EOD Entry</button>
      </div>
    </div>

    <!-- Matrix -->
    <div v-else class="surface-card border-theme rounded matrix-wrapper">
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="sticky-col header-cell product-header">Product</th>
              <th
                v-for="d in dates"
                :key="d"
                data-testid="date-header"
                class="header-cell"
              >
                {{ formatShortDate(d) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="product in activeProducts"
              :key="product.product_id"
              data-testid="matrix-row"
            >
              <td class="sticky-col product-cell">
                <div style="font-weight: 600; color: var(--text-primary);">{{ product.product_name }}</div>
                <small style="color: var(--text-tertiary);">
                  {{ product.pack_size }}<span v-if="product.back_order > 0"> · BO: {{ product.back_order }}</span>
                </small>
              </td>
              <td
                v-for="d in dates"
                :key="d"
                class="cell"
                :title="cellTooltip(product, d)"
              >
                <div class="cell-content">
                  <div class="bal" :style="cellStyle(product, d)">
                    {{ cellBalance(product, d) }}
                  </div>
                  <div v-if="hasActivity(product, d)" class="deltas">
                    <span v-if="cellDelta(product, d).in > 0" class="delta-in">+{{ cellDelta(product, d).in }}</span>
                    <span v-if="cellDelta(product, d).out > 0" class="delta-out">-{{ cellDelta(product, d).out }}</span>
                    <span v-if="cellDelta(product, d).adjustment !== 0" class="delta-adj">
                      {{ cellDelta(product, d).adjustment > 0 ? '+' : '' }}{{ cellDelta(product, d).adjustment }}*
                    </span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr data-testid="aggregate-footer" class="footer-row">
              <td class="sticky-col footer-label">Daily Totals</td>
              <td
                v-for="d in dates"
                :key="d"
                class="cell footer-cell"
              >
                <div class="footer-in">+{{ dailyTotalIn(d) }}</div>
                <div class="footer-out">−{{ dailyTotalOut(d) }}</div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useStockMovements } from '@/composables/api/useStockMovements.js'
import { useProducts } from '@/composables/api/useProducts.js'

export default {
  name: 'StockHistory',

  setup() {
    const { movements, loading, error, fetchMovements, groupByProductAndDate, computeRunningBalance, computeDailyTotals } = useStockMovements()
    const { products, initializeProducts } = useProducts()

    const today = new Date()
    const isoDay = (offset = 0) => {
      const d = new Date(today.getTime() + offset * 86400000)
      return d.toISOString().split('T')[0]
    }
    const dateTo = ref(isoDay(0))
    const dateFrom = ref(isoDay(-13))

    const dates = computed(() => {
      const out = []
      const start = new Date(dateFrom.value + 'T00:00:00')
      const end = new Date(dateTo.value + 'T00:00:00')
      let cur = new Date(start)
      while (cur <= end) {
        out.push(cur.toISOString().split('T')[0])
        cur = new Date(cur.getTime() + 86400000)
      }
      return out
    })

    const activeProducts = computed(() => products.value.filter(p => p.status === 'active'))

    const grouped = computed(() =>
      groupByProductAndDate(movements.value, dates.value, activeProducts.value)
    )

    const balances = computed(() => {
      const map = new Map()
      activeProducts.value.forEach(p => {
        map.set(p.product_id, computeRunningBalance(p, movements.value, dates.value))
      })
      return map
    })

    const dailyTotals = computed(() =>
      computeDailyTotals(movements.value, dates.value)
    )

    const cellBalance = (product, date) => {
      const b = balances.value.get(product.product_id)
      return b?.get(date) ?? 0
    }

    const cellDelta = (product, date) => {
      const perProduct = grouped.value.get(product.product_id)
      return perProduct?.get(date) ?? { in: 0, out: 0, adjustment: 0, net: 0 }
    }

    const hasActivity = (product, date) => {
      const d = cellDelta(product, date)
      return d.in > 0 || d.out > 0 || d.adjustment !== 0
    }

    const cellStyle = (product, date) => {
      const bal = cellBalance(product, date)
      if (bal < 0) return 'color: var(--status-error); font-weight: 700;'
      if (bal === 0) return 'color: var(--text-tertiary);'
      if (bal <= (product.low_stock_threshold ?? 15)) return 'color: var(--status-warning); font-weight: 600;'
      return 'color: var(--text-primary);'
    }

    const cellTooltip = (product, date) => {
      const d = cellDelta(product, date)
      const parts = []
      if (d.in > 0) parts.push(`In: ${d.in}`)
      if (d.out > 0) parts.push(`Out: ${d.out}`)
      if (d.adjustment !== 0) parts.push(`Adjustment: ${d.adjustment > 0 ? '+' : ''}${d.adjustment}`)
      if (parts.length === 0) return `Bal ${cellBalance(product, date)} · no activity`
      return `Bal ${cellBalance(product, date)} · ${parts.join(', ')}`
    }

    const dailyTotalIn = (date) => dailyTotals.value.get(date)?.in ?? 0
    const dailyTotalOut = (date) => dailyTotals.value.get(date)?.out ?? 0

    const formatShortDate = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00')
      return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    }

    const reloadRange = async () => {
      await fetchMovements({ dateFrom: dateFrom.value, dateTo: dateTo.value })
    }

    onMounted(async () => {
      await initializeProducts()
      await fetchMovements({ dateFrom: dateFrom.value, dateTo: dateTo.value })
    })

    return {
      movements,
      loading,
      error,
      products,
      activeProducts,
      dateFrom,
      dateTo,
      dates,
      cellBalance,
      cellDelta,
      hasActivity,
      cellStyle,
      cellTooltip,
      dailyTotalIn,
      dailyTotalOut,
      formatShortDate,
      reloadRange,
    }
  }
}
</script>

<style scoped>
.matrix-wrapper {
  overflow: hidden;
}

.matrix-scroll {
  overflow-x: auto;
  max-width: 100%;
}

.matrix-table {
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
}

.header-cell {
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.6rem 0.6rem;
  border-bottom: 2px solid var(--border-primary);
  text-align: center;
  white-space: nowrap;
}

.product-header {
  text-align: left;
  min-width: 220px;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface-card);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04);
}

.product-cell {
  padding: 0.55rem 0.75rem;
  min-width: 220px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-primary);
}

.cell {
  padding: 0.4rem 0.4rem;
  border-bottom: 1px solid var(--border-primary);
  text-align: center;
  min-width: 68px;
  vertical-align: middle;
}

.cell-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.bal {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
}

.deltas {
  display: flex;
  gap: 3px;
  font-size: 0.62rem;
  font-weight: 600;
}

.delta-in {
  color: var(--status-success);
}

.delta-out {
  color: var(--status-error);
}

.delta-adj {
  color: var(--status-warning);
}

.footer-row {
  background: var(--surface-elevated, var(--surface-card));
}

.footer-label {
  font-weight: 700;
  color: var(--text-primary);
  padding: 0.55rem 0.75rem;
  border-top: 2px solid var(--border-primary);
}

.footer-cell {
  border-top: 2px solid var(--border-primary);
  padding: 0.4rem;
}

.footer-in {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--status-success);
  line-height: 1.1;
}

.footer-out {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--status-error);
  line-height: 1.1;
}
</style>
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js`
Expected: 6/6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/stock/StockHistory.vue frontend/src/pages/stock/__tests__/StockHistory.test.js
git commit -m "feat: rewrite Stock History as product × day matrix view"
```

---

## Task 6: Products page — Back Order column + Pack Size filter, drop loose bottles

**Files:**
- Modify: `frontend/src/pages/inventory/Products.vue`

**Interfaces:**
- Consumes: `MOCK_PRODUCTS` schema from Task 1 (each product has `back_order`, `pack_size`, no `loose_bottles`, no `category_id`)
- Produces: Products page shows "Back Order" column instead of "Loose btls"; the "Loose Bottles" stat card becomes "Back Ordered" (total cases back-ordered across all products); Pack Size filter dropdown replaces (or supplements) the Stock alert filter

- [ ] **Step 1: Read the current Products.vue to locate touch points**

Read `frontend/src/pages/inventory/Products.vue`. Identify:
1. The "Loose Bottles" stat card (currently shows `totalLooseBottles`)
2. The `looseBottles`, `initLooseBottles`, `totalLooseBottles` state in `setup()`
3. The "Loose btls" column in the data table
4. The Stock alert filter dropdown (for adding Pack Size next to it)
5. The `onMounted` block that calls `initLooseBottles`

- [ ] **Step 2: Replace the "Loose Bottles" stat card with "Back Ordered"**

Find the stat card that reads `title="Loose Bottles" :value="totalLooseBottles"`. Change it to:

```html
<CardTemplate size="xs" border-color="warning" border-position="start" title="Back Ordered" :value="totalBackOrdered" subtitle="Cases owed to customers" />
```

- [ ] **Step 3: Replace `looseBottles` state with `totalBackOrdered` computed**

In `setup()`, remove:

```js
const looseBottles = ref({})
const initLooseBottles = () => {
  const map = {}
  products.value.forEach(p => {
    map[p.product_id] = p.loose_bottles ?? 0
  })
  looseBottles.value = map
}
const totalLooseBottles = computed(() => {
  return Object.values(looseBottles.value).reduce((sum, n) => sum + n, 0)
})
```

Add:

```js
const totalBackOrdered = computed(() =>
  products.value.reduce((sum, p) => sum + (p.back_order || 0), 0)
)
```

- [ ] **Step 4: Replace the "Loose btls" table column with "Back Order"**

Find the table header:

```html
<th style="width: 110px; text-align: right;">Loose btls</th>
```

Change to:

```html
<th style="width: 110px; text-align: right;">Back Order</th>
```

Find the table cell:

```html
<td class="text-end">
  <span :class="(looseBottles[product.product_id] ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
    {{ looseBottles[product.product_id] ?? 0 }}
  </span>
</td>
```

Change to:

```html
<td class="text-end">
  <span :class="(product.back_order ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
    {{ product.back_order ?? 0 }}
  </span>
</td>
```

- [ ] **Step 5: Add Pack Size filter dropdown**

Locate the filter row that currently shows the "Stock alert" dropdown. Immediately before that dropdown, insert:

```html
<div class="filter-dropdown">
  <label class="filter-label text-tertiary-medium">Pack size</label>
  <select
    class="form-select form-select-sm input-theme"
    v-model="packSizeFilter"
  >
    <option value="">All sizes</option>
    <option v-for="size in packSizes" :key="size" :value="size">{{ size }}</option>
  </select>
</div>
```

In `setup()`, add:

```js
const packSizeFilter = ref('')
const packSizes = computed(() => {
  const set = new Set()
  products.value.forEach(p => { if (p.pack_size) set.add(p.pack_size) })
  return Array.from(set).sort()
})
```

Modify the `sortedFilteredProducts` computed's source list from `filteredProducts.value` to a new upstream computed that additionally applies the pack size filter. Immediately above the existing `sortedFilteredProducts` computed, add:

```js
const packFilteredProducts = computed(() =>
  packSizeFilter.value
    ? filteredProducts.value.filter(p => p.pack_size === packSizeFilter.value)
    : filteredProducts.value
)
```

Change `sortedFilteredProducts` to sort `packFilteredProducts.value` instead of `filteredProducts.value` — replace `[...filteredProducts.value]` with `[...packFilteredProducts.value]`. Similarly, update `paginatedProducts` if it references `filteredProducts.value.length` for total — it should use `packFilteredProducts.value.length` (via `sortedFilteredProducts`).

Also update the DataTable prop `:total-items="filteredProducts.length"` to `:total-items="packFilteredProducts.length"`.

Return `packSizeFilter`, `packSizes`, `packFilteredProducts`, `totalBackOrdered` from `setup()`.

- [ ] **Step 6: Remove `initLooseBottles` call from `onMounted`**

Find:

```js
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await initializeProducts()
  initLooseBottles()
  calculateExpiringCount()
})
```

Change to:

```js
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await initializeProducts()
  calculateExpiringCount()
})
```

Also remove `looseBottles`, `initLooseBottles`, `totalLooseBottles`, `incrementLoose`, `decrementLoose` from the `setup()` return statement — anything that no longer exists in the composition.

- [ ] **Step 7: Verify no lingering references**

Run:
```bash
cd frontend && npx eslint src/pages/inventory/Products.vue
```

Expected: same 2 pre-existing errors as before (`Products` multi-word, `bootstrap` global). No new errors about `looseBottles`, `totalLooseBottles`, or `initLooseBottles`.

Also verify by grep — should return no matches inside Products.vue:
```bash
grep -n "looseBottles\|initLooseBottles\|totalLooseBottles" "C:/Users/ngjames/Desktop/RC-COLA-INV/frontend/src/pages/inventory/Products.vue"
```

- [ ] **Step 8: Run full test suite for regressions**

Run: `cd frontend && npx vitest run`
Expected: no test failures. Products.vue has no tests of its own, but its template is compiled during test collection.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/inventory/Products.vue
git commit -m "feat: swap loose bottles for back order on Products page; add pack size filter"
```

---

## Self-Review

**Spec coverage:**

| Requirement (from analysis) | Task |
|---|---|
| Event-log data model (`MOCK_STOCK_MOVEMENTS`) | Task 1 |
| Real product catalog (20 SKUs, flavor × pack_size) | Task 1 |
| Remove loose bottles from data model | Task 1 |
| Remove `MOCK_EOD_HISTORY` | Task 1 |
| GET `/stock/movements/` with query filtering | Task 1 |
| POST `/stock/eod/` writes movements + updates back_order | Task 1 |
| Composable for fetching + grouping + balance derivation | Task 2 |
| EOD input model: cases_in / cases_out / bo_delta | Task 3 |
| Live balance preview in EOD entry | Task 4 |
| Sparse entry UX (product picker / working set) | Task 4 |
| Reconciliation banner in preview | Task 4 |
| Stock History as product × day matrix | Task 5 |
| Sticky product column | Task 5 |
| Aggregate footer row (daily totals) | Task 5 |
| Date range picker | Task 5 |
| Back Order column on Products page | Task 6 |
| Pack Size filter on Products page | Task 6 |
| Remove loose bottles UI on Products page | Task 6 |

**Placeholder scan:** No "TBD", no "similar to task N", no "add appropriate error handling" — every step has code or explicit expected output.

**Type consistency:**
- Movement schema (`movement_id`, `product_id`, `date`, `type`, `quantity`, `adjustment_direction?`, `note`, `created_at`) — consistent across Tasks 1, 2, 5.
- Entry shape (`cases_in`, `cases_out`, `bo_delta`) — consistent across Tasks 3, 4.
- Product schema (`flavor`, `pack_size`, `back_order`, no `loose_bottles`, no `category_id`) — consistent across Tasks 1, 4, 5, 6.
- EodItem preview shape (`stock_before`, `stock_after`, `needs_reconciliation`) — consistent between Task 3 composable and Task 4 template.
- API paths (`/stock/movements/`, `/stock/eod/`) — consistent across Tasks 1, 2, 3.
- Composable names (`useStockMovements`, `useEodUpdate`) — consistent across all tasks.

Plan is internally consistent. Ready for execution.
