#!/usr/bin/env python3
"""
Salesloft Sync Health Monitor
Continuously monitors sync health and provides real-time alerts for issues
"""

import os
import sys
import json
import requests
import argparse
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
import time
from collections import defaultdict, Counter
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SLACK_WEBHOOK = os.getenv("SLACK_WEBHOOK_URL")
SALESFORCE_INSTANCE = os.getenv("SALESFORCE_INSTANCE", "rentable.my.salesforce.com")

# Alert thresholds
THRESHOLDS = {
    "error_rate": 5,  # Percent
    "sync_delay": 3600,  # Seconds (1 hour)
    "api_usage": 80,  # Percent
    "unmapped_users": 5,  # Count
    "connection_check_interval": 300,  # 5 minutes
}

# Error categorization
ERROR_CATEGORIES = {
    "connection": ["not connected", "connection lost", "unauthorized", "401", "403"],
    "instance": ["unable to find", "entity_is_deleted", "wrong instance", "na34"],
    "mapping": ["missing field", "required field", "invalid value", "field not accessible"],
    "rate_limit": ["rate limit", "too many requests", "429", "throttled"],
    "timeout": ["timeout", "timed out", "request timeout", "504"],
    "permission": ["permission denied", "access denied", "insufficient privileges"],
    "validation": ["validation error", "invalid", "constraint violation"],
    "duplicate": ["duplicate", "already exists", "unique constraint"],
}

