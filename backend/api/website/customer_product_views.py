from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from models.Product import Product
import logging

logger = logging.getLogger(__name__)


def _get_all_products():
    """Get all non-deleted products regardless of status."""
    try:
        return list(Product.query("products", filter_condition=(Product.isDeleted == False)))
    except Exception as e:
        logger.error(f"Error fetching all products: {e}", exc_info=True)
        return []


def _get_products_by_category(category_id, subcategory_name=None):
    """Get all non-deleted products for a category, optionally filtered by subcategory."""
    try:
        condition = (Product.isDeleted == False) & (Product.category_id == category_id)
        if subcategory_name:
            condition = condition & (Product.subcategory_name == subcategory_name)
        return list(Product.query("products", filter_condition=condition))
    except Exception as e:
        logger.error(f"Error fetching products for category {category_id}: {e}", exc_info=True)
        return []


def _format_product(product):
    return {
        '_id': product.sk,
        'product_id': product.sk,
        'product_name': product.product_name,
        'category_id': product.category_id,
        'SKU': product.SKU,
        'description': product.description,
        'selling_price': float(product.selling_price) if product.selling_price else 0.0,
        'stock': int(product.total_stock) if product.total_stock else 0,
        'unit': product.unit,
        'is_taxable': product.is_taxable,
        'status': product.status,
        'date_received': product.date_received.isoformat() if product.date_received else None,
        'low_stock_threshold': int(product.low_stock_threshold) if product.low_stock_threshold else 10,
        'image_url': product.image_url,
        'image_filename': product.image_filename,
    }


def _sort_products(products):
    """In-stock first, then alphabetically by name within each group."""
    return sorted(
        products,
        key=lambda p: (0 if (p.total_stock or 0) > 0 else 1, (p.product_name or '').lower())
    )


def _paginate(items, page, limit):
    total = len(items)
    total_pages = max(1, (total + limit - 1) // limit)
    start = (page - 1) * limit
    return items[start:start + limit], {
        'current_page': page,
        'total_pages': total_pages,
        'total_items': total,
        'items_per_page': limit,
        'has_next': page < total_pages,
        'has_previous': page > 1,
    }


@method_decorator(csrf_exempt, name='dispatch')
class CustomerProductListView(APIView):
    def get(self, request):
        try:
            page = int(request.GET.get('page', 1))
            limit = int(request.GET.get('limit', 20))
            category_id = request.GET.get('category_id')
            subcategory_name = request.GET.get('subcategory_name', '').strip() or None
            search = request.GET.get('search')

            if search:
                products = Product.search_by_name(search, limit=500)
            elif category_id:
                products = _get_products_by_category(category_id, subcategory_name)
            else:
                products = _get_all_products()

            page_items, pagination = _paginate(_sort_products(products), page, limit)
            return Response({
                'success': True,
                'data': {
                    'products': [_format_product(p) for p in page_items],
                    'pagination': pagination,
                }
            }, status=status.HTTP_200_OK)

        except (ValueError, TypeError) as e:
            return Response({'success': False, 'message': 'Invalid query parameters'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in CustomerProductListView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerProductDetailView(APIView):
    def get(self, request, product_id):
        try:
            product = Product.get_by_id(product_id)
            if not product or product.isDeleted or product.status not in ('active', 'low_stock'):
                return Response({'success': False, 'message': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'success': True, 'data': {'product': _format_product(product)}}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in CustomerProductDetailView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerProductSearchView(APIView):
    def get(self, request):
        try:
            search_term = request.GET.get('q', '').strip()
            page = int(request.GET.get('page', 1))
            limit = int(request.GET.get('limit', 20))

            if not search_term:
                products = _get_all_products()
            else:
                products = Product.search_by_name(search_term, limit=500)

            page_items, pagination = _paginate(_sort_products(products), page, limit)
            return Response({
                'success': True,
                'data': {
                    'products': [_format_product(p) for p in page_items],
                    'pagination': pagination,
                    'search_term': search_term,
                }
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in CustomerProductSearchView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerProductByCategoryView(APIView):
    def get(self, request, category_id):
        try:
            page = int(request.GET.get('page', 1))
            limit = int(request.GET.get('limit', 20))

            products = _get_products_by_category(category_id)
            page_items, pagination = _paginate(_sort_products(products), page, limit)
            return Response({
                'success': True,
                'data': {
                    'products': [_format_product(p) for p in page_items],
                    'pagination': pagination,
                }
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in CustomerProductByCategoryView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerFeaturedProductsView(APIView):
    def get(self, request):
        try:
            limit = int(request.GET.get('limit', 10))
            products = _get_all_products()[:limit]
            return Response({
                'success': True,
                'data': {'products': [_format_product(p) for p in products]}
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in CustomerFeaturedProductsView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
