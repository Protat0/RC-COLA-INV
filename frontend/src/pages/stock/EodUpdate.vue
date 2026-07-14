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

      <!-- Loading state (initial products / assortments fetch) -->
      <div v-if="productsLoading || assortmentsLoading" class="text-center py-5">
        <div class="spinner-border" style="color: var(--text-accent);" role="status">
          <span class="visually-hidden">Loading…</span>
        </div>
        <p class="mt-2" style="color: var(--text-tertiary); font-size: 0.85rem;">Loading products and assortments…</p>
      </div>

      <!-- Entry step -->
      <template v-else-if="step === 'entry'">
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
            <div v-if="assortmentSummary.length > 0" data-testid="assortment-summary" class="mt-2 rounded p-2" style="background: var(--surface-tertiary);">
              <div
                v-for="s in assortmentSummary"
                :key="s.assortment_id"
                style="font-size: 0.8rem; color: var(--text-secondary);"
              >
                <strong>{{ s.qty }} × {{ s.name }}</strong>
                <span class="ms-2">→ {{ s.total_cases_broken }} case{{ s.total_cases_broken === 1 ? '' : 's' }} broken</span>
                <span class="ms-1">·</span>
                <span
                  class="ms-1"
                  :style="s.loose_change > 0 ? 'color: var(--status-warning); font-weight: 600;' : s.loose_change < 0 ? 'color: var(--status-success); font-weight: 600;' : ''"
                >
                  {{ s.loose_change > 0 ? '+' : '' }}{{ s.loose_change }} loose bottle{{ Math.abs(s.loose_change) === 1 ? '' : 's' }}
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

    // One-line summary per assortment sale for the entry-step preview.
    // Per-flavor detail stays on the preview step's Assortment breakdown card.
    const assortmentSummary = computed(() => {
      const caseSizeById = {}
      activeProducts.value.forEach(p => { caseSizeById[p.product_id] = p.case_size ?? 0 })
      return assortmentPreview.value.map(p => {
        let totalCases = 0
        let looseChange = 0
        p.effects.forEach(eff => {
          totalCases += eff.cases_broken
          looseChange += (eff.cases_broken * (caseSizeById[eff.product_id] || 0)) - eff.bottles_needed
        })
        return {
          assortment_id: p.assortment_id,
          name: p.name,
          qty: p.qty,
          total_cases_broken: totalCases,
          loose_change: looseChange,
        }
      })
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
      assortmentSummary,
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
