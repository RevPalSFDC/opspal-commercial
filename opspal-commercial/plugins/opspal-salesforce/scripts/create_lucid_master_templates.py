import os
import requests
from dotenv import load_dotenv


from pathlib import Path


import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root

PROJECT_ROOT = resolve_project_root()

# Load environment variables
load_dotenv(PROJECT_ROOT / ".env")

LUCID_API_TOKEN = os.getenv('LUCID_API_TOKEN')
LUCID_API_BASE_URL = os.getenv('LUCID_API_BASE_URL')
LUCID_DEFAULT_PRODUCT = os.getenv('LUCID_DEFAULT_PRODUCT')

def create_master_template(title, description, product=LUCID_DEFAULT_PRODUCT):
    headers = {
        'Authorization': f'Bearer {LUCID_API_TOKEN}',
        'Content-Type': 'application/json'
    }

    payload = {
        'title': title,
        'description': description,
        'product': product,
        'tags': ['master-template']
    }

    response = requests.post(f'{LUCID_API_BASE_URL}/documents', json=payload, headers=headers)

    if response.status_code == 200 or response.status_code == 201:
        result = response.json()
        return {
            'docId': result.get('id'),
            'editUrl': result.get('editUrl')
        }
    else:
        print(f"Error creating template {title}: {response.text}")
        return None

def main():
    master_templates = [
        {
            'title': '[MASTER] Salesforce Architecture Template',
            'description': 'Master template for Salesforce system architecture with layers for Presentation, Business Logic, Data, and Integration',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Data Flow Template',
            'description': 'Master template for system boundaries including Source, ETL, and Target',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Process Swimlane Template',
            'description': 'Master template with 5 swimlanes: Customer, Sales Rep, Manager, System, Support',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Entity Relationship Diagram Template',
            'description': 'Master template showing entities: Account, Contact, Opportunity with relationships',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Product Roadmap Template',
            'description': 'Master template with timeline Q1-Q4 2025, phases and milestones',
            'product': 'lucidspark'
        },
        {
            'title': '[MASTER] Account Hierarchy Template',
            'description': 'Master template showing hierarchy levels: Global, Domestic, Parent, Child',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Contact Organization Chart Template',
            'description': 'Master template with org levels: CEO, C-Suite, Directors, Managers',
            'product': 'lucidchart'
        },
        {
            'title': '[MASTER] Opportunity Pipeline Template',
            'description': 'Master template showing Opportunity stages from Prospecting to Closed',
            'product': 'lucidchart'
        }
    ]

    results = []
    for template in master_templates:
        result = create_master_template(template['title'], template['description'], template.get('product'))
        if result:
            result['title'] = template['title']
            results.append(result)

    print("Master Templates Creation Results:")
    for result in results:
        print(f"{result['title']}:")
        print(f"  Document ID: {result['docId']}")
        print(f"  Edit URL: {result['editUrl']}\n")

if __name__ == '__main__':
    main()