class SyncHealthMonitor:
    """Main monitoring class for Salesloft sync health"""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json",
            "User-Agent": "salesloft-sync-health-monitor/1.0"
        }
        self.health_status = {
            "last_check": None,
            "connection_healthy": False,
            "error_trends": defaultdict(list),
            "performance_metrics": {},
            "alerts_sent": []
        }
        self.alert_cooldown = {}  # Prevent alert spam

    def check_connection_status(self) -> Dict:
        """Verify CRM connection is active and correct"""
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json().get("data", {})
                crm_url = data.get("crm_url", "")

                # Check if connected to correct instance
                correct_instance = SALESFORCE_INSTANCE in crm_url

                return {
                    "connected": data.get("crm_connected", False),
                    "crm_type": data.get("crm_type"),
                    "instance_url": crm_url,
                    "correct_instance": correct_instance,
                    "last_sync": data.get("last_sync_at")
                }
            else:
                return {
                    "connected": False,
                    "error": f"API returned {response.status_code}"
                }

        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }

    def check_sync_errors(self, hours: int = 1) -> Tuple[List[Dict], Dict]:
        """Check for recent sync errors and categorize them"""
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)

        errors = []
        error_summary = defaultdict(int)

        # Check CRM activities for sync failures
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/crm_activities",
                params={
                    "updated_at[gte]": start_time.isoformat(),
                    "per_page": 100
                },
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                activities = response.json().get("data", [])

                for activity in activities:
                    if activity.get("sync_status") == "failed" or activity.get("error"):
                        error = {
                            "id": activity.get("id"),
                            "type": activity.get("activity_type"),
                            "error_message": activity.get("error_message", "Unknown error"),
                            "created_at": activity.get("created_at"),
                            "person_id": activity.get("person_id"),
                            "category": self._categorize_error(activity.get("error_message", ""))
                        }
                        errors.append(error)
                        error_summary[error["category"]] += 1

        except Exception as e:
            if self.verbose:
                print(f"Error fetching sync errors: {e}")

        return errors, dict(error_summary)

    def _categorize_error(self, error_message: str) -> str:
        """Categorize error based on message content"""
        error_lower = error_message.lower()

        for category, keywords in ERROR_CATEGORIES.items():
            if any(keyword in error_lower for keyword in keywords):
                return category

        return "other"

    def check_user_mappings(self) -> Dict:
        """Verify all users have CRM IDs mapped"""
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/users",
                params={"per_page": 100},
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                users = response.json().get("data", [])

                unmapped_users = []
                partially_mapped = []

                for user in users:
                    if user.get("active"):
                        if not user.get("crm_user_id"):
                            unmapped_users.append({
                                "id": user.get("id"),
                                "name": user.get("name"),
                                "email": user.get("email")
                            })
                        elif not user.get("crm_user"):
                            partially_mapped.append({
                                "id": user.get("id"),
                                "name": user.get("name")
                            })

                return {
                    "total_active": len([u for u in users if u.get("active")]),
                    "fully_mapped": len(users) - len(unmapped_users) - len(partially_mapped),
                    "unmapped": unmapped_users,
                    "partially_mapped": partially_mapped
                }

        except Exception as e:
            if self.verbose:
                print(f"Error checking user mappings: {e}")
            return {}

    def check_sync_performance(self) -> Dict:
        """Analyze sync performance metrics"""
        metrics = {
            "avg_sync_time": 0,
            "sync_success_rate": 0,
            "last_successful_sync": None,
            "sync_delay": 0
        }

        try:
            # Get recent sync activities
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/crm_activities",
                params={
                    "per_page": 100,
                    "sort": "updated_at",
                    "sort_direction": "desc"
                },
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                activities = response.json().get("data", [])

                if activities:
                    # Calculate success rate
                    total = len(activities)
                    successful = len([a for a in activities if a.get("sync_status") != "failed"])
                    metrics["sync_success_rate"] = (successful / total) * 100 if total > 0 else 0

                    # Find last successful sync
                    for activity in activities:
                        if activity.get("sync_status") != "failed":
                            metrics["last_successful_sync"] = activity.get("updated_at")
                            break

                    # Calculate sync delay
                    if metrics["last_successful_sync"]:
                        last_sync = datetime.fromisoformat(
                            metrics["last_successful_sync"].replace("Z", "+00:00")
                        )
                        metrics["sync_delay"] = (
                            datetime.now(timezone.utc) - last_sync
                        ).total_seconds()

        except Exception as e:
            if self.verbose:
                print(f"Error checking sync performance: {e}")

        return metrics

    def check_field_mappings(self) -> Dict:
        """Verify field mappings are configured correctly"""
        mapping_issues = {
            "missing_mappings": [],
            "type_mismatches": [],
            "permission_issues": []
        }

        # This would require checking actual field configuration
        # For now, we'll check for common issues in error messages
        errors, _ = self.check_sync_errors(hours=24)

        for error in errors:
            msg = error.get("error_message", "").lower()

            if "required field" in msg or "missing field" in msg:
                mapping_issues["missing_mappings"].append(msg)
            elif "invalid type" in msg or "type mismatch" in msg:
                mapping_issues["type_mismatches"].append(msg)
            elif "field not accessible" in msg or "permission" in msg:
                mapping_issues["permission_issues"].append(msg)

        return mapping_issues

    def generate_health_score(self) -> Tuple[int, str]:
        """Generate overall health score (0-100) and status"""
        score = 100
        issues = []

        # Check connection (40 points)
        connection = self.check_connection_status()
        if not connection.get("connected"):
            score -= 40
            issues.append("CRM disconnected")
        elif not connection.get("correct_instance"):
            score -= 20
            issues.append("Wrong instance")

        # Check errors (30 points)
        errors, error_summary = self.check_sync_errors(hours=1)
        error_count = len(errors)
        if error_count > 10:
            score -= 30
            issues.append(f"{error_count} sync errors")
        elif error_count > 5:
            score -= 15
            issues.append(f"{error_count} sync errors")
        elif error_count > 0:
            score -= 5

        # Check user mappings (15 points)
        mappings = self.check_user_mappings()
        unmapped = len(mappings.get("unmapped", []))
        if unmapped > THRESHOLDS["unmapped_users"]:
            score -= 15
            issues.append(f"{unmapped} unmapped users")
        elif unmapped > 0:
            score -= 5

        # Check performance (15 points)
        performance = self.check_sync_performance()
        if performance.get("sync_success_rate", 100) < 90:
            score -= 10
            issues.append("Low success rate")
        if performance.get("sync_delay", 0) > THRESHOLDS["sync_delay"]:
            score -= 5
            issues.append("Sync delays")

        # Determine status
        if score >= 90:
            status = "healthy"
        elif score >= 70:
            status = "warning"
        elif score >= 50:
            status = "degraded"
        else:
            status = "critical"

        return score, status, issues

    def send_alert(self, severity: str, title: str, message: str, details: Dict = None):
        """Send alert via configured channels"""

        # Check cooldown to prevent spam
        alert_key = f"{severity}:{title}"
        if alert_key in self.alert_cooldown:
            last_sent = self.alert_cooldown[alert_key]
            if (datetime.now() - last_sent).total_seconds() < 3600:  # 1 hour cooldown
                return

        # Send to Slack
        if SLACK_WEBHOOK:
            self._send_slack_alert(severity, title, message, details)

        # Log alert
        self.health_status["alerts_sent"].append({
            "timestamp": datetime.now().isoformat(),
            "severity": severity,
            "title": title,
            "message": message
        })

        # Update cooldown
        self.alert_cooldown[alert_key] = datetime.now()

        if self.verbose:
            print(f"[{severity.upper()}] {title}: {message}")

    def _send_slack_alert(self, severity: str, title: str, message: str, details: Dict = None):
        """Send alert to Slack"""
        emoji_map = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🔵",
            "info": "ℹ️"
        }

        emoji = emoji_map.get(severity, "📢")
        color_map = {
            "critical": "#FF0000",
            "high": "#FF8C00",
            "medium": "#FFD700",
            "low": "#4169E1",
            "info": "#808080"
        }

        color = color_map.get(severity, "#808080")

        payload = {
            "text": f"{emoji} *Salesloft Sync Alert: {title}*",
            "attachments": [{
                "color": color,
                "fields": [
                    {
                        "title": "Issue",
                        "value": message,
                        "short": False
                    },
                    {
                        "title": "Severity",
                        "value": severity.upper(),
                        "short": True
                    },
                    {
                        "title": "Time",
                        "value": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "short": True
                    }
                ]
            }]
        }

        if details:
            payload["attachments"][0]["fields"].append({
                "title": "Details",
                "value": json.dumps(details, indent=2)[:500],  # Limit length
                "short": False
            })

        try:
            requests.post(SLACK_WEBHOOK, json=payload, timeout=5)
        except Exception as e:
            if self.verbose:
                print(f"Failed to send Slack alert: {e}")

    def analyze_and_alert(self):
        """Main analysis and alerting logic"""
        alerts_triggered = []

        # 1. Check connection
        connection = self.check_connection_status()
        if not connection.get("connected"):
            self.send_alert(
                "critical",
                "CRM Connection Lost",
                "Salesloft is not connected to Salesforce CRM",
                {"error": connection.get("error")}
            )
            alerts_triggered.append("connection_lost")
        elif not connection.get("correct_instance"):
            self.send_alert(
                "critical",
                "Wrong Salesforce Instance",
                f"Connected to {connection.get('instance_url')} instead of {SALESFORCE_INSTANCE}",
                connection
            )
            alerts_triggered.append("wrong_instance")

        # 2. Check sync errors
        errors, error_summary = self.check_sync_errors(hours=1)
        if len(errors) > THRESHOLDS["error_rate"]:
            # Group errors by category for better reporting
            top_category = max(error_summary.items(), key=lambda x: x[1])[0] if error_summary else "unknown"

            self.send_alert(
                "high" if len(errors) < 20 else "critical",
                "High Sync Error Rate",
                f"{len(errors)} sync errors in the last hour. Top issue: {top_category}",
                error_summary
            )
            alerts_triggered.append("high_error_rate")

        # 3. Check user mappings
        mappings = self.check_user_mappings()
        unmapped = mappings.get("unmapped", [])
        if len(unmapped) > THRESHOLDS["unmapped_users"]:
            self.send_alert(
                "medium",
                "Unmapped Users",
                f"{len(unmapped)} users not mapped to Salesforce",
                {"unmapped_users": [u["name"] for u in unmapped[:10]]}  # First 10
            )
            alerts_triggered.append("unmapped_users")

        # 4. Check performance
        performance = self.check_sync_performance()
        if performance.get("sync_delay", 0) > THRESHOLDS["sync_delay"]:
            delay_hours = performance["sync_delay"] / 3600
            self.send_alert(
                "high",
                "Sync Delays",
                f"Last successful sync was {delay_hours:.1f} hours ago",
                performance
            )
            alerts_triggered.append("sync_delays")

        if performance.get("sync_success_rate", 100) < 90:
            self.send_alert(
                "medium",
                "Low Sync Success Rate",
                f"Sync success rate is {performance['sync_success_rate']:.1f}%",
                performance
            )
            alerts_triggered.append("low_success_rate")

        return alerts_triggered

    def continuous_monitor(self, interval: int = 300):
        """Run continuous monitoring with specified interval (seconds)"""
        print(f"Starting continuous monitoring (interval: {interval}s)")
        print(f"Correct Salesforce instance: {SALESFORCE_INSTANCE}")
        print("-" * 80)

        while True:
            try:
                # Update timestamp
                self.health_status["last_check"] = datetime.now().isoformat()

                # Generate health score
                score, status, issues = self.generate_health_score()

                # Print status
                status_emoji = {
                    "healthy": "✅",
                    "warning": "⚠️",
                    "degraded": "🟡",
                    "critical": "🔴"
                }.get(status, "❓")

                print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]")
                print(f"Health Score: {score}/100 {status_emoji} ({status.upper()})")

                if issues:
                    print(f"Issues: {', '.join(issues)}")

                # Run analysis and alerting
                alerts = self.analyze_and_alert()

                if alerts:
                    print(f"Alerts sent: {', '.join(alerts)}")
                elif status == "healthy":
                    print("All systems operating normally")

                # Save status to file
                self._save_status(score, status, issues)

                # Wait for next iteration
                if self.verbose:
                    print(f"Next check in {interval} seconds...")

                time.sleep(interval)

            except KeyboardInterrupt:
                print("\nMonitoring stopped by user")
                break
            except Exception as e:
                print(f"Error in monitoring loop: {e}")
                time.sleep(interval)

    def _save_status(self, score: int, status: str, issues: List[str]):
        """Save current status to file for external monitoring"""
        status_file = "/tmp/salesloft_sync_health.json"

        status_data = {
            "timestamp": datetime.now().isoformat(),
            "score": score,
            "status": status,
            "issues": issues,
            "connection": self.check_connection_status(),
            "last_alerts": self.health_status["alerts_sent"][-5:] if self.health_status["alerts_sent"] else []
        }

        try:
            with open(status_file, "w") as f:
                json.dump(status_data, f, indent=2)
        except Exception as e:
            if self.verbose:
                print(f"Failed to save status file: {e}")

    def generate_report(self) -> Dict:
        """Generate comprehensive health report"""
        print("\n" + "="*80)
        print("SALESLOFT SYNC HEALTH REPORT")
        print("="*80)
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Get all metrics
        connection = self.check_connection_status()
        errors, error_summary = self.check_sync_errors(hours=24)
        mappings = self.check_user_mappings()
        performance = self.check_sync_performance()
        field_issues = self.check_field_mappings()
        score, status, issues = self.generate_health_score()

        # Print report
        print(f"\n📊 OVERALL HEALTH: {score}/100 ({status.upper()})")
        if issues:
            print(f"   Issues: {', '.join(issues)}")

        print(f"\n🔌 CONNECTION STATUS:")
        print(f"   Connected: {'✅ Yes' if connection.get('connected') else '❌ No'}")
        print(f"   Instance: {connection.get('instance_url', 'Not connected')}")
        print(f"   Correct: {'✅ Yes' if connection.get('correct_instance') else '❌ No'}")

        print(f"\n❌ SYNC ERRORS (24h):")
        print(f"   Total: {len(errors)}")
        if error_summary:
            print(f"   By Category:")
            for category, count in sorted(error_summary.items(), key=lambda x: x[1], reverse=True):
                print(f"      - {category}: {count}")

        print(f"\n👥 USER MAPPINGS:")
        print(f"   Total Active: {mappings.get('total_active', 0)}")
        print(f"   Fully Mapped: {mappings.get('fully_mapped', 0)}")
        print(f"   Unmapped: {len(mappings.get('unmapped', []))}")
        if mappings.get("unmapped"):
            print(f"   Unmapped Users:")
            for user in mappings["unmapped"][:5]:
                print(f"      - {user['name']} ({user['email']})")

        print(f"\n⚡ PERFORMANCE:")
        print(f"   Success Rate: {performance.get('sync_success_rate', 0):.1f}%")
        print(f"   Sync Delay: {performance.get('sync_delay', 0)/60:.1f} minutes")
        print(f"   Last Success: {performance.get('last_successful_sync', 'Unknown')}")

        print(f"\n🔧 FIELD MAPPING ISSUES:")
        for issue_type, issues_list in field_issues.items():
            if issues_list:
                print(f"   {issue_type}: {len(issues_list)} issues")

        # Return structured report
        return {
            "timestamp": datetime.now().isoformat(),
            "health_score": score,
            "health_status": status,
            "connection": connection,
            "errors": {
                "count": len(errors),
                "summary": error_summary
            },
            "mappings": mappings,
            "performance": performance,
            "field_issues": field_issues
        }


