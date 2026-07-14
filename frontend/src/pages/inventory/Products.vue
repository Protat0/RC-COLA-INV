<template>
  <div class="container-fluid pt-2 pb-4 products-page surface-secondary">
    <!-- Stat Cards -->
    <div class="row mb-3" v-if="!loading">
      <div class="col-6 col-md-3 mb-2">
        <CardTemplate size="xs" border-color="error" border-position="start" title="Low Stock" :value="productStats.lowStock" subtitle="Critical Items" />
      </div>
      <div class="col-6 col-md-3 mb-2">
        <CardTemplate size="xs" border-color="error" border-position="start" title="Out of Stock" :value="productStats.outOfStock" subtitle="Products" />
      </div>
      <div class="col-6 col-md-3 mb-2">
        <CardTemplate size="xs" border-color="warning" border-position="start" title="Loose Bottles" :value="totalLooseBottles" subtitle="Across all products" />
      </div>
      <div class="col-6 col-md-3 mb-2">
        <CardTemplate size="xs" border-color="warning" border-position="start" title="Back Ordered" :value="totalBackOrdered" subtitle="Cases owed to customers" />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !hasProducts" class="text-center py-5">
      <div class="spinner-border text-accent" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-3 text-tertiary-medium">Loading products...</p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="status-error text-center" role="alert">
      <p class="mb-3">{{ error }}</p>
      <button class="btn btn-submit" @click="handleRefresh">Try Again</button>
    </div>

    <!-- Action Bar -->
    <div v-if="!loading || hasProducts" class="action-bar-container mb-3">
      <div class="action-bar-controls surface-card border-theme">
        <div class="action-row">
          <!-- Left Side: Main Actions -->
          <div v-if="selectedProductIds.length === 0" class="d-flex gap-2">
            <div class="dropdown dropdown-container" ref="addDropdown">
              <button
                class="btn btn-add btn-sm btn-with-icon-sm dropdown-toggle"
                type="button"
                @click="toggleAddDropdown"
                :class="{ 'active': showAddDropdown }"
              >
                <Plus :size="14" />
                ADD ITEM
              </button>
              <div class="dropdown-menu add-dropdown-menu" :class="{ 'show': showAddDropdown }">
                <button class="dropdown-item" @click="handleSingleProduct">
                  <div class="d-flex align-items-center gap-3">
                    <Plus :size="16" class="text-accent" />
                    <div>
                      <div class="fw-semibold">Single Product</div>
                      <small class="text-tertiary-medium">Add one product manually</small>
                    </div>
                  </div>
                </button>
                <button class="dropdown-item" @click="handleImport">
                  <div class="d-flex align-items-center gap-3">
                    <FileText :size="16" class="text-accent" />
                    <div>
                      <div class="fw-semibold">Import File</div>
                      <small class="text-tertiary-medium">Upload CSV/Excel (20+ items)</small>
                    </div>
                  </div>
                </button>
              </div>
            </div>
            <button
              class="btn btn-export btn-sm"
              @click="handleExport"
              :disabled="filteredProducts.length === 0 || exportLoading"
            >
              {{ exportLoading ? 'EXPORTING...' : 'EXPORT' }}
            </button>
          </div>

          <!-- Selection Actions -->
          <div v-if="selectedProductIds.length > 0" class="d-flex gap-2">
            <button
              class="btn btn-delete btn-sm btn-with-icon-sm"
              @click="handleDeleteSelected"
              :disabled="bulkDeleteLoading"
            >
              <Trash2 :size="14" />
              {{ bulkDeleteLoading ? 'DELETING...' : `DELETE (${selectedProductIds.length})` }}
            </button>
          </div>

          <!-- Right Side: Search + Filter -->
          <div class="d-flex align-items-center gap-2">
            <button
              class="btn btn-filter btn-sm search-toggle"
              @click="toggleSearchMode"
              :class="{ 'state-active': searchMode }"
            >
              <Search :size="16" />
            </button>
            <template v-if="!searchMode">
              <div class="filter-dropdown">
                <label class="filter-label text-tertiary-medium">Pack size</label>
                <select
                  class="form-select form-select-sm input-theme"
                  v-model="packSizeFilter"
                >
                  <option value="">All sizes</option>
                  <option v-for="size in packSizes" :key="size" :value="size">{{ size }}</option>
                </select>
              </div>
              <div class="filter-dropdown">
                <label class="filter-label text-tertiary-medium">Stock alert</label>
                <select
                  class="form-select form-select-sm input-theme"
                  :value="filters.stock_level"
                  @change="handleStockFilter"
                >
                  <option value="">All items</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>
            </template>
            <div v-if="searchMode" class="search-container">
              <div class="position-relative">
                <input
                  ref="searchInput"
                  :value="filters.search"
                  @input="handleSearchInput"
                  type="text"
                  class="form-control form-control-sm search-input input-theme"
                  placeholder="Search products..."
                />
                <button
                  class="btn btn-sm btn-link position-absolute end-0 top-50 translate-middle-y text-tertiary-medium"
                  @click="handleClearSearch"
                  style="border: none; padding: 0.25rem;"
                >
                  <X :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="table-wrapper">
      <DataTable
        v-if="!loading || hasProducts"
        :total-items="packFilteredProducts.length"
        :current-page="currentPage"
        :items-per-page="itemsPerPage"
        @page-changed="handlePageChange"
      >
        <template #header>
          <tr>
            <th style="width: 40px;">
              <input
                type="checkbox"
                class="form-check-input"
                @change="handleSelectAll"
                :checked="allSelected"
                :indeterminate.prop="someSelected"
              />
            </th>
            <th class="sortable-header" @click="handleSort('name')">
              <span class="header-content">
                Item name
                <span class="sort-icon" :class="getSortIconClass('name')">
                  <span v-if="sortColumn === 'name' && sortDirection === 'asc'">↑</span>
                  <span v-else-if="sortColumn === 'name' && sortDirection === 'desc'">↓</span>
                  <span v-else class="sort-idle">⇅</span>
                </span>
              </span>
            </th>
            <th style="width: 110px;" class="sortable-header" @click="handleSort('stock')">
              <span class="header-content justify-content-end">
                Stock (cases)
                <span class="sort-icon" :class="getSortIconClass('stock')">
                  <span v-if="sortColumn === 'stock' && sortDirection === 'asc'">↑</span>
                  <span v-else-if="sortColumn === 'stock' && sortDirection === 'desc'">↓</span>
                  <span v-else class="sort-idle">⇅</span>
                </span>
              </span>
            </th>
            <th style="width: 90px; text-align: right;">Case size</th>
            <th style="width: 100px; text-align: right;">Loose btls</th>
            <th style="width: 110px; text-align: right;">Back Order</th>
            <th style="width: 130px; text-align: right;" class="sortable-header" @click="handleSort('sellingPrice')">
              <span class="header-content justify-content-end">
                Price
                <span class="sort-icon" :class="getSortIconClass('sellingPrice')">
                  <span v-if="sortColumn === 'sellingPrice' && sortDirection === 'asc'">↑</span>
                  <span v-else-if="sortColumn === 'sellingPrice' && sortDirection === 'desc'">↓</span>
                  <span v-else class="sort-idle">⇅</span>
                </span>
              </span>
            </th>
            <th style="width: 80px; text-align: center;">Margin</th>
            <th style="width: 180px; text-align: center;">Actions</th>
          </tr>
        </template>

        <template #body>
          <tr
            v-for="product in paginatedProducts"
            :key="product.product_id"
            :class="getRowClass(product)"
          >
            <td>
              <input
                type="checkbox"
                class="form-check-input"
                :value="product.product_id"
                :checked="selectedProductIds.includes(product.product_id)"
                @change="handleProductSelect(product.product_id, $event.target.checked)"
              />
            </td>
            <td>
              <div :class="['fw-medium', getProductNameClass(product)]">
                {{ product.product_name }}
              </div>
            </td>
            <td class="text-end">
              <span :class="getStockDisplayClass(product)">
                {{ getProductStock(product) }}
              </span>
            </td>
            <td class="text-end text-secondary">
              {{ product.case_size ?? '—' }}
            </td>
            <td class="text-end">
              <span :class="(product.loose_bottles ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
                {{ product.loose_bottles ?? 0 }}
              </span>
            </td>
            <td class="text-end">
              <span :class="(product.back_order ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'">
                {{ product.back_order ?? 0 }}
              </span>
            </td>
            <td class="text-end fw-medium text-secondary">
              ₱{{ formatPrice(product.selling_price || product.price) }}
            </td>
            <td class="text-center fw-medium">
              <span :class="getMarginClass(getProductCostPrice(product), product.selling_price || product.price)">
                {{ calculateMargin(getProductCostPrice(product), product.selling_price || product.price) }}%
              </span>
            </td>
            <td>
              <div class="d-flex gap-1 justify-content-center">
                <button
                  class="btn btn-outline-secondary btn-icon-only btn-xs action-btn action-btn-edit"
                  @click="editProduct(product)"
                  title="Edit"
                >
                  <Edit :size="12" />
                </button>
                <button
                  class="btn btn-outline-primary btn-icon-only btn-xs action-btn action-btn-view"
                  @click="viewProduct(product)"
                  title="View"
                >
                  <Eye :size="12" />
                </button>
                <button
                  class="btn btn-outline-info btn-icon-only btn-xs action-btn action-btn-stock"
                  @click="restockProduct(product)"
                  title="Update Stock"
                >
                  <Package :size="12" />
                </button>
                <button
                  class="btn btn-outline-danger btn-icon-only btn-xs action-btn action-btn-delete"
                  @click="handleDeleteProduct(product)"
                  title="Delete"
                  :disabled="deleteLoading"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && filteredProducts.length === 0 && !error" class="text-center py-5">
      <div class="card-theme">
        <div class="card-body py-5">
          <Package :size="48" class="text-tertiary-medium mb-3" />
          <p class="text-tertiary-medium mb-3">
            {{ !hasProducts ? 'No products found' : 'No products match the current filters' }}
          </p>
          <button
            v-if="!hasProducts"
            class="btn btn-add btn-with-icon"
            @click="handleSingleProduct"
          >
            <Plus :size="16" />
            Add First Product
          </button>
          <button
            v-else
            class="btn btn-filter btn-with-icon"
            @click="handleClearFilters"
          >
            <RefreshCw :size="16" />
            Clear Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AddProductModal
      ref="addProductModal"
      @success="handleProductSuccess"
    />

    <StockUpdateModal
      ref="stockUpdateModal"
      @success="handleStockUpdateSuccess"
    />

    <ViewProductModal
      ref="viewProductModal"
      @edit="editProduct"
      @restock="restockProduct"
      @toggle-status="toggleProductStatus"
      @generate-barcode="generateProductBarcode"
    />

    <ImportModal
      ref="importModal"
      @import-completed="handleImportSuccess"
      @import-failed="handleImportError"
    />

    <DeleteConfirmationModal
      ref="deleteConfirmationModal"
      :is-loading="deleteLoading || bulkDeleteLoading"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useProducts } from '@/composables/api/useProducts'
