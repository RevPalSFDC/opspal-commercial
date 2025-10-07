#!/usr/bin/env python3
"""
Unified Salesforce-Salesloft Sync Diagnostic Tool

This tool provides comprehensive sync diagnostics between Salesforce and Salesloft,
including bi-directional verification, error analysis, and automated remediation suggestions.
"""

import os
import sys
import json
import requests
import argparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
import time
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
import hashlib

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SALESFORCE_ORG = os.getenv("SALESFORCE_ORG_ALIAS", "production")

# Headers for Salesloft API
SALESLOFT_HEADERS = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "User-Agent": "sf-salesloft-sync-diagnostics/1.0"
}

# Diagnostic results storage
diagnostic_results = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "sync_health": {},
    "errors": [],
    "warnings": [],
    "remediation_suggestions": [],
    "performance_metrics": {},
    "field_mappings": {},
    "duplicate_analysis": {},
    "missing_records": {"salesforce": [], "salesloft": []},
    "sync_statistics": {}
}

class SyncDiagnostics:
    """Main diagnostic engine for Salesforce-Salesloft sync"""

    def __init__(self):
        self.sl_client = SalesloftClient()
        self.sf_client = SalesforceClient()
        self.sync_mappings = self._load_sync_mappings()

    def _load_sync_mappings(self) -> Dict:
        """Load field mappings between Salesforce and Salesloft"""
        return {
            "Contact": {
                "sf_to_sl": {
                    "Id": "crm_id",
                    "FirstName": "first_name",
                    "LastName": "last_name",
                    "Email": "email_address",
                    "Phone": "phone",
                    "Title": "title",
                    "AccountId": "account_crm_id"
                },
                "sl_to_sf": {
                    "first_name": "FirstName",
                    "last_name": "LastName",
                    "email_address": "Email",
                    "phone": "Phone",
                    "title": "Title"
                }
            },
            "Account": {
                "sf_to_sl": {
                    "Id": "crm_id",
                    "Name": "name",
                    "Website": "domain",
                    "Industry": "industry",
                    "NumberOfEmployees": "size"
                },
                "sl_to_sf": {
                    "name": "Name",
                    "domain": "Website",
                    "industry": "Industry",
                    "size": "NumberOfEmployees"
                }
            },
            "Task": {
                "sf_to_sl": {
                    "Id": "crm_activity_id",
                    "Subject": "subject",
                    "Description": "note",
                    "ActivityDate": "due_date",
                    "Status": "status"
                },
                "sl_to_sf": {
                    "subject": "Subject",
                    "note": "Description",
                    "due_date": "ActivityDate",
                    "status": "Status"
                }
            }
        }

    def run_full_diagnostic(self) -> Dict:
        """Run comprehensive sync diagnostics"""
        print("\n" + "="*80)
        print("SALESFORCE-SALESLOFT SYNC DIAGNOSTICS")
        print("="*80)

        # Check API connectivity
        print("\n[1/8] Checking API connectivity...")
        self._check_connectivity()

        # Analyze sync configuration
        print("\n[2/8] Analyzing sync configuration...")
        self._analyze_sync_config()

        # Check field mappings
        print("\n[3/8] Validating field mappings...")
        self._validate_field_mappings()

        # Analyze sync errors
        print("\n[4/8] Analyzing recent sync errors...")
        self._analyze_sync_errors()

        # Check for duplicates
        print("\n[5/8] Checking for duplicate records...")
        self._check_duplicates()

        # Verify bi-directional sync
        print("\n[6/8] Verifying bi-directional sync...")
        self._verify_bidirectional_sync()

        # Analyze performance metrics
        print("\n[7/8] Analyzing sync performance...")
        self._analyze_performance()

        # Generate remediation suggestions
        print("\n[8/8] Generating remediation suggestions...")
        self._generate_remediation_suggestions()

        return diagnostic_results

    def _check_connectivity(self):
        """Check connectivity to both APIs"""
        # Check Salesloft
        sl_status = self.sl_client.check_connection()
        diagnostic_results["sync_health"]["salesloft_api"] = sl_status

        # Check Salesforce
        sf_status = self.sf_client.check_connection()
        diagnostic_results["sync_health"]["salesforce_api"] = sf_status

        if not sl_status["connected"]:
            diagnostic_results["errors"].append({
                "type": "connectivity",
                "system": "salesloft",
                "message": "Cannot connect to Salesloft API",
                "details": sl_status.get("error")
            })

        if not sf_status["connected"]:
            diagnostic_results["errors"].append({
                "type": "connectivity",
                "system": "salesforce",
                "message": "Cannot connect to Salesforce",
                "details": sf_status.get("error")
            })

    def _analyze_sync_config(self):
        """Analyze sync configuration and settings"""
        config = self.sl_client.get_sync_config()
        diagnostic_results["sync_health"]["configuration"] = config

        # Check for common misconfigurations
        if not config.get("sync_enabled"):
            diagnostic_results["errors"].append({
                "type": "configuration",
                "message": "Sync is disabled in Salesloft",
                "severity": "critical"
            })

        if config.get("last_sync_at"):
            last_sync = datetime.fromisoformat(config["last_sync_at"].replace("Z", "+00:00"))
            hours_since = (datetime.now(timezone.utc) - last_sync).total_seconds() / 3600

            if hours_since > 24:
                diagnostic_results["warnings"].append({
                    "type": "sync_delay",
                    "message": f"Last sync was {hours_since:.1f} hours ago",
                    "severity": "medium"
                })

    def _validate_field_mappings(self):
        """Validate field mappings between systems"""
        for object_type, mappings in self.sync_mappings.items():
            print(f"  Checking {object_type} mappings...")

            # Get sample records from both systems
            sl_sample = self.sl_client.get_sample_records(object_type.lower(), limit=5)
            sf_sample = self.sf_client.get_sample_records(object_type, limit=5)

            # Check field availability
            missing_fields = {
                "salesforce": [],
                "salesloft": []
            }

            if sf_sample:
                sf_fields = set(sf_sample[0].keys())
                for sf_field in mappings["sf_to_sl"].keys():
                    if sf_field not in sf_fields:
                        missing_fields["salesforce"].append(sf_field)

            if sl_sample:
                sl_fields = set(sl_sample[0].keys())
                for sl_field in mappings["sl_to_sf"].keys():
                    if sl_field not in sl_fields:
                        missing_fields["salesloft"].append(sl_field)

            diagnostic_results["field_mappings"][object_type] = {
                "status": "valid" if not any(missing_fields.values()) else "invalid",
                "missing_fields": missing_fields
            }

            if missing_fields["salesforce"] or missing_fields["salesloft"]:
                diagnostic_results["errors"].append({
                    "type": "field_mapping",
                    "object": object_type,
                    "message": f"Missing fields in {object_type} mapping",
                    "details": missing_fields
                })

    def _analyze_sync_errors(self):
        """Analyze recent sync errors from both systems"""
        # Get Salesloft sync errors
        sl_errors = self.sl_client.get_sync_errors(days=7)

        # Categorize errors
        error_categories = defaultdict(list)
        for error in sl_errors:
            error_type = self._categorize_error(error)
            error_categories[error_type].append(error)

        diagnostic_results["sync_statistics"]["error_summary"] = {
            category: len(errors) for category, errors in error_categories.items()
        }

        # Store sample errors
        for category, errors in error_categories.items():
            if errors:
                diagnostic_results["errors"].append({
                    "type": f"sync_{category}",
                    "count": len(errors),
                    "samples": errors[:3],  # Store first 3 examples
                    "first_seen": min(e.get("created_at", "") for e in errors),
                    "last_seen": max(e.get("created_at", "") for e in errors)
                })

    def _categorize_error(self, error: Dict) -> str:
        """Categorize error type"""
        error_msg = error.get("message", "").lower()

        if "permission" in error_msg or "access" in error_msg:
            return "permission"
        elif "duplicate" in error_msg:
            return "duplicate"
        elif "validation" in error_msg or "invalid" in error_msg:
            return "validation"
        elif "required" in error_msg or "missing" in error_msg:
            return "required_field"
        elif "timeout" in error_msg or "timed out" in error_msg:
            return "timeout"
        elif "rate" in error_msg or "limit" in error_msg:
            return "rate_limit"
        else:
            return "other"

    def _check_duplicates(self):
        """Check for duplicate records in both systems"""
        print("  Checking Contacts for duplicates...")

        # Check Salesloft for duplicates
        sl_people = self.sl_client.get_all_people(limit=1000)
        sl_emails = defaultdict(list)

        for person in sl_people:
            email = person.get("email_address")
            if email:
                sl_emails[email.lower()].append(person)

        sl_duplicates = {email: records for email, records in sl_emails.items() if len(records) > 1}

        # Check Salesforce for duplicates
        sf_contacts = self.sf_client.get_contacts_with_duplicates()

        diagnostic_results["duplicate_analysis"] = {
            "salesloft": {
                "total_duplicates": len(sl_duplicates),
                "affected_emails": list(sl_duplicates.keys())[:10]
            },
            "salesforce": {
                "total_duplicates": len(sf_contacts.get("duplicates", [])),
                "sample_duplicates": sf_contacts.get("duplicates", [])[:10]
            }
        }

        if sl_duplicates:
            diagnostic_results["warnings"].append({
                "type": "duplicates",
                "system": "salesloft",
                "message": f"Found {len(sl_duplicates)} duplicate email addresses in Salesloft",
                "severity": "high"
            })

    def _verify_bidirectional_sync(self):
        """Verify records exist in both systems"""
        print("  Sampling records for bi-directional verification...")

        # Sample recent records from Salesloft
        sl_people = self.sl_client.get_recent_people(days=7, limit=20)

        missing_in_sf = []
        missing_in_sl = []

        with ThreadPoolExecutor(max_workers=5) as executor:
            # Check if Salesloft records exist in Salesforce
            futures = []
            for person in sl_people:
                crm_id = person.get("crm_id")
                if crm_id:
                    future = executor.submit(self.sf_client.verify_contact_exists, crm_id)
                    futures.append((future, person, "sf"))

            # Sample Salesforce contacts
            sf_contacts = self.sf_client.get_recent_contacts(days=7, limit=20)
            for contact in sf_contacts:
                email = contact.get("Email")
                if email:
                    future = executor.submit(self.sl_client.verify_person_exists, email)
                    futures.append((future, contact, "sl"))

            for future, record, target_system in futures:
                try:
                    exists = future.result(timeout=10)
                    if not exists:
                        if target_system == "sf":
                            missing_in_sf.append({
                                "salesloft_id": record.get("id"),
                                "email": record.get("email_address"),
                                "name": f"{record.get('first_name', '')} {record.get('last_name', '')}"
                            })
                        else:
                            missing_in_sl.append({
                                "salesforce_id": record.get("Id"),
                                "email": record.get("Email"),
                                "name": f"{record.get('FirstName', '')} {record.get('LastName', '')}"
                            })
                except Exception as e:
                    print(f"    Error verifying record: {e}")

        diagnostic_results["missing_records"]["salesforce"] = missing_in_sf
        diagnostic_results["missing_records"]["salesloft"] = missing_in_sl

        if missing_in_sf or missing_in_sl:
            diagnostic_results["errors"].append({
                "type": "sync_gap",
                "message": "Records missing in one system",
                "details": {
                    "missing_in_salesforce": len(missing_in_sf),
                    "missing_in_salesloft": len(missing_in_sl)
                }
            })

    def _analyze_performance(self):
        """Analyze sync performance metrics"""
        # Get sync timing data
        recent_syncs = self.sl_client.get_sync_history(days=7)

        if recent_syncs:
            sync_times = [s.get("duration_seconds", 0) for s in recent_syncs if s.get("duration_seconds")]

            if sync_times:
                diagnostic_results["performance_metrics"] = {
                    "average_sync_time": sum(sync_times) / len(sync_times),
                    "max_sync_time": max(sync_times),
                    "min_sync_time": min(sync_times),
                    "total_syncs": len(recent_syncs),
                    "failed_syncs": len([s for s in recent_syncs if s.get("status") == "failed"]),
                    "success_rate": len([s for s in recent_syncs if s.get("status") == "success"]) / len(recent_syncs) * 100
                }

                if diagnostic_results["performance_metrics"]["average_sync_time"] > 300:
                    diagnostic_results["warnings"].append({
                        "type": "performance",
                        "message": f"Average sync time is {diagnostic_results['performance_metrics']['average_sync_time']:.1f} seconds",
                        "severity": "medium"
                    })

    def _generate_remediation_suggestions(self):
        """Generate specific remediation suggestions based on findings"""
        suggestions = []

        # Connectivity issues
        if any(e["type"] == "connectivity" for e in diagnostic_results["errors"]):
            suggestions.append({
                "priority": "CRITICAL",
                "category": "Connectivity",
                "issue": "API connection failure",
                "actions": [
                    "Verify API tokens are valid and not expired",
                    "Check network connectivity and firewall rules",
                    "Ensure Salesforce org alias is correctly set",
                    "Test with: sf org display --target-org " + SALESFORCE_ORG
                ]
            })

        # Duplicate issues
        dup_analysis = diagnostic_results.get("duplicate_analysis", {})
        if dup_analysis.get("salesloft", {}).get("total_duplicates", 0) > 0:
            suggestions.append({
                "priority": "HIGH",
                "category": "Data Quality",
                "issue": f"Found {dup_analysis['salesloft']['total_duplicates']} duplicate records in Salesloft",
                "actions": [
                    "Run deduplication process in Salesloft",
                    "Implement unique constraints on email field",
                    "Review and merge duplicate records",
                    "Set up duplicate prevention rules"
                ]
            })

        # Sync gaps
        missing_records = diagnostic_results.get("missing_records", {})
        if missing_records.get("salesforce") or missing_records.get("salesloft"):
            suggestions.append({
                "priority": "HIGH",
                "category": "Sync Integrity",
                "issue": "Records missing in one or both systems",
                "actions": [
                    "Run full sync reconciliation",
                    "Check sync filters and criteria",
                    "Verify record ownership and sharing settings",
                    "Review sync logs for specific record failures"
                ]
            })

        # Field mapping issues
        for obj, mapping_info in diagnostic_results.get("field_mappings", {}).items():
            if mapping_info.get("status") == "invalid":
                suggestions.append({
                    "priority": "MEDIUM",
                    "category": "Configuration",
                    "issue": f"Invalid field mappings for {obj}",
                    "actions": [
                        f"Review field mappings for {obj}",
                        "Ensure all mapped fields exist in both systems",
                        "Check field-level security settings",
                        "Update mapping configuration"
                    ]
                })

        # Performance issues
        perf_metrics = diagnostic_results.get("performance_metrics", {})
        if perf_metrics.get("success_rate", 100) < 95:
            suggestions.append({
                "priority": "MEDIUM",
                "category": "Performance",
                "issue": f"Sync success rate is {perf_metrics.get('success_rate', 0):.1f}%",
                "actions": [
                    "Investigate failed sync attempts",
                    "Optimize sync batch sizes",
                    "Check for API rate limiting",
                    "Consider implementing retry logic"
                ]
            })

        diagnostic_results["remediation_suggestions"] = suggestions


