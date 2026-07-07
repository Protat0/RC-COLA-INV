"""
Django Management Command: Diagnose Online Transaction Retrieval
================================================================
Bypasses PynamoDB/GSI entirely and uses raw boto3 to inspect what's
actually stored in DynamoDB for a given customer_id.

Usage:
    python manage.py diagnose_orders --customer CUST-00030
    python manage.py diagnose_orders --all   (show all customer_ids that have orders)
"""

import boto3
from boto3.dynamodb.conditions import Key, Attr
from django.core.management.base import BaseCommand
from app.utils import DYNAMO_TABLE_NAME, AWS_REGION


class Command(BaseCommand):
    help = 'Diagnose online transaction storage and GSI status for a customer'

    def add_arguments(self, parser):
        parser.add_argument('--customer', type=str, help='Customer ID to inspect (e.g. CUST-00030)')
        parser.add_argument('--all', action='store_true', help='List all customer_ids that have orders')
        parser.add_argument('--limit', type=int, default=20, help='Max items to inspect')

    def handle(self, *args, **options):
        client = boto3.client('dynamodb', region_name=AWS_REGION)
        resource = boto3.resource('dynamodb', region_name=AWS_REGION)
        table = resource.Table(DYNAMO_TABLE_NAME)

        self.stdout.write(f'\nTable : {DYNAMO_TABLE_NAME}')
        self.stdout.write(f'Region: {AWS_REGION}\n')

        # ── 1. List all online_transaction items via table query ──────────
        self.stdout.write('=' * 70)
        self.stdout.write('STEP 1: Table query — PK = "online_transactions"')
        self.stdout.write('=' * 70)
        try:
            resp = table.query(
                KeyConditionExpression=Key('PK').eq('online_transactions'),
                ScanIndexForward=False,  # newest first
                Limit=options['limit'],
            )
            items = resp.get('Items', [])
            self.stdout.write(f'Found {len(items)} item(s) (up to limit={options["limit"]})\n')
            for item in items:
                sk = item.get('SK', '?')
                cid = item.get('customer_id', '[MISSING]')
                status = item.get('order_status', '?')
                cat = item.get('created_at', '[MISSING]')
                self.stdout.write(f'  SK={sk}  customer_id={cid}  status={status}  created_at={cat}')
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Table query FAILED: {e}'))
            items = []

        # ── 2. Check GSI existence ────────────────────────────────────────
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write('STEP 2: Check GSI "online-transaction-customer-id-index"')
        self.stdout.write('=' * 70)
        try:
            desc = client.describe_table(TableName=DYNAMO_TABLE_NAME)
            gsis = desc['Table'].get('GlobalSecondaryIndexes', [])
            gsi_names = [g['IndexName'] for g in gsis]
            target = 'online-transaction-customer-id-index'
            if target in gsi_names:
                for g in gsis:
                    if g['IndexName'] == target:
                        self.stdout.write(self.style.SUCCESS(f'GSI EXISTS: {target}'))
                        self.stdout.write(f'  Status: {g.get("IndexStatus", "?")}')
                        self.stdout.write(f'  Keys  : {g.get("KeySchema", [])}')
            else:
                self.stdout.write(self.style.ERROR(f'GSI NOT FOUND: {target}'))
                self.stdout.write(f'  Available GSIs: {gsi_names}')
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'describe_table FAILED: {e}'))

        # ── 3. Per-customer query ─────────────────────────────────────────
        customer_id = options.get('customer')
        if customer_id:
            self.stdout.write('\n' + '=' * 70)
            self.stdout.write(f'STEP 3: GSI query for customer_id = "{customer_id}"')
            self.stdout.write('=' * 70)
            try:
                resp = table.query(
                    IndexName='online-transaction-customer-id-index',
                    KeyConditionExpression=Key('customer_id').eq(customer_id),
                )
                gsi_items = resp.get('Items', [])
                self.stdout.write(f'GSI returned {len(gsi_items)} order(s)\n')
                for item in gsi_items:
                    self.stdout.write(f'  SK={item.get("SK")}  status={item.get("order_status")}  created_at={item.get("created_at")}')
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'GSI query FAILED: {e}'))

            self.stdout.write('\n' + '-' * 70)
            self.stdout.write(f'STEP 4: Python-filter from table query for customer_id = "{customer_id}"')
            self.stdout.write('-' * 70)
            matched = [i for i in items if i.get('customer_id') == customer_id]
            self.stdout.write(f'Table-query items matching customer: {len(matched)}')
            for item in matched:
                self.stdout.write(f'  SK={item.get("SK")}  status={item.get("order_status")}  created_at={item.get("created_at")}')
            if not matched and items:
                self.stdout.write('\n  Customer IDs found in the table:')
                seen = {}
                for item in items:
                    cid = item.get('customer_id', '[MISSING]')
                    seen[cid] = seen.get(cid, 0) + 1
                for cid, count in seen.items():
                    self.stdout.write(f'    {cid} ({count} order(s))')

        if options.get('all') and items:
            self.stdout.write('\n' + '=' * 70)
            self.stdout.write('All customer_ids with orders:')
            self.stdout.write('=' * 70)
            seen = {}
            for item in items:
                cid = item.get('customer_id', '[MISSING]')
                seen[cid] = seen.get(cid, 0) + 1
            for cid, count in sorted(seen.items()):
                self.stdout.write(f'  {cid}: {count} order(s)')

        self.stdout.write('\n' + '=' * 70)
