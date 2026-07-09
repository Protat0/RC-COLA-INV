# End-of-Day Stock Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an End-of-Day (EOD) stock deduction page where staff enter cases sold and loose bottle counts per product, with a two-step entry → preview flow, reconciliation warnings for negative stock, and a full transaction history page.

**Architecture:** A dedicated Vue 3 page (`EodUpdate.vue`) backed by a `useEodUpdate` composable manages form state, preview computation, and submission. A companion `StockHistory.vue` page lists all past EOD entries with expandable detail rows. Both pages use the existing mock interceptor pattern — the POST handler mutates `MOCK_PRODUCTS` in-place so stock changes persist within the prototype session. Past entries accumulate in `MOCK_EOD_HISTORY` for the lifetime of the session.

**Tech Stack:** Vue 3 Options API with `setup()` function (match `frontend/src/pages/inventory/Products.vue`), Axios mock interceptor, Bootstrap 5, global CSS variables from `colors.css` / `buttons.css`, Lucide Vue icons (via `frontend/src/plugins/lucide.js`), Vitest + @vue/test-utils.

## Global Constraints

- Vue 3 Options API with `setup()` function returning all reactive state and methods — match the exact pattern in `frontend/src/pages/inventory/Products.vue`
- Tests: `shallowMount` with `global: { stubs: { Teleport: true } }` and `globals: true` in vitest.config.js
- All colors via CSS variables only — never hardcoded hex. Use `--text-primary`, `--border-primary`, `--surface-card`, `--status-warning`, `--status-warning-bg`, `--status-error`, `--status-success`, `--text-tertiary`, `--state-hover`, `--text-inverse`, `--surface-secondary`, `--surface-elevated`
- Buttons use global semantic classes from `buttons.css`: `btn-add` (green), `btn-filter` (neutral), `btn-cancel`, `btn-submit` (blue), `btn-delete`. Border radius override for rectangular shape: `border-radius: 0.3rem !important`
- Mock interceptor lives in `frontend/src/services/mockInterceptor.js`. The existing `getHandler(url)` handles GETs only. Add a separate `getPostHandler(config)` function for POST routes, checked in the interceptor by method
- Loose bottles are **tracked as-is**: the submitted `loose_bottles` value overwrites `product.loose_bottles` directly — it is NOT subtracted from case stock
- Negative stock after deduction is **allowed** — set `needs_reconciliation: true` on that item and display a persistent amber warning banner on the preview step
- Every EOD entry must include `entry_date` (string `YYYY-MM-DD`) and `created_at` (ISO 8601 string from `new Date().toISOString()`)
- Route paths: `/stock/eod` and `/stock/history`
- Sidebar file: `frontend/src/layouts/Sidebar.vue`. The Inventory submenu block starts at the `<!-- Inventory Section -->` comment. Add the two new sub-items inside the existing `<ul class="nav-submenu">` alongside Products, Categories, Logs

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/data/mockData.js` | Modify | Add `MOCK_EOD_HISTORY` array export |
| `frontend/src/services/mockInterceptor.js` | Modify | Add `getPostHandler` + EOD GET/POST route handlers |
| `frontend/src/composables/api/useEodUpdate.js` | Create | All EOD form state, computed preview, submit, history fetch |
| `frontend/src/composables/api/__tests__/useEodUpdate.test.js` | Create | Unit tests for composable logic |
| `frontend/src/pages/stock/EodUpdate.vue` | Create | Two-step EOD entry page (entry → preview → success) |
| `frontend/src/pages/stock/__tests__/EodUpdate.test.js` | Create | Render + behavior tests for EodUpdate page |
| `frontend/src/pages/stock/StockHistory.vue` | Create | EOD history listing with expandable detail rows |
| `frontend/src/pages/stock/__tests__/StockHistory.test.js` | Create | Render + behavior tests for StockHistory page |
| `frontend/src/router/index.js` | Modify | Add `/stock/eod` and `/stock/history` routes |
| `frontend/src/layouts/Sidebar.vue` | Modify | Add EOD Update + Stock History links under Inventory submenu |

---

## Task 1: Mock data and interceptor for EOD endpoints

**Files:**
- Modify: `frontend/src/data/mockData.js`
- Modify: `frontend/src/services/mockInterceptor.js`

**Interfaces:**
- Produces: `MOCK_EOD_HISTORY` (exported array, mutable) — consumed by the interceptor GET handler and `useEodUpdate`
- Produces: POST `/stock/eod/` handler — mutates `MOCK_PRODUCTS` in-place, pushes new entry to `MOCK_EOD_HISTORY`, returns `{ success: true, data: <newEntry> }`
- Produces: GET `/stock/eod/history/` handler — returns `{ success: true, data: MOCK_EOD_HISTORY }`

- [ ] **Step 1: Add `MOCK_EOD_HISTORY` to mockData.js**

Open `frontend/src/data/mockData.js` and append this export after the existing `MOCK_TRANSACTIONS` block:

```js
export const MOCK_EOD_HISTORY = [
  {
    eod_id: 'eod_20260707_001',
    entry_date: '2026-07-07',
    created_at: '2026-07-07T18:15:00.000Z',
    items: [
      { product_id: 'prod_001', product_name: 'RC Cola 330mL Can (Case/24)',   cases_sold: 15, loose_bottles: 3,  stock_before: 465, stock_after: 450, needs_reconciliation: false },
      { product_id: 'prod_002', product_name: 'RC Cola 500mL PET (Case/24)',   cases_sold: 8,  loose_bottles: 0,  stock_before: 328, stock_after: 320, needs_reconciliation: false },
      { product_id: 'prod_007', product_name: 'Royal Orange 330mL Can (Case/24)', cases_sold: 12, loose_bottles: 7, stock_before: 392, stock_after: 380, needs_reconciliation: false },
    ],
    status: 'applied',
  },
  {
    eod_id: 'eod_20260706_001',
    entry_date: '2026-07-06',
    created_at: '2026-07-06T17:45:00.000Z',
    items: [
      { product_id: 'prod_001', product_name: 'RC Cola 330mL Can (Case/24)',   cases_sold: 20, loose_bottles: 5,  stock_before: 485, stock_after: 465, needs_reconciliation: false },
      { product_id: 'prod_006', product_name: 'RC Cola 250mL PET (Case/24)',   cases_sold: 35, loose_bottles: 14, stock_before: 65,  stock_after: 30,  needs_reconciliation: false },
      { product_id: 'prod_010', product_name: 'Royal Grape 330mL Can (Case/24)', cases_sold: 5, loose_bottles: 0,  stock_before: 5,   stock_after: 0,   needs_reconciliation: false },
    ],
    status: 'applied',
  },
  {
    eod_id: 'eod_20260705_001',
    entry_date: '2026-07-05',
    created_at: '2026-07-05T19:00:00.000Z',
    items: [
      { product_id: 'prod_005', product_name: 'RC Cola 2L PET (Case/6)',      cases_sold: 68, loose_bottles: 2,  stock_before: 60,  stock_after: -8,  needs_reconciliation: true },
      { product_id: 'prod_011', product_name: 'RC Lemon 330mL Can (Case/24)', cases_sold: 10, loose_bottles: 9,  stock_before: 290, stock_after: 280, needs_reconciliation: false },
    ],
    status: 'flagged',
  },
]
```

- [ ] **Step 2: Add EOD handlers to mockInterceptor.js**

Open `frontend/src/services/mockInterceptor.js`. Add `MOCK_EOD_HISTORY` to the import at the top:

```js
import {
  MOCK_PRODUCTS,
  MOCK_CATEGORIES,
  MOCK_SALES_BY_ITEM,
  MOCK_MONTHLY_DATA,
  MOCK_TRANSACTIONS,
  MOCK_EOD_HISTORY,
} from '../data/mockData.js'
```

Then add a `getPostHandler` function directly before the `api.interceptors.request.use(...)` call:

```js
function getPostHandler(config) {
  const url = config.url || ''

  if (url.includes('/stock/eod/')) {
    return (cfg) => {
      const body = JSON.parse(cfg.data || '{}')
      body.items.forEach(item => {
        const product = MOCK_PRODUCTS.find(p => p.product_id === item.product_id)
        if (product) {
          product.total_stock = item.stock_after
          product.loose_bottles = item.loose_bottles
        }
      })
      const newEntry = {
        eod_id: `eod_${Date.now()}`,
        entry_date: body.entry_date,
        created_at: new Date().toISOString(),
        items: body.items,
        status: body.items.some(i => i.needs_reconciliation) ? 'flagged' : 'applied',
      }
      MOCK_EOD_HISTORY.unshift(newEntry)
      return Promise.resolve({
        data: { success: true, data: newEntry },
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
```

Then update the interceptor to check both methods:

```js
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

Also add the GET history handler inside the existing `getHandler(url)` function, before the final fallback return:

```js
  // EOD Stock History
  if (url.includes('/stock/eod/history/')) {
    return mockAdapter({ success: true, data: MOCK_EOD_HISTORY })
  }
```

- [ ] **Step 3: Verify manually**

Start the dev server (`npm run dev` from `frontend/`). Open the browser console and run:

```js
// In browser console
import('/src/services/api.js').then(m => {
  m.api.get('/stock/eod/history/').then(r => console.log('GET history:', r.data))
})
```

Expected: `{ success: true, data: [ ... 3 entries ... ] }`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/data/mockData.js frontend/src/services/mockInterceptor.js
git commit -m "feat: add EOD mock data and interceptor handlers"
```

---

## Task 2: `useEodUpdate` composable

**Files:**
- Create: `frontend/src/composables/api/useEodUpdate.js`
- Create: `frontend/src/composables/api/__tests__/useEodUpdate.test.js`

**Interfaces:**
- Consumes: `api` from `frontend/src/services/api.js` (GET + POST)
- Consumes: `useProducts` from `./useProducts.js` — uses `products` ref and `initializeProducts()`
- Produces (all returned from `useEodUpdate()`):
  - `activeProducts` — `ComputedRef<Product[]>` — active products only
  - `entries` — `Ref<{ [product_id: string]: { cases_sold: number, loose_bottles: number } }>`
  - `changedItems` — `ComputedRef<EodItem[]>` — only items with cases_sold > 0 or changed loose_bottles
  - `flaggedItems` — `ComputedRef<EodItem[]>` — changedItems where needs_reconciliation === true
  - `hasChanges` — `ComputedRef<boolean>`
  - `loading` — `Ref<boolean>`
  - `productsLoading` — `Ref<boolean>` (from useProducts)
  - `submitted` — `Ref<boolean>`
  - `lastSubmission` — `Ref<EodEntry | null>`
  - `history` — `Ref<EodEntry[]>`
  - `historyLoading` — `Ref<boolean>`
  - `error` — `Ref<string | null>`
  - `initEntries()` — populates `entries` from `activeProducts`
  - `initializeProducts()` — from useProducts
  - `submitEod(entryDate: string)` — POSTs to `/stock/eod/`, sets `submitted = true`
  - `fetchHistory()` — GETs `/stock/eod/history/`, sets `history`
  - `resetForm()` — clears submitted state and re-inits entries

`EodItem` shape:
```ts
{
  product_id: string
  product_name: string
  cases_sold: number
  loose_bottles: number
  stock_before: number
  stock_after: number          // stock_before - cases_sold
  needs_reconciliation: boolean  // stock_after < 0
}
```

- [ ] **Step 1: Write failing tests**

Create `frontend/src/composables/api/__tests__/useEodUpdate.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock api before importing composable
vi.mock('@/services/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const MOCK_ACTIVE = [
  { product_id: 'prod_001', product_name: 'RC Cola 330mL', status: 'active', total_stock: 100, loose_bottles: 5 },
  { product_id: 'prod_002', product_name: 'RC Cola 500mL', status: 'active', total_stock: 50,  loose_bottles: 0 },
]
const MOCK_INACTIVE = { product_id: 'prod_003', product_name: 'Inactive', status: 'inactive', total_stock: 10, loose_bottles: 0 }

vi.mock('../useProducts.js', () => ({
  useProducts: vi.fn(() => ({
    products: { value: [...MOCK_ACTIVE, MOCK_INACTIVE] },
    loading: { value: false },
    initializeProducts: vi.fn(),
  })),
}))

import { useEodUpdate } from '../useEodUpdate.js'

describe('useEodUpdate', () => {
  it('initEntries creates entries only for active products', () => {
    const { entries, initEntries } = useEodUpdate()
    initEntries()
    expect(Object.keys(entries.value)).toHaveLength(2)
    expect(entries.value['prod_001']).toEqual({ cases_sold: 0, loose_bottles: 5 })
    expect(entries.value['prod_002']).toEqual({ cases_sold: 0, loose_bottles: 0 })
    expect(entries.value['prod_003']).toBeUndefined()
  })

  it('changedItems is empty when no cases_sold and no loose_bottles change', () => {
    const { changedItems, initEntries } = useEodUpdate()
    initEntries()
    expect(changedItems.value).toHaveLength(0)
  })

  it('changedItems includes product when cases_sold > 0', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 10
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0].product_id).toBe('prod_001')
    expect(changedItems.value[0].stock_before).toBe(100)
    expect(changedItems.value[0].stock_after).toBe(90)
  })

  it('changedItems includes product when loose_bottles value changes', () => {
    const { entries, changedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].loose_bottles = 8  // was 5
    expect(changedItems.value).toHaveLength(1)
    expect(changedItems.value[0].product_id).toBe('prod_001')
  })

  it('sets needs_reconciliation true when stock_after < 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 150  // stock is 100
    expect(changedItems.value[0].needs_reconciliation).toBe(true)
    expect(changedItems.value[0].stock_after).toBe(-50)
    expect(flaggedItems.value).toHaveLength(1)
  })

  it('does not flag items where stock_after >= 0', () => {
    const { entries, changedItems, flaggedItems, initEntries } = useEodUpdate()
    initEntries()
    entries.value['prod_001'].cases_sold = 100  // exactly 0 remaining
    expect(changedItems.value[0].needs_reconciliation).toBe(false)
    expect(flaggedItems.value).toHaveLength(0)
  })

  it('hasChanges is false initially, true after editing', () => {
    const { entries, hasChanges, initEntries } = useEodUpdate()
    initEntries()
    expect(hasChanges.value).toBe(false)
    entries.value['prod_002'].cases_sold = 5
    expect(hasChanges.value).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js
```

Expected: FAIL — `Cannot find module '../useEodUpdate.js'`

- [ ] **Step 3: Create the composable**

Create `frontend/src/composables/api/useEodUpdate.js`:

```js
import { ref, computed } from 'vue'
import { api } from '@/services/api.js'
import { useProducts } from './useProducts.js'

export function useEodUpdate() {
  const { products, loading: productsLoading, initializeProducts } = useProducts()

  const entries = ref({})
  const loading = ref(false)
  const error = ref(null)
  const submitted = ref(false)
  const lastSubmission = ref(null)
  const history = ref([])
  const historyLoading = ref(false)

  const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'active')
  )

  const initEntries = () => {
    const map = {}
    activeProducts.value.forEach(p => {
      map[p.product_id] = {
        cases_sold: 0,
        loose_bottles: p.loose_bottles ?? 0,
      }
    })
    entries.value = map
  }

  const changedItems = computed(() =>
    activeProducts.value
      .map(p => {
        const entry = entries.value[p.product_id] || { cases_sold: 0, loose_bottles: p.loose_bottles ?? 0 }
        const stock_before = p.total_stock ?? 0
        const stock_after = stock_before - entry.cases_sold
        const looseOriginal = p.loose_bottles ?? 0
        const looseChanged = entry.loose_bottles !== looseOriginal
        return {
          product_id: p.product_id,
          product_name: p.product_name,
          cases_sold: entry.cases_sold,
          loose_bottles: entry.loose_bottles,
          stock_before,
          stock_after,
          needs_reconciliation: stock_after < 0,
          _has_changes: entry.cases_sold > 0 || looseChanged,
        }
      })
      .filter(item => item._has_changes)
      .map(({ _has_changes, ...item }) => item)
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
        items: changedItems.value,
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

  const fetchHistory = async () => {
    historyLoading.value = true
    try {
      const response = await api.get('/stock/eod/history/')
      history.value = response.data.data || []
    } catch (err) {
      error.value = err.message || 'Failed to load history'
    } finally {
      historyLoading.value = false
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
    history,
    historyLoading,
    changedItems,
    flaggedItems,
    hasChanges,
    initEntries,
    initializeProducts,
    submitEod,
    fetchHistory,
    resetForm,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/composables/api/__tests__/useEodUpdate.test.js
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/api/useEodUpdate.js frontend/src/composables/api/__tests__/useEodUpdate.test.js
git commit -m "feat: add useEodUpdate composable with EOD form state and preview logic"
```

---

## Task 3: EOD Update page + routes

**Files:**
- Create: `frontend/src/pages/stock/EodUpdate.vue`
- Create: `frontend/src/pages/stock/__tests__/EodUpdate.test.js`
- Modify: `frontend/src/router/index.js`

**Interfaces:**
- Consumes: `useEodUpdate` from Task 2 — all returned values
- Produces: page at route `/stock/eod`, navigates to `/stock/history` on success

- [ ] **Step 1: Write failing tests**

Create `frontend/src/pages/stock/__tests__/EodUpdate.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref, computed } from 'vue'

const mockComposable = {
  activeProducts: ref([
    { product_id: 'prod_001', product_name: 'RC Cola 330mL Can (Case/24)', total_stock: 100, loose_bottles: 5 },
    { product_id: 'prod_002', product_name: 'RC Cola 500mL PET (Case/24)', total_stock: 50,  loose_bottles: 0 },
  ]),
  entries: ref({
    prod_001: { cases_sold: 0, loose_bottles: 5 },
    prod_002: { cases_sold: 0, loose_bottles: 0 },
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

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import EodUpdate from '../EodUpdate.vue'

describe('EodUpdate.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.submitted.value = false
    mockComposable.hasChanges.value = false
    mockComposable.flaggedItems.value = []
    mockComposable.changedItems.value = []
  })

  it('renders the page heading', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.text()).toContain('End of Day Stock Update')
  })

  it('renders a row for each active product in entry step', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="product-row"]')).toHaveLength(2)
  })

  it('preview button is disabled when no changes', () => {
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    const btn = wrapper.find('[data-testid="preview-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows reconciliation warning banner when flaggedItems exist in preview step', async () => {
    mockComposable.flaggedItems.value = [{ product_id: 'prod_001', product_name: 'RC Cola 330mL', cases_sold: 150, loose_bottles: 5, stock_before: 100, stock_after: -50, needs_reconciliation: true }]
    mockComposable.hasChanges.value = true
    mockComposable.changedItems.value = mockComposable.flaggedItems.value
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    // Switch to preview step
    await wrapper.setData({ step: 'preview' })
    expect(wrapper.find('[data-testid="recon-banner"]').exists()).toBe(true)
  })

  it('shows success view when submitted is true', async () => {
    mockComposable.submitted.value = true
    const wrapper = shallowMount(EodUpdate, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="success-view"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js
```

Expected: FAIL — `Cannot find module '../EodUpdate.vue'`

- [ ] **Step 3: Create EodUpdate.vue**

Create `frontend/src/pages/stock/EodUpdate.vue`:

```vue
<template>
  <div class="container-fluid pt-2 pb-5 eod-page surface-secondary">

    <!-- Success view -->
    <div v-if="submitted" data-testid="success-view" class="text-center py-5">
      <div class="surface-card border-theme rounded p-5 mx-auto" style="max-width: 480px;">
        <div class="mb-3" style="font-size: 3rem;">✓</div>
        <h5 class="mb-1">EOD Update Applied</h5>
        <p class="text-tertiary-medium mb-4">
          {{ lastSubmission?.items?.length || 0 }} products updated for {{ entryDate }}
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
      <!-- Page header -->
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

      <!-- Reconciliation warning banner (preview step only) -->
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
        <div class="surface-card border-theme rounded" style="overflow: hidden;">
          <table class="table mb-0">
            <thead>
              <tr>
                <th style="color: var(--text-primary);">Product</th>
                <th class="text-center" style="width: 90px; color: var(--text-primary);">Stock</th>
                <th class="text-center" style="width: 150px; color: var(--text-primary);">Cases Sold</th>
                <th class="text-center" style="width: 150px; color: var(--text-primary);">Loose Bottles</th>
                <th style="width: 36px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="product in activeProducts"
                :key="product.product_id"
                data-testid="product-row"
              >
                <td style="color: var(--text-primary); font-weight: 500;">{{ product.product_name }}</td>
                <td class="text-center">
                  <span :style="stockStyle(product)">{{ product.total_stock ?? 0 }}</span>
                </td>
                <td class="text-center">
                  <input
                    v-if="entries[product.product_id]"
                    type="number"
                    min="0"
                    class="form-control form-control-sm text-center input-theme"
                    v-model.number="entries[product.product_id].cases_sold"
                    style="width: 100%; border-radius: 0.3rem;"
                  />
                </td>
                <td class="text-center">
                  <input
                    v-if="entries[product.product_id]"
                    type="number"
                    min="0"
                    class="form-control form-control-sm text-center input-theme"
                    v-model.number="entries[product.product_id].loose_bottles"
                    style="width: 100%; border-radius: 0.3rem;"
                  />
                </td>
                <td class="text-center">
                  <span
                    v-if="wouldGoNegative(product)"
                    title="Will go negative"
                    style="color: var(--status-warning); font-size: 1rem;"
                  >⚠</span>
                </td>
              </tr>
            </tbody>
          </table>
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
                <th class="text-center" style="width: 100px; color: var(--text-primary);">Cases Sold</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary);">After</th>
                <th class="text-center" style="width: 90px; color: var(--text-primary);">Loose Btls</th>
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
                <td class="text-center fw-bold" style="color: var(--status-error);">−{{ item.cases_sold }}</td>
                <td class="text-center fw-bold" :style="item.needs_reconciliation ? 'color: var(--status-error);' : 'color: var(--status-success);'">
                  {{ item.stock_after }}
                </td>
                <td class="text-center" style="color: var(--text-secondary);">{{ item.loose_bottles }}</td>
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

    const formattedDate = computed(() => {
      const d = new Date(entryDate.value + 'T00:00:00')
      return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    })

    const wouldGoNegative = (product) => {
      const entry = entries.value[product.product_id]
      if (!entry) return false
      return (product.total_stock ?? 0) - entry.cases_sold < 0
    }

    const stockStyle = (product) => {
      const stock = product.total_stock ?? 0
      if (stock === 0) return 'color: var(--status-error); font-weight: 700;'
      if (stock <= (product.low_stock_threshold || 15)) return 'color: var(--status-warning); font-weight: 700;'
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
      wouldGoNegative,
      stockStyle,
      handleSubmit,
      startNew,
    }
  },

  methods: {
    // $router is available via Options API — no need to inject in setup
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
  padding: 0.6rem 1rem;
  border-color: var(--border-primary);
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: none;
}
</style>
```

- [ ] **Step 4: Add routes to router/index.js**

Open `frontend/src/router/index.js`. Add these two imports near the top with the other page imports:

```js
import EodUpdate from '@/pages/stock/EodUpdate.vue'
import StockHistory from '@/pages/stock/StockHistory.vue'
```

Inside the `children` array of the MainLayout route, add:

```js
{
  path: 'stock/eod',
  name: 'EodUpdate',
  component: EodUpdate,
  meta: { title: 'EOD Stock Update' }
},
{
  path: 'stock/history',
  name: 'StockHistory',
  component: StockHistory,
  meta: { title: 'Stock Update History' }
},
```

Note: `StockHistory.vue` will be created in Task 4. The import and route entry are safe to add now — the page component file just needs to exist before the dev server loads.

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/EodUpdate.test.js
```

Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/stock/EodUpdate.vue frontend/src/pages/stock/__tests__/EodUpdate.test.js frontend/src/router/index.js
git commit -m "feat: add EOD stock update page with two-step entry and preview flow"
```

---

## Task 4: Stock History page

**Files:**
- Create: `frontend/src/pages/stock/StockHistory.vue`
- Create: `frontend/src/pages/stock/__tests__/StockHistory.test.js`

**Interfaces:**
- Consumes: `useEodUpdate` from Task 2 — uses `history`, `historyLoading`, `fetchHistory()`
- Route `/stock/history` already registered in Task 3

- [ ] **Step 1: Write failing tests**

Create `frontend/src/pages/stock/__tests__/StockHistory.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

const MOCK_HISTORY = [
  {
    eod_id: 'eod_001',
    entry_date: '2026-07-07',
    created_at: '2026-07-07T18:15:00.000Z',
    items: [
      { product_id: 'prod_001', product_name: 'RC Cola 330mL', cases_sold: 15, loose_bottles: 3, stock_before: 465, stock_after: 450, needs_reconciliation: false },
    ],
    status: 'applied',
  },
  {
    eod_id: 'eod_002',
    entry_date: '2026-07-05',
    created_at: '2026-07-05T19:00:00.000Z',
    items: [
      { product_id: 'prod_005', product_name: 'RC Cola 2L PET', cases_sold: 68, loose_bottles: 2, stock_before: 60, stock_after: -8, needs_reconciliation: true },
    ],
    status: 'flagged',
  },
]

const mockComposable = {
  history: ref(MOCK_HISTORY),
  historyLoading: ref(false),
  error: ref(null),
  fetchHistory: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/api/useEodUpdate.js', () => ({
  useEodUpdate: () => mockComposable,
}))

import StockHistory from '../StockHistory.vue'

describe('StockHistory.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComposable.history.value = MOCK_HISTORY
    mockComposable.historyLoading.value = false
  })

  it('renders a row for each history entry', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.findAll('[data-testid="history-entry"]')).toHaveLength(2)
  })

  it('shows flagged badge for entries with status flagged', () => {
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    const badges = wrapper.findAll('[data-testid="flagged-badge"]')
    expect(badges).toHaveLength(1)
  })

  it('shows empty state when history is empty', () => {
    mockComposable.history.value = []
    const wrapper = shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })

  it('calls fetchHistory on mount', () => {
    shallowMount(StockHistory, { global: { stubs: { Teleport: true } } })
    expect(mockComposable.fetchHistory).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js
```

Expected: FAIL — `Cannot find module '../StockHistory.vue'`

- [ ] **Step 3: Create StockHistory.vue**

Create `frontend/src/pages/stock/StockHistory.vue`:

```vue
<template>
  <div class="container-fluid pt-2 pb-5 surface-secondary" style="min-height: 100vh;">

    <!-- Header -->
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div>
        <h5 class="mb-0" style="color: var(--text-primary); font-weight: 700;">Stock Update History</h5>
        <small style="color: var(--text-tertiary);">End-of-day stock deductions</small>
      </div>
      <button
        class="btn btn-add btn-sm"
        style="border-radius: 0.3rem !important;"
        @click="$router.push('/stock/eod')"
      >+ New EOD Entry</button>
    </div>

    <!-- Loading -->
    <div v-if="historyLoading" class="text-center py-5">
      <div class="spinner-border" style="color: var(--text-accent);" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="history.length === 0"
      data-testid="empty-state"
      class="text-center py-5"
    >
      <div class="surface-card border-theme rounded p-5 mx-auto" style="max-width: 400px;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
        <p style="color: var(--text-tertiary);">No stock updates recorded yet.</p>
        <button
          class="btn btn-add btn-sm mt-2"
          style="border-radius: 0.3rem !important;"
          @click="$router.push('/stock/eod')"
        >Record First EOD Update</button>
      </div>
    </div>

    <!-- History list -->
    <div v-else class="d-flex flex-column gap-2">
      <div
        v-for="entry in history"
        :key="entry.eod_id"
        data-testid="history-entry"
        class="surface-card border-theme rounded p-3"
      >
        <!-- Entry header row -->
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">{{ formatDate(entry.entry_date) }}</div>
            <small style="color: var(--text-tertiary);">
              Recorded at {{ formatTimestamp(entry.created_at) }}
              · {{ entry.items.length }} product{{ entry.items.length !== 1 ? 's' : '' }} updated
            </small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span
              v-if="entry.status === 'flagged'"
              data-testid="flagged-badge"
              class="badge"
              style="background: var(--status-warning); color: var(--text-inverse); font-size: 0.7rem;"
            >⚠ Needs Reconciliation</span>
            <span
              v-else
              class="badge"
              style="background: var(--status-success); color: var(--text-inverse); font-size: 0.7rem;"
            >Applied</span>
            <button
              class="btn btn-filter btn-xs"
              style="border-radius: 0.3rem !important; font-size: 0.75rem;"
              @click="toggleExpand(entry.eod_id)"
            >{{ expandedIds.includes(entry.eod_id) ? 'Hide' : 'Details' }}</button>
          </div>
        </div>

        <!-- Expanded detail table -->
        <div v-if="expandedIds.includes(entry.eod_id)" class="mt-3" style="border-top: 1px solid var(--border-primary); padding-top: 0.75rem;">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th style="color: var(--text-primary); font-size: 0.75rem;">Product</th>
                <th class="text-center" style="width: 70px; color: var(--text-primary); font-size: 0.75rem;">Before</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary); font-size: 0.75rem;">Sold</th>
                <th class="text-center" style="width: 70px; color: var(--text-primary); font-size: 0.75rem;">After</th>
                <th class="text-center" style="width: 80px; color: var(--text-primary); font-size: 0.75rem;">Loose</th>
                <th class="text-center" style="width: 110px; color: var(--text-primary); font-size: 0.75rem;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in entry.items" :key="item.product_id">
                <td style="color: var(--text-primary); font-size: 0.82rem;">{{ item.product_name }}</td>
                <td class="text-center" style="color: var(--text-secondary); font-size: 0.82rem;">{{ item.stock_before }}</td>
                <td class="text-center fw-bold" style="color: var(--status-error); font-size: 0.82rem;">−{{ item.cases_sold }}</td>
                <td
                  class="text-center fw-bold"
                  :style="item.stock_after < 0 ? 'color: var(--status-error);' : 'color: var(--status-success);'"
                  style="font-size: 0.82rem;"
                >{{ item.stock_after }}</td>
                <td class="text-center" style="color: var(--text-secondary); font-size: 0.82rem;">{{ item.loose_bottles }}</td>
                <td class="text-center">
                  <span
                    v-if="item.needs_reconciliation"
                    style="color: var(--status-warning); font-size: 0.75rem; font-weight: 600;"
                  >⚠ Recon.</span>
                  <span v-else style="color: var(--status-success); font-size: 0.75rem;">✓ OK</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useEodUpdate } from '@/composables/api/useEodUpdate.js'

export default {
  name: 'StockHistory',

  setup() {
    const { history, historyLoading, error, fetchHistory } = useEodUpdate()

    const expandedIds = ref([])

    const toggleExpand = (eodId) => {
      const idx = expandedIds.value.indexOf(eodId)
      if (idx === -1) {
        expandedIds.value.push(eodId)
      } else {
        expandedIds.value.splice(idx, 1)
      }
    }

    const formatDate = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00')
      return d.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })
    }

    const formatTimestamp = (isoStr) => {
      const d = new Date(isoStr)
      return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
    }

    onMounted(() => {
      fetchHistory()
    })

    return {
      history,
      historyLoading,
      error,
      expandedIds,
      toggleExpand,
      formatDate,
      formatTimestamp,
    }
  },

  methods: {}
}
</script>
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/pages/stock/__tests__/StockHistory.test.js
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/stock/StockHistory.vue frontend/src/pages/stock/__tests__/StockHistory.test.js
git commit -m "feat: add stock update history page with expandable EOD entries"
```

---

## Task 5: Sidebar navigation links

**Files:**
- Modify: `frontend/src/layouts/Sidebar.vue`

**Interfaces:**
- Consumes: router routes `/stock/eod` and `/stock/history` (registered in Task 3)
- Produces: two new sub-items under the Inventory submenu; `isInventoryRoute()` updated to include stock routes

- [ ] **Step 1: Verify the Inventory submenu block**

Open `frontend/src/layouts/Sidebar.vue`. Find the `<!-- Inventory Section -->` comment (around line 94). The `<ul class="nav-submenu">` inside it currently has three `<li>` items: Products, Categories, Logs.

- [ ] **Step 2: Add EOD Update and Stock History sub-items**

Inside the `<ul class="nav-submenu">` block, after the existing Logs `<li>`, add:

```html
<li class="nav-subitem">
  <router-link
    to="/stock/eod"
    class="nav-sublink"
    :class="{ 'active-sub': isActiveRoute('/stock/eod') }"
  >
    <ClipboardList :size="16" class="nav-subicon" />
    EOD Update
  </router-link>
