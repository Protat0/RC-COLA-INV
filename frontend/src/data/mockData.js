// Prototype mock data — RC Cola distribution inventory

// Canonical variant display order. Sort helpers below rank pack_size by this list.
export const PACK_SIZE_ORDER = ['Mega', '240mL', 'Litro', '1.5L', 'Qute 237mL', '237mL']

const packSizeRank = (size) => {
  const i = PACK_SIZE_ORDER.indexOf(size)
  return i === -1 ? PACK_SIZE_ORDER.length : i
}

// Sort products by pack_size (canonical order), then flavor (A–Z).
export const sortByVariant = (a, b) => {
  const p = packSizeRank(a.pack_size) - packSizeRank(b.pack_size)
  if (p !== 0) return p
  return (a.flavor || '').localeCompare(b.flavor || '')
}

// Sort pack size strings themselves by canonical order.
export const sortPackSizes = (sizes) =>
  [...sizes].sort((a, b) => packSizeRank(a) - packSizeRank(b))

export const MOCK_PRODUCTS = [
  // Mega
  { product_id: 'prod_rc_mega',    product_name: 'Mega RC Cola',       SKU: 'RC-MEGA',    flavor: 'RC Cola', pack_size: 'Mega',        status: 'active',   total_stock: 144, low_stock_threshold: 20, price: 55,  cost_price: 42, back_order: 0, loose_bottles: 8, case_size: 12 },
  { product_id: 'prod_lm_mega',    product_name: 'Mega Lemon',         SKU: 'LM-MEGA',    flavor: 'Lemon',   pack_size: 'Mega',        status: 'active',   total_stock: 59,  low_stock_threshold: 15, price: 55,  cost_price: 42, back_order: 0, loose_bottles: 8, case_size: 12 },
  { product_id: 'prod_or_mega',    product_name: 'Mega Orange',        SKU: 'OR-MEGA',    flavor: 'Orange',  pack_size: 'Mega',        status: 'active',   total_stock: 44,  low_stock_threshold: 15, price: 55,  cost_price: 42, back_order: 0, loose_bottles: 8, case_size: 12 },
  // 240mL
  { product_id: 'prod_rc_240',     product_name: '240mL RC Cola',      SKU: 'RC-240',     flavor: 'RC Cola', pack_size: '240mL',       status: 'active',   total_stock: 3,   low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, loose_bottles: 0, case_size: 24 },
  { product_id: 'prod_lm_240',     product_name: '240mL Lemon',        SKU: 'LM-240',     flavor: 'Lemon',   pack_size: '240mL',       status: 'active',   total_stock: 70,  low_stock_threshold: 20, price: 28,  cost_price: 22, back_order: 1, loose_bottles: 0, case_size: 24 },
  { product_id: 'prod_or_240',     product_name: '240mL Orange',       SKU: 'OR-240',     flavor: 'Orange',  pack_size: '240mL',       status: 'active',   total_stock: 13,  low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, loose_bottles: 0, case_size: 24 },
  { product_id: 'prod_se_240',     product_name: '240mL Seetrus',      SKU: 'SE-240',     flavor: 'Seetrus', pack_size: '240mL',       status: 'active',   total_stock: 0,   low_stock_threshold: 10, price: 28,  cost_price: 22, back_order: 0, loose_bottles: 0, case_size: 24 },
  // Litro (case of 6, per assortment pack size)
  { product_id: 'prod_rc_litro',   product_name: 'Litro RC Cola',      SKU: 'RC-LITRO',   flavor: 'RC Cola', pack_size: 'Litro',       status: 'active',   total_stock: 0,   low_stock_threshold: 5,  price: 65,  cost_price: 50, back_order: 0, loose_bottles: 0, case_size: 6 },
  { product_id: 'prod_lm_litro',   product_name: 'Litro Lemon',        SKU: 'LM-LITRO',   flavor: 'Lemon',   pack_size: 'Litro',       status: 'active',   total_stock: 31,  low_stock_threshold: 10, price: 65,  cost_price: 50, back_order: 0, loose_bottles: 0, case_size: 6 },
  { product_id: 'prod_or_litro',   product_name: 'Litro Orange',       SKU: 'OR-LITRO',   flavor: 'Orange',  pack_size: 'Litro',       status: 'active',   total_stock: 31,  low_stock_threshold: 10, price: 65,  cost_price: 50, back_order: 1, loose_bottles: 0, case_size: 6 },
  // 1.5L (case of 6; active for asrt_15l assortment)
  { product_id: 'prod_rc_15l',     product_name: '1.5L RC Cola',       SKU: 'RC-15L',     flavor: 'RC Cola', pack_size: '1.5L',        status: 'active',   total_stock: 12,  low_stock_threshold: 6,  price: 90,  cost_price: 70, back_order: 0, loose_bottles: 0, case_size: 6 },
  { product_id: 'prod_lm_15l',     product_name: '1.5L Lemon',         SKU: 'LM-15L',     flavor: 'Lemon',   pack_size: '1.5L',        status: 'active',   total_stock: 12,  low_stock_threshold: 6,  price: 90,  cost_price: 70, back_order: 0, loose_bottles: 0, case_size: 6 },
  { product_id: 'prod_or_15l',     product_name: '1.5L Orange',        SKU: 'OR-15L',     flavor: 'Orange',  pack_size: '1.5L',        status: 'active',   total_stock: 12,  low_stock_threshold: 6,  price: 90,  cost_price: 70, back_order: 0, loose_bottles: 0, case_size: 6 },
  // Qute 237mL (case of 12, per assortment pack size)
  { product_id: 'prod_rc_qute',    product_name: 'Qute 237mL RC Cola', SKU: 'RC-QUTE',    flavor: 'RC Cola', pack_size: 'Qute 237mL',  status: 'active',   total_stock: 163, low_stock_threshold: 30, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_lm_qute',    product_name: 'Qute 237mL Lemon',   SKU: 'LM-QUTE',    flavor: 'Lemon',   pack_size: 'Qute 237mL',  status: 'active',   total_stock: 40,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_or_qute',    product_name: 'Qute 237mL Orange',  SKU: 'OR-QUTE',    flavor: 'Orange',  pack_size: 'Qute 237mL',  status: 'active',   total_stock: 35,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_se_qute',    product_name: 'Qute 237mL Seetrus', SKU: 'SE-QUTE',    flavor: 'Seetrus', pack_size: 'Qute 237mL',  status: 'active',   total_stock: 15,  low_stock_threshold: 10, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  // 237mL (case of 12, same physical bottle as EJ assortment pack size)
  { product_id: 'prod_lm_237',     product_name: '237mL Lemon',        SKU: 'LM-237',     flavor: 'Lemon',   pack_size: '237mL',       status: 'active',   total_stock: 41,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_or_237',     product_name: '237mL Orange',       SKU: 'OR-237',     flavor: 'Orange',  pack_size: '237mL',       status: 'active',   total_stock: 49,  low_stock_threshold: 15, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_se_237',     product_name: '237mL Seetrus',      SKU: 'SE-237',     flavor: 'Seetrus', pack_size: '237mL',       status: 'active',   total_stock: 20,  low_stock_threshold: 10, price: 25,  cost_price: 19, back_order: 0, loose_bottles: 0, case_size: 12 },
  // EJ 237mL (active)
  { product_id: 'prod_ej_fruit',   product_name: '237mL EJ Mixed Fruit',    SKU: 'EJ-FRUIT',   flavor: 'EJ Mixed Fruit',    pack_size: '237mL', status: 'active', total_stock: 24, low_stock_threshold: 8, price: 30, cost_price: 23, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_ej_berries', product_name: '237mL EJ Mixed Berries',  SKU: 'EJ-BERRY',   flavor: 'EJ Mixed Berries',  pack_size: '237mL', status: 'active', total_stock: 24, low_stock_threshold: 8, price: 30, cost_price: 23, back_order: 0, loose_bottles: 0, case_size: 12 },
  { product_id: 'prod_ej_citrus',  product_name: '237mL EJ Japanese Citrus', SKU: 'EJ-CITRUS', flavor: 'EJ Japanese Citrus', pack_size: '237mL', status: 'active', total_stock: 24, low_stock_threshold: 8, price: 30, cost_price: 23, back_order: 0, loose_bottles: 0, case_size: 12 },
]

// Sales by item — used to derive total units sold and profit
export const MOCK_SALES_BY_ITEM = MOCK_PRODUCTS
  .filter(p => p.status === 'active')
  .map(p => ({
    id: p.product_id,
    product_id: p.product_id,
    item_name: p.product_name,
    items_sold: Math.floor(Math.random() * 800 + 200),
    total_sales: 0,  // calculated below
    cost_price: p.cost_price,
  }))
  .map(item => ({
    ...item,
    // revenue at ~25% margin above cost
    total_sales: Math.round(item.items_sold * (MOCK_PRODUCTS.find(p => p.product_id === item.id)?.price || 350)),
  }))

// Monthly data — used for "Top Performing Month" KPI
export const MOCK_MONTHLY_DATA = [
  { period: '2024-08', total_sales: 138000, transaction_count: 38 },
  { period: '2024-09', total_sales: 155000, transaction_count: 43 },
  { period: '2024-10', total_sales: 172000, transaction_count: 49 },
  { period: '2024-11', total_sales: 198000, transaction_count: 55 },
  { period: '2024-12', total_sales: 225000, transaction_count: 62 },
  { period: '2025-01', total_sales: 187000, transaction_count: 52 },
  { period: '2025-02', total_sales: 203000, transaction_count: 58 },
  { period: '2025-03', total_sales: 248000, transaction_count: 71 },
  { period: '2025-04', total_sales: 219000, transaction_count: 63 },
  { period: '2025-05', total_sales: 231000, transaction_count: 67 },
  { period: '2025-06', total_sales: 244000, transaction_count: 70 },
  { period: '2025-07', total_sales: 182000, transaction_count: 51 },
]

// Recent transactions — shown in Dashboard transaction feed
const now = new Date()
const minsAgo = (m) => new Date(now - m * 60 * 1000).toISOString()

export const MOCK_TRANSACTIONS = [
  {
    _id: 'txn_20250707_001',
    transaction_date: minsAgo(8),
    customer_name: 'Bernardo Sari-Sari Store',
    items: [{ product_id: 'prod_rc_mega', qty: 10 }, { product_id: 'prod_lm_240', qty: 5 }],
    payment_method: 'cash',
    total_amount: 690,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_002',
    transaction_date: minsAgo(35),
    customer_name: 'Reyes General Merchandise',
    items: [{ product_id: 'prod_lm_mega', qty: 20 }, { product_id: 'prod_or_240', qty: 8 }],
    payment_method: 'transfer',
    total_amount: 1324,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_003',
    transaction_date: minsAgo(92),
    customer_name: 'Santos Convenience Store',
    items: [{ product_id: 'prod_rc_mega', qty: 15 }, { product_id: 'prod_rc_qute', qty: 10 }],
    payment_method: 'cash',
    total_amount: 1075,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_004',
    transaction_date: minsAgo(180),
    customer_name: 'Cruz Grocery',
    items: [{ product_id: 'prod_or_mega', qty: 12 }, { product_id: 'prod_lm_240', qty: 6 }],
    payment_method: 'check',
    total_amount: 828,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_005',
    transaction_date: minsAgo(340),
    customer_name: 'Garcia Mini Mart',
    items: [{ product_id: 'prod_lm_litro', qty: 8 }, { product_id: 'prod_or_litro', qty: 4 }],
    payment_method: 'cash',
    total_amount: 780,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_006',
    transaction_date: minsAgo(520),
    customer_name: 'Dela Cruz Wholesale',
    items: [{ product_id: 'prod_rc_mega', qty: 50 }, { product_id: 'prod_lm_mega', qty: 30 }, { product_id: 'prod_lm_237', qty: 20 }],
    payment_method: 'transfer',
    total_amount: 4960,
    status: 'completed',
  },
  {
    _id: 'txn_20250707_007',
    transaction_date: minsAgo(750),
    customer_name: 'Mendoza Carenderia',
    items: [{ product_id: 'prod_or_240', qty: 6 }],
    payment_method: 'cash',
    total_amount: 168,
    status: 'pending',
  },
  {
    _id: 'txn_20250707_008',
    transaction_date: minsAgo(1100),
    customer_name: 'Villanueva Restaurant Supply',
    items: [{ product_id: 'prod_rc_mega', qty: 24 }, { product_id: 'prod_or_mega', qty: 12 }, { product_id: 'prod_rc_qute', qty: 12 }],
    payment_method: 'transfer',
    total_amount: 2280,
    status: 'completed',
  },
]

export const MOCK_STOCK_MOVEMENTS = [
  // 2026-07-03: Mega RC Cola — delivery in
  { movement_id: 'mv_20260703_001', product_id: 'prod_rc_mega', date: '2026-07-03', type: 'in',  quantity: 50, note: null, created_at: '2026-07-03T09:30:00.000Z' },
  { movement_id: 'mv_20260703_002', product_id: 'prod_lm_mega', date: '2026-07-03', type: 'in',  quantity: 20, note: null, created_at: '2026-07-03T09:30:00.000Z' },

  // 2026-07-04: dispatches out
  { movement_id: 'mv_20260704_001', product_id: 'prod_rc_mega', date: '2026-07-04', type: 'out', quantity: 12, note: null, created_at: '2026-07-04T17:00:00.000Z' },
  { movement_id: 'mv_20260704_002', product_id: 'prod_lm_240',  date: '2026-07-04', type: 'out', quantity: 5,  note: null, created_at: '2026-07-04T17:00:00.000Z' },

  // 2026-07-05: mixed activity + big customer order
  { movement_id: 'mv_20260705_001', product_id: 'prod_rc_qute', date: '2026-07-05', type: 'in',  quantity: 100, note: null, created_at: '2026-07-05T10:00:00.000Z' },
  { movement_id: 'mv_20260705_002', product_id: 'prod_rc_qute', date: '2026-07-05', type: 'out', quantity: 35,  note: null, created_at: '2026-07-05T17:00:00.000Z' },
  { movement_id: 'mv_20260705_003', product_id: 'prod_rc_mega', date: '2026-07-05', type: 'out', quantity: 8,   note: null, created_at: '2026-07-05T17:00:00.000Z' },

  // 2026-07-06: physical count adjustment on Lemon Litro (found extra 3)
  { movement_id: 'mv_20260706_001', product_id: 'prod_lm_litro', date: '2026-07-06', type: 'adjustment', adjustment_direction: 'increase', quantity: 3, note: 'Physical count — found 3 extra cases', created_at: '2026-07-06T11:00:00.000Z' },
  { movement_id: 'mv_20260706_002', product_id: 'prod_or_240',   date: '2026-07-06', type: 'out',        quantity: 4, note: null, created_at: '2026-07-06T17:00:00.000Z' },

  // 2026-07-07: sales day
  { movement_id: 'mv_20260707_001', product_id: 'prod_rc_qute', date: '2026-07-07', type: 'out', quantity: 12, note: null, created_at: '2026-07-07T17:00:00.000Z' },
  { movement_id: 'mv_20260707_002', product_id: 'prod_lm_237',  date: '2026-07-07', type: 'out', quantity: 6,  note: null, created_at: '2026-07-07T17:00:00.000Z' },
  { movement_id: 'mv_20260707_003', product_id: 'prod_or_237',  date: '2026-07-07', type: 'out', quantity: 4,  note: null, created_at: '2026-07-07T17:00:00.000Z' },

  // 2026-07-08: bulk delivery + oversell
  { movement_id: 'mv_20260708_001', product_id: 'prod_rc_mega', date: '2026-07-08', type: 'in',  quantity: 40, note: null, created_at: '2026-07-08T09:00:00.000Z' },
  { movement_id: 'mv_20260708_002', product_id: 'prod_rc_240',  date: '2026-07-08', type: 'out', quantity: 5,  note: 'Oversold — needs reconciliation', created_at: '2026-07-08T17:00:00.000Z' },
]

export const MOCK_ASSORTMENTS = [
  {
    assortment_id: 'asrt_mega',
    name: 'Mega Assorted',
    price: 275,
    original_price: 280,
    pack_size_label: 'Case of 12',
    items: [
      { product_id: 'prod_rc_mega', bottles: 4 },
      { product_id: 'prod_lm_mega', bottles: 4 },
      { product_id: 'prod_or_mega', bottles: 4 },
    ],
  },
  {
    assortment_id: 'asrt_240',
    name: '240mL Assorted',
    price: 199,
    original_price: 204,
    pack_size_label: 'Case of 24',
    items: [
      { product_id: 'prod_rc_240', bottles: 6 },
      { product_id: 'prod_lm_240', bottles: 6 },
      { product_id: 'prod_or_240', bottles: 6 },
      { product_id: 'prod_se_240', bottles: 6 },
    ],
  },
  {
    assortment_id: 'asrt_litro',
    name: 'Litro Assorted',
    price: 211,
    pack_size_label: 'Pack of 6',
    items: [
      { product_id: 'prod_rc_litro', bottles: 2 },
      { product_id: 'prod_lm_litro', bottles: 2 },
      { product_id: 'prod_or_litro', bottles: 2 },
    ],
  },
  {
    assortment_id: 'asrt_15l',
    name: '1.5L Assorted',
    price: 322,
    pack_size_label: 'Pack of 6',
    items: [
      { product_id: 'prod_rc_15l', bottles: 2 },
      { product_id: 'prod_lm_15l', bottles: 2 },
      { product_id: 'prod_or_15l', bottles: 2 },
    ],
  },
  {
    assortment_id: 'asrt_qute',
    name: 'Qute 237mL Assorted',
    price: 150,
    pack_size_label: 'Pack of 12',
    items: [
      { product_id: 'prod_rc_qute', bottles: 3 },
      { product_id: 'prod_lm_qute', bottles: 3 },
      { product_id: 'prod_or_qute', bottles: 3 },
      { product_id: 'prod_se_qute', bottles: 3 },
    ],
  },
  {
    assortment_id: 'asrt_ej',
    name: 'EJ 237mL Assorted',
    price: 171,
    pack_size_label: 'Pack of 12',
    items: [
      { product_id: 'prod_ej_fruit',   bottles: 4 },
      { product_id: 'prod_ej_berries', bottles: 4 },
      { product_id: 'prod_ej_citrus',  bottles: 4 },
    ],
  },
]
