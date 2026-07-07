"""
Customer-Facing Order Views
Base URL: /api/v1/web/orders/
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from app.services.sales.online_transactions_services import OnlineTransactionService
from app.utils.singleton import get_singleton
import logging

logger = logging.getLogger(__name__)


class CustomerOrderBaseView(APIView):
    permission_classes = [AllowAny]

    @property
    def service(self) -> OnlineTransactionService:
        return get_singleton(OnlineTransactionService)


# ================================================================
# ORDER CREATION
# ================================================================

class CustomerCreateOrderView(CustomerOrderBaseView):
    """POST /web/orders/create/ — Place a new online order."""

    def post(self, request):
        try:
            order_data = request.data
            customer_id = order_data.get('customer_id')

            if not customer_id:
                return Response(
                    {'error': 'customer_id is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            result = self.service.create_online_order(order_data, customer_id)

            if result.get('success'):
                return Response(result, status=status.HTTP_201_CREATED)
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"CustomerCreateOrderView error: {e}")
            return Response(
                {'error': f'Failed to create order: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ================================================================
# ORDER HISTORY
# ================================================================

class CustomerOrderHistoryView(CustomerOrderBaseView):
    """GET /web/orders/customer/<customer_id>/ — Orders for a customer."""

    def get(self, request, customer_id):
        try:
            status_filter = request.query_params.get('status')
            limit = int(request.query_params.get('limit', 50))

            orders = self.service.get_customer_orders(
                customer_id,
                status=status_filter,
                limit=limit,
            )

            return Response(orders, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"CustomerOrderHistoryView error for {customer_id}: {e}")
            return Response(
                {'error': f'Failed to fetch orders: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ================================================================
# ORDER DETAIL
# ================================================================

class CustomerOrderDetailView(CustomerOrderBaseView):
    """GET /web/orders/<order_id>/ — Single order detail."""

    def get(self, request, order_id):
        try:
            order = self.service.get_order_by_id(order_id)

            if not order:
                return Response(
                    {'error': 'Order not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return Response(order, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"CustomerOrderDetailView error for {order_id}: {e}")
            return Response(
                {'error': f'Failed to fetch order: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ================================================================
# ORDER CANCELLATION
# ================================================================

class CustomerCancelOrderView(CustomerOrderBaseView):
    """POST /web/orders/<order_id>/cancel/ — Cancel an order and restore stock."""

    def post(self, request, order_id):
        try:
            cancellation_reason = request.data.get('cancellation_reason', '').strip()
            cancelled_by = request.data.get('customer_id', 'customer')

            if not cancellation_reason:
                return Response(
                    {'error': 'cancellation_reason is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            result = self.service.cancel_online_order(
                order_id,
                cancellation_reason,
                cancelled_by,
            )

            return Response(result, status=status.HTTP_200_OK)

        except ValueError as ve:
            return Response(
                {'error': str(ve)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            logger.error(f"CustomerCancelOrderView error for {order_id}: {e}")
            return Response(
                {'error': f'Failed to cancel order: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ================================================================
# STOCK CHECK
# ================================================================

class CustomerStockCheckView(CustomerOrderBaseView):
    """POST /web/orders/stock/check/ — Validate stock before placing an order."""

    def post(self, request):
        try:
            items = request.data.get('items', [])

            if not items:
                return Response(
                    {'error': 'items list is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            validation = self.service.validate_order_stock(items)
            return Response(validation, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"CustomerStockCheckView error: {e}")
            return Response(
                {'error': f'Stock validation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
