// Prototype mock interceptor — intercepts all axios calls and returns static data.
// To re-enable live API: remove the import in main.js.

import { api } from './api.js'
import {
  MOCK_PRODUCTS,
  MOCK_CATEGORIES,
  MOCK_SALES_BY_ITEM,
  MOCK_MONTHLY_DATA,
  MOCK_TRANSACTIONS,
  MOCK_EOD_HISTORY,
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

function getHandler(url) {
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

  // Categories (list, subcategories, active, etc.)
  if (url.includes('/categories/')) {
    return mockAdapter({ data: MOCK_CATEGORIES })
  }

  // Sales by item — used for Total Units Sold and Total Profit KPIs
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

  // Monthly sales by period — used for Top Performing Month
  if (url.includes('sales-report/by-period/')) {
    return mockAdapter({ data: MOCK_MONTHLY_DATA })
  }

  // Recent sales transactions — Dashboard transaction feed
  if (url.includes('/sales/recent/')) {
    return mockAdapter({ success: true, data: MOCK_TRANSACTIONS })
  }

  // Invoices / sales stats fallback
  if (url.includes('/invoices/') || url.includes('/sales/') || url.includes('sales-display/')) {
    return mockAdapter({ data: [], success: true, total_transactions: 0 })
  }

  // Products stats / low-stock / deleted
  if (url.includes('/products/')) {
    return mockAdapter({ data: [] })
  }

  // Suppliers
  if (url.includes('/suppliers/')) {
    return mockAdapter({ data: [] })
  }

  // EOD Stock History
  if (url.includes('/stock/eod/history/')) {
    return mockAdapter({ success: true, data: MOCK_EOD_HISTORY })
  }

  // Everything else — silent empty success so no error toasts fire
  return mockAdapter({ data: [], success: true })
}

function getPostHandler(config) {
  const url = config.url || ''

  if (url.includes('/stock/eod/')) {
    return (cfg) => {
      const body = JSON.parse(cfg.data || '{}')
      const items = body.items ?? []
      items.forEach(item => {
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
        items: items,
        status: items.some(i => i.needs_reconciliation) ? 'flagged' : 'applied',
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
