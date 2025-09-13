#!/usr/bin/env python3
"""
Analyze ENTITY_IS_DELETED and JSON_PARSER_ERROR issues in Salesloft/Salesforce sync
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
import time
from collections import defaultdict
import re

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-entity-error-analyzer/1.0"
}

def api_request(endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Make API request with retry logic"""
    url = f"{BASE_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 2))
                print(f"Rate limited, waiting {retry_after} seconds...")
                time.sleep(retry_after)
                continue
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return {"error": str(e)}
            time.sleep(2 ** attempt)
    
    return {}

def analyze_entity_errors():
    """Search for entity deletion and JSON parsing errors"""
    
    print("\n=== Searching for Entity Deletion and JSON Errors ===")
    
    # Track different error types
    error_patterns = {
        "ENTITY_IS_DELETED": [],
        "JSON_PARSER_ERROR": [],
        "INVALID_FIELD": [],
        "REQUIRED_FIELD_MISSING": [],
        "DUPLICATE_VALUE": [],
        "OTHER": []
    }
    
    # Date range - last 30 days to catch more patterns
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=30)
    
    # Check CRM activities for errors
    print("\n=== Checking CRM Activities ===")
    
    page = 1
    total_errors = 0
    
    while page <= 20:
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,
            "page": page,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/crm_activities", params)
        activities = result.get("data", [])
        
        if not activities:
            break
        
        print(f"Processing page {page}: {len(activities)} activities")
        
        for activity in activities:
            error_msg = activity.get("error", "")
            
            if error_msg:
                total_errors += 1
                
                # Categorize error
                if "ENTITY_IS_DELETED" in error_msg:
                    error_patterns["ENTITY_IS_DELETED"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg,
                        "crm_id": activity.get("crm_id"),
                        "subject": activity.get("subject", "")[:50],
                        "custom_fields": activity.get("custom_crm_fields", {})
                    })
                elif "JSON_PARSER_ERROR" in error_msg:
                    error_patterns["JSON_PARSER_ERROR"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg,
                        "subject": activity.get("subject", "")[:50],
                        "custom_fields": activity.get("custom_crm_fields", {})
                    })
                elif "INVALID_FIELD" in error_msg:
                    error_patterns["INVALID_FIELD"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg,
                        "subject": activity.get("subject", "")[:50]
                    })
                elif "REQUIRED_FIELD_MISSING" in error_msg:
                    error_patterns["REQUIRED_FIELD_MISSING"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg,
                        "subject": activity.get("subject", "")[:50]
                    })
                elif "DUPLICATE_VALUE" in error_msg:
                    error_patterns["DUPLICATE_VALUE"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg,
                        "subject": activity.get("subject", "")[:50]
                    })
                elif "Not connected to your CRM" not in error_msg:  # Skip the connection errors we already analyzed
                    error_patterns["OTHER"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error_msg[:200],  # First 200 chars
                        "subject": activity.get("subject", "")[:50]
                    })
        
        page += 1
        time.sleep(0.1)
    
    print(f"\nTotal errors found: {total_errors}")
    
    # Also check for deleted records in People
    print("\n=== Checking for Deleted People Records ===")
    
    deleted_people = []
    params = {
        "updated_at[gte]": start_date.isoformat(),
        "per_page": 100,
        "page": 1,
        "include_deleted": "true"  # Try to include deleted records
    }
    
    result = api_request("/people", params)
    people = result.get("data", [])
    
    for person in people:
        # Check if person has CRM issues
        if person.get("do_not_contact") or not person.get("crm_id"):
            if person.get("crm_id"):
                deleted_people.append({
                    "id": person.get("id"),
                    "name": person.get("display_name"),
                    "email": person.get("email_address"),
                    "crm_id": person.get("crm_id"),
                    "crm_url": person.get("crm_url"),
                    "updated_at": person.get("updated_at"),
                    "do_not_contact": person.get("do_not_contact")
                })
    
    return error_patterns, deleted_people

def analyze_error_details(error_patterns):
    """Analyze error patterns to understand root causes"""
    
    analysis = {}
    
    # Analyze ENTITY_IS_DELETED errors
    if error_patterns["ENTITY_IS_DELETED"]:
        print("\n=== ENTITY_IS_DELETED Analysis ===")
        
        # Extract Salesforce IDs from errors
        sf_ids = []
        for error in error_patterns["ENTITY_IS_DELETED"]:
            # Look for Salesforce ID pattern (18 character alphanumeric)
            crm_id = error.get("crm_id", "")
            if crm_id and len(crm_id) >= 15:
                sf_ids.append(crm_id)
        
        # Group by date to see deletion patterns
        deletions_by_date = defaultdict(list)
        for error in error_patterns["ENTITY_IS_DELETED"]:
            date = error["created_at"].split("T")[0] if error.get("created_at") else "Unknown"
            deletions_by_date[date].append(error)
        
        analysis["entity_deleted"] = {
            "total_count": len(error_patterns["ENTITY_IS_DELETED"]),
            "salesforce_ids": sf_ids[:10],  # Sample of IDs
            "by_date": {date: len(errors) for date, errors in deletions_by_date.items()},
            "sample_errors": error_patterns["ENTITY_IS_DELETED"][:5]
        }
    
    # Analyze JSON_PARSER_ERROR
    if error_patterns["JSON_PARSER_ERROR"]:
        print("\n=== JSON_PARSER_ERROR Analysis ===")
        
        # Extract field names and values from error messages
        field_issues = []
        for error in error_patterns["JSON_PARSER_ERROR"]:
            error_msg = error.get("error", "")
            
            # Look for boolean conversion issues
            if "boolean from VALUE_STRING" in error_msg:
                # Extract the problematic value
                import re
                match = re.search(r"value (\w+)", error_msg)
                if match:
                    field_issues.append({
                        "type": "Boolean conversion",
                        "value": match.group(1),
                        "error": error_msg
                    })
        
        analysis["json_parser"] = {
            "total_count": len(error_patterns["JSON_PARSER_ERROR"]),
            "field_issues": field_issues,
            "sample_errors": error_patterns["JSON_PARSER_ERROR"][:5]
        }
    
    return analysis