class SalesloftClient:
    """Client for Salesloft API operations"""

    def __init__(self):
        self.base_url = SALESLOFT_BASE_URL
        self.headers = SALESLOFT_HEADERS

    def api_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """Make API request with retry logic"""
        url = f"{self.base_url}{endpoint}" if not endpoint.startswith("http") else endpoint

        for attempt in range(3):
            try:
                response = requests.get(url, headers=self.headers, params=params, timeout=30)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 2))
                    time.sleep(retry_after)
                    continue

                if response.status_code == 404:
                    return {"error": "not_found", "status_code": 404}

                response.raise_for_status()
                return response.json()

            except requests.exceptions.RequestException as e:
                if attempt == 2:
                    return {"error": str(e)}
                time.sleep(2 ** attempt)

        return {}

    def check_connection(self) -> Dict:
        """Check Salesloft API connectivity"""
        result = self.api_request("/me")

        if "error" not in result and result.get("data"):
            user = result["data"]
            return {
                "connected": True,
                "user": user.get("name"),
                "email": user.get("email"),
                "team": user.get("team", {}).get("name")
            }
        else:
            return {
                "connected": False,
                "error": result.get("error", "Unknown error")
            }

    def get_sync_config(self) -> Dict:
        """Get sync configuration"""
        result = self.api_request("/team")

        if "error" not in result and result.get("data"):
            team = result["data"]
            return {
                "sync_enabled": team.get("crm_connected", False),
                "crm_type": team.get("crm_type"),
                "last_sync_at": team.get("last_sync_at")
            }

        return {"sync_enabled": False}

    def get_sync_errors(self, days: int = 7) -> List[Dict]:
        """Get recent sync errors"""
        errors = []
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        # Check multiple endpoints for errors
        endpoints = ["/sync_errors", "/import_errors", "/crm_activities"]

        for endpoint in endpoints:
            params = {
                "created_at[gte]": start_date.isoformat(),
                "created_at[lte]": end_date.isoformat(),
                "per_page": 100,
                "page": 1
            }

            result = self.api_request(endpoint, params)
            if result.get("data"):
                for item in result["data"]:
                    if item.get("error") or item.get("sync_status") == "failed":
                        errors.append(item)

        return errors

    def get_sample_records(self, object_type: str, limit: int = 5) -> List[Dict]:
        """Get sample records of specified type"""
        endpoint_map = {
            "contact": "/people",
            "account": "/accounts",
            "task": "/activities"
        }

        endpoint = endpoint_map.get(object_type.lower())
        if not endpoint:
            return []

        result = self.api_request(endpoint, {"per_page": limit})
        return result.get("data", [])

    def get_all_people(self, limit: int = 1000) -> List[Dict]:
        """Get all people (up to limit)"""
        people = []
        page = 1

        while len(people) < limit:
            result = self.api_request("/people", {"per_page": 100, "page": page})
            data = result.get("data", [])

            if not data:
                break

            people.extend(data)
            page += 1

            if len(data) < 100:
                break

        return people[:limit]

    def get_recent_people(self, days: int = 7, limit: int = 20) -> List[Dict]:
        """Get recently created people"""
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        params = {
            "created_at[gte]": start_date.isoformat(),
            "per_page": limit,
            "sort": "created_at",
            "sort_direction": "desc"
        }

        result = self.api_request("/people", params)
        return result.get("data", [])

    def verify_person_exists(self, email: str) -> bool:
        """Verify if a person exists by email"""
        result = self.api_request("/people", {"email_address": email})
        return bool(result.get("data"))

    def get_sync_history(self, days: int = 7) -> List[Dict]:
        """Get sync history (if available)"""
        # This would need actual endpoint, using placeholder
        return []


