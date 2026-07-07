"""
Django management command to fix branch_id stored as Number instead of String.

Some legacy DynamoDB records in session_logs and audit_logs have branch_id
stored as type N (Number) instead of S (String). PynamoDB's UnicodeAttribute
cannot deserialise them and _safe_query logs a warning per bad record on every
GET /combined-logs/ request.

Usage:
    python manage.py fix_session_branch_id          # dry-run — list bad records
    python manage.py fix_session_branch_id --apply  # convert N -> S in DynamoDB
"""
from decimal import Decimal

import boto3
from decouple import config
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Fix branch_id stored as DynamoDB Number type (N) instead of String (S)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply fixes. Without this flag the command is a dry-run.',
        )

    def handle(self, *args, **options):
        dry_run = not options['apply']
        table_name = config('DYNAMO_TABLE_NAME', default='RamyeonCornerDB')
        region = config('AWS_REGION_NAME', default='ap-southeast-1')

        self.stdout.write('=' * 60)
        self.stdout.write('FIX branch_id TYPE  (Number -> String)')
        self.stdout.write('=' * 60)
        if dry_run:
            self.stdout.write('[DRY RUN] No changes will be written.')
        else:
            self.stdout.write('[APPLY] Bad records will be updated.')
        self.stdout.write('')

        dynamodb = boto3.resource(
            'dynamodb',
            region_name=region,
            aws_access_key_id=config('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=config('AWS_SECRET_ACCESS_KEY'),
        )
        table = dynamodb.Table(table_name)
        self.stdout.write(f'Connected to table: {table_name}')

        total_found = 0
        total_fixed = 0

        for partition_key in ('session_logs', 'audit_logs'):
            self.stdout.write(f'\nScanning PK="{partition_key}" ...')
            bad_records = self._find_bad_records(table, partition_key)

            if not bad_records:
                self.stdout.write(f'  No bad records found in {partition_key}.')
                continue

            self.stdout.write(f'  Found {len(bad_records)} record(s) with numeric branch_id:')
            for item in bad_records:
                sk = item.get('SK', '?')
                raw = item.get('branch_id')
                self.stdout.write(f'    {partition_key} / {sk}  branch_id={raw!r}')

            total_found += len(bad_records)

            if not dry_run:
                fixed = self._fix_records(table, partition_key, bad_records)
                total_fixed += fixed
                self.stdout.write(f'  Fixed {fixed} record(s).')

        self.stdout.write('')
        self.stdout.write(f'Total bad records found : {total_found}')
        if not dry_run:
            self.stdout.write(f'Total records fixed     : {total_fixed}')
        else:
            self.stdout.write('Run with --apply to fix them.')

    # ------------------------------------------------------------------

    def _find_bad_records(self, table, partition_key):
        """Return all items in the partition whose branch_id is a Decimal (was stored as N)."""
        bad = []
        kwargs = {
            'KeyConditionExpression': 'PK = :pk',
            'ExpressionAttributeValues': {':pk': partition_key},
        }
        while True:
            response = table.query(**kwargs)
            for item in response.get('Items', []):
                bid = item.get('branch_id')
                if isinstance(bid, Decimal):
                    bad.append(item)
            last_key = response.get('LastEvaluatedKey')
            if not last_key:
                break
            kwargs['ExclusiveStartKey'] = last_key
        return bad

    def _fix_records(self, table, partition_key, bad_records):
        """Convert branch_id from Decimal to str for each bad record."""
        fixed = 0
        for item in bad_records:
            sk = item.get('SK')
            raw = item.get('branch_id')
            new_value = str(int(raw)) if raw == int(raw) else str(raw)
            try:
                table.update_item(
                    Key={'PK': partition_key, 'SK': sk},
                    UpdateExpression='SET branch_id = :bid',
                    ExpressionAttributeValues={':bid': new_value},
                )
                fixed += 1
            except Exception as e:
                self.stderr.write(f'  ERROR updating {partition_key}/{sk}: {e}')
        return fixed