def generate_remediation_plan(error_patterns, analysis):
    """Generate specific remediation steps for each error type"""
    
    remediation = []
    
    # ENTITY_IS_DELETED remediation
    if error_patterns["ENTITY_IS_DELETED"]:
        remediation.append({
            "error_type": "ENTITY_IS_DELETED",
            "severity": "HIGH",
            "count": len(error_patterns["ENTITY_IS_DELETED"]),
            "description": "Activities are trying to sync to deleted Salesforce records",
            "root_causes": [
                "Records were deleted in Salesforce but Salesloft still references them",
                "Merge operations in Salesforce that consolidated records",
                "Data cleanup that removed old records",
                "Permission changes that made records inaccessible"
            ],
            "immediate_actions": [
                "Identify all deleted record IDs in Salesforce",
                "Check Salesforce Recycle Bin for recently deleted records",
                "Verify if records were merged (check for master record IDs)",
                "Update Salesloft to remove references to deleted records"
            ],
            "preventive_measures": [
                "Implement soft delete handling in sync process",
                "Set up alerts for Salesforce record deletions",
                "Create mapping table for merged records",
                "Regular audit of record references"
            ]
        })
    
    # JSON_PARSER_ERROR remediation
    if error_patterns["JSON_PARSER_ERROR"]:
        remediation.append({
            "error_type": "JSON_PARSER_ERROR",
            "severity": "MEDIUM",
            "count": len(error_patterns["JSON_PARSER_ERROR"]),
            "description": "Data type mismatches between Salesloft and Salesforce",
            "root_causes": [
                "Boolean fields receiving string values ('False' instead of false)",
                "Date fields with incorrect format",
                "Number fields receiving text values",
                "Required fields missing from payload"
            ],
            "immediate_actions": [
                "Review field mappings for data type consistency",
                "Update boolean field handling (convert 'False'/'True' strings to boolean)",
                "Validate all required fields are mapped",
                "Check for recent Salesforce field type changes"
            ],
            "preventive_measures": [
                "Add data type validation before sync",
                "Implement type conversion layer",
                "Document all field mappings with expected types",
                "Set up monitoring for field type changes"
            ]
        })
    
    # Other field errors
    if error_patterns["INVALID_FIELD"]:
        remediation.append({
            "error_type": "INVALID_FIELD",
            "severity": "MEDIUM",
            "count": len(error_patterns["INVALID_FIELD"]),
            "description": "Fields referenced don't exist or aren't accessible",
            "immediate_actions": [
                "Verify field API names in Salesforce",
                "Check field-level security settings",
                "Review recent Salesforce deployments for field changes"
            ]
        })
    
    return remediation

def main():
    print("\n" + "="*80)
    print("ENTITY DELETION AND DATA TYPE ERROR ANALYSIS")
    print("="*80)
    
    # Analyze errors
    error_patterns, deleted_people = analyze_entity_errors()
    
    # Detailed analysis
    analysis = analyze_error_details(error_patterns)
    
    # Generate remediation plan
    remediation = generate_remediation_plan(error_patterns, analysis)
    
    # Report results
    print("\n" + "="*80)
    print("ERROR SUMMARY")
    print("="*80)
    
    for error_type, errors in error_patterns.items():
        if errors:
            print(f"\n{error_type}: {len(errors)} occurrences")
            
            if error_type == "ENTITY_IS_DELETED" and errors:
                print("  Sample deleted entities:")
                for error in errors[:3]:
                    print(f"    - {error['type']} (ID: {error.get('crm_id', 'Unknown')})")
                    print(f"      Created: {error['created_at']}")
                    print(f"      Subject: {error['subject']}")
            
            elif error_type == "JSON_PARSER_ERROR" and errors:
                print("  Sample parsing errors:")
                for error in errors[:3]:
                    print(f"    - {error['type']} activity")
                    print(f"      Error: {error['error'][:100]}...")
    
    if deleted_people:
        print(f"\n⚠️  Found {len(deleted_people)} people with potential CRM sync issues")
    
    # Print remediation plan
    print("\n" + "="*80)
    print("REMEDIATION PLAN")
    print("="*80)
    
    for plan in remediation:
        print(f"\n[{plan['severity']}] {plan['error_type']} ({plan['count']} errors)")
        print(f"Description: {plan['description']}")
        
        print("\nRoot Causes:")
        for cause in plan.get("root_causes", []):
            print(f"  • {cause}")
        
        print("\nImmediate Actions:")
        for action in plan.get("immediate_actions", []):
            print(f"  ✓ {action}")
        
        print("\nPreventive Measures:")
        for measure in plan.get("preventive_measures", []):
            print(f"  → {measure}")
    
    # Save detailed report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error_summary": {error_type: len(errors) for error_type, errors in error_patterns.items() if errors},
        "analysis": analysis,
        "remediation_plan": remediation,
        "sample_errors": {
            error_type: errors[:10] 
            for error_type, errors in error_patterns.items() 
            if errors
        },
        "deleted_people": deleted_people[:20]
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/entity_error_analysis.json"
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: {output_file}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)