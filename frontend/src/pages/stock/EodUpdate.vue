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