def main():
    parser = argparse.ArgumentParser(
        description="Monitor Salesloft-Salesforce sync health"
    )
    parser.add_argument(
        "--mode",
        choices=["continuous", "once", "report"],
        default="once",
        help="Monitoring mode"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=300,
        help="Check interval in seconds (for continuous mode)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )
    parser.add_argument(
        "--export",
        help="Export report to file"
    )

    args = parser.parse_args()

    # Check for required environment variables
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        sys.exit(1)

    # Initialize monitor
    monitor = SyncHealthMonitor(verbose=args.verbose)

    if args.mode == "continuous":
        # Run continuous monitoring
        monitor.continuous_monitor(interval=args.interval)
    elif args.mode == "report":
        # Generate detailed report
        report = monitor.generate_report()

        if args.export:
            with open(args.export, "w") as f:
                json.dump(report, f, indent=2)
            print(f"\n📄 Report exported to: {args.export}")
    else:
        # Run once
        score, status, issues = monitor.generate_health_score()
        print(f"Health Score: {score}/100 ({status})")

        if issues:
            print(f"Issues: {', '.join(issues)}")

        alerts = monitor.analyze_and_alert()

        if alerts:
            print(f"Alerts triggered: {', '.join(alerts)}")
        else:
            print("No critical issues detected")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)