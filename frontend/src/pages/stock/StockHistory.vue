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
              <th class="sticky-col-loose header-cell loose-header">Loose</th>
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
              <td data-testid="loose-cell" class="sticky-col-loose loose-cell">
                <span :class="(product.loose_bottles ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
                  {{ product.loose_bottles ?? 0 }}
                </span>
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
              <td class="sticky-col-loose loose-cell"></td>
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
import { sortByVariant } from '@/data/mockData.js'

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

    const activeProducts = computed(() =>
      products.value.filter(p => p.status === 'active').sort(sortByVariant)
    )

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

    onMounted(() => {
      initializeProducts()
      fetchMovements({ dateFrom: dateFrom.value, dateTo: dateTo.value })
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
  background: var(--surface-primary);
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
  width: 220px;
  min-width: 220px;
  max-width: 220px;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--surface-primary);
}

/* Second sticky column (Loose) — pinned right after the 220px Product column.
   Owns the right-edge shadow so it visually terminates the sticky region. */
.sticky-col-loose {
  position: sticky;
  left: 220px;
  z-index: 2;
  background: var(--surface-primary);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04);
}

.loose-header {
  text-align: right;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
}

.loose-cell {
  text-align: right;
  padding: 0.55rem 0.75rem;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-primary);
}

.product-cell {
  padding: 0.55rem 0.75rem;
  width: 220px;
  min-width: 220px;
  max-width: 220px;
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