class SalesforceClient:
    """Client for Salesforce operations"""

    def __init__(self):
        self.org = SALESFORCE_ORG

    def check_connection(self) -> Dict:
        """Check Salesforce connectivity"""
        try:
            result = subprocess.run(
                ["sf", "org", "display", "--target-org", self.org, "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                data = json.loads(result.stdout)
                org_info = data.get("result", {})
                return {
                    "connected": True,
                    "username": org_info.get("username"),
                    "org_id": org_info.get("id"),
                    "instance_url": org_info.get("instanceUrl")
                }
            else:
                return {
                    "connected": False,
                    "error": f"Command failed: {result.stderr}"
                }

        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }

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
            else:
                print(f"SOQL error: {result.stderr}")
                return []

        except Exception as e:
            print(f"Error running SOQL: {e}")
            return []

    def get_sample_records(self, object_type: str, limit: int = 5) -> List[Dict]:
        """Get sample records from Salesforce"""
        query = f"SELECT * FROM {object_type} LIMIT {limit}"
        return self.run_soql(query)

    def get_contacts_with_duplicates(self) -> Dict:
        """Check for duplicate contacts"""
        # Query for duplicate emails
        query = """
        SELECT Email, COUNT(Id) cnt, GROUP_CONCAT(Id)
        FROM Contact
        WHERE Email != null
        GROUP BY Email
        HAVING COUNT(Id) > 1
        LIMIT 100
        """

        # Note: GROUP_CONCAT might not work in SOQL, using alternative
        query = """
        SELECT Email, COUNT(Id)
        FROM Contact
        WHERE Email != null
        GROUP BY Email
        HAVING COUNT(Id) > 1
        LIMIT 100
        """

        duplicates = self.run_soql(query)

        return {
            "duplicates": [{"email": d.get("Email"), "count": d.get("expr0")} for d in duplicates]
        }

    def verify_contact_exists(self, contact_id: str) -> bool:
        """Verify if a contact exists by ID"""
        query = f"SELECT Id FROM Contact WHERE Id = '{contact_id}' LIMIT 1"
        results = self.run_soql(query)
        return bool(results)

    def get_recent_contacts(self, days: int = 7, limit: int = 20) -> List[Dict]:
        """Get recently created contacts"""
        query = f"""
        SELECT Id, FirstName, LastName, Email, Phone, CreatedDate
        FROM Contact
        WHERE CreatedDate >= LAST_N_DAYS:{days}
        ORDER BY CreatedDate DESC
        LIMIT {limit}
        """
        return self.run_soql(query)


def generate_report(results: Dict):
    """Generate comprehensive diagnostic report"""
    print("\n" + "="*80)
    print("SYNC DIAGNOSTIC REPORT")
    print("="*80)

    # Health Summary
    print("\n📊 HEALTH SUMMARY")
    print("-" * 40)

    health = results.get("sync_health", {})
    sl_health = health.get("salesloft_api", {})
    sf_health = health.get("salesforce_api", {})

    print(f"Salesloft API: {'✅ Connected' if sl_health.get('connected') else '❌ Disconnected'}")
    if sl_health.get("connected"):
        print(f"  User: {sl_health.get('user')}")
        print(f"  Team: {sl_health.get('team')}")

    print(f"Salesforce API: {'✅ Connected' if sf_health.get('connected') else '❌ Disconnected'}")
    if sf_health.get("connected"):
        print(f"  Org: {sf_health.get('username')}")
        print(f"  Instance: {sf_health.get('instance_url')}")

    config = health.get("configuration", {})
    if config:
        print(f"Sync Status: {'✅ Enabled' if config.get('sync_enabled') else '❌ Disabled'}")
        print(f"CRM Type: {config.get('crm_type', 'Unknown')}")

    # Errors
    errors = results.get("errors", [])
    if errors:
        print("\n❌ ERRORS FOUND")
        print("-" * 40)
        for error in errors[:10]:  # Show first 10 errors
            print(f"[{error.get('type', 'unknown').upper()}] {error.get('message', 'No message')}")
            if error.get("details"):
                print(f"  Details: {error['details']}")

    # Warnings
    warnings = results.get("warnings", [])
    if warnings:
        print("\n⚠️  WARNINGS")
        print("-" * 40)
        for warning in warnings:
            print(f"[{warning.get('severity', 'LOW').upper()}] {warning.get('message')}")

    # Performance Metrics
    perf = results.get("performance_metrics", {})
    if perf:
        print("\n📈 PERFORMANCE METRICS")
        print("-" * 40)
        print(f"Success Rate: {perf.get('success_rate', 0):.1f}%")
        print(f"Average Sync Time: {perf.get('average_sync_time', 0):.1f} seconds")
        print(f"Total Syncs (7 days): {perf.get('total_syncs', 0)}")
        print(f"Failed Syncs: {perf.get('failed_syncs', 0)}")

    # Duplicate Analysis
    dup = results.get("duplicate_analysis", {})
    if dup:
        print("\n🔄 DUPLICATE ANALYSIS")
        print("-" * 40)
        sl_dups = dup.get("salesloft", {})
        sf_dups = dup.get("salesforce", {})

        print(f"Salesloft Duplicates: {sl_dups.get('total_duplicates', 0)}")
        if sl_dups.get("affected_emails"):
            print(f"  Sample emails: {', '.join(sl_dups['affected_emails'][:5])}")

        print(f"Salesforce Duplicates: {sf_dups.get('total_duplicates', 0)}")

    # Missing Records
    missing = results.get("missing_records", {})
    if missing.get("salesforce") or missing.get("salesloft"):
        print("\n🔍 MISSING RECORDS")
        print("-" * 40)

        if missing.get("salesforce"):
            print(f"Missing in Salesforce: {len(missing['salesforce'])} records")
            for record in missing["salesforce"][:3]:
                print(f"  - {record.get('name')} ({record.get('email')})")

        if missing.get("salesloft"):
            print(f"Missing in Salesloft: {len(missing['salesloft'])} records")
            for record in missing["salesloft"][:3]:
                print(f"  - {record.get('name')} ({record.get('email')})")

    # Remediation Suggestions
    suggestions = results.get("remediation_suggestions", [])
    if suggestions:
        print("\n💡 REMEDIATION SUGGESTIONS")
        print("-" * 40)

        for idx, suggestion in enumerate(suggestions, 1):
            print(f"\n{idx}. [{suggestion['priority']}] {suggestion['category']}")
            print(f"   Issue: {suggestion['issue']}")
            print(f"   Actions:")
            for action in suggestion["actions"]:
                print(f"     • {action}")

    # Save detailed report
    report_file = f"/home/chris/Desktop/RevPal/Agents/reports/sync_diagnostic_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs(os.path.dirname(report_file), exist_ok=True)

    with open(report_file, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n📄 Detailed report saved to: {report_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Salesforce-Salesloft Sync Diagnostic Tool"
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Run quick diagnostic (skip detailed checks)"
    )
    parser.add_argument(
        "--focus",
        choices=["errors", "duplicates", "performance", "mapping", "missing"],
        help="Focus on specific diagnostic area"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to analyze (default: 7)"
    )
    parser.add_argument(
        "--export",
        choices=["json", "csv", "html"],
        help="Export format for report"
    )

    args = parser.parse_args()

    # Check for required environment variables
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        print("Please set: export SALESLOFT_TOKEN='your-token-here'")
        sys.exit(1)

    # Run diagnostics
    diagnostics = SyncDiagnostics()

    if args.quick:
        print("Running quick diagnostics...")
        # Run subset of checks
        results = diagnostics.run_full_diagnostic()  # Modify for quick mode
    elif args.focus:
        print(f"Focusing on {args.focus} diagnostics...")
        # Run specific checks based on focus area
        results = diagnostics.run_full_diagnostic()  # Modify for focused mode
    else:
        results = diagnostics.run_full_diagnostic()

    # Generate report
    generate_report(results)

    # Export in requested format
    if args.export:
        print(f"\nExporting report as {args.export}...")
        # Implement export functionality

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nDiagnostic interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)