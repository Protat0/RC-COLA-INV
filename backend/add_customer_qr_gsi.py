"""
Add the customer-qr-code-index GSI to the DynamoDB table.

Usage:
    python add_customer_qr_gsi.py

Run this ONCE against your live table before deploying the permanent QR feature.
Index creation is asynchronous — wait for it to become ACTIVE in the AWS Console
(DynamoDB → Tables → RamyeonCornerDB → Indexes) before running generate_customer_qr_codes.
"""
import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

TABLE_NAME = os.getenv('DYNAMO_TABLE_NAME', 'RamyeonCornerDB')
AWS_REGION  = os.getenv('AWS_REGION_NAME') or os.getenv('AWS_REGION', 'ap-southeast-1')
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')

client_kwargs = {'region_name': AWS_REGION}
if AWS_ACCESS_KEY and AWS_SECRET_KEY:
    client_kwargs.update({
        'aws_access_key_id': AWS_ACCESS_KEY,
        'aws_secret_access_key': AWS_SECRET_KEY,
    })

client = boto3.client('dynamodb', **client_kwargs)
INDEX_NAME = 'customer-qr-code-index'


def get_existing_indexes():
    response = client.describe_table(TableName=TABLE_NAME)
    return {idx['IndexName'] for idx in response['Table'].get('GlobalSecondaryIndexes', [])}


def add_qr_index():
    print(f"Checking table '{TABLE_NAME}'...")
    try:
        existing = get_existing_indexes()
    except ClientError as e:
        print(f"❌ Could not describe table: {e}")
        return

    print(f"Existing indexes: {existing}")

    if INDEX_NAME in existing:
        print(f"✅ '{INDEX_NAME}' already exists — nothing to do.")
        return

    print(f"🔄 Creating '{INDEX_NAME}'...")
    try:
        client.update_table(
            TableName=TABLE_NAME,
            AttributeDefinitions=[
                {'AttributeName': 'qr_code', 'AttributeType': 'S'},
                {'AttributeName': 'SK',      'AttributeType': 'S'},
            ],
            GlobalSecondaryIndexUpdates=[
                {
                    'Create': {
                        'IndexName': INDEX_NAME,
                        'KeySchema': [
                            {'AttributeName': 'qr_code', 'KeyType': 'HASH'},
                            {'AttributeName': 'SK',      'KeyType': 'RANGE'},
                        ],
                        'Projection': {'ProjectionType': 'ALL'},
                    }
                }
            ],
        )
        print(f"✅ GSI creation initiated.")
        print()
        print("Index creation is asynchronous and typically takes 1–5 minutes.")
        print("Monitor status: AWS Console → DynamoDB → Tables → RamyeonCornerDB → Indexes")
        print("Once ACTIVE, run:  python manage.py generate_customer_qr_codes")
    except ClientError as e:
        print(f"❌ Error: {e}")


if __name__ == '__main__':
    add_qr_index()
