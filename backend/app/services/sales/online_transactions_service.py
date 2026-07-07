from datetime import datetime, timedelta
import uuid
from decimal import Decimal
from ..core.database_service import DatabaseService
from models.Customers import Customer
import logging

logger = logging.getLogger(__name__)

# Helper to convert floats to Decimals for DynamoDB to avoid precision loss.
def floats_to_decimals(obj):
    if isinstance(obj, list):
        return [floats_to_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj

class OnlineTransactionService:
    """
    Service for creating customer web orders, adapted for DynamoDB.
    """

    def __init__(self):
        db_service = DatabaseService()
        self.online_transactions_table = db_service.get_table('online_transactions')

    # ------------------------- Helpers -------------------------
    def _generate_order_id(self) -> str:
        return f"ONLINE-{uuid.uuid4()}"

    def _compute_items(self, items):
        computed = []
        subtotal = 0.0
        for item in items or []:
            price = float(item.get('price', 0))
            qty = int(item.get('quantity', 1))
            line_subtotal = round(price * qty, 2)
            computed.append({
                'product_id': item.get('product_id') or item.get('id') or item.get('productId'),
                'product_name': item.get('name') or item.get('product_name'),
                'quantity': qty,
                'price': price,
                'subtotal': line_subtotal,
            })
            subtotal += line_subtotal
        return computed, round(subtotal, 2)

    def _compute_fees(self, delivery_type: str):
        delivery_fee = 50.0 if (delivery_type or '').lower() == 'delivery' else 0.0
        service_fee = 15.0
        return round(delivery_fee, 2), round(service_fee, 2)

    def _compute_points_discount(self, points_to_redeem: int, subtotal: float):
        try:
            pts = int(points_to_redeem or 0)
        except (ValueError, TypeError):
            pts = 0
        discount = round(pts / 4.0, 2)  # 4 points = ₱1
        return float(min(discount, subtotal)), pts

    def _compute_points_earned(self, subtotal_after_discount: float) -> int:
        return int(round(subtotal_after_discount * 0.20))

    # ------------------------- Public API -------------------------
    def create_online_order(self, order_data: dict, customer_id: str):
        if not customer_id:
            raise ValueError("customer_id is required")

        items_in = order_data.get('items', [])
        delivery_address = order_data.get('delivery_address', {})
        payment_method = order_data.get('payment_method', 'cod')
        delivery_type = order_data.get('delivery_type', 'delivery')
        points_to_redeem = int(order_data.get('points_to_redeem', 0) or 0)
        notes = order_data.get('notes') or order_data.get('special_instructions') or ''

        # Look up customer via PynamoDB model
        customer = None
        if customer_id and customer_id != 'GUEST':
            try:
                customer = Customer.get_by_id(customer_id)
            except Exception as e:
                logger.warning(f"Could not fetch customer {customer_id}: {e}")

        # Computations
        items, subtotal = self._compute_items(items_in)
        points_discount, pts_used = self._compute_points_discount(points_to_redeem, subtotal)
        subtotal_after_discount = round(subtotal - points_discount, 2)
        delivery_fee, service_fee = self._compute_fees(delivery_type)
        total_amount = round(subtotal_after_discount + delivery_fee + service_fee, 2)
        points_earned = self._compute_points_earned(subtotal_after_discount)

        order_id = self._generate_order_id()
        now_utc = datetime.utcnow()
        now_utc_iso = now_utc.isoformat() + "Z"
        now_local_iso = (now_utc + timedelta(hours=8)).isoformat()

        order_record = {
            'order_id': order_id,
            'customer_id': customer_id or 'GUEST',
            'customer_name': customer.full_name if customer else 'Guest',
            'customer_email': customer.email if customer else None,
            'customer_phone': customer.phone_number if customer else None,
            'transaction_date': now_utc_iso,
            'transaction_date_local': now_local_iso,
            'delivery_address': delivery_address,
            'delivery_type': delivery_type,
            'items': items,
            'subtotal': subtotal,
            'points_redeemed': pts_used,
            'points_discount': points_discount,
            'subtotal_after_discount': subtotal_after_discount,
            'delivery_fee': delivery_fee,
            'service_fee': service_fee,
            'total_amount': total_amount,
            'payment_method': payment_method,
            'payment_status': 'pending',
            'order_status': 'pending',
            'notes': notes,
            'status_history': [{'status': 'pending', 'timestamp': now_utc_iso}],
            'loyalty_points_earned': points_earned,
            'created_at': now_utc_iso,
            'updated_at': now_utc_iso,
        }

        order_record_ddb = floats_to_decimals(order_record)
        order_record_ddb = {k: v for k, v in order_record_ddb.items() if v not in [None, '']}
        self.online_transactions_table.put_item(Item=order_record_ddb)

        # Update customer loyalty points in DynamoDB
        if customer:
            try:
                if pts_used > 0:
                    customer.deduct_loyalty_points(pts_used, reason=f"Redeemed at order {order_id}")
                    # Re-fetch after deduction so earned points stack correctly
                    customer = Customer.get_by_id(customer_id)
                if points_earned > 0 and customer:
                    customer.add_loyalty_points(points_earned, reason=f"Earned from order {order_id}")
            except Exception as e:
                # Points failure must not block order confirmation
                logger.error(f"Failed to update loyalty points for {customer_id} on order {order_id}: {e}")

        return {
            'success': True,
            'data': {
                'order_id': order_id,
                'order': order_record,
                'points_earned': points_earned,
                'points_redeemed': pts_used,
            }
        }
