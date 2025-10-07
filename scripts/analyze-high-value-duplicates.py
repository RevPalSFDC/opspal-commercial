#!/usr/bin/env python3
"""
Analyze high-value duplicate accounts in Salesloft for manual review
"""

import os
import requests
import json
from datetime import datetime

SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN", "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f")
headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def get_account_details(account_id):
    """Get comprehensive account details"""
    try:
        response = requests.get(
            f"https://api.salesloft.com/v2/accounts/{account_id}",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get('data')
    except:
        pass
    return None

def get_recent_activity(account_id):
    """Get recent activity for an account"""
    try:
        response = requests.get(
            f"https://api.salesloft.com/v2/activities/emails",
            headers=headers,
            params={"account_id": account_id, "per_page": 5},
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get('data', [])
    except:
        pass
    return []

def analyze_high_value_duplicates():
    """Analyze specific high-value duplicate accounts"""

    high_value_duplicates = [
        {
            'domain': 'irvinecompany.com',
            'accounts': [
                {'id': 5594928, 'name': 'Irvine Company', 'people': 517},
                {'id': 18463819, 'name': 'The Irvine Company', 'people': 23}
            ]
        },
        {
            'domain': 'udr.com',
            'accounts': [
                {'id': 8001879, 'name': 'UDR', 'people': 248},
                {'id': 8342358, 'name': 'UDR - Regional - BOS', 'people': 30}
            ]
        },
        {
            'domain': 'kmgprestige.com',
            'accounts': [
                {'id': 5475898, 'name': 'KMG Prestige', 'people': 246},
                {'id': 101114286, 'name': 'KMG Prestige', 'people': 2}
            ]
        },
        {
            'domain': 'pacapts.com',
            'accounts': [
                {'id': 5325445, 'name': 'Preferred Apartment Communities', 'people': 144},
                {'id': 33864131, 'name': 'PAC', 'people': 3}
            ]
        },
        {
            'domain': 'jvmrealty.com',
            'accounts': [
                {'id': 9055248, 'name': 'JVM Realty Corporation', 'people': 93},
                {'id': 26721329, 'name': 'JVM Realty', 'people': 16}
            ]
        }
    ]

    analysis = []

    print("ANALYZING HIGH-VALUE DUPLICATE ACCOUNTS")
    print("="*60)

    for dup_group in high_value_duplicates:
        print(f"\nAnalyzing {dup_group['domain']}...")

        group_analysis = {
            'domain': dup_group['domain'],
            'total_people': sum(acc['people'] for acc in dup_group['accounts']),
            'accounts': []
        }

        for account_info in dup_group['accounts']:
            account = get_account_details(account_info['id'])
            if not account:
                continue

            recent_activity = get_recent_activity(account_info['id'])

            account_analysis = {
                'id': account_info['id'],
                'name': account.get('name'),
                'people_count': account_info['people'],
                'crm_id': account.get('crm_id'),
                'owner': account.get('owner', {}).get('id'),
                'created_at': account.get('created_at'),
                'last_contacted_at': account.get('last_contacted_at'),
                'recent_activity_count': len(recent_activity),
                'custom_fields': {
                    'Customer Stage': account.get('custom_fields', {}).get('Customer Stage'),
                    'Account Executive': account.get('custom_fields', {}).get('Account Executive'),
                    'Active Account': account.get('custom_fields', {}).get('Active Account')
                }
            }

            group_analysis['accounts'].append(account_analysis)

        # Determine recommendation
        if group_analysis['total_people'] > 200:
            group_analysis['recommendation'] = 'HIGH_PRIORITY_MANUAL_REVIEW'
        elif group_analysis['total_people'] > 100:
            group_analysis['recommendation'] = 'MANUAL_REVIEW_REQUIRED'
        else:
            group_analysis['recommendation'] = 'STANDARD_REVIEW'

        # Check for CRM conflicts
        crm_ids = [acc['crm_id'] for acc in group_analysis['accounts'] if acc.get('crm_id')]
        if len(set(crm_ids)) > 1:
            group_analysis['crm_conflict'] = True
            group_analysis['crm_ids'] = crm_ids
        else:
            group_analysis['crm_conflict'] = False

        analysis.append(group_analysis)

    return analysis

def generate_merge_recommendations(analysis):
    """Generate specific merge recommendations"""

    recommendations = []

    for group in analysis:
        rec = {
            'domain': group['domain'],
            'total_people': group['total_people'],
            'priority': 'HIGH' if group['total_people'] > 200 else 'MEDIUM',
            'merge_strategy': None,
            'primary_account': None,
            'action_items': []
        }

        # Sort accounts by creation date
        accounts = sorted(group['accounts'], key=lambda x: x.get('created_at', ''))

        # Determine primary account
        if group['crm_conflict']:
            rec['merge_strategy'] = 'CRM_RECONCILIATION_REQUIRED'
            rec['action_items'].append('Verify correct Salesforce account')
            rec['action_items'].append('Resolve CRM ID conflict before merge')
        else:
            rec['merge_strategy'] = 'STANDARD_MERGE'
            rec['primary_account'] = accounts[0]['id']  # Oldest account

        # Check for active customers
        for account in accounts:
            if account['custom_fields'].get('Customer Stage') == 'Paying Customer':
                rec['action_items'].append(f"⚠️ ACTIVE CUSTOMER: {account['name']} (ID: {account['id']})")
                rec['merge_strategy'] = 'CAREFUL_REVIEW_REQUIRED'

        # Check for recent activity
        for account in accounts:
            if account.get('recent_activity_count', 0) > 0:
                rec['action_items'].append(f"Recent activity on {account['name']}")

        recommendations.append(rec)

    return recommendations

def main():
    print("HIGH-VALUE DUPLICATE ACCOUNT ANALYSIS")
    print("="*60)
    print(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Analyze accounts
    analysis = analyze_high_value_duplicates()

    # Generate recommendations
    recommendations = generate_merge_recommendations(analysis)

    # Display results
    print("\n" + "="*60)
    print("ANALYSIS SUMMARY")
    print("="*60)

    for i, rec in enumerate(recommendations, 1):
        print(f"\n{i}. Domain: {rec['domain']}")
        print(f"   Total People: {rec['total_people']}")
        print(f"   Priority: {rec['priority']}")
        print(f"   Strategy: {rec['merge_strategy']}")

        if rec['primary_account']:
            print(f"   Recommended Primary: Account ID {rec['primary_account']}")

        if rec['action_items']:
            print("   Action Items:")
            for item in rec['action_items']:
                print(f"     - {item}")

    # Save detailed report
    report = {
        'timestamp': datetime.now().isoformat(),
        'analysis': analysis,
        'recommendations': recommendations
    }

    report_file = f"/tmp/high_value_duplicates_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\n📋 Detailed report saved to: {report_file}")

    # Show merge commands
    print("\n" + "="*60)
    print("MERGE COMMANDS (After Manual Review)")
    print("="*60)

    for rec in recommendations:
        if rec['merge_strategy'] == 'STANDARD_MERGE' and rec['primary_account']:
            group = next(g for g in analysis if g['domain'] == rec['domain'])
            duplicate_ids = [acc['id'] for acc in group['accounts'] if acc['id'] != rec['primary_account']]

            if duplicate_ids:
                print(f"\n# {rec['domain']} ({rec['total_people']} people)")
                print(f"python3 scripts/salesloft-account-merger.py \\")
                print(f"  --primary {rec['primary_account']} \\")
                print(f"  --duplicates {' '.join(map(str, duplicate_ids))} \\")
                print(f"  --execute")

if __name__ == "__main__":
    main()