"""
Online Transaction Service — DynamoDB (PynamoDB) implementation.
Replaces the previous MongoDB-backed version.
"""
from datetime import datetime, timedelta, timezone
from models.Online_Transactions import OnlineTransaction
from models.Customers import Customer
from app.utils.counters import counter_service
from app.utils.singleton import get_singleton
from ..inventory.product_service import ProductService
from ..inventory.batch_service import BatchService
import logging
import math
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)


def _txn_to_dict(txn: OnlineTransaction) -> dict:
    """Return a flat dict compatible with the view layer."""
    try:
        return txn.to_dict()
    except Exception as e:
        logger.warning(f"to_dict() failed for {txn.sk}: {e}")
        return {'transaction_id': txn.sk, 'order_status': txn.order_status}


def _order_raw_to_dict(raw: dict) -> dict:
    """
    Convert a raw boto3 DynamoDB item (already Python-typed by the resource client)
    into the same nested structure that OnlineTransaction.to_dict() produces.
    Avoids N+1 GetItem calls when listing orders.
    """
    def _f(v, d=0.0):
        try: return float(v)
        except: return d

    def _i(v, d=0):
        try: return int(v)
        except: return d

    items = []
    for item in (raw.get('items') or []):
        items.append({
            'product_id':   item.get('product_id', ''),
            'product_name': item.get('product_name', ''),
            'quantity':     _i(item.get('quantity', 0)),
            'price':        _f(item.get('price', 0)),
            'subtotal':     _f(item.get('subtotal', 0)),
        })

    subtotal      = _f(raw.get('subtotal', 0))
    delivery_fee  = _f(raw.get('delivery_fee', 0))
    service_fee   = _f(raw.get('service_fee', 0))
    total_amount  = _f(raw.get('total_amount', 0))
    pts_redeemed  = _f(raw.get('points_rdeemed', 0))  # ERD typo preserved
    pts_discount  = _f(raw.get('ponts_discount', 0))   # ERD typo preserved
    pts_earned    = _f(raw.get('loyalty_points_earned', 0))

    return {
        'transaction_id': raw.get('SK', ''),
        'customer': {
            'customer_id':    raw.get('customer_id', ''),
            'customer_name':  raw.get('customer_name', ''),
            'customer_email': raw.get('customer_email', ''),
            'customer_phone': raw.get('customer_phone', ''),
        },
        'timing': {
            'transaction_date_utc':   raw.get('transaction_date', ''),
            'transaction_date_local': raw.get('transaction_date_local', ''),
            'timezone':               raw.get('Timezone', 'UTC'),
            'utc_offset_minutes':     _i(raw.get('utc_offset_minutes', 0)),
            'created_at':             raw.get('created_at', ''),
            'updated_at':             raw.get('updated_at', ''),
        },
        'delivery': {
            'address': raw.get('delivery_address', ''),
            'type':    raw.get('delivery_type', 'delivery'),
            'fee':     delivery_fee,
        },
        'items': items,
        'financials': {
            'subtotal':                subtotal,
            'points_redeemed':         pts_redeemed,
            'points_discount':         pts_discount,
            'subtotal_after_discount': _f(raw.get('subtotal_after_discount', subtotal)),
            'delivery_fee':            delivery_fee,
            'service_fee':             service_fee,
            'total_amount':            total_amount,
            'loyalty_points_earned':   pts_earned,
            'net_revenue':             total_amount - delivery_fee - service_fee,
        },
        'payment': {
            'method':    raw.get('payment_method', 'cash'),
            'status':    raw.get('payment_status', 'pending'),
            'reference': raw.get('payment_reference') or '',
        },
        'order': {
            'status':         raw.get('order_status', 'pending'),
            'overall_status': raw.get('status', 'active'),
            'notes':          raw.get('notes') or '',
            'status_timeline': [],
        },
        'loyalty': {
            'points_redeemed': pts_redeemed,
            'points_earned':   pts_earned,
        },
    }


_ACTIVE_STATUSES = {'pending', 'confirmed', 'processing', 'preparing', 'on_the_way'}


