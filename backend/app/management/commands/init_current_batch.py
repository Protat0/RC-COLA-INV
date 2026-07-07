"""
Django Management Command: Initialize current_batch_id
=======================================================
Sets current_batch_id on every product that has active batches,
using the same FEFO sort that BatchService.advance_current_batch uses.

Products with no active batches get the pointer cleared.

Usage:
    python manage.py init_current_batch --dry-run   (safe preview, default)
    python manage.py init_current_batch --live       (writes to DynamoDB)
"""

from django.core.management.base import BaseCommand
from app.utils.singleton import get_singleton
from app.services.inventory.batch_service import BatchService
from models.Product import Product


class Command(BaseCommand):
    help = 'Initialize current_batch_id on all products using FEFO batch order'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=True,
            help='Preview changes without writing to DynamoDB (default)',
        )
        parser.add_argument(
            '--live',
            action='store_true',
            help='Write current_batch_id to DynamoDB',
        )

    def handle(self, *args, **options):
        dry_run = not options['live']

        self.stdout.write('\n' + '=' * 70)
        if dry_run:
            self.stdout.write(self.style.WARNING(
                '⚠️  DRY RUN — no changes will be written'
            ))
            self.stdout.write('   Run with --live to apply.\n')
        else:
            self.stdout.write(self.style.ERROR(
                '🚨 LIVE MODE — this will update DynamoDB!'
            ))
            self.stdout.write('=' * 70)
            answer = input('\nSet current_batch_id on ALL products? (yes/no): ')
            if answer.strip().lower() != 'yes':
                self.stdout.write('Aborted.')
                return
            self.stdout.write('')
        self.stdout.write('=' * 70 + '\n')

        batch_service = get_singleton(BatchService)

        # Load all non-deleted products
        self.stdout.write('Loading products...')
        try:
            products = list(Product.query(
                'products',
                filter_condition=Product.isDeleted == False,
            ))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Failed to load products: {e}'))
            return

        self.stdout.write(f'Found {len(products)} products.\n')

        set_count = 0
        cleared_count = 0
        already_ok = 0
        errors = []

        for i, product in enumerate(products, 1):
            product_id = product.sk
            product_name = product.product_name or product_id
            existing_ptr = getattr(product, 'current_batch_id', None)

            try:
                # Determine what the pointer should be without writing
                from models.Batches import Batch
                from datetime import datetime as _dt

                all_batches = list(Batch.get_by_product_id(product_id, limit=500))
                _USABLE = {'active', 'low_stock', 'expiring_soon'}
                valid = [
                    b for b in all_batches
                    if getattr(b, 'status', None) in _USABLE
                    and int(getattr(b, 'quantity_remaining', 0) or 0) > 0
                    and not b.is_expired()
                ]

                if valid:
                    _far = _dt(9999, 12, 31)
                    _epoch = _dt(1970, 1, 1)
                    valid.sort(key=lambda x: (
                        x.expiry_date if x.expiry_date is not None else _far,
                        x.date_received if x.date_received is not None else _epoch,
                    ))
                    target_batch_id = valid[0].sk
                    target_qty = int(valid[0].quantity_remaining)
                    target_exp = valid[0].expiry_date.date() if valid[0].expiry_date else 'no expiry'
                else:
                    target_batch_id = None
                    target_qty = 0
                    target_exp = '—'

                # Check if pointer already matches
                if existing_ptr == target_batch_id:
                    already_ok += 1
                    continue

                # Report the change
                old_label = existing_ptr or 'none'
                new_label = target_batch_id or 'cleared'
                if target_batch_id:
                    self.stdout.write(
                        f'  [{i}/{len(products)}] {product_name[:35]:<35} '
                        f'{old_label} → {new_label} '
                        f'(qty={target_qty}, exp={target_exp})'
                    )
                    set_count += 1
                else:
                    self.stdout.write(
                        f'  [{i}/{len(products)}] {product_name[:35]:<35} '
                        f'{old_label} → cleared (no active batches)'
                    )
                    cleared_count += 1

                if not dry_run:
                    batch_service._update_product_current_batch(product_id, target_batch_id)

            except Exception as e:
                errors.append({'product_id': product_id, 'error': str(e)})
                self.stderr.write(f'  ❌ {product_id}: {e}')

        # Summary
        self.stdout.write('\n' + '=' * 70)
        verb = 'Would set' if dry_run else 'Set'
        self.stdout.write(f'{verb} pointer on  : {set_count} products')
        self.stdout.write(f'{verb} cleared on  : {cleared_count} products')
        self.stdout.write(f'Already correct : {already_ok} products')
        if errors:
            self.stdout.write(self.style.ERROR(f'Errors          : {len(errors)}'))
            for err in errors[:5]:
                self.stderr.write(f"  - {err['product_id']}: {err['error']}")
        self.stdout.write('=' * 70)

        if dry_run and (set_count + cleared_count) > 0:
            self.stdout.write(self.style.WARNING(
                '\n💡 To apply, run:\n   python manage.py init_current_batch --live'
            ))
        elif not dry_run:
            self.stdout.write(self.style.SUCCESS('\n✅ current_batch_id initialized.'))
