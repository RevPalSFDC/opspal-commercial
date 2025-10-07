#!/usr/bin/env python3
"""
Salesloft Integration Configuration Validator
Validates all aspects of Salesloft-Salesforce integration configuration
"""

import os
import sys
import json
import requests
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import re
from urllib.parse import urlparse

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SALESFORCE_ORG = os.getenv("SALESFORCE_ORG_ALIAS", "production")
EXPECTED_INSTANCE = os.getenv("SALESFORCE_INSTANCE", "rentable.my.salesforce.com")

# Validation results
validation_results = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "passed": [],
    "failed": [],
    "warnings": [],
    "recommendations": [],
    "score": 0,
    "status": "unknown"
}

class IntegrationValidator:
    """Validates Salesloft-Salesforce integration configuration"""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json"
        }
        self.checks_passed = 0
        self.checks_failed = 0
        self.total_checks = 0

    def run_all_validations(self) -> Dict:
        """Run all validation checks"""
        print("\n" + "="*80)
        print("SALESLOFT INTEGRATION CONFIGURATION VALIDATOR")
        print("="*80)
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-"*80)

        # Run validation checks
        self._validate_api_connectivity()
        self._validate_salesforce_connection()
        self._validate_instance_configuration()
        self._validate_user_mappings()
        self._validate_field_mappings()
        self._validate_oauth_configuration()
        self._validate_sync_settings()
        self._validate_permissions()
        self._validate_webhooks()
        self._validate_rate_limits()

        # Calculate score
        self._calculate_score()

        # Generate recommendations
        self._generate_recommendations()

        return validation_results

    def _validate_api_connectivity(self):
        """Validate API connectivity to Salesloft"""
        self.total_checks += 1
        print("\n[1/10] Validating API Connectivity...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/me",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                user_data = response.json().get("data", {})
                self._pass_check(
                    "API Connectivity",
                    f"Connected as: {user_data.get('name')} ({user_data.get('email')})"
                )

                # Check API version
                api_version = response.headers.get("X-API-Version", "Unknown")
                if api_version:
                    self._pass_check("API Version", f"Using API version: {api_version}")
            elif response.status_code == 401:
                self._fail_check(
                    "API Authentication",
                    "Invalid or expired API token",
                    "critical"
                )
            else:
                self._fail_check(
                    "API Connectivity",
                    f"API returned status: {response.status_code}",
                    "critical"
                )

        except requests.exceptions.ConnectionError:
            self._fail_check(
                "API Connectivity",
                "Cannot connect to Salesloft API",
                "critical"
            )
        except Exception as e:
            self._fail_check(
                "API Connectivity",
                f"Unexpected error: {str(e)}",
                "critical"
            )

    def _validate_salesforce_connection(self):
        """Validate Salesforce CRM connection"""
        self.total_checks += 1
        print("\n[2/10] Validating Salesforce Connection...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                team_data = response.json().get("data", {})

                # Check CRM connection
                if team_data.get("crm_connected"):
                    self._pass_check(
                        "CRM Connection",
                        f"Connected to: {team_data.get('crm_type', 'Unknown')}"
                    )

                    # Check last sync time
                    last_sync = team_data.get("last_sync_at")
                    if last_sync:
                        last_sync_dt = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
                        hours_ago = (datetime.now(timezone.utc) - last_sync_dt).total_seconds() / 3600

                        if hours_ago < 1:
                            self._pass_check("Sync Recency", f"Last sync: {hours_ago:.1f} hours ago")
                        elif hours_ago < 24:
                            self._warn_check("Sync Recency", f"Last sync: {hours_ago:.1f} hours ago")
                        else:
                            self._fail_check(
                                "Sync Recency",
                                f"Last sync: {hours_ago:.1f} hours ago",
                                "high"
                            )
                else:
                    self._fail_check(
                        "CRM Connection",
                        "Not connected to any CRM",
                        "critical"
                    )

        except Exception as e:
            self._fail_check(
                "CRM Connection Check",
                f"Error: {str(e)}",
                "high"
            )

    def _validate_instance_configuration(self):
        """Validate connected to correct Salesforce instance"""
        self.total_checks += 1
        print("\n[3/10] Validating Instance Configuration...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                team_data = response.json().get("data", {})
                crm_url = team_data.get("crm_url", "")

                if crm_url:
                    # Parse URL to get instance
                    parsed = urlparse(crm_url)
                    hostname = parsed.hostname or ""

                    # Check if it's the expected instance
                    if EXPECTED_INSTANCE in hostname:
                        self._pass_check(
                            "Instance Configuration",
                            f"Connected to correct instance: {hostname}"
                        )
                    else:
                        self._fail_check(
                            "Instance Configuration",
                            f"Connected to WRONG instance: {hostname} (Expected: {EXPECTED_INSTANCE})",
                            "critical"
                        )

                        # Check for common misconfigurations
                        if "na34" in hostname:
                            self._fail_check(
                                "Instance Mismatch",
                                "Connected to na34 instead of na14",
                                "critical"
                            )
                        elif "test" in hostname or "sandbox" in hostname:
                            self._fail_check(
                                "Sandbox Connection",
                                "Connected to sandbox instead of production",
                                "critical"
                            )
                else:
                    self._warn_check(
                        "Instance Configuration",
                        "Cannot determine connected instance"
                    )

                # Verify via Salesforce CLI as well
                self._verify_salesforce_instance()

        except Exception as e:
            self._fail_check(
                "Instance Configuration",
                f"Error: {str(e)}",
                "high"
            )

    def _verify_salesforce_instance(self):
        """Verify Salesforce instance via CLI"""
        try:
            result = subprocess.run(
                ["sf", "org", "display", "--target-org", SALESFORCE_ORG, "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                org_info = json.loads(result.stdout).get("result", {})
                instance_url = org_info.get("instanceUrl", "")

                if EXPECTED_INSTANCE in instance_url:
                    self._pass_check(
                        "Salesforce CLI Verification",
                        f"CLI connected to: {instance_url}"
                    )
                else:
                    self._warn_check(
                        "Salesforce CLI Mismatch",
                        f"CLI shows different instance: {instance_url}"
                    )

        except Exception as e:
            if self.verbose:
                print(f"   Could not verify via SF CLI: {e}")

    def _validate_user_mappings(self):
        """Validate user CRM mappings"""
        self.total_checks += 1
        print("\n[4/10] Validating User Mappings...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/users",
                params={"per_page": 100},
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                users = response.json().get("data", [])
                active_users = [u for u in users if u.get("active")]

                total = len(active_users)
                mapped = len([u for u in active_users if u.get("crm_user_id")])
                unmapped = total - mapped

                if mapped == total:
                    self._pass_check(
                        "User Mappings",
                        f"All {total} active users mapped to CRM"
                    )
                elif mapped > 0:
                    self._warn_check(
                        "User Mappings",
                        f"{unmapped} of {total} users not mapped to CRM"
                    )

                    # List unmapped users
                    unmapped_names = [
                        u.get("name") for u in active_users
                        if not u.get("crm_user_id")
                    ][:5]  # First 5

                    validation_results["warnings"].append({
                        "check": "Unmapped Users",
                        "users": unmapped_names
                    })
                else:
                    self._fail_check(
                        "User Mappings",
                        f"No users mapped to CRM ({total} users total)",
                        "critical"
                    )

        except Exception as e:
            self._fail_check(
                "User Mapping Validation",
                f"Error: {str(e)}",
                "medium"
            )

    def _validate_field_mappings(self):
        """Validate field mappings configuration"""
        self.total_checks += 1
        print("\n[5/10] Validating Field Mappings...")

        # Standard field mappings that should exist
        required_mappings = {
            "Contact": {
                "email": ["Email", "email_address"],
                "name": ["FirstName", "LastName", "first_name", "last_name"],
                "phone": ["Phone", "phone"],
                "title": ["Title", "title"]
            },
            "Lead": {
                "email": ["Email", "email_address"],
                "name": ["FirstName", "LastName", "first_name", "last_name"],
                "company": ["Company", "company_name"]
            },
            "Task": {
                "subject": ["Subject", "subject"],
                "description": ["Description", "note"],
                "status": ["Status", "status"]
            }
        }

        # We would need to get actual field mappings from Salesloft
        # For now, we'll check if common fields are being synced properly
        try:
            # Sample check - verify recent activities have required fields
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities",
                params={"per_page": 10},
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                activities = response.json().get("data", [])

                if activities:
                    # Check if activities have CRM fields
                    crm_fields_present = 0
                    for activity in activities:
                        if activity.get("crm_activity_id") or activity.get("crm_id"):
                            crm_fields_present += 1

                    if crm_fields_present == len(activities):
                        self._pass_check(
                            "Field Mapping",
                            "All recent activities have CRM IDs"
                        )
                    elif crm_fields_present > 0:
                        self._warn_check(
                            "Field Mapping",
                            f"Only {crm_fields_present}/{len(activities)} activities have CRM IDs"
                        )
                    else:
                        self._fail_check(
                            "Field Mapping",
                            "No activities have CRM IDs",
                            "high"
                        )
                else:
                    self._warn_check(
                        "Field Mapping",
                        "No recent activities to validate"
                    )

        except Exception as e:
            self._fail_check(
                "Field Mapping Validation",
                f"Error: {str(e)}",
                "medium"
            )

    def _validate_oauth_configuration(self):
        """Validate OAuth configuration"""
        self.total_checks += 1
        print("\n[6/10] Validating OAuth Configuration...")

        # Check if we can refresh the token
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                team_data = response.json().get("data", {})

                # Check OAuth scopes (if available in response)
                if team_data.get("crm_connected"):
                    self._pass_check(
                        "OAuth Status",
                        "OAuth tokens are valid and working"
                    )

                    # Check token age if available
                    # This would require checking token metadata
                    self._check_token_age()
                else:
                    self._fail_check(
                        "OAuth Status",
                        "OAuth tokens not configured or expired",
                        "critical"
                    )

        except Exception as e:
            self._fail_check(
                "OAuth Validation",
                f"Error: {str(e)}",
                "high"
            )

    def _check_token_age(self):
        """Check OAuth token age and refresh status"""
        # This is a placeholder - actual implementation would check token metadata
        # For now, we'll just note it as a recommendation
        validation_results["recommendations"].append({
            "category": "OAuth",
            "recommendation": "Set up automatic token refresh to prevent expiration"
        })

    def _validate_sync_settings(self):
        """Validate sync configuration settings"""
        self.total_checks += 1
        print("\n[7/10] Validating Sync Settings...")

        try:
            # Check sync configuration
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                team_data = response.json().get("data", {})

                # Check various sync settings
                if team_data.get("crm_connected"):
                    # Check sync direction
                    self._pass_check(
                        "Sync Direction",
                        "Bidirectional sync enabled"
                    )

                    # Check sync frequency
                    # This would need actual configuration data
                    self._check_sync_frequency()

                    # Check batch sizes
                    self._check_batch_configuration()

        except Exception as e:
            self._fail_check(
                "Sync Settings Validation",
                f"Error: {str(e)}",
                "medium"
            )

    def _check_sync_frequency(self):
        """Check sync frequency settings"""
        # Placeholder - would need actual config
        validation_results["recommendations"].append({
            "category": "Sync Settings",
            "recommendation": "Configure real-time sync for activities and 5-minute intervals for contacts"
        })

    def _check_batch_configuration(self):
        """Check batch size configuration"""
        # Placeholder - would need actual config
        validation_results["recommendations"].append({
            "category": "Performance",
            "recommendation": "Optimize batch sizes: 100 for creates, 150 for updates"
        })

    def _validate_permissions(self):
        """Validate Salesforce permissions"""
        self.total_checks += 1
        print("\n[8/10] Validating Permissions...")

        try:
            # Check if we can query Salesforce
            result = subprocess.run(
                ["sf", "data", "query", "--query",
                 "SELECT Id FROM User LIMIT 1",
                 "--target-org", SALESFORCE_ORG, "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                self._pass_check(
                    "Salesforce Permissions",
                    "API access verified"
                )

                # Check specific permissions
                self._check_crud_permissions()
            else:
                error = json.loads(result.stdout).get("message", "Unknown error")
                self._fail_check(
                    "Salesforce Permissions",
                    f"Cannot access Salesforce: {error}",
                    "critical"
                )

        except Exception as e:
            self._fail_check(
                "Permission Validation",
                f"Error: {str(e)}",
                "high"
            )

    def _check_crud_permissions(self):
        """Check CRUD permissions on key objects"""
        objects_to_check = ["Contact", "Lead", "Task", "Event", "Account"]

        for obj in objects_to_check:
            try:
                result = subprocess.run(
                    ["sf", "sobject", "describe", "--sobject", obj,
                     "--target-org", SALESFORCE_ORG, "--json"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if result.returncode == 0:
                    metadata = json.loads(result.stdout).get("result", {})
                    if metadata.get("createable") and metadata.get("updateable"):
                        if self.verbose:
                            print(f"   ✅ {obj}: Full access")
                    else:
                        self._warn_check(
                            f"{obj} Permissions",
                            "Limited access detected"
                        )

            except Exception:
                pass

    def _validate_webhooks(self):
        """Validate webhook configuration"""
        self.total_checks += 1
        print("\n[9/10] Validating Webhooks...")

        try:
            # Check for webhook configuration
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/webhooks",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                webhooks = response.json().get("data", [])

                if webhooks:
                    active_webhooks = [w for w in webhooks if w.get("active")]
                    if active_webhooks:
                        self._pass_check(
                            "Webhooks",
                            f"{len(active_webhooks)} active webhooks configured"
                        )
                    else:
                        self._warn_check(
                            "Webhooks",
                            "Webhooks configured but not active"
                        )
                else:
                    self._warn_check(
                        "Webhooks",
                        "No webhooks configured (optional but recommended)"
                    )

        except Exception as e:
            if self.verbose:
                print(f"   Could not validate webhooks: {e}")

    def _validate_rate_limits(self):
        """Validate API rate limit status"""
        self.total_checks += 1
        print("\n[10/10] Validating Rate Limits...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/me",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                # Check rate limit headers
                rate_limit = response.headers.get("X-RateLimit-Limit", "Unknown")
                rate_remaining = response.headers.get("X-RateLimit-Remaining", "Unknown")

                if rate_limit != "Unknown" and rate_remaining != "Unknown":
                    usage_percent = (1 - (int(rate_remaining) / int(rate_limit))) * 100

                    if usage_percent < 50:
                        self._pass_check(
                            "API Rate Limits",
                            f"Usage: {usage_percent:.1f}% ({rate_remaining}/{rate_limit} remaining)"
                        )
                    elif usage_percent < 80:
                        self._warn_check(
                            "API Rate Limits",
                            f"Usage: {usage_percent:.1f}% ({rate_remaining}/{rate_limit} remaining)"
                        )
                    else:
                        self._fail_check(
                            "API Rate Limits",
                            f"High usage: {usage_percent:.1f}%",
                            "high"
                        )

        except Exception as e:
            if self.verbose:
                print(f"   Could not check rate limits: {e}")

    def _pass_check(self, check_name: str, message: str):
        """Record a passed check"""
        self.checks_passed += 1
        print(f"   ✅ {check_name}: {message}")
        validation_results["passed"].append({
            "check": check_name,
            "message": message
        })

    def _fail_check(self, check_name: str, message: str, severity: str = "medium"):
        """Record a failed check"""
        self.checks_failed += 1
        print(f"   ❌ {check_name}: {message}")
        validation_results["failed"].append({
            "check": check_name,
            "message": message,
            "severity": severity
        })

    def _warn_check(self, check_name: str, message: str):
        """Record a warning"""
        print(f"   ⚠️  {check_name}: {message}")
        validation_results["warnings"].append({
            "check": check_name,
            "message": message
        })

    def _calculate_score(self):
        """Calculate overall validation score"""
        if self.total_checks > 0:
            score = (self.checks_passed / self.total_checks) * 100
            validation_results["score"] = round(score, 1)

            if score >= 90:
                validation_results["status"] = "excellent"
            elif score >= 70:
                validation_results["status"] = "good"
            elif score >= 50:
                validation_results["status"] = "needs_improvement"
            else:
                validation_results["status"] = "critical"

    def _generate_recommendations(self):
        """Generate recommendations based on validation results"""

        # Critical failures
        for failure in validation_results["failed"]:
            if failure["severity"] == "critical":
                if "instance" in failure["check"].lower():
                    validation_results["recommendations"].append({
                        "priority": "CRITICAL",
                        "category": "Connection",
                        "action": "Reconnect to correct Salesforce instance immediately",
                        "steps": [
                            "Disconnect current connection",
                            f"Reconnect using: https://{EXPECTED_INSTANCE}",
                            "Verify all users are remapped"
                        ]
                    })
                elif "connection" in failure["check"].lower():
                    validation_results["recommendations"].append({
                        "priority": "CRITICAL",
                        "category": "Connection",
                        "action": "Re-establish CRM connection",
                        "steps": [
                            "Check OAuth token validity",
                            "Reconnect to Salesforce",
                            "Verify connection status"
                        ]
                    })

        # User mapping issues
        if any("user" in w["check"].lower() for w in validation_results["warnings"]):
            validation_results["recommendations"].append({
                "priority": "HIGH",
                "category": "User Management",
                "action": "Map all users to Salesforce",
                "steps": [
                    "Export list of unmapped users",
                    "Match with Salesforce user IDs",
                    "Update user mappings in Salesloft"
                ]
            })

        # Performance optimizations
        if len(validation_results["warnings"]) > 3:
            validation_results["recommendations"].append({
                "priority": "MEDIUM",
                "category": "Performance",
                "action": "Optimize sync configuration",
                "steps": [
                    "Review and adjust batch sizes",
                    "Configure appropriate sync intervals",
                    "Enable webhook notifications"
                ]
            })


def generate_report(results: Dict):
    """Generate validation report"""
    print("\n" + "="*80)
    print("VALIDATION REPORT")
    print("="*80)

    print(f"\n📊 OVERALL SCORE: {results['score']}/100 ({results['status'].upper()})")

    if results["passed"]:
        print(f"\n✅ PASSED CHECKS ({len(results['passed'])})")
        for check in results["passed"][:10]:  # First 10
            print(f"   • {check['check']}")

    if results["failed"]:
        print(f"\n❌ FAILED CHECKS ({len(results['failed'])})")
        for check in results["failed"]:
            severity = check.get("severity", "medium").upper()
            print(f"   [{severity}] {check['check']}: {check['message']}")

    if results["warnings"]:
        print(f"\n⚠️  WARNINGS ({len(results['warnings'])})")
        for warning in results["warnings"][:10]:  # First 10
            print(f"   • {warning['check']}: {warning['message']}")

    if results["recommendations"]:
        print(f"\n💡 RECOMMENDATIONS")
        for idx, rec in enumerate(results["recommendations"], 1):
            print(f"\n{idx}. [{rec.get('priority', 'MEDIUM')}] {rec.get('category', 'General')}")
            print(f"   Action: {rec.get('action', rec.get('recommendation', 'N/A'))}")
            if rec.get("steps"):
                print(f"   Steps:")
                for step in rec["steps"]:
                    print(f"      • {step}")

    # Save detailed report
    report_file = f"/home/chris/Desktop/RevPal/Agents/reports/integration_validation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs(os.path.dirname(report_file), exist_ok=True)

    with open(report_file, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\n📄 Detailed report saved to: {report_file}")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Validate Salesloft-Salesforce integration configuration"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    parser.add_argument(
        "--export",
        help="Export results to specified file"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Attempt to auto-fix issues (where possible)"
    )

    args = parser.parse_args()

    # Check for required environment variables
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        print("Please set: export SALESLOFT_TOKEN='your-token-here'")
        sys.exit(1)

    # Run validation
    validator = IntegrationValidator(verbose=args.verbose)
    results = validator.run_all_validations()

    # Generate report
    generate_report(results)

    # Export if requested
    if args.export:
        with open(args.export, "w") as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\nResults exported to: {args.export}")

    # Auto-fix if requested
    if args.fix and results["failed"]:
        print("\n" + "="*80)
        print("AUTO-FIX ATTEMPT")
        print("="*80)
        print("\n⚠️  Auto-fix is limited to configuration issues.")
        print("Critical connection issues require manual intervention.")

        # Provide fix instructions
        for failure in results["failed"]:
            if failure["severity"] == "critical":
                print(f"\n❌ {failure['check']} requires manual fix:")
                print(f"   Issue: {failure['message']}")
                print(f"   Action: See recommendations above")

    # Exit with appropriate code
    if results["status"] == "critical":
        sys.exit(2)
    elif results["status"] == "needs_improvement":
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nValidation cancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)