class OnlineTransactionService:

    def __init__(self):
        print("[ORDER TIMING] OnlineTransactionService.__init__ start")
        self.batch_service = get_singleton(BatchService)
        print("[ORDER TIMING] OnlineTransactionService.__init__ done")

        # Auto-cancellation settings (scheduler disabled by default — start manually if needed)
        self.auto_cancel_enabled = False
        self.check_interval_minutes = 5
        self.expiry_minutes = 30
        self._scheduler_thread: Optional[threading.Thread] = None
        self._stop_scheduler = False
        self._last_check_time: Optional[datetime] = None

    # ================================================================
    # AUTO-CANCELLATION SCHEDULER
    # ================================================================

    def _start_auto_cancellation_scheduler(self):
        if not self.auto_cancel_enabled:
            return
        try:
            self._stop_scheduler = False
            self._scheduler_thread = threading.Thread(
                target=self._run_auto_cancellation_loop,
                daemon=True,
                name="AutoCancelScheduler",
            )
            self._scheduler_thread.start()
            logger.info(f"Auto-cancellation scheduler started (every {self.check_interval_minutes}m)")
        except Exception as e:
            logger.error(f"Failed to start auto-cancellation scheduler: {e}")

    def _run_auto_cancellation_loop(self):
        while not self._stop_scheduler:
            try:
                self.auto_cancel_expired_orders(self.expiry_minutes)
                self._last_check_time = datetime.utcnow()
                time.sleep(self.check_interval_minutes * 60)
            except Exception as e:
                logger.error(f"Error in auto-cancellation loop: {e}")
                time.sleep(60)

    def stop_auto_cancellation(self):
        self._stop_scheduler = True
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            self._scheduler_thread.join(timeout=5.0)

    def restart_auto_cancellation(self, check_interval_minutes=None, expiry_minutes=None):
        self.stop_auto_cancellation()
        if check_interval_minutes:
            self.check_interval_minutes = check_interval_minutes
        if expiry_minutes:
            self.expiry_minutes = expiry_minutes
        self._start_auto_cancellation_scheduler()

    def get_scheduler_status(self):
        result = {
            'enabled': self.auto_cancel_enabled,
            'check_interval_minutes': self.check_interval_minutes,
            'expiry_minutes': self.expiry_minutes,
            'last_check_time': self._last_check_time.isoformat() if self._last_check_time else None,
            'scheduler_running': bool(self._scheduler_thread and self._scheduler_thread.is_alive()),
            'stop_requested': self._stop_scheduler,
        }
        if self._last_check_time:
            result['minutes_since_last_check'] = (
                datetime.utcnow() - self._last_check_time
            ).total_seconds() / 60
        return result

    def update_auto_cancellation_settings(self, enabled=None, check_interval=None, expiry_minutes=None):
        try:
            if enabled is not None:
                self.auto_cancel_enabled = enabled
                if enabled:
                    self._start_auto_cancellation_scheduler()
                else:
                    self.stop_auto_cancellation()
            if check_interval is not None:
                self.check_interval_minutes = check_interval
                if self.auto_cancel_enabled:
                    self.restart_auto_cancellation()
            if expiry_minutes is not None:
                self.expiry_minutes = expiry_minutes
            return {
                'success': True,
                'settings': {
                    'enabled': self.auto_cancel_enabled,
                    'check_interval_minutes': self.check_interval_minutes,
                    'expiry_minutes': self.expiry_minutes,
                },
            }
        except Exception as e:
            logger.error(f"Error updating auto-cancel settings: {e}")
            return {'success': False, 'error': str(e)}

    # ================================================================
    # AUTO-CANCELLATION LOGIC
    # ================================================================

    def auto_cancel_expired_orders(self, expiry_minutes=30):
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=expiry_minutes)
            cancelled, failed = [], []

            for txn in OnlineTransaction.order_status_index.query(
                'pending',
                filter_condition=(OnlineTransaction.created_at < cutoff),
            ):
                try:
                    txn.cancel_order(
                        reason=f"Auto-cancelled: not processed within {expiry_minutes} minutes",
                        cancelled_by='system_auto_cancel',
                    )
                    cancelled.append({'order_id': txn.sk, 'customer_id': txn.customer_id})
                except Exception as e:
                    failed.append({'order_id': txn.sk, 'error': str(e)})

            return {
                'success': True,
                'cancelled_count': len(cancelled),
                'failed_count': len(failed),
                'cancelled_orders': cancelled,
                'failed_orders': failed,
                'check_time': datetime.utcnow().isoformat(),
            }
        except Exception as e:
            logger.error(f"Auto-cancel error: {e}")
            return {
                'success': False, 'cancelled_count': 0, 'failed_count': 0,
                'cancelled_orders': [], 'failed_orders': [], 'error': str(e),
                'check_time': datetime.utcnow().isoformat(),
            }

    def manual_check_expired_orders(self):
        result = self.auto_cancel_expired_orders(self.expiry_minutes)
        result['scheduler_status'] = self.get_scheduler_status()
        return result

    # ================================================================
    # ID GENERATION
    # ================================================================

    def generate_online_order_id(self):
        return counter_service.get_next_id('online_transactions')

    # ================================================================
    # FEE / POINTS CALCULATIONS (pure)
    # ================================================================

    def calculate_service_fee(self, subtotal_after_discount, delivery_fee, payment_method):
        try:
            if payment_method == 'cod':
                return {
                    'service_fee': 15.00,
                    'breakdown': {
                        'payment_method': 'cod',
                        'base_amount': 0, 'paymongo_percentage_fee': 0,
                        'paymongo_fixed_fee': 0, 'calculated_total': 15.00, 'rounded_to': 15.00,
                    },
                }
            elif payment_method in ['gcash_paymongo', 'bank_paymongo']:
                base = subtotal_after_discount + delivery_fee
                pct_fee = base * 0.035
                fixed_fee = 15.00
                calc_fee = pct_fee + fixed_fee
                rounded = math.ceil(calc_fee / 5) * 5
                final = max(rounded, 20.00)
                return {
                    'service_fee': final,
                    'breakdown': {
                        'payment_method': payment_method,
                        'base_amount': round(base, 2),
                        'paymongo_percentage_fee': round(pct_fee, 2),
                        'paymongo_fixed_fee': fixed_fee,
                        'calculated_total': round(calc_fee, 2),
                        'rounded_to': final,
                    },
                }
            return {'service_fee': 15.00, 'breakdown': {}}
        except Exception as e:
            logger.error(f"Error calculating service fee: {e}")
            return {'service_fee': 15.00, 'breakdown': {}}

    def calculate_loyalty_points_earned(self, subtotal_after_discount):
        return int(subtotal_after_discount * 0.20)

    def calculate_points_discount(self, points_to_redeem):
        return points_to_redeem / 4.0

    # ================================================================
    # STOCK & POINTS VALIDATION
    # ================================================================

    def validate_order_stock(self, items):
        from models.Product import Product
        errors = []
        stock_details = {}
        for item in items:
            product_id = item.get('product_id')
            quantity = item.get('quantity', 0)
            product = Product.get_by_id(product_id)
            if not product:
                errors.append(f"Product {product_id} not found")
                continue
            batch_check = self.batch_service.check_batch_availability(product_id, quantity)
            stock_details[product_id] = {
                'product_name': product.product_name,
                'requested': quantity,
                'available': batch_check.get('total_stock', 0),
                'sufficient': batch_check.get('available', False),
            }
            if not batch_check.get('available', False):
                errors.append(
                    f"Insufficient stock for {product.product_name}. "
                    f"Available: {batch_check.get('total_stock', 0)}, Requested: {quantity}"
                )
        return {'valid': len(errors) == 0, 'errors': errors, 'stock_details': stock_details}

    def validate_points_redemption(self, customer_id, points_to_redeem, subtotal):
        try:
            if points_to_redeem == 0:
                return {'valid': True, 'error': None}
            if points_to_redeem < 40:
                return {'valid': False, 'error': 'Minimum redemption is 40 points (₱10)'}

            customer = Customer.get_by_id(customer_id)
            if not customer:
                return {'valid': False, 'error': 'Customer not found'}

            available = getattr(customer, 'loyalty_points', 0) or 0
            if available < points_to_redeem:
                return {
                    'valid': False,
                    'error': f'Insufficient points. Available: {available}, Requested: {points_to_redeem}',
                }

            points_discount = self.calculate_points_discount(points_to_redeem)
            max_discount = min(20, subtotal * 0.20)
            if points_discount > max_discount:
                max_points = int(max_discount * 4)
                return {
                    'valid': False,
                    'error': f'Points discount exceeds cap. Maximum: {max_points} points (₱{max_discount:.2f})',
                }
            return {'valid': True, 'error': None}
        except Exception as e:
            logger.error(f"Points validation error: {e}")
            return {'valid': False, 'error': str(e)}

    # ================================================================
    # ORDER RETRIEVAL
    # ================================================================

    def _run_with_timeout(self, fn, timeout_secs=8, fallback=None):
        """Run fn() in a thread; return fallback if it takes longer than timeout_secs."""
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(fn)
            try:
                return future.result(timeout=timeout_secs)
            except FutureTimeout:
                logger.warning(f"DynamoDB call timed out after {timeout_secs}s")
                return fallback if fallback is not None else []
            except Exception as e:
                logger.error(f"DynamoDB call failed: {e}")
                return fallback if fallback is not None else []

    def get_order_by_id(self, order_id):
        def _fetch():
            txn = OnlineTransaction.get_by_id(order_id)
            return _txn_to_dict(txn) if txn else None
        return self._run_with_timeout(_fetch, fallback=None)

    def get_customer_orders(self, customer_id, status=None, limit=50):
        """
        Fetch orders for a customer using a paginated boto3 query + FilterExpression.
        The GSI 'online-transaction-customer-id-index' does not exist in the table,
        so we query PK='online_transactions' and filter by customer_id in DynamoDB.
        """
        def _fetch():
            import boto3
            from boto3.dynamodb.conditions import Key as _Key, Attr as _Attr
            from app.utils import DYNAMO_TABLE_NAME, AWS_REGION

            orders = []
            try:
                _table = boto3.resource('dynamodb', region_name=AWS_REGION).Table(DYNAMO_TABLE_NAME)
                last_key = None

                while len(orders) < limit:
                    kwargs = {
                        'KeyConditionExpression': _Key('PK').eq('online_transactions'),
                        'FilterExpression': _Attr('customer_id').eq(customer_id),
                        'ScanIndexForward': False,  # newest first
                    }
                    if last_key:
                        kwargs['ExclusiveStartKey'] = last_key

                    resp = _table.query(**kwargs)
                    for raw in resp.get('Items', []):
                        if len(orders) >= limit:
                            break
                        orders.append(_order_raw_to_dict(raw))

                    last_key = resp.get('LastEvaluatedKey')
                    if not last_key:
                        break

                print(f"[GET_ORDERS] {customer_id}: {len(orders)} order(s)")
            except Exception as e:
                print(f"[GET_ORDERS] query failed: {type(e).__name__}: {e}")

            if status:
                orders = [o for o in orders if o.get('order', {}).get('status') == status]
            return orders

        return self._run_with_timeout(_fetch, timeout_secs=30)

    def get_all_orders(self, filters=None, limit=100):
        def _fetch():
            filter_cond = None
            if filters:
                if filters.get('status'):
                    fc = OnlineTransaction.order_status == filters['status']
                    filter_cond = fc if not filter_cond else filter_cond & fc
                if filters.get('payment_status'):
                    fc = OnlineTransaction.payment_status == filters['payment_status']
                    filter_cond = fc if not filter_cond else filter_cond & fc
                if filters.get('customer_id'):
                    fc = OnlineTransaction.customer_id == filters['customer_id']
                    filter_cond = fc if not filter_cond else filter_cond & fc

            kwargs = {'limit': limit}
            if filter_cond is not None:
                kwargs['filter_condition'] = filter_cond

            return [_txn_to_dict(t) for t in OnlineTransaction.query('online_transactions', **kwargs)]

        return self._run_with_timeout(_fetch)

    def get_orders_by_status(self, status, limit=50):
        def _fetch():
            return [
                _txn_to_dict(t)
                for t in OnlineTransaction.order_status_index.query(status, limit=limit)
            ]
        return self._run_with_timeout(_fetch)

    def get_pending_orders(self):
        return self.get_orders_by_status('pending')

    def get_processing_orders(self):
        return self.get_orders_by_status('processing')

    def get_order_summary(self, start_date, end_date):
        try:
            all_orders = self.get_all_orders(limit=1000)
            filtered = [
                o for o in all_orders
                if start_date <= self._parse_date(o.get('timing', {}).get('transaction_date_utc') or o.get('transaction_date', '')) <= end_date
            ]
            completed = [o for o in filtered if o.get('order_status') == 'completed']
            cancelled = [o for o in filtered if o.get('order_status') == 'cancelled']
            total_rev = sum(o.get('financial', {}).get('total_amount', 0) or 0 for o in completed)
            avg = total_rev / len(completed) if completed else 0
            return {
                'total_orders': len(filtered),
                'total_revenue': round(total_rev, 2),
                'completed_orders': len(completed),
                'cancelled_orders': len(cancelled),
                'avg_order_value': round(avg, 2),
                'payment_method_breakdown': {},
            }
        except Exception as e:
            logger.error(f"Error getting order summary: {e}")
            return {}

    def _parse_date(self, date_str):
        try:
            return datetime.fromisoformat(str(date_str).replace('Z', '+00:00'))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    # ================================================================
    # ORDER CREATION
    # ================================================================

    def has_active_order(self, customer_id) -> dict:
        """
        Returns {'active': True, 'order_id': <id>, 'status': <status>} if the customer
        has any order in an active (non-terminal) status, else {'active': False}.
        Uses the same boto3 paginated query that get_customer_orders uses.
        """
        def _check():
            import boto3
            from boto3.dynamodb.conditions import Key as _Key, Attr as _Attr
            from app.utils import DYNAMO_TABLE_NAME, AWS_REGION

            try:
                _table = boto3.resource('dynamodb', region_name=AWS_REGION).Table(DYNAMO_TABLE_NAME)
                last_key = None
                while True:
                    kwargs = {
                        'KeyConditionExpression': _Key('PK').eq('online_transactions'),
                        'FilterExpression': (
                            _Attr('customer_id').eq(customer_id) &
                            _Attr('order_status').is_in(list(_ACTIVE_STATUSES))
                        ),
                        'ScanIndexForward': False,
                        'Limit': 10,
                    }
                    if last_key:
                        kwargs['ExclusiveStartKey'] = last_key
                    resp = _table.query(**kwargs)
                    items = resp.get('Items', [])
                    if items:
                        first = items[0]
                        return {
                            'active': True,
                            'order_id': first.get('SK', ''),
                            'status': first.get('order_status', ''),
                        }
                    last_key = resp.get('LastEvaluatedKey')
                    if not last_key:
                        break
            except Exception as e:
                print(f"[HAS_ACTIVE_ORDER] query failed: {type(e).__name__}: {e}")
            return {'active': False}

        result = self._run_with_timeout(_check, timeout_secs=15, fallback={'active': False})
        return result or {'active': False}

    def create_online_order(self, order_data, customer_id):
        try:
            from models.Product import Product
            import time as _time
            _t0 = _time.time()
            print(f"[ORDER TIMING] start customer={customer_id}")

            order_id = self.generate_online_order_id()
            print(f"[ORDER TIMING] order_id generated ({_time.time()-_t0:.2f}s)")
            now = datetime.utcnow()

            customer = Customer.get_by_id(customer_id)
            print(f"[ORDER TIMING] customer fetched ({_time.time()-_t0:.2f}s)")
            if not customer:
                raise ValueError(f"Customer {customer_id} not found")

            # Failsafe: block if the customer already has an active order
            active = self.has_active_order(customer_id)
            if active.get('active'):
                raise ValueError(
                    f"You already have an active order ({active['order_id']}) "
                    f"with status '{active['status']}'. "
                    "Please wait for it to complete or cancel it before placing a new one."
                )
            print(f"[ORDER TIMING] active-order check done ({_time.time()-_t0:.2f}s)")

            # Single pass: validate stock + build items with prices (avoids duplicate Product fetches)
            subtotal = 0.0
            items_with_prices = []
            stock_errors = []
            for item in order_data.get('items', []):
                product = Product.get_by_id(item['product_id'])
                print(f"[ORDER TIMING] product {item['product_id']} fetched ({_time.time()-_t0:.2f}s)")
                if not product:
                    stock_errors.append(f"Product {item['product_id']} not found")
                    continue
                qty = int(item['quantity'])
                batch_check = self.batch_service.check_batch_availability(item['product_id'], qty)
                print(f"[STOCK] batch_check for {item['product_id']} qty={qty}: {batch_check}")
                print(f"[ORDER TIMING] batch check done ({_time.time()-_t0:.2f}s)")
                if not batch_check.get('available', False):
                    stock_errors.append(
                        f"Insufficient stock for {product.product_name}. "
                        f"Available: {batch_check.get('total_stock', 0)}, Requested: {qty}"
                    )
                    continue
                unit_price = float(product.selling_price or 0)
                item_subtotal = unit_price * qty
                items_with_prices.append({
                    'product_id': product.sk,
                    'product_name': product.product_name or '',
                    'quantity': qty,
                    'price': unit_price,
                    'subtotal': item_subtotal,
                })
                subtotal += item_subtotal

            if stock_errors:
                raise ValueError(f"Stock validation failed: {', '.join(stock_errors)}")

            # Validate points using the already-fetched customer (no extra DynamoDB read)
            points_to_redeem = int(order_data.get('points_to_redeem', 0))
            points_discount = 0.0
            if points_to_redeem > 0:
                available_points = getattr(customer, 'loyalty_points', 0) or 0
                if points_to_redeem < 40:
                    raise ValueError('Minimum redemption is 40 points (₱10)')
                if available_points < points_to_redeem:
                    raise ValueError(
                        f'Insufficient points. Available: {available_points}, Requested: {points_to_redeem}'
                    )
                points_discount = self.calculate_points_discount(points_to_redeem)

            subtotal_after_discount = subtotal - points_discount
            delivery_fee = 50.0
            payment_method = order_data.get('payment_method', 'cod')
            service_fee_data = self.calculate_service_fee(subtotal_after_discount, delivery_fee, payment_method)
            service_fee = service_fee_data['service_fee']
            total_amount = subtotal_after_discount + delivery_fee + service_fee

            txn = OnlineTransaction(
                pk='online_transactions',
                sk=order_id,
                customer_id=customer_id,
                customer_name=getattr(customer, 'full_name', '') or getattr(customer, 'name', '') or '',
                customer_email=getattr(customer, 'email', '') or '',
                customer_phone=getattr(customer, 'phone_number', '') or '',
                transaction_date=now,
                transaction_date_local=now,
                Timezone='UTC',
                utc_offset_minutes=0,
                delivery_address=str(order_data.get('delivery_address', '')),
                delivery_type=order_data.get('delivery_type', 'delivery'),
                subtotal=round(subtotal, 2),
                points_rdeemed=float(points_to_redeem),
                ponts_discount=round(points_discount, 2),
                subtotal_after_discount=round(subtotal_after_discount, 2),
                delivery_fee=delivery_fee,
                service_fee=service_fee,
                total_amount=round(total_amount, 2),
                payment_method=payment_method,
                payment_status='pending',
                order_status='pending',
                status='active',
                notes=order_data.get('notes', ''),
                loyalty_points_earned=float(self.calculate_loyalty_points_earned(subtotal_after_discount)),
                created_at=now,
                updated_at=now,
            )

            # Set items
            from models.Online_Transactions import OnlineSaleItem
            txn.items = [
                OnlineSaleItem(
                    product_id=i['product_id'],
                    product_name=i['product_name'],
                    quantity=i['quantity'],
                    price=i['price'],
                    subtotal=i['subtotal'],
                )
                for i in items_with_prices
            ]

            txn.save()
            print(f"[ORDER TIMING] txn saved ({_time.time()-_t0:.2f}s)")

            # Update loyalty points — reuse the already-fetched customer object
            try:
                if points_to_redeem > 0:
                    customer.deduct_loyalty_points(
                        points_to_redeem,
                        reason=f"Redeemed at order {order_id}",
                    )
                    customer = Customer.get_by_id(customer_id)
                points_earned_count = self.calculate_loyalty_points_earned(subtotal_after_discount)
                if points_earned_count > 0 and customer:
                    customer.add_loyalty_points(
                        points_earned_count,
                        reason=f"Earned from order {order_id}",
                    )
            except Exception as le:
                logger.error(f"Failed to update loyalty points for {customer_id} on order {order_id}: {le}")
            print(f"[ORDER TIMING] loyalty done ({_time.time()-_t0:.2f}s)")

            # Deduct batch stock — fire and forget via daemon thread so it can't block the response
            for item in items_with_prices:
                _pid = item['product_id']
                _qty = item['quantity']
                import threading as _threading
                def _deduct_bg(pid=_pid, qty=_qty, oid=order_id, cid=customer_id):
                    try:
                        result = self.batch_service.deduct_stock_fifo(pid, qty, f"Online order {oid}", adjusted_by=cid)
                        print(f"[STOCK] ✅ Deducted {qty} of {pid} for {oid}: {result}")
                    except Exception as _e:
                        print(f"[STOCK] ❌ Background batch deduction FAILED for {pid} on {oid}: {_e}")
                        logger.error(f"Background batch deduction failed for {pid} on {oid}: {_e}")
                _threading.Thread(target=_deduct_bg, daemon=True).start()
            print(f"[ORDER TIMING] batch deduction dispatched ({_time.time()-_t0:.2f}s)")

            try:
                from app.services.core.audit_service import AuditLogService
                get_singleton(AuditLogService).log_action(
                    user_data={'user_id': customer_id, 'username': customer_id, 'source': 'website'},
                    action='create',
                    resource_id=order_id,
                    resource_type='online_transaction',
                    changes={'total_amount': round(total_amount, 2), 'items_count': len(items_with_prices)},
                )
            except Exception as ae:
                logger.warning(f"Audit logging failed for online order {order_id}: {ae}")
            print(f"[ORDER TIMING] audit done ({_time.time()-_t0:.2f}s) — returning response")

            return {
                'success': True,
                'message': 'Order created successfully',
                'data': {'order_id': order_id, 'order': _txn_to_dict(txn)},
            }

        except ValueError as e:
            raise
        except Exception as e:
            logger.error(f"Error creating online order: {e}")
            raise Exception(f"Error creating online order: {e}")

    # ================================================================
    # ORDER STATUS MANAGEMENT
    # ================================================================

    def update_order_status(self, order_id, new_status, updated_by, notes=''):
        txn = OnlineTransaction.get_by_id(order_id)
        if not txn:
            raise ValueError(f"Order {order_id} not found")

        ALLOWED = {
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['processing', 'cancelled'],
            'processing': ['on_the_way', 'shipped'],
            'on_the_way': ['completed', 'delivered'],
            'shipped': ['delivered', 'completed'],
            'delivered': [], 'completed': [], 'cancelled': [],
        }
        current = txn.order_status
        allowed = ALLOWED.get(current, [])
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from '{current}' to '{new_status}'. Allowed: {allowed}"
            )

        txn.update_order_status(new_status, notes)
        txn.save()

        try:
            from app.services.core.audit_service import AuditLogService
            get_singleton(AuditLogService).log_action(
                user_data={'user_id': updated_by, 'username': updated_by, 'source': 'admin'},
                action='update_status',
                resource_id=order_id,
                resource_type='online_transaction',
                changes={'old_status': current, 'new_status': new_status, 'notes': notes},
            )
        except Exception as ae:
            logger.warning(f"Audit logging failed for order status update {order_id}: {ae}")

        return _txn_to_dict(txn)

    def update_payment_status(self, order_id, payment_status, payment_reference=None, confirmed_by=None):
        txn = OnlineTransaction.get_by_id(order_id)
        if not txn:
            raise ValueError(f"Order {order_id} not found")

        txn.payment_status = payment_status
        txn.updated_at = datetime.utcnow()
        if payment_reference:
            txn.payment_reference = payment_reference
        txn.save()

        try:
            from app.services.core.audit_service import AuditLogService
            actor = confirmed_by or 'system'
            get_singleton(AuditLogService).log_action(
                user_data={'user_id': actor, 'username': actor, 'source': 'admin'},
                action='update_payment',
                resource_id=order_id,
                resource_type='online_transaction',
                changes={'payment_status': payment_status, 'payment_reference': payment_reference},
            )
        except Exception as ae:
            logger.warning(f"Audit logging failed for payment update {order_id}: {ae}")

        if payment_status == 'paid' and txn.order_status == 'pending':
            self.update_order_status(order_id, 'confirmed', confirmed_by or 'system', 'Payment confirmed')

        return _txn_to_dict(OnlineTransaction.get_by_id(order_id))

    def mark_ready_for_delivery(self, order_id, prepared_by, delivery_notes=''):
        txn = OnlineTransaction.get_by_id(order_id)
        if not txn:
            raise ValueError(f"Order {order_id} not found")
        if txn.order_status not in ('processing', 'confirmed'):
            raise ValueError(
                f"Order must be in 'processing' status to mark ready. Current: {txn.order_status}"
            )
        notes = f"Ready for delivery. {delivery_notes}".strip()
        return self.update_order_status(order_id, 'on_the_way', prepared_by, notes)

    def complete_order(self, order_id, completed_by, delivery_person=None):
        txn = OnlineTransaction.get_by_id(order_id)
        if not txn:
            raise ValueError(f"Order {order_id} not found")

        notes = "Order delivered"
        if delivery_person:
            notes += f" by {delivery_person}"
        return self.update_order_status(order_id, 'completed', completed_by, notes)

    def cancel_online_order(self, order_id, cancellation_reason, cancelled_by):
        txn = OnlineTransaction.get_by_id(order_id)
        if not txn:
            raise ValueError(f"Order {order_id} not found")
        if txn.order_status not in ('pending', 'confirmed'):
            raise ValueError(
                f"Cannot cancel order in '{txn.order_status}' status."
            )

        # Snapshot items before cancelling (PynamoDB clears them after save in some edge cases)
        items_snapshot = list(txn.items or [])

        txn.cancel_order(reason=cancellation_reason, cancelled_by=cancelled_by)

        # Restore stock to batches for each cancelled item
        for item in items_snapshot:
            pid = getattr(item, 'product_id', None)
            qty = int(getattr(item, 'quantity', 0) or 0)
            if not pid or qty <= 0:
                continue
            try:
                self.batch_service.restore_order_stock(
                    product_id=pid,
                    quantity=qty,
                    reason=f"Cancelled order {order_id}: {cancellation_reason}",
                    adjusted_by=cancelled_by,
                )
                print(f"[STOCK] ✅ Restored {qty} of {pid} after cancel {order_id}")
            except Exception as se:
                print(f"[STOCK] ❌ Stock restore FAILED for {pid} on {order_id}: {se}")
                logger.error(f"Stock restore failed for {pid} on {order_id}: {se}")

        try:
            from app.services.core.audit_service import AuditLogService
            get_singleton(AuditLogService).log_action(
                user_data={'user_id': cancelled_by, 'username': cancelled_by, 'source': 'admin'},
                action='cancel',
                resource_id=order_id,
                resource_type='online_transaction',
                changes={'reason': cancellation_reason},
            )
        except Exception as ae:
            logger.warning(f"Audit logging failed for order cancellation {order_id}: {ae}")

        return _txn_to_dict(OnlineTransaction.get_by_id(order_id))
