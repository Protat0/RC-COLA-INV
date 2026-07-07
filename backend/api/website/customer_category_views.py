from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from models.Categories import Category
from models.Product import Product
import logging

logger = logging.getLogger(__name__)


def _format_category(category):
    return {
        '_id': category.sk,
        'category_id': category.sk,
        'category_name': category.category_name,
        'description': category.description,
        'status': category.status,
        'icon': category.icon,
        'sort_order': int(category.sort_order) if category.sort_order else 0,
        'sub_categories': [
            {
                'subcategory_id': sc.subcategory_id,
                'name': sc.name,
                'description': sc.description,
                'status': sc.status,
            }
            for sc in category.sub_categories
            if sc.status == 'active'
        ],
    }


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
        'status': product.status,
        'image_url': product.image_url,
        'image_filename': product.image_filename,
    }


@method_decorator(csrf_exempt, name='dispatch')
class CustomerCategoryListView(APIView):
    def get(self, request):
        try:
            categories = Category.get_active_categories()
            formatted = [_format_category(c) for c in categories]
            return Response({
                'success': True,
                'data': {
                    'categories': formatted,
                    'count': len(formatted),
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in CustomerCategoryListView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerCategoryDetailView(APIView):
    def get(self, request, category_id):
        try:
            category = Category.get_by_id(category_id)
            if not category or category.isDeleted:
                return Response({'success': False, 'message': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'success': True, 'data': _format_category(category)}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in CustomerCategoryDetailView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class CustomerCategoryWithProductsView(APIView):
    def get(self, request, category_id):
        try:
            page = int(request.GET.get('page', 1))
            limit = int(request.GET.get('limit', 20))

            category = Category.get_by_id(category_id)
            if not category or category.isDeleted:
                return Response({'success': False, 'message': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)

            products = list(Product.query(
                "products",
                filter_condition=(Product.isDeleted == False) & (Product.category_id == category_id)
            ))
            total = len(products)
            total_pages = max(1, (total + limit - 1) // limit)
            start = (page - 1) * limit
            page_products = products[start:start + limit]

            return Response({
                'success': True,
                'data': {
                    'category': _format_category(category),
                    'products': [_format_product(p) for p in page_products],
                    'pagination': {
                        'current_page': page,
                        'total_pages': total_pages,
                        'total_items': total,
                        'items_per_page': limit,
                        'has_next': page < total_pages,
                        'has_previous': page > 1,
                    }
                }
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error in CustomerCategoryWithProductsView: {e}", exc_info=True)
            return Response({'success': False, 'message': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
