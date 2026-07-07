"""
Django management command to backfill permanent QR codes for all existing customers.

Usage:
    python manage.py generate_customer_qr_codes
    python manage.py generate_customer_qr_codes --dry-run

Run AFTER add_customer_qr_gsi.py and after the GSI is ACTIVE.
Customers that already have a qr_code are skipped.
"""
import uuid
from django.core.management.base import BaseCommand
import boto3
from decouple import config


class Command(BaseCommand):
    help = 'Generate permanent QR codes for all customers that do not have one yet'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be updated without writing to DynamoDB',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        self.stdout.write('=' * 60)
        self.stdout.write('GENERATE PERMANENT CUSTOMER QR CODES')
        if dry_run:
            self.stdout.write(self.style.WARNING('  DRY RUN — no writes will occur'))
        self.stdout.write('=' * 60)

        table_name = config('DYNAMO_TABLE_NAME', default='RamyeonCornerDB')
        region     = config('AWS_REGION_NAME', default='ap-southeast-1')

        dynamodb = boto3.resource(
            'dynamodb',
            region_name=region,
            aws_access_key_id=config('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=config('AWS_SECRET_ACCESS_KEY'),
        )
        table = dynamodb.Table(table_name)

        self.stdout.write(f'Connected to table: {table_name}')

        # Page through all customer records (PK = "customers")
        all_customers = []
        kwargs = {
            'KeyConditionExpression': boto3.dynamodb.conditions.Key('PK').eq('customers'),
        }

        while True:
            response = table.query(**kwargs)
            all_customers.extend(response.get('Items', []))
            last_key = response.get('LastEvaluatedKey')
            if not last_key:
                break
            kwargs['ExclusiveStartKey'] = last_key

        total     = len(all_customers)
        updated   = 0
        skipped   = 0
        errors    = 0

        self.stdout.write(f'Found {total} customer records\n')

        for item in all_customers:
            sk = item.get('SK', 'unknown')

            if item.get('isDeleted'):
                self.stdout.write(f'  {sk}: deleted — skipping')
                skipped += 1
                continue

            if item.get('qr_code'):
                self.stdout.write(f'  {sk}: already has QR code — skipping')
                skipped += 1
                continue

            new_code = str(uuid.uuid4())

            if dry_run:
                self.stdout.write(
                    self.style.WARNING(f'  {sk}: would assign qr_code={new_code}')
                )
                updated += 1
                continue

            try:
                table.update_item(
                    Key={'PK': 'customers', 'SK': sk},
                    UpdateExpression='SET qr_code = :code',
                    ConditionExpression='attribute_not_exists(qr_code)',
                    ExpressionAttributeValues={':code': new_code},
                )
                self.stdout.write(self.style.SUCCESS(f'  ✓ {sk}: qr_code={new_code}'))
                updated += 1
            except table.meta.client.exceptions.ConditionalCheckFailedException:
                # Another process wrote qr_code between our read and write — safe to skip
                self.stdout.write(f'  {sk}: qr_code set by concurrent process — skipping')
                skipped += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗ {sk}: {e}'))
                errors += 1

        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('COMPLETE'))
        self.stdout.write(f'  Total:   {total}')
        self.stdout.write(f'  Updated: {updated}')
        self.stdout.write(f'  Skipped: {skipped}')
        if errors:
            self.stdout.write(self.style.ERROR(f'  Errors:  {errors}'))
        self.stdout.write('=' * 60)
