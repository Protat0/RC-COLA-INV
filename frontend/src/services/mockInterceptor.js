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
