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
              <th class="sticky-col-bo header-cell bo-header">BO</th>
              <th
                v-for="d in dates"
                :key="d"
                data-testid="date-header"
                class="header-cell"
                :class="{ 'col-hover-header': hoveredDate === d }"
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
              :class="{ 'row-hover': hoveredProductId === product.product_id }"
            >
              <td class="sticky-col product-cell">
                <div style="font-weight: 600; color: var(--text-primary);">{{ product.product_name }}</div>
              </td>
              <td data-testid="loose-cell" class="sticky-col-loose loose-cell">
                <span :class="(product.loose_bottles ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
                  {{ product.loose_bottles ?? 0 }}
                </span>
              </td>
              <td data-testid="bo-cell" class="sticky-col-bo bo-cell">
                <span v-if="(product.back_order ?? 0) > 0" class="text-warning fw-bold">{{ product.back_order }}</span>
                <span v-else class="text-tertiary-medium">—</span>
              </td>
              <td
                v-for="d in dates"
                :key="d"
                class="cell"
                :class="{
                  'cell-hovered': hoveredProductId === product.product_id && hoveredDate === d,
                  'col-hover': hoveredDate === d && hoveredProductId !== product.product_id,
                }"
                :title="cellTooltip(product, d)"
                @mouseenter="onCellEnter(product, d, $event)"
                @mouseleave="onCellLeave"
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
              <td class="sticky-col-bo bo-cell"></td>
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

    <!-- Dwell popover (renders after 3s of hover on a data cell) -->
    <div
      v-if="popover"
      data-testid="cell-popover"
      class="cell-popover"
      :style="{ top: popover.y + 'px', left: popover.x + 'px' }"
    >
      <div class="popover-title">{{ popover.product.product_name }}</div>
      <div class="popover-sub">{{ formatShortDate(popover.date) }}</div>
      <div class="popover-body">
        <div class="popover-row">
          <span>In</span>
          <span :style="popover.delta.in > 0 ? 'color: var(--status-success); font-weight: 700;' : ''">
            {{ popover.delta.in }}
          </span>
        </div>
        <div class="popover-row">
          <span>Out</span>
          <span :style="popover.delta.out > 0 ? 'color: var(--status-error); font-weight: 700;' : ''">
            {{ popover.delta.out }}
          </span>
        </div>
        <div class="popover-row" v-if="popover.delta.adjustment !== 0">
          <span>Adjustment</span>
          <span style="color: var(--status-warning); font-weight: 700;">
            {{ popover.delta.adjustment > 0 ? '+' : '' }}{{ popover.delta.adjustment }}
          </span>
        </div>
        <div class="popover-row popover-balance">
          <span>Balance</span>
          <span style="font-weight: 700;">{{ popover.balance }}</span>
        </div>
      </div>
      <div class="popover-footer">
        Loose {{ popover.product.loose_bottles ?? 0 }} · BO {{ popover.product.back_order ?? 0 }} · Case {{ popover.product.case_size ?? '—' }}
      </div>
    </div>

  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useStockMovements } from '@/composables/api/useStockMovements.js'
import { useProducts } from '@/composables/api/useProducts.js'
import { sortByVariant } from '@/data/mockData.js'

