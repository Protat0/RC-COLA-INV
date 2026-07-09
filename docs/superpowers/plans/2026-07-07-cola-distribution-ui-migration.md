# Cola Distribution UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the frontend UI from a ramyeon corner shop POS into an RC Cola distribution inventory system by updating domain-specific labels, removing food/expiry-related UI, and aligning terminology with beverage distribution workflows.

**Architecture:** All changes are confined to the Vue 3 frontend in `frontend/src/`. Changes are purely UI/label-level — no new components, no API contract changes, no route restructuring. The backend API field names (`expiry_date`, `cost_price`, etc.) stay unchanged; we simply stop displaying/requiring them in the UI.

**Tech Stack:** Vue 3 (Options API + Composition API), Vite, Vitest, @vue/test-utils, Bootstrap 5, Lucide Vue icons

## Global Constraints

- Do NOT change branding: PANNTECH name, logo circle, logo image, color variables, or any CSS
- Do NOT rename API field names or change API payloads structurally — just stop requiring/displaying `expiry_date` in the UI
- Do NOT restructure routes, file names, or component hierarchy
- Do NOT change any backend service files (`src/services/api*.js`) except inline comment text
- Tests run with: `cd frontend && npm run test:unit`
- All new test files go in `frontend/src/components/__tests__/`
- Use `shallowMount` to avoid deep dependency chains in tests

---

### Task 1: App-Level Functional Labels

**Files:**
- Modify: `frontend/src/layouts/Sidebar.vue:13`
- Modify: `frontend/src/pages/suppliers/OrdersHistory.vue:781`
- Test: `frontend/src/components/__tests__/task1-app-labels.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: Sidebar shows "Distribution Inventory" subtitle; PDF header says "PANNTECH Distribution Inventory"

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task1-app-labels.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import Sidebar from '@/layouts/Sidebar.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})

describe('Sidebar brand subtitle', () => {
  it('shows Distribution Inventory subtitle', async () => {
    const wrapper = shallowMount(Sidebar, {
      global: {
        plugins: [router],
        stubs: { 'router-link': true }
      }
    })
    expect(wrapper.text()).toContain('Distribution Inventory')
    expect(wrapper.text()).not.toContain('POS & Inventory')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task1-app-labels.spec.js
```
Expected: FAIL — "Distribution Inventory" not found

- [ ] **Step 3: Update Sidebar.vue subtitle**

In `frontend/src/layouts/Sidebar.vue` line 13, change:
```html
<small class="brand-subtitle">POS & Inventory</small>
```
to:
```html
<small class="brand-subtitle">Distribution Inventory</small>
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task1-app-labels.spec.js
```
Expected: PASS

- [ ] **Step 5: Update PDF header in OrdersHistory.vue**

In `frontend/src/pages/suppliers/OrdersHistory.vue` line 781, change:
```javascript
doc.text('PANNTECH POS & Inventory', pageWidth / 2, 38, { align: 'center' })
```
to:
```javascript
doc.text('PANNTECH Distribution Inventory', pageWidth / 2, 38, { align: 'center' })
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layouts/Sidebar.vue frontend/src/pages/suppliers/OrdersHistory.vue frontend/src/components/__tests__/task1-app-labels.spec.js
git commit -m "feat: update sidebar subtitle and PDF header for distribution system"
```

---

### Task 2: Supplier Type Category Options

**Files:**
- Modify: `frontend/src/pages/suppliers/Suppliers.vue:119-145`
- Modify: `frontend/src/components/suppliers/SupplierFormModal.vue:119-128`
- Test: `frontend/src/components/__tests__/task2-supplier-types.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: Both type dropdowns use cola-distribution-appropriate categories (Beverage Distributor, Logistics Partner, Retail Partner, Support Services, Co-Manufacturer, Other); the mislabeled "Stock alert" filter label is corrected to "Order Volume"

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task2-supplier-types.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import SupplierFormModal from '@/components/suppliers/SupplierFormModal.vue'

const minimalFormData = {
  supplier_name: '', contact_person: '', email: '',
  phone_number: '', type: '', address: '', notes: ''
}

describe('SupplierFormModal type options', () => {
  it('shows Beverage Distributor and not Food & Beverages', () => {
    const wrapper = shallowMount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false }
    })
    expect(wrapper.text()).toContain('Beverage Distributor')
    expect(wrapper.text()).not.toContain('Food & Beverages')
    expect(wrapper.text()).not.toContain('Raw Materials')
  })

  it('shows Logistics Partner and not Packaging Materials', () => {
    const wrapper = shallowMount(SupplierFormModal, {
      props: { show: true, isEdit: false, formData: minimalFormData, isValid: false }
    })
    expect(wrapper.text()).toContain('Logistics Partner')
    expect(wrapper.text()).not.toContain('Packaging Materials')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task2-supplier-types.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update SupplierFormModal.vue type options**

In `frontend/src/components/suppliers/SupplierFormModal.vue` lines 119–128, replace the entire `<select>` block with:
```html
<select 
  class="form-select modern-input" 
  id="supplierType"
  v-model="formData.type"
