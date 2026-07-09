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
