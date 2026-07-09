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