>
  <option value="">Select supplier type</option>
  <option value="beverage">Beverage Distributor</option>
  <option value="logistics">Logistics Partner</option>
  <option value="retail">Retail Partner</option>
  <option value="support">Support Services</option>
  <option value="co_manufacturer">Co-Manufacturer</option>
  <option value="other">Other</option>
</select>
```

- [ ] **Step 4: Update Suppliers.vue type filter and fix mislabeled filter**

In `frontend/src/pages/suppliers/Suppliers.vue` lines 117–129, replace the category filter `<div class="filter-dropdown">` block with:
```html
<div class="filter-dropdown">
  <label class="filter-label">Category</label>
  <select 
    class="form-select form-select-sm" 
    v-model="suppliersComposable.filters.type" 
    @change="applyFilters"
  >
    <option value="all">All items</option>
    <option value="beverage">Beverage Distributor</option>
    <option value="logistics">Logistics Partner</option>
    <option value="retail">Retail Partner</option>
    <option value="support">Support Services</option>
    <option value="co_manufacturer">Co-Manufacturer</option>
  </select>
</div>
```

Also fix the mislabeled order volume filter at lines 132–133 (currently says "Stock alert" but filters order volume):
```html
<label class="filter-label">Stock alert</label>
```
→
```html
<label class="filter-label">Order Volume</label>
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task2-supplier-types.spec.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/suppliers/Suppliers.vue frontend/src/components/suppliers/SupplierFormModal.vue frontend/src/components/__tests__/task2-supplier-types.spec.js
git commit -m "feat: update supplier type categories for cola distribution"
```

---

### Task 3: Dashboard KPI Labels

**Files:**
- Modify: `frontend/src/pages/Dashboard.vue:100,200`
- Test: `frontend/src/components/__tests__/task3-dashboard-labels.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: "Total Items Sold" KPI card retitled to "Total Units Sold"; transaction customer fallback "Walk-in" changed to "Direct Sale"

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task3-dashboard-labels.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import Dashboard from '@/pages/Dashboard.vue'

