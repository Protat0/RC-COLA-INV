from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt
from app.services.identity.customer_service import CustomerService
from app.decorators.authenticationDecorator import jwt_required
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# One shared service instance (stateless, safe to reuse)
_customer_service = CustomerService()


def _get_customer(customer_id: str):
    """Return customer dict or None. Raises nothing — caller handles 404."""
    return _customer_service.get_customer_by_id(customer_id)


# ---------------------------------------------------------------------------
# GET /web/loyalty/balance/
# ---------------------------------------------------------------------------
@api_view(['GET'])
@jwt_required
def get_loyalty_balance(request):
    try:
        customer_id = request.customer['customer_id']
        customer = _get_customer(customer_id)
        if not customer:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        balance = float(customer.get('loyalty_points', 0))
        return Response({'success': True, 'balance': balance}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"get_loyalty_balance error: {e}", exc_info=True)
        return Response({'error': 'An error occurred'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# GET /web/loyalty/history/
# ---------------------------------------------------------------------------
@api_view(['GET'])
@jwt_required
def get_loyalty_history(request):
    """Points transaction history is not persisted separately yet — returns empty."""
    return Response({
        'success': True,
        'history': {'transactions': [], 'total_count': 0}
    }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /web/loyalty/validate-redemption/
# ---------------------------------------------------------------------------
@api_view(['POST'])
@jwt_required
@csrf_exempt
def validate_points_redemption(request):
    try:
        customer_id = request.customer['customer_id']
        points_to_redeem = request.data.get('points_to_redeem')

        if not points_to_redeem:
            return Response({'error': 'points_to_redeem is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pts = int(points_to_redeem)
        except (ValueError, TypeError):
            return Response({'error': 'points_to_redeem must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

        if pts <= 0:
            return Response({'success': False, 'can_redeem': False, 'message': 'Invalid points amount'},
                            status=status.HTTP_200_OK)

        customer = _get_customer(customer_id)
        if not customer:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        available = float(customer.get('loyalty_points', 0))
        if pts > available:
            return Response({
                'success': False, 'can_redeem': False,
                'message': f'Insufficient points. Available: {available}',
                'available_points': available
            }, status=status.HTTP_200_OK)

        return Response({
            'success': True, 'can_redeem': True,
            'message': 'Valid redemption',
            'available_points': available
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"validate_points_redemption error: {e}", exc_info=True)
        return Response({'error': 'An error occurred'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# POST /web/loyalty/redeem/
# ---------------------------------------------------------------------------
@api_view(['POST'])
@jwt_required
@csrf_exempt
def redeem_points(request):
    try:
        customer_id = request.customer['customer_id']
        points_to_redeem = request.data.get('points_to_redeem')
        description = request.data.get('description', 'Points redemption at checkout')

        if not points_to_redeem:
            return Response({'error': 'points_to_redeem is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pts = int(points_to_redeem)
        except (ValueError, TypeError):
            return Response({'error': 'points_to_redeem must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

        if pts <= 0:
            return Response({'error': 'points_to_redeem must be positive'}, status=status.HTTP_400_BAD_REQUEST)

        updated = _customer_service.redeem_loyalty_points(customer_id, pts, description)
        if not updated:
            return Response({'error': 'Customer not found or insufficient points'},
                            status=status.HTTP_400_BAD_REQUEST)

        new_balance = float(updated.get('loyalty_points', 0))
        return Response({
            'success': True,
            'message': f'Successfully redeemed {pts} points',
            'points_redeemed': pts,
            'new_balance': new_balance
        }, status=status.HTTP_200_OK)

    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"redeem_points error: {e}", exc_info=True)
        return Response({'error': 'An error occurred'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# POST /web/loyalty/award/
# ---------------------------------------------------------------------------
@api_view(['POST'])
@jwt_required
@csrf_exempt
def award_points(request):
    """
    Award points after order completion.
    Accepts either `points` (explicit amount) or `order_amount` (calculates 20%).
    """
    try:
        customer_id = request.customer['customer_id']
        explicit_points = request.data.get('points')
        order_amount = request.data.get('order_amount')
        description = request.data.get('description', 'Points earned from order')

        if explicit_points is not None:
            pts = int(explicit_points)
        elif order_amount is not None:
            pts = int(round(float(order_amount) * 0.20))
        else:
            return Response({'error': 'Either points or order_amount is required'},
                            status=status.HTTP_400_BAD_REQUEST)

        if pts <= 0:
            return Response({'error': 'Points amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)

        updated = _customer_service.update_loyalty_points(customer_id, pts, description)
        if not updated:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        new_balance = float(updated.get('loyalty_points', 0))
        return Response({
            'success': True,
            'message': f'Successfully awarded {pts} points',
            'points_awarded': pts,
            'new_balance': new_balance
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"award_points error: {e}", exc_info=True)
        return Response({'error': 'An error occurred'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# GET /web/loyalty/health/
# ---------------------------------------------------------------------------
@api_view(['GET'])
def loyalty_health_check(request):
    return Response({
        'service': 'Customer Loyalty Points',
        'status': 'active',
        'version': '2.0.0',
        'timestamp': datetime.utcnow().isoformat()
    }, status=status.HTTP_200_OK)