const DWELL_MS = 3000

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

    // Hover + dwell popover state
    const hoveredProductId = ref(null)
    const hoveredDate = ref(null)
    const popover = ref(null) // { product, date, delta, balance, x, y } | null
    let dwellTimer = null

    const clearDwell = () => {
      if (dwellTimer) {
        clearTimeout(dwellTimer)
        dwellTimer = null
      }
    }

    const onCellEnter = (product, date, event) => {
      hoveredProductId.value = product.product_id
      hoveredDate.value = date
      clearDwell()
      popover.value = null
      const target = event?.currentTarget
      dwellTimer = setTimeout(() => {
        const rect = target?.getBoundingClientRect?.()
        popover.value = {
          product,
          date,
          delta: cellDelta(product, date),
          balance: cellBalance(product, date),
          x: rect ? rect.right + 8 : 0,
          y: rect ? rect.top : 0,
        }
      }, DWELL_MS)
    }

    const onCellLeave = () => {
      hoveredProductId.value = null
      hoveredDate.value = null
      clearDwell()
      popover.value = null
    }

    onMounted(() => {
      initializeProducts()
      fetchMovements({ dateFrom: dateFrom.value, dateTo: dateTo.value })
    })

    onBeforeUnmount(() => {
      clearDwell()
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
      hoveredProductId,
      hoveredDate,
      popover,
      onCellEnter,
      onCellLeave,
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
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.6rem 0.6rem;
  border-bottom: 2px solid var(--border-primary);
  text-align: center;
  white-space: nowrap;
}

/* Sticky column HEADER cells need the header background too — otherwise
   the more-specific .sticky-col* rules would pin them white. */
thead .sticky-col,
thead .sticky-col-loose,
thead .sticky-col-bo {
  background: var(--surface-secondary);
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

/* Second sticky column (Loose) — pinned right after the 220px Product column. */
.sticky-col-loose {
  position: sticky;
  left: 220px;
  z-index: 2;
  background: var(--surface-primary);
}

/* Third sticky column (BO) — pinned right after Loose (264 = 220 + 44).
   Owns the right-edge shadow so it visually terminates the sticky region. */
.sticky-col-bo {
  position: sticky;
  left: 264px;
  z-index: 2;
  background: var(--surface-primary);
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04);
}

.loose-header,
.bo-header {
  text-align: center;
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  padding-left: 0.35rem;
  padding-right: 0.35rem;
}

.loose-cell,
.bo-cell {
  text-align: center;
  padding: 0.55rem 0.35rem;
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-primary);
}

.product-cell {
  padding: 0.55rem 0.3rem 0.55rem 0.75rem;
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
  padding: 0.75rem 0.75rem;
  border-top: 2px solid var(--border-primary);
  font-size: 0.9rem;
}

.footer-cell {
  border-top: 2px solid var(--border-primary);
  padding: 0.6rem 0.4rem;
}

.footer-in {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--status-success);
  line-height: 1.2;
}

.footer-out {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--status-error);
  line-height: 1.2;
}

/* Hover highlights */
.matrix-table tbody tr.row-hover td {
  background: var(--state-hover);
}
.matrix-table tbody tr.row-hover td.sticky-col,
.matrix-table tbody tr.row-hover td.sticky-col-loose,
.matrix-table tbody tr.row-hover td.sticky-col-bo {
  /* Sticky cells need an opaque overlay because their base bg is white
     and state-hover is a semi-transparent purple — layer both. */
  background:
    linear-gradient(var(--state-hover), var(--state-hover)),
    var(--surface-primary);
}
.matrix-table td.cell.col-hover,
.matrix-table td.cell.cell-hovered {
  background: var(--state-hover);
}
.matrix-table td.cell.cell-hovered {
  outline: 2px solid var(--text-accent, var(--status-success));
  outline-offset: -2px;
  position: relative;
  z-index: 1;
}
.matrix-table th.col-hover-header {
  background: var(--state-active);
  color: var(--text-primary);
}

/* Dwell popover */
.cell-popover {
  position: fixed;
  z-index: 20;
  background: var(--surface-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 0.75rem 0.9rem;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
  min-width: 220px;
  max-width: 280px;
  font-size: 0.85rem;
  color: var(--text-primary);
  pointer-events: none;
}
.popover-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  margin-bottom: 0.15rem;
}
.popover-sub {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-bottom: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border-primary);
}
.popover-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.popover-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}
.popover-row.popover-balance {
  margin-top: 0.35rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--border-primary);
}
.popover-footer {
  margin-top: 0.55rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--border-primary);
  font-size: 0.72rem;
  color: var(--text-tertiary);
}
</style>