</li>
<li class="nav-subitem">
  <router-link
    to="/stock/history"
    class="nav-sublink"
    :class="{ 'active-sub': isActiveRoute('/stock/history') }"
  >
    <History :size="16" class="nav-subicon" />
    Stock History
  </router-link>
</li>
```

- [ ] **Step 3: Register ClipboardList and History icons**

Open `frontend/src/plugins/lucide.js`. Add `ClipboardList` and `History` to the list of registered icons. The file registers icons individually — add them in the same pattern as the existing icons:

```js
app.component('ClipboardList', ClipboardList)
app.component('History', History)
```

And import them at the top:

```js
import { ..., ClipboardList, History } from 'lucide-vue-next'
```

- [ ] **Step 4: Update `isInventoryRoute()` to include stock routes**

In `Sidebar.vue`, find the `isInventoryRoute()` method (in the `methods` or `setup` section). It currently checks paths like `/products`, `/categories`, `/logs`. Add the stock paths:

```js
isInventoryRoute() {
  const path = this.$route.path
  return path.startsWith('/products') ||
         path.startsWith('/categories') ||
         path.startsWith('/logs') ||
         path.startsWith('/stock')
}
```

If it's defined differently (e.g., using `useRoute`), apply the same logic — add `|| path.startsWith('/stock')` to the condition.

- [ ] **Step 5: Manual smoke test**

Start the dev server (`npm run dev`). Navigate to the app. Verify:
1. The Inventory sidebar section, when expanded, shows "EOD Update" and "Stock History"
2. Clicking "EOD Update" loads the entry form with all active products listed
3. Entering a `cases_sold` value enables the "Preview Changes" button
4. The preview table shows the correct Before / After values
5. "Apply Changes" updates the product stock — navigate to Products and confirm the stock changed
6. "Stock History" page shows the 3 seeded entries plus any new one just applied
7. Clicking "Details" on a history entry expands the per-product breakdown

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layouts/Sidebar.vue frontend/src/plugins/lucide.js
git commit -m "feat: add EOD Update and Stock History links to inventory sidebar"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Dedicated page (not modal) | Task 3 — `EodUpdate.vue` at `/stock/eod` |
| All active products listed with current stock | Task 3 — `activeProducts` from composable |
| Cases sold input per product | Task 3 — `entries[id].cases_sold` v-model |
| Loose bottles tracked as-is (overwrite, not subtract) | Task 1 — POST handler sets `product.loose_bottles = item.loose_bottles` |
| Always record date and timestamp | Task 1 — `entry_date` + `created_at: new Date().toISOString()` |
| Allow negative stock | Task 2 — no blocking; `needs_reconciliation: true` flag set |
| Persistent reconciliation warning | Task 3 — amber banner in preview step, visible until user goes back |
| Full transaction history | Task 4 — `StockHistory.vue` at `/stock/history` |
| Expandable entry detail | Task 4 — `toggleExpand` + `expandedIds` |
| Sidebar navigation | Task 5 — two sub-items under Inventory |
| Mock data persists in session | Task 1 — POST handler mutates `MOCK_PRODUCTS` and `MOCK_EOD_HISTORY` in-place |

**No placeholders detected.**

**Type/name consistency confirmed:** `changedItems`, `flaggedItems`, `entries`, `submitEod`, `fetchHistory`, `resetForm` — all names match between composable definition (Task 2) and page usage (Tasks 3–4).