import { sortByVariant, sortPackSizes } from '@/data/mockData.js'
import AddProductModal from '@/components/products/AddProductModal.vue'
import StockUpdateModal from '@/components/products/StockUpdateModal.vue'
import ViewProductModal from '@/components/products/ViewProductModal.vue'
import CardTemplate from '@/components/common/CardTemplate.vue'
import DataTable from '@/components/common/TableTemplate.vue'
import ImportModal from '@/components/products/ImportModal.vue'
import DeleteConfirmationModal from '@/components/common/DeleteConfirmationModal.vue'

export default {
  name: 'Products',
  components: {
    AddProductModal,
    StockUpdateModal,
    ViewProductModal,
    ImportModal,
    CardTemplate,
    DataTable,
    DeleteConfirmationModal
  },

  setup() {
    const {
      products,
      filteredProducts,
      productStats,
      hasProducts,
      filters,
      error,
      loading,
      deleteLoading,
      bulkDeleteLoading,
      exportLoading,
      fetchProducts,
      deleteProduct,
      bulkDeleteProducts,
      updateProduct,
      exportProducts,
      setFilters,
      resetFilters,
      initializeProducts,
      clearError
    } = useProducts()

    resetFilters()
    products.value = []
    loading.value = true

    const searchMode = ref(false)
    const showAddDropdown = ref(false)
    const selectedProductIds = ref([])
    const deleteConfirmationModal = ref(null)
    const productToDelete = ref(null)
    const currentPage = ref(1)
    const itemsPerPage = ref(20)
    const expiringCount = ref(0)
    const addDropdown = ref(null)
    const searchInput = ref(null)

    const totalBackOrdered = computed(() =>
      products.value.reduce((sum, p) => sum + (p.back_order || 0), 0)
    )

    const totalLooseBottles = computed(() =>
      products.value.reduce((sum, p) => sum + (p.loose_bottles || 0), 0)
    )

    const packSizeFilter = ref('')
    const packSizes = computed(() => {
      const set = new Set()
      products.value.forEach(p => { if (p.pack_size) set.add(p.pack_size) })
      return sortPackSizes(set)
    })

    const sortColumn = ref('name')
    const sortDirection = ref('asc')

    const packFilteredProducts = computed(() =>
      packSizeFilter.value
        ? filteredProducts.value.filter(p => p.pack_size === packSizeFilter.value)
        : filteredProducts.value
    )

    const sortedFilteredProducts = computed(() => {
      if (!sortColumn.value || !sortDirection.value) return packFilteredProducts.value

      const col = sortColumn.value
      const dir = sortDirection.value

      return [...packFilteredProducts.value].sort((a, b) => {
        if (col === 'name') {
          const cmp = sortByVariant(a, b)
          return dir === 'asc' ? cmp : -cmp
        }

        let aVal, bVal

        if (col === 'sku') {
          aVal = (a.SKU || '').toLowerCase()
          bVal = (b.SKU || '').toLowerCase()
        } else if (col === 'sellingPrice') {
          aVal = parseFloat(a.selling_price || a.price || 0)
          bVal = parseFloat(b.selling_price || b.price || 0)
        } else if (col === 'costPrice') {
          aVal = parseFloat(getProductCostPrice(a) || 0)
          bVal = parseFloat(getProductCostPrice(b) || 0)
        } else if (col === 'stock') {
          aVal = getProductStock(a) || 0
          bVal = getProductStock(b) || 0
        } else if (col === 'status') {
          aVal = (a.status || '').toLowerCase()
          bVal = (b.status || '').toLowerCase()
        } else {
          return 0
        }

        if (aVal < bVal) return dir === 'asc' ? -1 : 1
        if (aVal > bVal) return dir === 'asc' ? 1 : -1
        return 0
      })
    })

    const paginatedProducts = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage.value
      return sortedFilteredProducts.value.slice(start, start + itemsPerPage.value)
    })

    const allSelected = computed(() =>
      paginatedProducts.value.length > 0 &&
      paginatedProducts.value.every(p => selectedProductIds.value.includes(p.product_id))
    )

    const someSelected = computed(() =>
      selectedProductIds.value.length > 0 && !allSelected.value
    )

    const selectedProducts = computed(() =>
      products.value.filter(p => selectedProductIds.value.includes(p.product_id))
    )

    const calculateExpiringCount = () => {
      const now = new Date()
      const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000))
      expiringCount.value = products.value.filter(product => {
        const expiryDate = product.oldest_batch_expiry ?? product.expiry_date
        if (!expiryDate) return false
        const expiry = new Date(expiryDate)
        return expiry <= thirtyDaysFromNow && expiry >= now
      }).length
    }

    const getProductStock = (product) => product.total_stock ?? product.stock ?? 0
    const getProductCostPrice = (product) => product.average_cost_price ?? product.cost_price ?? 0

    const handleRefresh = async () => {
      clearError()
      await fetchProducts()
      calculateExpiringCount()
    }

    const handleCategoryFilter = (event) => {
      setFilters({ category_id: event.target.value })
      currentPage.value = 1
    }

    const handleStockFilter = (event) => {
      setFilters({ stock_level: event.target.value })
      currentPage.value = 1
    }

    const handleSearchInput = (event) => {
      setFilters({ search: event.target.value })
      currentPage.value = 1
    }

    const handleClearSearch = () => {
      setFilters({ search: '' })
      searchMode.value = false
    }

    const handleClearFilters = () => {
      resetFilters()
      searchMode.value = false
      currentPage.value = 1
    }

    const handleSelectAll = (event) => {
      if (event.target.checked) {
        selectedProductIds.value = [...new Set([
          ...selectedProductIds.value,
          ...paginatedProducts.value.map(p => p.product_id)
        ])]
      } else {
        const currentPageIds = paginatedProducts.value.map(p => p.product_id)
        selectedProductIds.value = selectedProductIds.value.filter(id => !currentPageIds.includes(id))
      }
    }

    const handleProductSelect = (productId, checked) => {
      if (checked) {
        selectedProductIds.value.push(productId)
      } else {
        selectedProductIds.value = selectedProductIds.value.filter(id => id !== productId)
      }
    }

    const handleDeleteProduct = (product) => {
      productToDelete.value = product
      deleteConfirmationModal.value?.openModal({
        title: 'Delete Product',
        message: `Are you sure you want to delete <strong>${product.product_name}</strong>? This action cannot be undone.`,
        confirmText: 'Delete',
        confirmClass: 'btn-delete'
      })
    }

    const handleConfirmDelete = async () => {
      try {
        if (productToDelete.value) {
          await deleteProduct(productToDelete.value.product_id)
          productToDelete.value = null
        } else {
          await bulkDeleteProducts(selectedProductIds.value)
          selectedProductIds.value = []
        }
        deleteConfirmationModal.value?.closeModal()
      } catch (error) {
        console.error('Failed to delete:', error)
      }
    }

    const handleDeleteSelected = () => {
      const count = selectedProductIds.value.length
      deleteConfirmationModal.value?.openModal({
        title: `Delete ${count} Product${count === 1 ? '' : 's'}`,
        message: `Are you sure you want to delete <strong>${count} product${count === 1 ? '' : 's'}</strong>? This action cannot be undone.`,
        confirmText: `Delete ${count}`,
        confirmClass: 'btn-delete'
      })
    }

    const handleExport = async () => {
      try {
        await exportProducts(filters.value)
      } catch (error) {
        console.error('Export failed:', error)
      }
    }

    const handlePageChange = (page) => {
      currentPage.value = page
    }

    const toggleSearchMode = async () => {
      searchMode.value = !searchMode.value
      if (searchMode.value) {
        await nextTick()
        searchInput.value?.focus()
      }
    }

    const toggleAddDropdown = () => { showAddDropdown.value = !showAddDropdown.value }
    const closeAddDropdown = () => { showAddDropdown.value = false }

    const getRowClass = (product) => {
      const stock = getProductStock(product)
      if (stock === 0) return 'table-danger'
      if (stock <= (product.low_stock_threshold || 15)) return 'table-warning'
      return ''
    }

    const getProductNameClass = (product) =>
      product.status === 'inactive' ? 'text-tertiary-medium' : 'text-primary'

    const getStockDisplayClass = (product) => {
      const stock = getProductStock(product)
      if (stock === 0) return 'text-error fw-bold'
      if (stock <= (product.low_stock_threshold || 15)) return 'text-warning fw-bold'
      return 'text-success'
    }

    const getStatusBadgeClass = (status) =>
      status === 'active' ? 'badge bg-success text-white' : 'badge bg-secondary text-white'

    const getStatusText = (status) => status === 'active' ? 'Active' : 'Inactive'

    const calculateMargin = (cost, selling) => {
      if (!cost || !selling || cost >= selling) return 0
      return Math.round(((selling - cost) / selling) * 100)
    }

    const getMarginClass = (cost, selling) => {
      const margin = calculateMargin(cost, selling)
      if (margin >= 40) return 'text-success'
      if (margin >= 20) return 'text-warning'
      return 'text-error'
    }

    const formatPrice = (price) => parseFloat(price || 0).toFixed(2)

    const toggleProductStatus = async (product) => {
      try {
        const newStatus = product.status === 'active' ? 'inactive' : 'active'
        await updateProduct(product.product_id, { status: newStatus })
      } catch (error) {
        console.error('Error toggling product status:', error)
      }
    }

    const generateProductBarcode = async (product) => {
      try {
        const timestamp = Date.now().toString()
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
        await updateProduct(product.product_id, { barcode: `${timestamp}${random}` })
      } catch (error) {
        console.error('Error generating barcode:', error)
      }
    }

    const handleSort = (column) => {
      if (sortColumn.value === column) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
      } else {
        sortColumn.value = column
        sortDirection.value = 'asc'
      }
      currentPage.value = 1
    }

    const getSortIconClass = (column) => {
      if (sortColumn.value !== column) return 'sort-icon--idle'
      return sortDirection.value === 'asc' ? 'sort-icon--asc' : 'sort-icon--desc'
    }

    const handleClickOutside = (event) => {
      if (addDropdown.value && !addDropdown.value.contains(event.target)) {
        showAddDropdown.value = false
      }
    }

    onMounted(async () => {
      document.addEventListener('click', handleClickOutside)
      await initializeProducts()
      calculateExpiringCount()
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      products,
      filteredProducts,
      productStats,
      hasProducts,
      filters,
      error,
      loading,
      deleteLoading,
      bulkDeleteLoading,
      exportLoading,

      searchMode,
      showAddDropdown,
      selectedProductIds,
      selectedProducts,
      currentPage,
      itemsPerPage,
      expiringCount,
      addDropdown,
      searchInput,
      sortColumn,
      sortDirection,

      totalBackOrdered,
      totalLooseBottles,
      packSizeFilter,
      packSizes,
      packFilteredProducts,

      paginatedProducts,
      allSelected,
      someSelected,

      getProductStock,
      getProductCostPrice,

      handleRefresh,
      handleCategoryFilter,
      handleStockFilter,
      handleSearchInput,
      handleClearSearch,
      handleClearFilters,
      handleSelectAll,
      handleProductSelect,
      handleDeleteProduct,
      handleConfirmDelete,
      handleDeleteSelected,
      deleteConfirmationModal,
      handleExport,
      handlePageChange,
      toggleSearchMode,
      toggleAddDropdown,
      closeAddDropdown,
      handleSort,
      getSortIconClass,

      getRowClass,
      getProductNameClass,
      getStockDisplayClass,
      getStatusBadgeClass,
      getStatusText,
      getMarginClass,
      calculateMargin,
      formatPrice,
      toggleProductStatus,
      generateProductBarcode
    }
  },

  methods: {
    showAddProductModal() {
      this.$refs.addProductModal?.openAdd?.()
    },

    editProduct(product) {
      const enrichedProduct = { ...product, category_id: product.category_id || '' }
      this.$refs.viewProductModal?.close?.()
      this.$refs.addProductModal?.openEdit?.(enrichedProduct)
    },

    viewProduct(product) {
      if (!product || !product.product_id) {
        console.error('Cannot view product: missing ID')
        return
      }
      try {
        this.$router.push(`/products/${product.product_id}`)
      } catch (error) {
        console.error('Navigation error:', error)
      }
    },

    restockProduct(product) {
      this.$refs.stockUpdateModal?.openStock?.(product)
    },

    handleSingleProduct(event) {
      event?.stopPropagation()
      this.showAddProductModal()
      this.closeAddDropdown()
    },

    handleBulkAdd(event) {
      event?.stopPropagation()
      this.closeAddDropdown()
    },

    handleImport(event) {
      event?.stopPropagation()
      const importModalElement = document.getElementById('importModal')
      if (importModalElement) {
        try {
          const modal = new bootstrap.Modal(importModalElement)
          modal.show()
        } catch (error) {
          console.error('Error showing modal:', error)
        }
      }
      this.closeAddDropdown()
    },

    handleProductSuccess() {
      this.handleRefresh()
    },

    handleStockUpdateSuccess() {},

    handleImportSuccess() {},

    handleImportError(error) {
      console.error(`Import failed: ${error.message || 'An unexpected error occurred'}`)
    }
  }
}
</script>

