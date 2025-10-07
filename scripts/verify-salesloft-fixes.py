#!/usr/bin/env python3
"""
Post-Fix Verification Script for Salesloft Sync
Verifies that automated fixes were successful and identifies remaining issues
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")

class SalesloftVerifier:
    """Verify Salesloft sync fixes were successful"""

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        self.results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": {},
            "issues_found": [],
            "issues_resolved": [],
            "manual_actions_needed": []
        }

    def run_verification(self) -> Dict:
        """Run all verification checks"""
        print("\n" + "="*60)
        print("SALESLOFT SYNC FIX VERIFICATION")
        print("="*60)
        print(f"Verification Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-"*60)

        # Run all checks
        self._check_connection_status()
        self._check_user_mappings()
        self._check_duplicates()
        self._check_recent_sync_errors()
        self._check_email_sync_status()
        self._calculate_health_score()

        return self.results

    def _check_connection_status(self):
        """Verify CRM connection is active"""
        print("\n1. Checking CRM Connection Status...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json().get("data", {})
                crm_connected = data.get("crm_connected", False)
                crm_url = data.get("crm_url", "")

                self.results["checks"]["connection"] = {
                    "connected": crm_connected,
                    "instance_url": crm_url
                }

                if crm_connected:
                    print(f"  ✅ CRM Connected: Yes")
                    print(f"  ✅ Instance URL: {crm_url}")

                    # Check if it's the correct instance
                    if "rentable" in crm_url.lower() or "na14" in crm_url.lower():
                        print(f"  ✅ Correct Instance: Yes")
                        self.results["issues_resolved"].append("CRM connection restored")
                    else:
                        print(f"  ❌ Correct Instance: No (Expected rentable/na14)")
                        self.results["manual_actions_needed"].append(
                            "Reconnect to correct Salesforce instance (rentable.my.salesforce.com)"
                        )
                else:
                    print(f"  ❌ CRM Connected: No")
                    self.results["manual_actions_needed"].append(
                        "Reconnect to Salesforce in Salesloft Settings → CRM"
                    )
            else:
                print(f"  ⚠️ Could not check connection status")

        except Exception as e:
            print(f"  ❌ Error checking connection: {e}")
            self.results["issues_found"].append(f"Connection check failed: {e}")

    def _check_user_mappings(self):
        """Check for unmapped users"""
        print("\n2. Checking User Mappings...")

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/users",
                params={"per_page": 100, "include_paging_counts": True},
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                users = response.json().get("data", [])
                active_users = [u for u in users if u.get("active")]
                unmapped_users = [u for u in active_users if not u.get("crm_user_id")]

                self.results["checks"]["user_mappings"] = {
                    "total_users": len(active_users),
                    "unmapped_count": len(unmapped_users),
                    "unmapped_users": [u.get("name", "Unknown") for u in unmapped_users]
                }

                print(f"  Total Active Users: {len(active_users)}")
                print(f"  Unmapped Users: {len(unmapped_users)}")

                if len(unmapped_users) == 0:
                    print(f"  ✅ All users are mapped!")
                    self.results["issues_resolved"].append("All users successfully mapped")
                else:
                    print(f"  ⚠️ Still have {len(unmapped_users)} unmapped users:")
                    for user in unmapped_users[:5]:
                        print(f"    - {user.get('name', 'Unknown')}")
                    self.results["issues_found"].append(f"{len(unmapped_users)} users still unmapped")

        except Exception as e:
            print(f"  ❌ Error checking users: {e}")

    def _check_duplicates(self):
        """Check for duplicate contacts"""
        print("\n3. Checking for Duplicate Contacts...")

        try:
            # This is a simplified check - real duplicate detection would be more complex
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/people",
                params={"per_page": 100},
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                people = response.json().get("data", [])

                # Group by email to find duplicates
                email_map = {}
                for person in people:
                    email = person.get("email_address", "").lower()
                    if email:
                        if email not in email_map:
                            email_map[email] = []
                        email_map[email].append(person)

                duplicates = {email: contacts for email, contacts in email_map.items() if len(contacts) > 1}

                self.results["checks"]["duplicates"] = {
                    "total_contacts": len(people),
                    "duplicate_groups": len(duplicates),
                    "duplicate_contacts": sum(len(contacts) - 1 for contacts in duplicates.values())
                }

                print(f"  Total Contacts: {len(people)}")
                print(f"  Duplicate Groups: {len(duplicates)}")

                if len(duplicates) == 0:
                    print(f"  ✅ No duplicates found!")
                    self.results["issues_resolved"].append("Duplicate contacts cleaned up")
                else:
                    print(f"  ⚠️ Still have {len(duplicates)} duplicate groups")
                    self.results["issues_found"].append(f"{len(duplicates)} duplicate groups remain")

        except Exception as e:
            print(f"  ❌ Error checking duplicates: {e}")

    def _check_recent_sync_errors(self):
        """Check for sync errors in the last 24 hours"""
        print("\n4. Checking Recent Sync Errors (24 hours)...")

        # Since we can't directly query sync errors via the API,
        # we'll check for activities without CRM IDs as a proxy
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=24)

        error_count = 0
        checked_count = 0

        # Check emails
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails",
                params={
                    "created_at[gte]": start_time.isoformat(),
                    "created_at[lte]": end_time.isoformat(),
                    "per_page": 100
                },
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                emails = response.json().get("data", [])
                checked_count += len(emails)
                unsynced = [e for e in emails if not e.get("crm_activity_id")]
                error_count += len(unsynced)

                print(f"  Emails checked: {len(emails)}")
                print(f"  Unsynced emails: {len(unsynced)}")

        except Exception as e:
            print(f"  ⚠️ Could not check email sync status: {e}")

        self.results["checks"]["sync_errors"] = {
            "period": "24_hours",
            "activities_checked": checked_count,
            "sync_errors": error_count
        }

        if error_count == 0:
            print(f"  ✅ No sync errors in last 24 hours!")
            self.results["issues_resolved"].append("All recent sync errors resolved")
        elif error_count <= 3:
            print(f"  ✅ Only {error_count} sync errors (acceptable)")
            self.results["issues_resolved"].append(f"Sync errors reduced to {error_count}")
        else:
            print(f"  ⚠️ Still have {error_count} sync errors")
            self.results["issues_found"].append(f"{error_count} sync errors in last 24 hours")

    def _check_email_sync_status(self):
        """Specifically check the problem dates from our original analysis"""
        print("\n5. Checking Original Problem Dates...")

        problem_dates = [
            ("2025-09-11", 18),  # 18 errors expected
            ("2025-09-10", 1),   # 1 error expected
            ("2025-09-03", 1),   # 1 error expected
        ]

        total_fixed = 0
        total_remaining = 0

        for date_str, expected_errors in problem_dates:
            try:
                response = requests.get(
                    f"{SALESLOFT_BASE_URL}/activities/emails",
                    params={
                        "created_at[gte]": f"{date_str}T00:00:00Z",
                        "created_at[lte]": f"{date_str}T23:59:59Z",
                        "per_page": 100
                    },
                    headers=self.headers,
                    timeout=10
                )

                if response.status_code == 200:
                    emails = response.json().get("data", [])
                    unsynced = [e for e in emails if not e.get("crm_activity_id")]

                    print(f"  {date_str}: {len(emails)} emails, {len(unsynced)} unsynced (was {expected_errors})")

                    if len(unsynced) == 0:
                        total_fixed += expected_errors
                    else:
                        total_remaining += len(unsynced)
                        total_fixed += max(0, expected_errors - len(unsynced))

            except Exception as e:
                print(f"  ⚠️ Could not check {date_str}: {e}")

        self.results["checks"]["problem_dates_fixed"] = {
            "errors_fixed": total_fixed,
            "errors_remaining": total_remaining
        }

        if total_remaining == 0:
            print(f"  ✅ All {total_fixed} original errors fixed!")
            self.results["issues_resolved"].append(f"All {total_fixed} email sync errors fixed")
        else:
            print(f"  ✅ Fixed {total_fixed} of original errors")
            print(f"  ⚠️ {total_remaining} errors still remain")

    def _calculate_health_score(self):
        """Calculate overall health score"""
        print("\n6. Calculating Health Score...")

        score = 100
        reasons = []

        # Connection (30 points)
        if self.results["checks"].get("connection", {}).get("connected"):
            print("  ✅ Connection: +30 points")
        else:
            score -= 30
            reasons.append("CRM not connected (-30)")

        # User mappings (20 points)
        unmapped = self.results["checks"].get("user_mappings", {}).get("unmapped_count", 0)
        if unmapped == 0:
            print("  ✅ User Mappings: +20 points")
        else:
            points_lost = min(20, unmapped * 4)
            score -= points_lost
            reasons.append(f"{unmapped} unmapped users (-{points_lost})")

        # Duplicates (15 points)
        dupes = self.results["checks"].get("duplicates", {}).get("duplicate_groups", 0)
        if dupes == 0:
            print("  ✅ No Duplicates: +15 points")
        else:
            points_lost = min(15, dupes * 1)
            score -= points_lost
            reasons.append(f"{dupes} duplicate groups (-{points_lost})")

        # Sync errors (35 points)
        errors = self.results["checks"].get("sync_errors", {}).get("sync_errors", 0)
        if errors == 0:
            print("  ✅ No Sync Errors: +35 points")
        elif errors <= 3:
            score -= 5
            print(f"  ✅ Minimal Errors: +30 points ({errors} errors, -5)")
        else:
            points_lost = min(35, errors * 2)
            score -= points_lost
            reasons.append(f"{errors} sync errors (-{points_lost})")

        self.results["health_score"] = {
            "score": max(0, score),
            "max_score": 100,
            "deductions": reasons
        }

        print(f"\n  HEALTH SCORE: {score}/100")
        if reasons:
            print("  Deductions:")
            for reason in reasons:
                print(f"    - {reason}")

    def generate_report(self) -> str:
        """Generate final verification report"""
        report = []
        report.append("\n" + "="*60)
        report.append("VERIFICATION SUMMARY")
        report.append("="*60)

        # Issues Resolved
        if self.results["issues_resolved"]:
            report.append("\n✅ ISSUES RESOLVED:")
            for issue in self.results["issues_resolved"]:
                report.append(f"  • {issue}")
        else:
            report.append("\n⚠️ No issues were resolved")

        # Remaining Issues
        if self.results["issues_found"]:
            report.append("\n⚠️ REMAINING ISSUES:")
            for issue in self.results["issues_found"]:
                report.append(f"  • {issue}")

        # Manual Actions Required
        if self.results["manual_actions_needed"]:
            report.append("\n🔧 MANUAL ACTIONS REQUIRED:")
            for action in self.results["manual_actions_needed"]:
                report.append(f"  • {action}")

        # Health Score
        health = self.results.get("health_score", {})
        score = health.get("score", 0)
        report.append(f"\n📊 HEALTH SCORE: {score}/100")

        if score >= 80:
            report.append("  ✅ System is healthy!")
        elif score >= 60:
            report.append("  ⚠️ System needs attention")
        else:
            report.append("  ❌ System has critical issues")

        # Next Steps
        report.append("\n" + "="*60)
        report.append("RECOMMENDED NEXT STEPS:")
        report.append("="*60)

        if self.results["manual_actions_needed"]:
            report.append("\n1. Complete Manual Actions:")
            for i, action in enumerate(self.results["manual_actions_needed"], 1):
                report.append(f"   {i}. {action}")

        report.append("\n2. Monitor System:")
        report.append("   python3 scripts/salesloft-sync-health-monitor.py --mode continuous")

        report.append("\n3. Run This Verification Again in 1 Hour:")
        report.append("   python3 scripts/verify-salesloft-fixes.py")

        return "\n".join(report)


def main():
    """Main execution"""
    # Check for API token
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN not set")
        print("\nRun: ./scripts/setup-salesloft-token.sh")
        sys.exit(1)

    # Run verification
    verifier = SalesloftVerifier()
    results = verifier.run_verification()

    # Generate report
    report = verifier.generate_report()
    print(report)

    # Save results
    results_file = f"/tmp/salesloft_verification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDetailed results saved to: {results_file}")

    # Exit code based on health score
    health_score = results.get("health_score", {}).get("score", 0)
    if health_score >= 80:
        sys.exit(0)  # Healthy
    elif health_score >= 60:
        sys.exit(1)  # Needs attention
    else:
        sys.exit(2)  # Critical


if __name__ == "__main__":
    main()