describe('Dashboard labels', () => {
  it('shows Total Units Sold instead of Total Items Sold', () => {
    const wrapper = shallowMount(Dashboard, {
      global: {
        stubs: { CardTemplate: true, RefreshCw: true }
      }
    })
    expect(wrapper.html()).toContain('Total Units Sold')
    expect(wrapper.html()).not.toContain('Total Items Sold')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task3-dashboard-labels.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update Dashboard.vue labels**

In `frontend/src/pages/Dashboard.vue` line 100, change:
```html
title="Total Items Sold"
```
to:
```html
title="Total Units Sold"
```

In `frontend/src/pages/Dashboard.vue` line 200, change:
```javascript
{{ transaction.customer_name || transaction.customer?.full_name || 'Walk-in' }}
```
to:
```javascript
{{ transaction.customer_name || transaction.customer?.full_name || 'Direct Sale' }}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task3-dashboard-labels.spec.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.vue frontend/src/components/__tests__/task3-dashboard-labels.spec.js
git commit -m "feat: update dashboard KPI and transaction labels for distribution system"
```

---

### Task 4: Remove Expiry Date from AddProductModal

**Files:**
- Modify: `frontend/src/components/products/AddProductModal.vue`
- Test: `frontend/src/components/__tests__/task4-add-product-modal.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: AddProductModal no longer shows or validates the expiry date field; `expiry_date` is excluded from the API payload; Batch Number field takes full row width

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task4-add-product-modal.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import AddProductModal from '@/components/products/AddProductModal.vue'

describe('AddProductModal expiry removal', () => {
  it('does not render an expiry date input', () => {
    const wrapper = shallowMount(AddProductModal, {
      props: { show: true },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.find('#batch_expiry_date').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task4-add-product-modal.spec.js
```
Expected: FAIL

- [ ] **Step 3: Remove expiry date field from template**

In `frontend/src/components/products/AddProductModal.vue`, find the `<div class="row g-3 mb-3">` that wraps both the `batch_expiry_date` (lines 251–275) and `batch_number` (lines 277–295) fields. Remove only the `batch_expiry_date` `<div class="col-md-6">` block (lines 251–275). Change the `batch_number` col from `col-md-6` to `col-md-12` so it takes the full row:

```html
<div class="row g-3 mb-3">
  <div class="col-md-12">
    <label for="batch_number" class="form-label text-primary fw-medium">
      Batch Number
    </label>
    <input 
      id="batch_number"
      v-model="batchForm.batch_number"
      type="text"
      :disabled="isLoading"
      class="form-control input-theme"
      placeholder="e.g. BATCH-001"
    />
    <small class="text-tertiary-medium">
      Optional — leave blank to auto-generate
    </small>
  </div>
</div>
```

> Read lines 277–295 of AddProductModal.vue first to copy the exact existing `batch_number` markup before replacing.

- [ ] **Step 4: Remove expiry from batchForm state**

In `frontend/src/components/products/AddProductModal.vue`, delete `expiry_date: '',` from both `batchForm` initial state definitions (lines ~644 and ~735).

- [ ] **Step 5: Remove expiry date validation block**

In `frontend/src/components/products/AddProductModal.vue`, delete lines 693–702:
```javascript
if (!batchForm.value.expiry_date) {
  errors.batch_expiry_date = 'Expiry date is required'
} else {
  const exp = new Date(batchForm.value.expiry_date)
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  if (exp <= todayDate) {
    errors.batch_expiry_date = 'Expiry date must be in the future'
  }
}
```

- [ ] **Step 6: Remove expiry from API payload and form reset**

Find and delete: `expiry_date: batchForm.value.expiry_date,` (line ~849)

Find and delete: `delete validationErrors.value.batch_expiry_date` (line ~759)

- [ ] **Step 7: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task4-add-product-modal.spec.js
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/products/AddProductModal.vue frontend/src/components/__tests__/task4-add-product-modal.spec.js
git commit -m "feat: remove expiry date field from product creation form"
```

---

### Task 5: Remove Expiry Display from ViewProductModal & ProductOverview

**Files:**
- Modify: `frontend/src/components/products/ViewProductModal.vue:159-163`
- Modify: `frontend/src/components/products/ProductOverview.vue:51-53,208-217,255,257-263`
- Test: `frontend/src/components/__tests__/task5-product-views.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: Product detail views no longer show expiry date or nearest expiry stat; `activeBatches` sorts by `batch_id` (FIFO) instead of expiry date; `USABLE_STATUSES` no longer includes `expiring_soon`; `nearestExpiryDate` computed removed

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task5-product-views.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import ViewProductModal from '@/components/products/ViewProductModal.vue'
import ProductOverview from '@/components/products/ProductOverview.vue'

describe('ViewProductModal expiry removal', () => {
  it('does not show Expiry Date label', () => {
    const wrapper = shallowMount(ViewProductModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', expiry_date: '2026-12-01' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('ProductOverview nearest expiry removal', () => {
  it('does not show Nearest Expiry label', () => {
    const wrapper = shallowMount(ProductOverview, {
      props: {
        product: { product_id: 1, product_name: 'RC Cola 1.5L', batches: [] }
      }
    })
    expect(wrapper.text()).not.toContain('Nearest Expiry')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task5-product-views.spec.js
```
Expected: FAIL

- [ ] **Step 3: Remove expiry from ViewProductModal.vue**

In `frontend/src/components/products/ViewProductModal.vue`, find and remove the expiry date display block around lines 159–163:
```html
<label class="form-label text-tertiary-medium">Expiry Date</label>
<span>
  {{ formatDate(product.expiry_date) }}
  <small v-if="product.expiry_date" class="d-block text-tertiary-medium">
    {{ getDaysUntilExpiry(product.expiry_date) }}
  </small>
</span>
```
Delete these lines and their wrapping `<div>` if it becomes empty. Also remove `getDaysUntilExpiry` from the `return` statement in `setup()` (~lines 296, 374) if it is only used here.

- [ ] **Step 4: Remove Nearest Expiry stat from ProductOverview.vue template**

In `frontend/src/components/products/ProductOverview.vue`, remove the nearest expiry stat block (lines 51–53):
```html
<small class="text-tertiary d-block">Nearest Expiry</small>
<span class="text-secondary">{{ formatDate(nearestExpiryDate) }}</span>
```
Delete these two lines (and their parent `<div>` if it becomes empty).

- [ ] **Step 5: Simplify activeBatches in ProductOverview.vue**

Replace the expiry-date-based `activeBatches` filter/sort (lines ~208–217):
```javascript
const activeBatches = computed(() => {
  const now = new Date()
  return batches.value
    .filter(
      b => USABLE_STATUSES.has(b.status) && (b.quantity_remaining > 0) && (!b.expiry_date || new Date(b.expiry_date) >= now)
    )
    .sort((a, b) => {
      if (!a.expiry_date && !b.expiry_date) return 0
      if (!a.expiry_date) return 1
      if (!b.expiry_date) return -1
      return new Date(a.expiry_date) - new Date(b.expiry_date)
    })
})
```
with:
```javascript
const activeBatches = computed(() =>
  batches.value
    .filter(b => USABLE_STATUSES.has(b.status) && b.quantity_remaining > 0)
    .sort((a, b) => (a.batch_id > b.batch_id ? 1 : -1))
)
```

Update `USABLE_STATUSES` (line ~255) — remove `expiring_soon`:
```javascript
const USABLE_STATUSES = new Set(['active', 'low_stock'])
```

Remove the `nearestExpiryDate` computed property (lines ~257–263):
```javascript
const nearestExpiryDate = computed(() => {
  const now = new Date()
  const usable = activeBatches.value.filter(
    b => USABLE_STATUSES.has(b.status) && b.expiry_date && new Date(b.expiry_date) >= now
  )
  return [...usable].sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0]?.expiry_date
})
```

- [ ] **Step 6: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task5-product-views.spec.js
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/products/ViewProductModal.vue frontend/src/components/products/ProductOverview.vue frontend/src/components/__tests__/task5-product-views.spec.js
git commit -m "feat: remove expiry display from product view and overview components"
```

---

### Task 6: Remove Expiry from ProductPurchases & BatchDetailsModal (Products)

**Files:**
- Modify: `frontend/src/components/products/ProductPurchases.vue`
- Modify: `frontend/src/components/products/BatchDetailsModal.vue:20`
- Test: `frontend/src/components/__tests__/task6-purchases-batch.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: ProductPurchases removes "Expired" status option, "Expiring Soon" filter, expiry date column, expiry-based sort; BatchDetailsModal (products) removes expiry date row; batch sorting uses FIFO (by `batch_id`)

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task6-purchases-batch.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import ProductPurchases from '@/components/products/ProductPurchases.vue'
import BatchDetailsModal from '@/components/products/BatchDetailsModal.vue'

describe('ProductPurchases expiry removal', () => {
  it('does not show Expired status option or Expiring Soon filter', () => {
    const wrapper = shallowMount(ProductPurchases, {
      props: {
        productId: 1,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle' }
      }
    })
    expect(wrapper.text()).not.toContain('Expired')
    expect(wrapper.text()).not.toContain('Expiring Soon')
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('BatchDetailsModal (products) expiry removal', () => {
  it('does not show Expiry Date row', () => {
    const wrapper = shallowMount(BatchDetailsModal, {
      props: {
        show: true,
        batch: { batch_id: 'B001', quantity_received: 100, quantity_remaining: 50, expiry_date: '2026-12-01' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task6-purchases-batch.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update ProductPurchases.vue — remove expired status option**

In `frontend/src/components/products/ProductPurchases.vue` line ~22, delete:
```html
<option value="expired">Expired</option>
```

- [ ] **Step 4: Remove Expiring Soon filter from ProductPurchases.vue**

Delete the entire `<div class="col-md-4">` block for "Expiring Soon" (lines ~25–37):
```html
<div class="col-md-4">
  <label class="form-label text-secondary">Expiring Soon</label>
  <div class="d-flex gap-2 align-items-center">
    <input type="checkbox" v-model="filters.expiringSoon" class="form-check-input" />
    <input
      v-if="filters.expiringSoon"
      v-model.number="filters.daysAhead"
      type="number"
      class="form-control input-theme form-control-sm"
      placeholder="Days"
      min="1"
    />
  </div>
</div>
```
Change the remaining filter columns from `col-md-4` to `col-md-6` for proper layout.

Remove `expiringSoon` and `daysAhead` from the `filters` reactive state (in `<script setup>`).

- [ ] **Step 5: Remove Expiry Date column from ProductPurchases.vue**

Delete the `<th class="text-start">Expiry Date</th>` table header (~line 100).

Delete the `<td>` cell containing:
```html
<span class="text-secondary" :class="getExpiryClass(batch.expiry_date)">
  {{ batch.expiry_date ? formatDate(batch.expiry_date) : 'N/A' }}
</span>
```

- [ ] **Step 6: Replace FEFO sort with FIFO sort in ProductPurchases.vue**

Find the expiry-based batch sort (lines ~210–217):
```javascript
// Priority 2: closest expiry first (no expiry goes after batches that have one)
const aHasExpiry = !!a.expiry_date
const bHasExpiry = !!b.expiry_date
if (aHasExpiry && bHasExpiry) {
  const expiryDiff = new Date(a.expiry_date) - new Date(b.expiry_date)
  if (expiryDiff !== 0) return expiryDiff
} else if (aHasExpiry !== bHasExpiry) {
  return aHasExpiry ? -1 : 1
}
```
Replace with:
```javascript
// Priority 2: FIFO — earliest batch first
if (a.batch_id < b.batch_id) return -1
if (a.batch_id > b.batch_id) return 1
```

- [ ] **Step 7: Remove expiry badge classes and helper functions from ProductPurchases.vue**

In `statusBadgeClasses` object (~lines 262, 264), remove:
```javascript
expiring_soon: 'status-badge status-badge-warning',
expired: 'status-badge status-badge-danger',
```

Delete the `if (batch.status === 'expired') return 'status-badge-neutral'` line (~line 270).

Delete the entire `getExpiryClass` function (~lines 277–278 and its body).

- [ ] **Step 8: Update BatchDetailsModal.vue (products)**

In `frontend/src/components/products/BatchDetailsModal.vue` line 20, delete:
```html
<tr><th>Expiry Date</th><td>{{ formatDate(batch.expiry_date) }}</td></tr>
```

- [ ] **Step 9: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task6-purchases-batch.spec.js
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/products/ProductPurchases.vue frontend/src/components/products/BatchDetailsModal.vue frontend/src/components/__tests__/task6-purchases-batch.spec.js
git commit -m "feat: remove expiry date from product purchase history and batch details"
```

---

### Task 7: Update Stock Adjustment Types & StockUpdateModal

**Files:**
- Modify: `frontend/src/components/products/StockUpdateModal.vue`
- Modify: `frontend/src/components/products/ProductAdjustments.vue`
- Modify: `frontend/src/components/products/AdjustmentDetailsModal.vue`
- Test: `frontend/src/components/__tests__/task7-stock-adjustments.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: "Spoilage / Expiry" adjustment option removed (the existing "Damage" option covers it); expiry date field removed from restock form; FEFO language updated to FIFO; batch option display no longer shows expiry

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task7-stock-adjustments.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import StockUpdateModal from '@/components/products/StockUpdateModal.vue'
import ProductAdjustments from '@/components/products/ProductAdjustments.vue'

describe('StockUpdateModal updates', () => {
  it('does not show Spoilage / Expiry option or Expiry Date field', () => {
    const wrapper = shallowMount(StockUpdateModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle', stock: 100 },
        suppliers: []
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Spoilage / Expiry')
    expect(wrapper.text()).not.toContain('Expiry Date')
  })

  it('shows FIFO instead of FEFO', () => {
    const wrapper = shallowMount(StockUpdateModal, {
      props: {
        show: true,
        product: { product_id: 1, product_name: 'RC Cola 1.5L', unit: 'bottle', stock: 100 },
        suppliers: []
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('FEFO')
  })
})

describe('ProductAdjustments filter', () => {
  it('does not show Spoilage option', () => {
    const wrapper = shallowMount(ProductAdjustments, {
      props: { productId: 1 }
    })
    expect(wrapper.text()).not.toContain('Spoilage')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task7-stock-adjustments.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update StockUpdateModal.vue — remove spoilage option**

In `frontend/src/components/products/StockUpdateModal.vue` line ~202, delete:
```html
<option value="spoilage">Spoilage / Expiry</option>
```
The existing `<option value="damage">Damage</option>` already covers this case.

- [ ] **Step 4: Remove expiry date field from restock form in StockUpdateModal.vue**

In `frontend/src/components/products/StockUpdateModal.vue`, delete the `<div class="col-md-6">` block for Expiry Date (lines ~121–133):
```html
<div class="col-md-6">
  <label for="expiry_date" class="form-label text-primary fw-medium">Expiry Date</label>
  <input
    id="expiry_date"
    v-model="form.expiry_date"
    type="date"
    :disabled="isLoading"
    :min="tomorrow"
    class="form-control input-theme"
  />
  <small class="text-tertiary-medium">Optional — leave blank if unknown</small>
</div>
```
Change the sibling supplier `<div class="col-md-6">` to `<div class="col-md-12">`.

- [ ] **Step 5: Remove expiry from batch option display and update FIFO text**

Line ~226 — remove expiry suffix from batch option label:
```javascript
{{ batch.batch_id }} — {{ batch.quantity_remaining }} {{ product?.unit }}{{ batch.expiry_date ? ' · Exp: ' + formatExpiry(batch.expiry_date) : '' }}
```
→
```javascript
{{ batch.batch_id }} — {{ batch.quantity_remaining }} {{ product?.unit }}
```

Line ~219 — update dropdown placeholder:
```html
'Auto — FEFO (recommended)'
```
→
```html
'Auto — FIFO (recommended)'
```

Line ~232 — update helper text:
```html
'FEFO automatically targets the soonest-expiring batch first'
```
→
```html
'FIFO automatically targets the earliest received batch first'
```

- [ ] **Step 6: Remove expiry_date from StockUpdateModal form state and payload**

Delete `expiry_date: '',` from both form state definitions (~lines 350 and 484).

Delete `expiry_date: form.value.expiry_date || undefined,` from the submit payload (~line 523).

Delete `form.value.expiry_date = ''` from the form reset (~line 437).

Delete the `formatExpiry` function (~line 410 and its body).

- [ ] **Step 7: Update ProductAdjustments.vue**

In `frontend/src/components/products/ProductAdjustments.vue` line ~21, delete:
```html
<option value="spoilage">Spoilage</option>
```

In the `statusBadgeClasses` object (~line 251), delete:
```javascript
spoilage: 'status-badge status-badge-warning',
```

- [ ] **Step 8: Update AdjustmentDetailsModal.vue**

In `frontend/src/components/products/AdjustmentDetailsModal.vue` line ~145, delete:
```javascript
'spoilage': 'badge bg-warning',
```

- [ ] **Step 9: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task7-stock-adjustments.spec.js
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/products/StockUpdateModal.vue frontend/src/components/products/ProductAdjustments.vue frontend/src/components/products/AdjustmentDetailsModal.vue frontend/src/components/__tests__/task7-stock-adjustments.spec.js
git commit -m "feat: remove spoilage/expiry adjustment type and update FIFO language"
```

---

### Task 8: Update ColumnFilterModal & ImportModal

**Files:**
- Modify: `frontend/src/components/products/ColumnFilterModal.vue:297-299,389`
- Modify: `frontend/src/components/products/ImportModal.vue:45,126,203`
- Test: `frontend/src/components/__tests__/task8-column-import.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: Column filter no longer offers "Expiry Date" as a togglable column; import instructions no longer reference `expiry_date` as required

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task8-column-import.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import ColumnFilterModal from '@/components/products/ColumnFilterModal.vue'
import ImportModal from '@/components/products/ImportModal.vue'

describe('ColumnFilterModal expiry removal', () => {
  it('does not list Expiry Date as a column option', () => {
    const wrapper = shallowMount(ColumnFilterModal, {
      props: { show: true, visibleColumns: {} },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
    expect(wrapper.text()).not.toContain('Product expiration date')
  })
})

describe('ImportModal instructions', () => {
  it('does not mention expiry_date as required', () => {
    const wrapper = shallowMount(ImportModal, {
      props: { show: true },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.html()).not.toMatch(/expiry_date.*REQUIRED/i)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task8-column-import.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update ColumnFilterModal.vue**

Remove the `expiryDate` column definition from the columns array (~lines 297–299):
```javascript
{
  key: 'expiryDate',
  name: 'Expiry Date',
  description: 'Product expiration date'
},
```
Delete this object.

Remove `expiryDate: true` from the default visible columns object (~line 389).

- [ ] **Step 4: Update ImportModal.vue**

Line ~45: Remove `<li><code>expiry_date</code> is <strong>REQUIRED</strong></li>`.

Line ~126: Change:
```html
<li>Products with <code>stock > 0</code> must have <code>cost_price</code> and <code>expiry_date</code></li>
```
to:
```html
<li>Products with <code>stock > 0</code> must have <code>cost_price</code></li>
```

Line ~203: Change:
```html
<li>Batch will include: quantity, cost price, and expiry date from your file</li>
```
to:
```html
<li>Batch will include: quantity and cost price from your file</li>
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task8-column-import.spec.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/products/ColumnFilterModal.vue frontend/src/components/products/ImportModal.vue frontend/src/components/__tests__/task8-column-import.spec.js
git commit -m "feat: remove expiry date from column filter and import instructions"
```

---

### Task 9: Remove Expiry from Supplier Batch Components

**Files:**
- Modify: `frontend/src/components/suppliers/CreateOrderModal.vue`
- Modify: `frontend/src/components/suppliers/BatchDetailsModal.vue`
- Modify: `frontend/src/components/suppliers/EditBatchDetailsModal.vue`
- Modify: `frontend/src/components/suppliers/OrderDetailsModal.vue`
- Test: `frontend/src/components/__tests__/task9-supplier-batch.spec.js`

**Interfaces:**
- Consumes: nothing
- Produces: All supplier-side batch and order components no longer show, collect, or map `expiry_date` / `expiryDate`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task9-supplier-batch.spec.js`:

```javascript
import { shallowMount } from '@vue/test-utils'
import BatchDetailsModal from '@/components/suppliers/BatchDetailsModal.vue'
import CreateOrderModal from '@/components/suppliers/CreateOrderModal.vue'

describe('Supplier BatchDetailsModal expiry removal', () => {
  it('does not show Expiry Date column', () => {
    const wrapper = shallowMount(BatchDetailsModal, {
      props: {
        show: true,
        order: { order_id: 'O001', batches: [] },
        supplier: { supplier_id: 1, supplier_name: 'RC Cola Distrib.' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})

describe('CreateOrderModal expiry removal', () => {
  it('does not show Expiry Date field in order items', () => {
    const wrapper = shallowMount(CreateOrderModal, {
      props: {
        show: true,
        supplier: { supplier_id: 1, supplier_name: 'RC Cola Distrib.' }
      },
      global: { stubs: { Teleport: true } }
    })
    expect(wrapper.text()).not.toContain('Expiry Date')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task9-supplier-batch.spec.js
```
Expected: FAIL

- [ ] **Step 3: Update CreateOrderModal.vue**

Delete the entire `<div>` block containing the "Expiry Date" label and date input (~lines 264–272):
```html
<label class="form-label small mb-1">Expiry Date</label>
<input
  type="date"
  v-model="item.expectedExpiryDate"
  ...
/>
```

Delete `expectedExpiryDate: '',` from item initial state (~line 455).

Delete the comment `// Expiry intentionally left blank — applies to a fresh delivery` (~line 593).

Delete `expiry_date: item.expectedExpiryDate || null,` from the API submit payload (~line 692).

- [ ] **Step 4: Update suppliers/BatchDetailsModal.vue**

Delete the "Expiry Date" table column header (~line 105):
```html
<th>Expiry Date</th>
```

Delete the expiry date `<td>` cell (~lines 135–139):
```html
<span v-if="item.expiryDate">
  {{ formatDate(item.expiryDate) }}
  ...
  <small :class="['text-secondary', { 'text-status-error': isExpiringSoon(item.expiryDate) }]">
    {{ getExpiryStatus(item.expiryDate) }}
  </small>
</span>
```
Delete the entire `<td>` containing this.

Delete `expiryDate: b.expiry_date || null,` from the batch mapping (~line 235).

Delete functions `isExpiringSoon` and `getExpiryStatus` (~lines 277–290).

- [ ] **Step 5: Update suppliers/EditBatchDetailsModal.vue**

Delete the "Expiry Date" column header (~line 114):
```html
<th style="width: 120px;">Expiry Date</th>
```

Delete the expiry date input `<td>` cell (~line 234) — the cell bound to `v-model="item.expiryDate"`.

Remove all `expiryDate` references from:
- Item state mapping (~lines 423, 507): delete `expiryDate: ...` lines
- New item default (~line 580): delete `expiryDate: '',`
- API submit payloads (~lines 749, 776): delete `expiry_date: item.expiryDate || null,`

- [ ] **Step 6: Update suppliers/OrderDetailsModal.vue**

In `frontend/src/components/suppliers/OrderDetailsModal.vue` line ~481, delete:
```javascript
expiryDate: b.expiry_date,
```

- [ ] **Step 7: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task9-supplier-batch.spec.js
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/suppliers/CreateOrderModal.vue frontend/src/components/suppliers/BatchDetailsModal.vue frontend/src/components/suppliers/EditBatchDetailsModal.vue frontend/src/components/suppliers/OrderDetailsModal.vue frontend/src/components/__tests__/task9-supplier-batch.spec.js
git commit -m "feat: remove expiry date from supplier order and batch components"
```

---

### Task 10: Clean Up useBatches.js Composable

**Files:**
- Modify: `frontend/src/composables/api/useBatches.js`
- Test: `frontend/src/components/__tests__/task10-use-batches.spec.js`

**Interfaces:**
- Consumes: `useBatches` is consumed by product detail and batch modal components
- Produces: `useBatches` no longer exposes `expiredBatches`, `expiringBatches`, `checkExpiryAlerts`, or `markExpiredBatches`; expired/expiring stats removed from initial state

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/task10-use-batches.spec.js`:

```javascript
import { useBatches } from '@/composables/api/useBatches.js'

describe('useBatches expiry cleanup', () => {
  it('does not expose expiredBatches', () => {
    const result = useBatches()
    expect(result.expiredBatches).toBeUndefined()
  })

  it('does not expose checkExpiryAlerts', () => {
    const result = useBatches()
    expect(result.checkExpiryAlerts).toBeUndefined()
  })

  it('does not expose markExpiredBatches', () => {
    const result = useBatches()
    expect(result.markExpiredBatches).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task10-use-batches.spec.js
```
Expected: FAIL

- [ ] **Step 3: Remove expiry-related state from initial stats object**

In `frontend/src/composables/api/useBatches.js` lines ~23–24, delete:
```javascript
expired_batches: 0,
expiring_within_7_days: 0,
```

- [ ] **Step 4: Remove expiredBatches computed property**

Delete (~lines 33–34):
```javascript
const expiredBatches = computed(() => 
  batches.value.filter(batch => batch.status === 'expired')
)
```

- [ ] **Step 5: Remove expiringBatches computed property**

Delete the `expiringBatches` computed that filters by `batch.expiry_date <= warningDate` (~lines 44–49).

- [ ] **Step 6: Remove checkExpiryAlerts and markExpiredBatches functions**

Delete `checkExpiryAlerts` function (~lines 252–265).

Delete `markExpiredBatches` function (~lines 267–275).

- [ ] **Step 7: Remove expiry-checking from batch stats block**

Delete the expiry check block inside the stats update (~lines 314–316):
```javascript
const expiryDate = new Date(batch.expiry_date)
...
if (!batch.expiry_date || expiryDate > warningDate || expiryDate <= now) {
```

- [ ] **Step 8: Remove from return statement**

Delete `expiredBatches,` from the composable's `return` object (~line 369).

- [ ] **Step 9: Run test, verify it passes**

```bash
cd frontend && npm run test:unit -- --reporter=verbose src/components/__tests__/task10-use-batches.spec.js
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/composables/api/useBatches.js frontend/src/components/__tests__/task10-use-batches.spec.js
git commit -m "feat: remove expiry tracking from useBatches composable"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Sidebar subtitle updated to "Distribution Inventory" | Task 1 |
| PDF header updated | Task 1 |
| Supplier type categories updated to distribution-appropriate values | Task 2 |
| "Stock alert" filter label corrected to "Order Volume" | Task 2 |
| Dashboard KPI "Total Items Sold" → "Total Units Sold" | Task 3 |
| "Walk-in" fallback → "Direct Sale" | Task 3 |
| Expiry date field removed from product creation form | Task 4 |
| Expiry date validation removed from product creation | Task 4 |
| Expiry display removed from product view modal | Task 5 |
| Nearest Expiry stat removed from product overview | Task 5 |
| FEFO sort → FIFO sort in product overview | Task 5 |
| `expiring_soon` removed from USABLE_STATUSES | Task 5 |
| "Expired" status option removed from batch filter | Task 6 |
| "Expiring Soon" filter removed from purchase history | Task 6 |
| Expiry Date column removed from purchase history table | Task 6 |
| FEFO sort → FIFO sort in purchase history | Task 6 |
| Expiry Date row removed from product BatchDetailsModal | Task 6 |
| "Spoilage / Expiry" adjustment option removed | Task 7 |
| FEFO language → FIFO in StockUpdateModal | Task 7 |
| Expiry date field removed from restock form | Task 7 |
| "Spoilage" option removed from ProductAdjustments filter | Task 7 |
| "Expiry Date" removed from column filter options | Task 8 |
| Import instructions updated (expiry_date no longer required) | Task 8 |
| Expiry date field removed from CreateOrderModal | Task 9 |
| Expiry date column removed from supplier BatchDetailsModal | Task 9 |
| Expiry date column removed from EditBatchDetailsModal | Task 9 |
| `expiryDate` mapping removed from OrderDetailsModal | Task 9 |
| `expiredBatches`, `checkExpiryAlerts`, `markExpiredBatches` removed from composable | Task 10 |

### Placeholder Scan

No TBD, TODO, or "similar to Task N" shortcuts used. All steps include exact file paths, line references, and code blocks.

### Type Consistency

- `batch.batch_id` used for FIFO sort in Tasks 5, 6 — consistent with field names visible throughout the codebase (confirmed in `ProductPurchases.vue` and `BatchDetailsModal.vue` inspection)
- `USABLE_STATUSES` mutated in Task 5; not referenced in any other task
- `expiry_date` and `expiryDate` removal is consistent across Tasks 4–10; no later task re-introduces them
