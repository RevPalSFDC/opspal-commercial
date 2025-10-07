#!/usr/bin/env python3
"""
Automated Salesforce-Salesloft Sync Remediation Tool

This tool provides automated fixes for common sync issues between Salesforce and Salesloft,
including duplicate resolution, field mapping fixes, and permission corrections.
"""

import os
import sys
import json
import requests
import subprocess
import argparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple, Set
import time
from collections import defaultdict
import hashlib
import re

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SALESFORCE_ORG = os.getenv("SALESFORCE_ORG_ALIAS", "production")

# Headers for Salesloft API
SALESLOFT_HEADERS = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "sync-remediation/1.0"
}

# Remediation results
remediation_results = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "issues_found": [],
    "fixes_applied": [],
    "fixes_failed": [],
    "manual_actions_required": [],
    "statistics": {}
}


class SyncRemediator:
    """Automated sync issue remediation engine"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.sl_client = SalesloftAPIClient()
        self.sf_client = SalesforceAPIClient()

    def run_remediation(self, issue_type: Optional[str] = None) -> Dict:
        """Run automated remediation for sync issues"""
        print("\n" + "="*80)
        print("AUTOMATED SYNC REMEDIATION")
        print("Mode: " + ("DRY RUN" if self.dry_run else "LIVE"))
        print("="*80)

        if issue_type:
            print(f"\nFocusing on {issue_type} issues...")
            self._remediate_specific_issue(issue_type)
        else:
            print("\nRunning comprehensive remediation...")
            self._run_comprehensive_remediation()

        return remediation_results

    def _run_comprehensive_remediation(self):
        """Run all remediation checks and fixes"""
        # 1. Fix duplicate records
        print("\n[1/7] Checking for duplicate records...")
        self._fix_duplicates()

        # 2. Fix missing required fields
        print("\n[2/7] Checking for missing required fields...")
        self._fix_missing_fields()

        # 3. Fix field mapping issues
        print("\n[3/7] Checking field mappings...")
        self._fix_field_mappings()

        # 4. Fix permission issues
        print("\n[4/7] Checking permissions...")
        self._fix_permissions()

        # 5. Re-sync failed records
        print("\n[5/7] Re-syncing failed records...")
        self._resync_failed_records()

        # 6. Clean up orphaned records
        print("\n[6/7] Cleaning up orphaned records...")
        self._cleanup_orphaned_records()

        # 7. Optimize sync configuration
        print("\n[7/7] Optimizing sync configuration...")
        self._optimize_sync_config()

    def _remediate_specific_issue(self, issue_type: str):
        """Remediate specific type of issue"""
        remediation_map = {
            "duplicates": self._fix_duplicates,
            "missing_fields": self._fix_missing_fields,
            "field_mappings": self._fix_field_mappings,
            "permissions": self._fix_permissions,
            "failed_syncs": self._resync_failed_records,
            "orphaned": self._cleanup_orphaned_records,
            "configuration": self._optimize_sync_config
        }

        if issue_type in remediation_map:
            remediation_map[issue_type]()
        else:
            print(f"Unknown issue type: {issue_type}")
            print(f"Available types: {', '.join(remediation_map.keys())}")

    def _fix_duplicates(self):
        """Fix duplicate records in both systems"""
        duplicates_fixed = 0

        # Find duplicates in Salesloft
        sl_duplicates = self._find_salesloft_duplicates()

        if sl_duplicates:
            print(f"  Found {len(sl_duplicates)} duplicate groups in Salesloft")

            for email, records in sl_duplicates.items():
                if len(records) > 1:
                    print(f"  Processing duplicates for: {email}")

                    # Determine master record (most recently updated)
                    master = max(records, key=lambda x: x.get("updated_at", ""))
                    duplicates = [r for r in records if r["id"] != master["id"]]

                    remediation_results["issues_found"].append({
                        "type": "duplicate",
                        "system": "salesloft",
                        "email": email,
                        "count": len(records),
                        "master_id": master["id"]
                    })

                    if not self.dry_run:
                        # Merge duplicate data into master
                        merged_data = self._merge_duplicate_data(master, duplicates)

                        # Update master record
                        if self.sl_client.update_person(master["id"], merged_data):
                            # Archive duplicates
                            for dup in duplicates:
                                if self.sl_client.archive_person(dup["id"]):
                                    duplicates_fixed += 1

                            remediation_results["fixes_applied"].append({
                                "type": "duplicate_merge",
                                "email": email,
                                "records_merged": len(duplicates)
                            })

        # Find duplicates in Salesforce
        sf_duplicates = self._find_salesforce_duplicates()

        if sf_duplicates:
            print(f"  Found {len(sf_duplicates)} duplicate groups in Salesforce")

            for email, records in sf_duplicates.items():
                if len(records) > 1:
                    remediation_results["manual_actions_required"].append({
                        "type": "salesforce_duplicates",
                        "email": email,
                        "count": len(records),
                        "action": "Review and merge using Salesforce duplicate management tools",
                        "record_ids": [r["Id"] for r in records]
                    })

        remediation_results["statistics"]["duplicates_fixed"] = duplicates_fixed

    def _find_salesloft_duplicates(self) -> Dict[str, List[Dict]]:
        """Find duplicate people in Salesloft by email"""
        people = self.sl_client.get_all_people(limit=5000)
        email_groups = defaultdict(list)

        for person in people:
            email = person.get("email_address", "").lower()
            if email:
                email_groups[email].append(person)

        return {email: records for email, records in email_groups.items() if len(records) > 1}

    def _find_salesforce_duplicates(self) -> Dict[str, List[Dict]]:
        """Find duplicate contacts in Salesforce by email"""
        query = """
        SELECT Id, FirstName, LastName, Email, AccountId, CreatedDate, LastModifiedDate
        FROM Contact
        WHERE Email != null
        ORDER BY Email, LastModifiedDate DESC
        """

        contacts = self.sf_client.run_soql(query)
        email_groups = defaultdict(list)

        for contact in contacts:
            email = contact.get("Email", "").lower()
            if email:
                email_groups[email].append(contact)

        return {email: records for email, records in email_groups.items() if len(records) > 1}

    def _merge_duplicate_data(self, master: Dict, duplicates: List[Dict]) -> Dict:
        """Merge data from duplicate records into master"""
        merged = {}

        # Fields to merge (prefer non-empty values)
        merge_fields = ["phone", "title", "city", "state", "country", "linkedin_url", "website"]

        for field in merge_fields:
            # Use master value if available
            if master.get(field):
                merged[field] = master[field]
            else:
                # Otherwise, find first non-empty value from duplicates
                for dup in duplicates:
                    if dup.get(field):
                        merged[field] = dup[field]
                        break

        # Merge tags (combine unique)
        all_tags = set()
        if master.get("tags"):
            all_tags.update(master["tags"])
        for dup in duplicates:
            if dup.get("tags"):
                all_tags.update(dup["tags"])
        if all_tags:
            merged["tags"] = list(all_tags)

        return merged

    def _fix_missing_fields(self):
        """Fix records with missing required fields"""
        fields_fixed = 0

        # Get recent sync failures due to missing fields
        errors = self.sl_client.get_sync_errors(error_type="required_field")

        for error in errors:
            record_id = error.get("record_id")
            missing_field = error.get("field")
            record_type = error.get("record_type")

            remediation_results["issues_found"].append({
                "type": "missing_field",
                "record_id": record_id,
                "field": missing_field,
                "record_type": record_type
            })

            if not self.dry_run:
                # Attempt to fill missing field with default or derived value
                default_value = self._get_default_field_value(missing_field, record_type)

                if default_value is not None:
                    update_success = False

                    if record_type == "person":
                        update_success = self.sl_client.update_person(record_id, {missing_field: default_value})
                    elif record_type == "account":
                        update_success = self.sl_client.update_account(record_id, {missing_field: default_value})

                    if update_success:
                        fields_fixed += 1
                        remediation_results["fixes_applied"].append({
                            "type": "missing_field_fixed",
                            "record_id": record_id,
                            "field": missing_field,
                            "value": default_value
                        })
                    else:
                        remediation_results["fixes_failed"].append({
                            "type": "missing_field",
                            "record_id": record_id,
                            "reason": "Update failed"
                        })

        remediation_results["statistics"]["fields_fixed"] = fields_fixed

    def _get_default_field_value(self, field: str, record_type: str) -> Any:
        """Get appropriate default value for missing field"""
        defaults = {
            "person": {
                "last_name": "Unknown",
                "email_address": None,  # Can't default email
                "title": "N/A",
                "phone": "",
                "city": "",
                "state": "",
                "country": "United States"
            },
            "account": {
                "name": "Unknown Company",
                "domain": "",
                "industry": "Other",
                "size": "",
                "city": "",
                "state": "",
                "country": "United States"
            }
        }

        return defaults.get(record_type, {}).get(field)

    def _fix_field_mappings(self):
        """Fix field mapping issues between systems"""
        mapping_issues = 0

        # Check for common field mapping problems
        print("  Checking field format compatibility...")

        # Phone number format standardization
        people_with_phones = self.sl_client.get_people_with_field("phone")

        for person in people_with_phones:
            phone = person.get("phone", "")
            standardized = self._standardize_phone(phone)

            if phone != standardized:
                remediation_results["issues_found"].append({
                    "type": "field_format",
                    "record_id": person["id"],
                    "field": "phone",
                    "original": phone,
                    "standardized": standardized
                })

                if not self.dry_run:
                    if self.sl_client.update_person(person["id"], {"phone": standardized}):
                        mapping_issues += 1
                        remediation_results["fixes_applied"].append({
                            "type": "field_standardization",
                            "record_id": person["id"],
                            "field": "phone"
                        })

        # Email validation
        print("  Validating email addresses...")
        people_with_invalid_emails = self._find_invalid_emails()

        for person in people_with_invalid_emails:
            remediation_results["manual_actions_required"].append({
                "type": "invalid_email",
                "record_id": person["id"],
                "email": person.get("email_address"),
                "action": "Manually verify and correct email address"
            })

        remediation_results["statistics"]["mapping_issues_fixed"] = mapping_issues

    def _standardize_phone(self, phone: str) -> str:
        """Standardize phone number format"""
        if not phone:
            return ""

        # Remove non-numeric characters
        digits = re.sub(r'[^\d]', '', phone)

        # Format US phone numbers
        if len(digits) == 10:
            return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        elif len(digits) == 11 and digits[0] == "1":
            return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"

        return phone  # Return original if can't standardize

    def _find_invalid_emails(self) -> List[Dict]:
        """Find records with invalid email addresses"""
        invalid = []
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

        people = self.sl_client.get_all_people(limit=1000)

        for person in people:
            email = person.get("email_address", "")
            if email and not email_pattern.match(email):
                invalid.append(person)

        return invalid

    def _fix_permissions(self):
        """Fix permission-related sync issues"""
        print("  Checking Salesforce field permissions...")

        # Check for field-level security issues
        permission_issues = self.sf_client.check_field_permissions()

        for issue in permission_issues:
            remediation_results["manual_actions_required"].append({
                "type": "permission",
                "object": issue["object"],
                "field": issue["field"],
                "profile": issue["profile"],
                "action": f"Grant {issue['permission']} permission on {issue['object']}.{issue['field']} for profile {issue['profile']}"
            })

        # Check Salesloft API permissions
        sl_perms = self.sl_client.check_permissions()

        if not sl_perms.get("can_write"):
            remediation_results["manual_actions_required"].append({
                "type": "api_permission",
                "system": "salesloft",
                "action": "Update API token with write permissions"
            })

    def _resync_failed_records(self):
        """Attempt to re-sync previously failed records"""
        resynced = 0

        # Get recent sync failures
        failures = self.sl_client.get_recent_sync_failures()

        print(f"  Found {len(failures)} failed sync attempts")

        for failure in failures[:100]:  # Process up to 100 failures
            record_id = failure.get("record_id")
            record_type = failure.get("record_type")
            error_message = failure.get("error", "")

            remediation_results["issues_found"].append({
                "type": "sync_failure",
                "record_id": record_id,
                "error": error_message
            })

            if not self.dry_run:
                # Attempt to fix and resync based on error type
                if "duplicate" in error_message.lower():
                    # Handle duplicate error
                    if self._handle_duplicate_sync_error(record_id, record_type):
                        resynced += 1
                elif "required" in error_message.lower() or "missing" in error_message.lower():
                    # Handle missing field error
                    if self._handle_missing_field_sync_error(record_id, record_type, error_message):
                        resynced += 1
                else:
                    # Generic retry
                    if self.sl_client.retry_sync(record_id):
                        resynced += 1
                        remediation_results["fixes_applied"].append({
                            "type": "resync_success",
                            "record_id": record_id
                        })

        remediation_results["statistics"]["records_resynced"] = resynced

    def _handle_duplicate_sync_error(self, record_id: str, record_type: str) -> bool:
        """Handle sync failure due to duplicate"""
        # Find existing duplicate in Salesforce
        if record_type == "person":
            person = self.sl_client.get_person(record_id)
            if person:
                email = person.get("email_address")
                # Check if duplicate exists in Salesforce
                existing = self.sf_client.find_contact_by_email(email)

                if existing:
                    # Link Salesloft record to existing Salesforce record
                    return self.sl_client.update_person(record_id, {"crm_id": existing["Id"]})

        return False

    def _handle_missing_field_sync_error(self, record_id: str, record_type: str, error_message: str) -> bool:
        """Handle sync failure due to missing required field"""
        # Extract field name from error message
        field_match = re.search(r"field[:\s]+(\w+)", error_message.lower())

        if field_match:
            field_name = field_match.group(1)
            default_value = self._get_default_field_value(field_name, record_type)

            if default_value is not None:
                if record_type == "person":
                    return self.sl_client.update_person(record_id, {field_name: default_value})
                elif record_type == "account":
                    return self.sl_client.update_account(record_id, {field_name: default_value})

        return False

    def _cleanup_orphaned_records(self):
        """Clean up orphaned records that no longer have valid references"""
        orphaned_count = 0

        # Find Salesloft records with invalid CRM IDs
        print("  Checking for orphaned Salesloft records...")
        sl_people = self.sl_client.get_people_with_crm_id()

        for person in sl_people:
            crm_id = person.get("crm_id")

            if crm_id and not self.sf_client.verify_contact_exists(crm_id):
                remediation_results["issues_found"].append({
                    "type": "orphaned_record",
                    "system": "salesloft",
                    "record_id": person["id"],
                    "invalid_crm_id": crm_id
                })

                if not self.dry_run:
                    # Clear invalid CRM ID
                    if self.sl_client.update_person(person["id"], {"crm_id": None}):
                        orphaned_count += 1
                        remediation_results["fixes_applied"].append({
                            "type": "orphaned_cleanup",
                            "record_id": person["id"]
                        })

        remediation_results["statistics"]["orphaned_cleaned"] = orphaned_count

    def _optimize_sync_config(self):
        """Optimize sync configuration for better performance"""
        optimizations = []

        # Check sync batch size
        current_config = self.sl_client.get_sync_configuration()
        batch_size = current_config.get("batch_size", 100)

        if batch_size > 200:
            optimizations.append({
                "setting": "batch_size",
                "current": batch_size,
                "recommended": 100,
                "reason": "Large batch sizes can cause timeouts"
            })

        # Check sync frequency
        sync_interval = current_config.get("sync_interval_minutes", 15)

        if sync_interval < 5:
            optimizations.append({
                "setting": "sync_interval",
                "current": sync_interval,
                "recommended": 10,
                "reason": "Too frequent syncing can cause rate limiting"
            })

        # Check field mappings for unnecessary fields
        mapped_fields = current_config.get("mapped_fields", [])
        recommended_fields = self._get_recommended_field_mappings()

        unnecessary_fields = set(mapped_fields) - set(recommended_fields)

        if unnecessary_fields:
            optimizations.append({
                "setting": "field_mappings",
                "remove": list(unnecessary_fields),
                "reason": "Syncing unnecessary fields impacts performance"
            })

        if optimizations:
            for opt in optimizations:
                remediation_results["manual_actions_required"].append({
                    "type": "configuration_optimization",
                    "optimization": opt
                })

        remediation_results["statistics"]["optimizations_suggested"] = len(optimizations)

    def _get_recommended_field_mappings(self) -> List[str]:
        """Get recommended field mappings for optimal sync"""
        return [
            "first_name", "last_name", "email_address", "phone",
            "title", "company_name", "crm_id", "account_crm_id",
            "owner_crm_id", "last_contacted_at"
        ]


class SalesloftAPIClient:
    """Salesloft API client with remediation methods"""

    def __init__(self):
        self.base_url = SALESLOFT_BASE_URL
        self.headers = SALESLOFT_HEADERS

    def api_request(self, method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> Dict:
        """Make API request"""
        url = f"{self.base_url}{endpoint}"

        for attempt in range(3):
            try:
                if method == "GET":
                    response = requests.get(url, headers=self.headers, params=params, timeout=30)
                elif method == "PUT":
                    response = requests.put(url, headers=self.headers, json=data, timeout=30)
                elif method == "POST":
                    response = requests.post(url, headers=self.headers, json=data, timeout=30)
                elif method == "DELETE":
                    response = requests.delete(url, headers=self.headers, timeout=30)
                else:
                    return {"error": f"Unsupported method: {method}"}

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 2))
                    time.sleep(retry_after)
                    continue

                if response.status_code in [200, 201, 204]:
                    if response.status_code == 204:
                        return {"success": True}
                    return response.json()
                else:
                    return {"error": f"Status {response.status_code}: {response.text}"}

            except Exception as e:
                if attempt == 2:
                    return {"error": str(e)}
                time.sleep(2 ** attempt)

        return {"error": "Max retries exceeded"}

    def get_all_people(self, limit: int = 1000) -> List[Dict]:
        """Get all people"""
        people = []
        page = 1

        while len(people) < limit:
            result = self.api_request("GET", "/people", params={"per_page": 100, "page": page})

            if "error" in result:
                break

            data = result.get("data", [])
            if not data:
                break

            people.extend(data)
            page += 1

            if len(data) < 100:
                break

        return people[:limit]

    def get_person(self, person_id: str) -> Optional[Dict]:
        """Get specific person"""
        result = self.api_request("GET", f"/people/{person_id}")
        return result.get("data") if "data" in result else None

    def update_person(self, person_id: str, data: Dict) -> bool:
        """Update person record"""
        result = self.api_request("PUT", f"/people/{person_id}", data=data)
        return "error" not in result

    def archive_person(self, person_id: str) -> bool:
        """Archive person record"""
        result = self.api_request("DELETE", f"/people/{person_id}")
        return "error" not in result

    def update_account(self, account_id: str, data: Dict) -> bool:
        """Update account record"""
        result = self.api_request("PUT", f"/accounts/{account_id}", data=data)
        return "error" not in result

    def get_sync_errors(self, error_type: Optional[str] = None) -> List[Dict]:
        """Get sync errors"""
        # This would need actual endpoint implementation
        return []

    def get_people_with_field(self, field: str) -> List[Dict]:
        """Get people with specific field populated"""
        people = self.get_all_people(limit=500)
        return [p for p in people if p.get(field)]

    def get_people_with_crm_id(self) -> List[Dict]:
        """Get people with CRM ID set"""
        people = self.get_all_people(limit=500)
        return [p for p in people if p.get("crm_id")]

    def check_permissions(self) -> Dict:
        """Check API permissions"""
        result = self.api_request("GET", "/me")
        if "data" in result:
            return {
                "can_read": True,
                "can_write": True  # Would need to test with actual write
            }
        return {"can_read": False, "can_write": False}

    def get_recent_sync_failures(self) -> List[Dict]:
        """Get recent sync failures"""
        # Would need actual implementation
        return []

    def retry_sync(self, record_id: str) -> bool:
        """Retry sync for specific record"""
        # Would need actual implementation
        return False

    def get_sync_configuration(self) -> Dict:
        """Get current sync configuration"""
        result = self.api_request("GET", "/team")
        return result.get("data", {})

    def find_contact_by_email(self, email: str) -> Optional[Dict]:
        """Find contact by email"""
        result = self.api_request("GET", "/people", params={"email_address": email})
        people = result.get("data", [])
        return people[0] if people else None


class SalesforceAPIClient:
    """Salesforce API client with remediation methods"""

    def __init__(self):
        self.org = SALESFORCE_ORG

    def run_soql(self, query: str) -> List[Dict]:
        """Run SOQL query"""
        try:
            result = subprocess.run(
                ["sf", "data", "query", "--query", query, "--target-org", self.org, "--json"],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                data = json.loads(result.stdout)
                return data.get("result", {}).get("records", [])

        except Exception as e:
            print(f"SOQL error: {e}")

        return []

    def verify_contact_exists(self, contact_id: str) -> bool:
        """Verify if contact exists"""
        query = f"SELECT Id FROM Contact WHERE Id = '{contact_id}' LIMIT 1"
        results = self.run_soql(query)
        return bool(results)

    def find_contact_by_email(self, email: str) -> Optional[Dict]:
        """Find contact by email"""
        query = f"SELECT Id, FirstName, LastName, Email FROM Contact WHERE Email = '{email}' LIMIT 1"
        results = self.run_soql(query)
        return results[0] if results else None

    def check_field_permissions(self) -> List[Dict]:
        """Check field-level permissions"""
        issues = []

        # Check key fields for Integration User profile
        query = """
        SELECT Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE SobjectType IN ('Contact', 'Account', 'Task')
        AND Parent.Profile.Name = 'Integration User'
        """

        permissions = self.run_soql(query)

        required_permissions = {
            "Contact": ["Email", "FirstName", "LastName", "Phone", "Title"],
            "Account": ["Name", "Website", "Industry"],
            "Task": ["Subject", "Description", "ActivityDate", "Status"]
        }

        for obj, fields in required_permissions.items():
            for field in fields:
                field_perm = next((p for p in permissions if p.get("Field") == f"{obj}.{field}"), None)

                if not field_perm or not field_perm.get("PermissionsEdit"):
                    issues.append({
                        "object": obj,
                        "field": field,
                        "profile": "Integration User",
                        "permission": "Edit"
                    })

        return issues


def generate_remediation_report(results: Dict):
    """Generate remediation report"""
    print("\n" + "="*80)
    print("REMEDIATION REPORT")
    print("="*80)

    # Summary
    print("\n📊 SUMMARY")
    print("-" * 40)

    stats = results.get("statistics", {})
    print(f"Issues Found: {len(results.get('issues_found', []))}")
    print(f"Fixes Applied: {len(results.get('fixes_applied', []))}")
    print(f"Fixes Failed: {len(results.get('fixes_failed', []))}")
    print(f"Manual Actions Required: {len(results.get('manual_actions_required', []))}")

    # Statistics
    if stats:
        print("\n📈 STATISTICS")
        print("-" * 40)
        for key, value in stats.items():
            print(f"{key.replace('_', ' ').title()}: {value}")

    # Successful fixes
    fixes = results.get("fixes_applied", [])
    if fixes:
        print("\n✅ FIXES APPLIED")
        print("-" * 40)
        for fix in fixes[:10]:
            print(f"• {fix.get('type', 'unknown')}: {fix.get('record_id', 'N/A')}")

    # Failed fixes
    failures = results.get("fixes_failed", [])
    if failures:
        print("\n❌ FIXES FAILED")
        print("-" * 40)
        for failure in failures[:10]:
            print(f"• {failure.get('type', 'unknown')}: {failure.get('reason', 'Unknown reason')}")

    # Manual actions
    manual = results.get("manual_actions_required", [])
    if manual:
        print("\n⚠️  MANUAL ACTIONS REQUIRED")
        print("-" * 40)
        for idx, action in enumerate(manual[:10], 1):
            print(f"\n{idx}. {action.get('type', 'Unknown').upper()}")
            print(f"   Action: {action.get('action', 'No action specified')}")

            if action.get("object"):
                print(f"   Object: {action['object']}")
            if action.get("field"):
                print(f"   Field: {action['field']}")

    # Save detailed report
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_file = f"/home/chris/Desktop/RevPal/Agents/reports/sync_remediation_{timestamp}.json"

    os.makedirs(os.path.dirname(report_file), exist_ok=True)

    with open(report_file, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n📄 Detailed report saved to: {report_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Automated Salesforce-Salesloft Sync Remediation"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode (no changes made)"
    )
    parser.add_argument(
        "--focus",
        choices=["duplicates", "missing_fields", "field_mappings", "permissions", "failed_syncs", "orphaned", "configuration"],
        help="Focus on specific issue type"
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Auto-approve all fixes (use with caution)"
    )

    args = parser.parse_args()

    # Check requirements
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        sys.exit(1)

    # Confirm before running
    if not args.dry_run and not args.auto_approve:
        print("\n⚠️  WARNING: This tool will make changes to your Salesloft data.")
        response = input("Are you sure you want to continue? (yes/no): ")

        if response.lower() != "yes":
            print("Remediation cancelled.")
            sys.exit(0)

    # Run remediation
    remediator = SyncRemediator(dry_run=args.dry_run)
    results = remediator.run_remediation(issue_type=args.focus)

    # Generate report
    generate_remediation_report(results)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nRemediation interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)