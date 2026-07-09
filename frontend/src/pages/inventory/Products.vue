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
        <CardTemplate size="xs" border-color="success" border-position="start" title="Total" :value="productStats.total" subtitle="Products" />
      </div>
      <div class="col-6 col-md-3 mb-2">
        <CardTemplate size="xs" border-color="warning" border-position="start" title="Loose Bottles" :value="totalLooseBottles" subtitle="Total across products" />
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

    <!-- Grid Control Bar: select-all + count + sort -->
    <div
      v-if="(!loading || hasProducts) && filteredProducts.length > 0"
      class="grid-control-bar mb-2"
    >
      <div class="d-flex align-items-center gap-2">
        <input
          type="checkbox"
          class="form-check-input"
          @change="handleSelectAll"
          :checked="allSelected"
          :indeterminate.prop="someSelected"
          title="Select all on this page"
          style="cursor: pointer;"
        />
        <span class="text-tertiary-medium" style="font-size: 0.8rem;">
          {{ filteredProducts.length }} product{{ filteredProducts.length !== 1 ? 's' : '' }}<span v-if="selectedProductIds.length > 0"> · {{ selectedProductIds.length }} selected</span>
        </span>
      </div>
      <div class="d-flex align-items-center gap-2">
        <label class="text-tertiary-medium mb-0" style="font-size: 0.75rem; white-space: nowrap;">Sort</label>
        <select
          class="form-select form-select-sm input-theme"
          style="width: auto;"
          :value="currentSortKey"
          @change="handleSortChange"
        >
          <option value="name-asc">Name (A–Z)</option>
          <option value="name-desc">Name (Z–A)</option>
          <option value="stock-desc">Stock (High–Low)</option>
          <option value="stock-asc">Stock (Low–High)</option>
          <option value="sellingPrice-asc">Price (Low–High)</option>
          <option value="sellingPrice-desc">Price (High–Low)</option>
        </select>
      </div>
    </div>

    <!-- Product Card Grid -->
    <div v-if="!loading || hasProducts" class="product-cards-grid">
      <div
        v-for="product in paginatedProducts"
        :key="product.product_id"
        class="product-card surface-card"
        :class="getCardClass(product)"
      >
        <!-- Top row: checkbox -->
        <div class="pc-top">
          <input
            type="checkbox"
            class="form-check-input"
            :value="product.product_id"
            :checked="selectedProductIds.includes(product.product_id)"
            @change="handleProductSelect(product.product_id, $event.target.checked)"
            style="cursor: pointer;"
          />
        </div>

        <!-- Product name -->
        <div class="pc-name" :class="getProductNameClass(product)">
          {{ product.product_name }}
        </div>

        <!-- Stock + Case size -->
        <div class="pc-stock-row">
          <div class="pc-stock-item">
            <span class="pc-stock-value" :class="getStockDisplayClass(product)">
              {{ getProductStock(product) }}
            </span>
            <span class="pc-stock-label">cases</span>
          </div>
          <div class="pc-stock-divider"></div>
          <div class="pc-stock-item">
            <span class="pc-stock-value" style="color: var(--text-secondary);">
              {{ product.case_size ?? '—' }}
            </span>
            <span class="pc-stock-label">per case</span>
          </div>
        </div>

        <!-- Loose bottles -->
        <div class="pc-loose-row">
          <span class="pc-loose-label">Loose bottles</span>
          <span
            class="pc-loose-count"
            :class="(looseBottles[product.product_id] ?? 0) > 0 ? 'text-warning fw-bold' : 'text-tertiary-medium'"
          >{{ looseBottles[product.product_id] ?? 0 }}</span>
        </div>

        <!-- Pricing row -->
        <div class="pc-price-row">
          <span class="pc-price">₱{{ formatPrice(product.selling_price || product.price) }}</span>
          <span
            class="pc-margin"
            :class="getMarginClass(getProductCostPrice(product), product.selling_price || product.price)"
          >
            {{ calculateMargin(getProductCostPrice(product), product.selling_price || product.price) }}%
          </span>
        </div>

        <!-- Action buttons -->
        <div class="pc-actions">
          <button class="btn btn-filter btn-sm pc-action-btn" @click="viewProduct(product)">View</button>
          <button class="btn btn-add btn-sm pc-action-btn" @click="restockProduct(product)">Update Stock</button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div
      v-if="(!loading || hasProducts) && totalPages > 1"
      class="product-grid-pagination mt-3 d-flex justify-content-between align-items-center"
    >
      <span class="text-tertiary-medium" style="font-size: 0.8rem;">{{ paginationInfo }}</span>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-filter" @click="handlePageChange(1)" :disabled="currentPage === 1">«</button>
        <button class="btn btn-sm btn-filter" @click="handlePageChange(currentPage - 1)" :disabled="currentPage === 1">‹</button>
        <span class="px-2 d-flex align-items-center" style="font-size: 0.85rem; color: var(--text-secondary);">
          {{ currentPage }} / {{ totalPages }}
        </span>
        <button class="btn btn-sm btn-filter" @click="handlePageChange(currentPage + 1)" :disabled="currentPage >= totalPages">›</button>
        <button class="btn btn-sm btn-filter" @click="handlePageChange(totalPages)" :disabled="currentPage >= totalPages">»</button>
      </div>
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
import AddProductModal from '@/components/products/AddProductModal.vue'
import StockUpdateModal from '@/components/products/StockUpdateModal.vue'
import ViewProductModal from '@/components/products/ViewProductModal.vue'
import CardTemplate from '@/components/common/CardTemplate.vue'
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

    const looseBottles = ref({})

    const initLooseBottles = () => {
      const map = {}
      products.value.forEach(p => {
        map[p.product_id] = p.loose_bottles ?? 0
      })
      looseBottles.value = map
    }

    const totalLooseBottles = computed(() => {
      return Object.values(looseBottles.value).reduce((sum, n) => sum + n, 0)
    })

    const incrementLoose = (productId) => {
      looseBottles.value = { ...looseBottles.value, [productId]: (looseBottles.value[productId] ?? 0) + 1 }
    }

    const decrementLoose = (productId) => {
      const current = looseBottles.value[productId] ?? 0
      if (current > 0) {
        looseBottles.value = { ...looseBottles.value, [productId]: current - 1 }
      }
    }

    const sortColumn = ref('name')
    const sortDirection = ref('asc')

    const currentSortKey = computed(() => `${sortColumn.value}-${sortDirection.value}`)

    const handleSortChange = (event) => {
      const val = event.target.value
      const dashIdx = val.lastIndexOf('-')
      sortColumn.value = val.slice(0, dashIdx)
      sortDirection.value = val.slice(dashIdx + 1)
      currentPage.value = 1
    }

    const sortedFilteredProducts = computed(() => {
      if (!sortColumn.value || !sortDirection.value) return filteredProducts.value

      const col = sortColumn.value
      const dir = sortDirection.value

      return [...filteredProducts.value].sort((a, b) => {
        let aVal, bVal

        if (col === 'name') {
          aVal = (a.product_name || '').toLowerCase()
          bVal = (b.product_name || '').toLowerCase()
        } else if (col === 'sku') {
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

    const totalPages = computed(() =>
      Math.max(1, Math.ceil(filteredProducts.value.length / itemsPerPage.value))
    )

    const paginationInfo = computed(() => {
      const total = filteredProducts.value.length
      if (total === 0) return ''
      const start = (currentPage.value - 1) * itemsPerPage.value + 1
      const end = Math.min(currentPage.value * itemsPerPage.value, total)
      return `${start}–${end} of ${total}`
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

    const getCardClass = (product) => {
      const stock = getProductStock(product)
      if (stock === 0) return 'pc-out-of-stock'
      if (stock <= (product.low_stock_threshold || 15)) return 'pc-low-stock'
      return ''
    }

    const getProductNameClass = (product) =>
      product.status === 'inactive' ? 'text-tertiary-medium' : 'pc-name-active'

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
      initLooseBottles()
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
      currentSortKey,

      looseBottles,
      totalLooseBottles,
      incrementLoose,
      decrementLoose,

      paginatedProducts,
      totalPages,
      paginationInfo,
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
      handleSortChange,

      getCardClass,
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

/* Grid control bar */
.grid-control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
}

/* Product card grid */
.product-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .product-cards-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (min-width: 1200px) {
  .product-cards-grid { grid-template-columns: repeat(4, 1fr); }
}

/* Product card */
.product-card {
  border-radius: 0.75rem;
  border: 1px solid var(--border-primary);
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: box-shadow 0.15s ease;
  position: relative;
  overflow: hidden;
}

.product-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.product-card.pc-low-stock::after {
  content: 'LOW';
  position: absolute;
  top: 13px;
  right: -22px;
  width: 84px;
  background: #f59e0b;
  color: #fff;
  text-align: center;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 0;
  transform: rotate(45deg);
  pointer-events: none;
}

.product-card.pc-out-of-stock::after {
  content: 'OUT';
  position: absolute;
  top: 13px;
  right: -22px;
  width: 84px;
  background: #ef4444;
  color: #fff;
  text-align: center;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 0;
  transform: rotate(45deg);
  pointer-events: none;
}

.product-card.pc-out-of-stock {
  opacity: 0.85;
}

/* Card sections */
.pc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pc-name {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 0.25rem;
  letter-spacing: -0.01em;
  min-height: 3.1rem;
  padding-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pc-name-active {
  color: var(--text-primary);
}

/* Stock row */
.pc-stock-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border-primary);
  border-bottom: 1px solid var(--border-primary);
  margin-top: 0.125rem;
}

.pc-stock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.pc-stock-value {
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
}

.pc-stock-label {
  font-size: 0.62rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.15rem;
}

.pc-stock-divider {
  width: 1px;
  height: 36px;
  background: var(--border-primary);
  flex-shrink: 0;
}

/* Loose bottles */
.pc-loose-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pc-loose-label {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.pc-loose-count {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
}

/* Pricing */
.pc-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pc-price {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pc-margin {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--surface-tertiary);
}

/* Actions */
.pc-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.375rem;
  border-top: 1px solid var(--border-primary);
}

.pc-action-btn {
  flex: 1;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: 0.3rem !important;
}

/* Pagination */
.product-grid-pagination {
  padding: 0.5rem 0;
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

  .grid-control-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .product-cards-grid { grid-template-columns: 1fr; }
}
</style>