<style scoped>
.products-page {
  min-height: 100vh;
}

.action-bar-container {
  position: relative;
  z-index: 100;
}

.action-bar-controls {
  border-radius: 0.75rem;
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.dropdown-container {
  position: relative;
  z-index: 1050;
}

.add-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1055;
  min-width: 280px;
  margin-top: 0.25rem;
  background-color: var(--surface-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 0.75rem;
  box-shadow: var(--shadow-xl);
  animation: dropdownSlide 0.2s ease;
  transform: translateZ(0);
}

.add-dropdown-menu.show {
  display: block;
}

@keyframes dropdownSlide {
  from { opacity: 0; transform: translateY(-10px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.dropdown-item {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-primary);
  background: transparent;
  border-left: none;
  border-right: none;
  border-top: none;
  transition: background-color 0.2s ease;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.dropdown-item:last-child { border-bottom: none; }
.dropdown-item:hover { background-color: var(--state-hover); }

.filter-dropdown { min-width: 120px; }

.filter-label {
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  display: block;
}

.search-container { min-width: 300px; }

.search-input {
  padding-right: 2.5rem;
  height: calc(1.5em + 0.75rem + 2px);
}

.search-toggle {
  height: calc(1.5em + 0.75rem + 2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.75rem;
  margin-top: 5px;
}

.state-active {
  background-color: var(--state-selected) !important;
  color: var(--text-accent) !important;
}

/* Data table wrapper */
.table-wrapper {
  position: relative;
  z-index: 1;
}

.table-wrapper :deep(.table-container) {
  position: relative;
  z-index: 1;
}

/* Sortable column headers */
.sortable-header {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.sortable-header:hover {
  background-color: var(--state-hover);
}

.header-content {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.sort-icon {
  font-size: 0.75rem;
  line-height: 1;
  transition: color 0.15s ease;
}

.sort-icon--idle .sort-idle {
  opacity: 0.3;
}

.sort-icon--asc,
.sort-icon--desc {
  color: var(--text-accent, #0d6efd);
}

@media (max-width: 768px) {
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-container { min-width: 100%; }

  .add-dropdown-menu {
    min-width: 250px;
    right: 0;
    left: auto;
  }

  .dropdown-item { padding: 0.875rem 1rem; }
}
</style>
