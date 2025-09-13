#!/usr/bin/env python3
"""
Comprehensive catalog of all JSON_PARSER_ERROR instances from the past 14 days
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
    "User-Agent": "salesloft-json-error-cataloger/1.0"
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

def parse_json_error(error_msg: str) -> Dict:
    """Parse JSON_PARSER_ERROR message to extract details"""
    
    parsed = {
        "raw_error": error_msg,
        "error_type": None,
        "field_name": None,
        "field_value": None,
        "expected_type": None,
        "actual_type": None,
        "line_column": None
    }
    
    # Pattern 1: Cannot deserialize instance of X from Y
    deserialize_pattern = r"Cannot deserialize instance of (\w+) from (\w+) value ([^\s]+)"
    match = re.search(deserialize_pattern, error_msg)
    if match:
        parsed["error_type"] = "Type Mismatch"
        parsed["expected_type"] = match.group(1)
        parsed["actual_type"] = match.group(2)
        parsed["field_value"] = match.group(3)
    
    # Pattern 2: Missing required field
    missing_field_pattern = r"missing a required field at \[line:(\d+), column:(\d+)\]"
    match = re.search(missing_field_pattern, error_msg)
    if match:
        parsed["error_type"] = "Missing Required Field"
        parsed["line_column"] = f"line:{match.group(1)}, column:{match.group(2)}"
    
    # Pattern 3: Field name extraction
    field_pattern = r"field[:\s]+['\"]?(\w+)['\"]?"
    match = re.search(field_pattern, error_msg, re.IGNORECASE)
    if match:
        parsed["field_name"] = match.group(1)
    
    # Pattern 4: Invalid value for type
    invalid_value_pattern = r"value[:\s]+['\"]?([^'\"]+)['\"]?"
    match = re.search(invalid_value_pattern, error_msg, re.IGNORECASE)
    if match and not parsed["field_value"]:
        parsed["field_value"] = match.group(1)
    
    return parsed

def catalog_json_errors():
    """Catalog all JSON_PARSER_ERROR instances from past 14 days"""
    
    print("\n=== Cataloging JSON_PARSER_ERROR Instances (Past 14 Days) ===")
    
    # Date range - last 14 days
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=14)
    
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    
    json_errors = []
    error_patterns = defaultdict(list)
    error_by_date = defaultdict(int)
    error_by_user = defaultdict(list)
    field_errors = defaultdict(list)
    
    # Check CRM activities
    print("\n=== Scanning CRM Activities ===")
    
    page = 1
    total_scanned = 0
    
    while page <= 50:  # Extended to scan more pages for 14 days
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
        
        print(f"Page {page}: Scanning {len(activities)} activities")
        total_scanned += len(activities)
        
        for activity in activities:
            error_msg = activity.get("error")
            
            if error_msg and "JSON_PARSER_ERROR" in error_msg:
                # Parse the error
                parsed_error = parse_json_error(error_msg)
                
                # Collect full error details
                error_detail = {
                    "id": activity.get("id"),
                    "type": activity.get("activity_type"),
                    "created_at": activity.get("created_at"),
                    "error": error_msg,
                    "parsed": parsed_error,
                    "subject": activity.get("subject", "")[:100],
                    "custom_fields": activity.get("custom_crm_fields", {}),
                    "user": None,
                    "to_address": None,
                    "from_address": None
                }
                
                # Extract user information from custom fields
                cf = activity.get("custom_crm_fields", {})
                if cf.get("from_name"):
                    error_detail["user"] = cf.get("from_name")
                    error_by_user[cf.get("from_name")].append(error_detail)
                if cf.get("from_address"):
                    error_detail["from_address"] = cf.get("from_address")
                if cf.get("to_address"):
                    error_detail["to_address"] = cf.get("to_address")
                
                json_errors.append(error_detail)
                
                # Categorize by pattern
                if parsed_error["error_type"]:
                    error_patterns[parsed_error["error_type"]].append(error_detail)
                
                # Track by date
                date_str = activity.get("created_at", "").split("T")[0]
                error_by_date[date_str] += 1
                
                # Track field-specific errors
                if parsed_error["field_name"]:
                    field_errors[parsed_error["field_name"]].append({
                        "value": parsed_error["field_value"],
                        "expected": parsed_error["expected_type"],
                        "actual": parsed_error["actual_type"],
                        "date": activity.get("created_at")
                    })
        
        page += 1
        time.sleep(0.1)
        
        # Stop if we've gone back far enough (no more data)
        if len(activities) < 100:
            break
    
    print(f"\nTotal activities scanned: {total_scanned}")
    print(f"JSON_PARSER_ERROR instances found: {len(json_errors)}")
    
    return json_errors, error_patterns, error_by_date, error_by_user, field_errors

def analyze_patterns(json_errors, error_patterns, field_errors):
    """Analyze patterns in JSON parser errors"""
    
    analysis = {
        "total_errors": len(json_errors),
        "unique_error_messages": len(set(e["error"] for e in json_errors)),
        "error_types": {},
        "common_fields": {},
        "common_values": {},
        "recommendations": []
    }
    
    # Analyze by error type
    for error_type, errors in error_patterns.items():
        analysis["error_types"][error_type] = {
            "count": len(errors),
            "percentage": (len(errors) / len(json_errors) * 100) if json_errors else 0
        }
    
    # Analyze field-specific issues
    for field_name, errors in field_errors.items():
        unique_values = set(e["value"] for e in errors if e["value"])
        analysis["common_fields"][field_name] = {
            "error_count": len(errors),
            "unique_values": list(unique_values)[:10],  # Top 10 problematic values
            "types_expected": set(e["expected"] for e in errors if e["expected"]),
            "types_received": set(e["actual"] for e in errors if e["actual"])
        }
    
    # Find most common problematic values
    value_counts = defaultdict(int)
    for error in json_errors:
        if error["parsed"]["field_value"]:
            value_counts[error["parsed"]["field_value"]] += 1
    
    analysis["common_values"] = dict(sorted(value_counts.items(), key=lambda x: x[1], reverse=True)[:10])
    
    # Generate recommendations based on patterns
    if "Type Mismatch" in error_patterns:
        analysis["recommendations"].append({
            "issue": "Type Mismatch Errors",
            "description": "Fields are receiving wrong data types",
            "solution": "Implement type conversion before sending to Salesforce",
            "specific_actions": [
                "Convert string 'False'/'True' to boolean false/true",
                "Ensure numeric fields receive numbers, not strings",
                "Validate date formats match Salesforce expectations"
            ]
        })
    
    if "Missing Required Field" in error_patterns:
        analysis["recommendations"].append({
            "issue": "Missing Required Fields",
            "description": "Required fields are not being populated",
            "solution": "Review field mappings and ensure all required fields are mapped",
            "specific_actions": [
                "Identify all required fields in Salesforce",
                "Map corresponding Salesloft fields",
                "Add validation to prevent sync without required data"
            ]
        })
    
    return analysis

def generate_report(json_errors, error_patterns, error_by_date, error_by_user, field_errors, analysis):
    """Generate comprehensive report"""
    
    print("\n" + "="*80)
    print("JSON_PARSER_ERROR CATALOG REPORT")
    print("="*80)
    
    print(f"\n📊 Summary:")
    print(f"  Total JSON Parser Errors: {len(json_errors)}")
    print(f"  Unique Error Messages: {analysis['unique_error_messages']}")
    print(f"  Date Range: Past 14 days")
    
    if error_by_date:
        print(f"\n📅 Errors by Date:")
        for date in sorted(error_by_date.keys(), reverse=True)[:7]:  # Last 7 days
            print(f"  {date}: {error_by_date[date]} errors")
    
    if analysis["error_types"]:
        print(f"\n🔍 Error Types:")
        for error_type, stats in analysis["error_types"].items():
            print(f"  {error_type}: {stats['count']} ({stats['percentage']:.1f}%)")
    
    if analysis["common_fields"]:
        print(f"\n⚠️  Problematic Fields:")
        for field_name, details in list(analysis["common_fields"].items())[:5]:
            print(f"\n  Field: {field_name}")
            print(f"    Errors: {details['error_count']}")
            if details["types_expected"]:
                print(f"    Expected types: {', '.join(details['types_expected'])}")
            if details["types_received"]:
                print(f"    Received types: {', '.join(details['types_received'])}")
            if details["unique_values"]:
                print(f"    Sample values: {', '.join(str(v) for v in details['unique_values'][:3])}")
    
    if analysis["common_values"]:
        print(f"\n🔢 Most Common Problematic Values:")
        for value, count in list(analysis["common_values"].items())[:5]:
            print(f"  '{value}': {count} occurrences")
    
    if error_by_user:
        print(f"\n👥 Errors by User:")
        user_counts = {user: len(errors) for user, errors in error_by_user.items()}
        for user, count in sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {user}: {count} errors")
    
    # Sample errors
    if json_errors:
        print(f"\n📝 Sample JSON Parser Errors:")
        for error in json_errors[:3]:
            print(f"\n  ID: {error['id']}")
            print(f"  Type: {error['type']}")
            print(f"  Created: {error['created_at']}")
            print(f"  Error: {error['error'][:150]}...")
            if error['parsed']['error_type']:
                print(f"  Parsed Type: {error['parsed']['error_type']}")
                if error['parsed']['field_name']:
                    print(f"  Field: {error['parsed']['field_name']}")
                if error['parsed']['field_value']:
                    print(f"  Value: {error['parsed']['field_value']}")
    
    # Recommendations
    if analysis["recommendations"]:
        print(f"\n💡 Recommendations:")
        for rec in analysis["recommendations"]:
            print(f"\n  {rec['issue']}:")
            print(f"    {rec['description']}")
            print(f"    Solution: {rec['solution']}")
            if rec.get("specific_actions"):
                print(f"    Actions:")
                for action in rec["specific_actions"]:
                    print(f"      • {action}")
    
    # Save detailed catalog
    catalog = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "date_range": {
            "start": (datetime.now(timezone.utc) - timedelta(days=14)).isoformat(),
            "end": datetime.now(timezone.utc).isoformat()
        },
        "summary": {
            "total_errors": len(json_errors),
            "unique_messages": analysis["unique_error_messages"],
            "error_types": analysis["error_types"],
            "users_affected": len(error_by_user)
        },
        "errors_by_date": dict(error_by_date),
        "errors_by_user": {user: len(errors) for user, errors in error_by_user.items()},
        "field_analysis": analysis["common_fields"],
        "common_values": analysis["common_values"],
        "all_errors": json_errors,
        "recommendations": analysis["recommendations"]
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/json_parser_error_catalog.json"
    with open(output_file, "w") as f:
        json.dump(catalog, f, indent=2)
    
    print(f"\n📄 Complete catalog saved to: {output_file}")
    
    return catalog

def main():
    print("\n" + "="*80)
    print("JSON_PARSER_ERROR COMPREHENSIVE CATALOG")
    print("="*80)
    
    # Catalog all JSON errors
    json_errors, error_patterns, error_by_date, error_by_user, field_errors = catalog_json_errors()
    
    if not json_errors:
        print("\n✅ No JSON_PARSER_ERROR instances found in the past 14 days!")
        print("\nThis is good news - it means:")
        print("  • Data type conversions are working correctly")
        print("  • Field mappings are properly configured")
        print("  • Required fields are being populated")
        return
    
    # Analyze patterns
    analysis = analyze_patterns(json_errors, error_patterns, field_errors)
    
    # Generate and save report
    catalog = generate_report(json_errors, error_patterns, error_by_date, error_by_user, field_errors, analysis)
    
    # Final summary
    print("\n" + "="*80)
    print("ACTION ITEMS")
    print("="*80)
    
    if json_errors:
        print("\n🚨 Immediate Actions Required:")
        print("1. Review the field mappings for type consistency")
        print("2. Implement data type conversion layer")
        print("3. Add validation before sync attempts")
        print("4. Monitor the specific users with high error rates")
        
        if "False" in str(analysis["common_values"]) or "True" in str(analysis["common_values"]):
            print("\n⚠️  Boolean Conversion Issue Detected:")
            print("  String values 'False' and 'True' need to be converted to boolean false/true")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)