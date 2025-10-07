#!/usr/bin/env python3
"""
Real-time Salesloft Sync Monitoring Dashboard
Provides continuous monitoring with visual indicators and alerts
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple
import argparse
import threading
from collections import deque

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")

class MonitoringDashboard:
    """Real-time monitoring dashboard for Salesloft sync"""

    def __init__(self, refresh_interval: int = 60):
        self.refresh_interval = refresh_interval
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json"
        }
        self.metrics_history = deque(maxlen=60)  # Keep 1 hour of metrics
        self.alert_threshold = {
            "error_rate": 5,  # Alert if error rate > 5%
            "unmapped_users": 1,  # Alert if any unmapped users
            "sync_delay": 300,  # Alert if sync delay > 5 minutes
            "health_score": 70  # Alert if health score < 70
        }
        self.last_alert_time = {}
        self.alert_cooldown = 3600  # Don't repeat same alert for 1 hour

    def run(self, mode: str = "dashboard"):
        """Run the monitoring dashboard"""
        if mode == "dashboard":
            self._run_dashboard()
        elif mode == "continuous":
            self._run_continuous()
        elif mode == "once":
            metrics = self._collect_metrics()
            self._display_metrics(metrics)
            self._check_alerts(metrics)

    def _run_dashboard(self):
        """Run interactive dashboard mode"""
        print("\033[2J\033[H")  # Clear screen
        print("=" * 80)
        print(" SALESLOFT SYNC MONITORING DASHBOARD ".center(80))
        print("=" * 80)
        print(f"Refresh Rate: {self.refresh_interval} seconds | Press Ctrl+C to exit")
        print("-" * 80)

        try:
            while True:
                metrics = self._collect_metrics()
                self._display_dashboard(metrics)
                self._check_alerts(metrics)

                # Countdown to next refresh
                for i in range(self.refresh_interval, 0, -1):
                    print(f"\rNext refresh in {i} seconds... ", end="", flush=True)
                    time.sleep(1)

        except KeyboardInterrupt:
            print("\n\nDashboard stopped by user")
            self._export_metrics()

    def _run_continuous(self):
        """Run in continuous monitoring mode (for background/service)"""
        print(f"Starting continuous monitoring (refresh every {self.refresh_interval}s)")

        while True:
            try:
                metrics = self._collect_metrics()
                self.metrics_history.append(metrics)

                # Log metrics
                print(f"[{metrics['timestamp']}] Health: {metrics['health_score']}/100, "
                      f"Errors: {metrics['error_count']}, "
                      f"Success Rate: {metrics['success_rate']:.1f}%")

                # Check for alerts
                self._check_alerts(metrics)

                time.sleep(self.refresh_interval)

            except Exception as e:
                print(f"Error in monitoring loop: {e}")
                time.sleep(self.refresh_interval)

    def _collect_metrics(self) -> Dict:
        """Collect all monitoring metrics"""
        metrics = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "connection": self._check_connection(),
            "sync_stats": self._check_sync_stats(),
            "user_mappings": self._check_user_mappings(),
            "recent_errors": self._check_recent_errors(),
            "performance": self._check_performance(),
            "health_score": 0,
            "error_count": 0,
            "success_rate": 0.0
        }

        # Calculate composite metrics
        metrics["health_score"] = self._calculate_health_score(metrics)
        metrics["error_count"] = len(metrics["recent_errors"].get("errors", []))

        # Calculate success rate
        total = metrics["sync_stats"].get("total_syncs", 0)
        failed = metrics["sync_stats"].get("failed_syncs", 0)
        if total > 0:
            metrics["success_rate"] = ((total - failed) / total) * 100

        return metrics

    def _check_connection(self) -> Dict:
        """Check CRM connection status"""
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/team",
                headers=self.headers,
                timeout=5
            )
            if response.status_code == 200:
                data = response.json().get("data", {})
                return {
                    "connected": data.get("crm_connected", False),
                    "instance": data.get("crm_url", ""),
                    "status": "ok"
                }
        except:
            pass

        return {"connected": False, "instance": "", "status": "error"}

    def _check_sync_stats(self) -> Dict:
        """Check sync statistics for last hour"""
        stats = {
            "total_syncs": 0,
            "successful_syncs": 0,
            "failed_syncs": 0,
            "pending_syncs": 0,
            "last_sync": None
        }

        try:
            # Check email activities as proxy for sync activity
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=1)

            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails",
                params={
                    "created_at[gte]": start_time.isoformat(),
                    "created_at[lte]": end_time.isoformat(),
                    "per_page": 100
                },
                headers=self.headers,
                timeout=5
            )

            if response.status_code == 200:
                emails = response.json().get("data", [])
                stats["total_syncs"] = len(emails)
                stats["successful_syncs"] = len([e for e in emails if e.get("crm_activity_id")])
                stats["failed_syncs"] = stats["total_syncs"] - stats["successful_syncs"]

                if emails:
                    latest = max(emails, key=lambda x: x.get("created_at", ""))
                    stats["last_sync"] = latest.get("created_at", "")

        except:
            pass

        return stats

    def _check_user_mappings(self) -> Dict:
        """Check user mapping status"""
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/users",
                params={"per_page": 100},
                headers=self.headers,
                timeout=5
            )

            if response.status_code == 200:
                users = response.json().get("data", [])
                active = [u for u in users if u.get("active")]
                unmapped = [u for u in active if not u.get("crm_user_id")]

                return {
                    "total_users": len(active),
                    "mapped_users": len(active) - len(unmapped),
                    "unmapped_users": len(unmapped),
                    "unmapped_names": [u.get("name", "Unknown") for u in unmapped[:5]]
                }
        except:
            pass

        return {"total_users": 0, "mapped_users": 0, "unmapped_users": 0}

    def _check_recent_errors(self) -> Dict:
        """Check for recent sync errors"""
        errors_data = {
            "errors": [],
            "error_types": {},
            "affected_objects": {}
        }

        # Since we can't directly query errors, check for unsynced activities
        try:
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(minutes=15)

            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails",
                params={
                    "created_at[gte]": start_time.isoformat(),
                    "created_at[lte]": end_time.isoformat(),
                    "per_page": 50
                },
                headers=self.headers,
                timeout=5
            )

            if response.status_code == 200:
                emails = response.json().get("data", [])
                unsynced = [e for e in emails if not e.get("crm_activity_id")]

                for email in unsynced:
                    errors_data["errors"].append({
                        "type": "SyncError",
                        "object": "Email",
                        "time": email.get("created_at", ""),
                        "subject": email.get("subject", "")[:50]
                    })

        except:
            pass

        return errors_data

    def _check_performance(self) -> Dict:
        """Check sync performance metrics"""
        perf = {
            "api_response_time": 0,
            "queue_size": 0,
            "processing_delay": 0
        }

        # Measure API response time
        try:
            start = time.time()
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/me",
                headers=self.headers,
                timeout=5
            )
            perf["api_response_time"] = int((time.time() - start) * 1000)  # ms
        except:
            perf["api_response_time"] = -1

        return perf

    def _calculate_health_score(self, metrics: Dict) -> int:
        """Calculate overall health score (0-100)"""
        score = 100

        # Connection (30 points)
        if not metrics["connection"]["connected"]:
            score -= 30

        # User mappings (20 points)
        unmapped = metrics["user_mappings"]["unmapped_users"]
        if unmapped > 0:
            score -= min(20, unmapped * 4)

        # Error rate (30 points)
        if metrics["sync_stats"]["total_syncs"] > 0:
            error_rate = (metrics["sync_stats"]["failed_syncs"] /
                         metrics["sync_stats"]["total_syncs"]) * 100
            if error_rate > 10:
                score -= 30
            elif error_rate > 5:
                score -= 15
            elif error_rate > 2:
                score -= 5

        # Performance (20 points)
        response_time = metrics["performance"]["api_response_time"]
        if response_time > 2000 or response_time < 0:
            score -= 20
        elif response_time > 1000:
            score -= 10
        elif response_time > 500:
            score -= 5

        return max(0, score)

    def _display_dashboard(self, metrics: Dict):
        """Display dashboard with visual indicators"""
        # Clear screen and move cursor to top
        print("\033[2J\033[H")

        # Header
        print("=" * 80)
        print(" SALESLOFT SYNC MONITORING DASHBOARD ".center(80))
        print("=" * 80)
        print(f"Last Update: {metrics['timestamp']} | Health Score: {self._get_health_indicator(metrics['health_score'])}")
        print("-" * 80)

        # Connection Status
        conn = metrics["connection"]
        conn_icon = "✅" if conn["connected"] else "❌"
        print(f"\n📡 CONNECTION STATUS: {conn_icon}")
        print(f"   Connected: {conn['connected']}")
        print(f"   Instance: {conn['instance'] or 'Not connected'}")

        # Sync Statistics
        stats = metrics["sync_stats"]
        print(f"\n📊 SYNC STATISTICS (Last Hour):")
        print(f"   Total Syncs: {stats['total_syncs']}")
        print(f"   Successful: {stats['successful_syncs']} ({metrics['success_rate']:.1f}%)")
        print(f"   Failed: {stats['failed_syncs']}")
        print(f"   Last Sync: {stats['last_sync'] or 'None'}")

        # User Mappings
        users = metrics["user_mappings"]
        user_icon = "✅" if users["unmapped_users"] == 0 else "⚠️"
        print(f"\n👥 USER MAPPINGS: {user_icon}")
        print(f"   Total Users: {users['total_users']}")
        print(f"   Mapped: {users['mapped_users']}")
        print(f"   Unmapped: {users['unmapped_users']}")
        if users.get("unmapped_names"):
            print(f"   Unmapped Users: {', '.join(users['unmapped_names'][:3])}")

        # Recent Errors
        errors = metrics["recent_errors"]
        error_icon = "✅" if len(errors["errors"]) == 0 else "⚠️"
        print(f"\n⚠️  RECENT ERRORS (15 min): {error_icon}")
        print(f"   Error Count: {len(errors['errors'])}")
        if errors["errors"]:
            for err in errors["errors"][:3]:
                print(f"   - {err['type']}: {err['object']} - {err.get('subject', 'N/A')}")

        # Performance
        perf = metrics["performance"]
        perf_icon = "✅" if perf["api_response_time"] < 1000 else "⚠️"
        print(f"\n⚡ PERFORMANCE: {perf_icon}")
        print(f"   API Response Time: {perf['api_response_time']}ms")

        # Health Score Bar
        self._display_health_bar(metrics["health_score"])

        print("\n" + "-" * 80)

    def _display_metrics(self, metrics: Dict):
        """Display metrics in simple format (for 'once' mode)"""
        print("\nSALESLOFT SYNC STATUS")
        print("=" * 40)
        print(f"Timestamp: {metrics['timestamp']}")
        print(f"Health Score: {metrics['health_score']}/100")
        print(f"Connection: {metrics['connection']['connected']}")
        print(f"Success Rate: {metrics['success_rate']:.1f}%")
        print(f"Error Count: {metrics['error_count']}")
        print(f"Unmapped Users: {metrics['user_mappings']['unmapped_users']}")

    def _display_health_bar(self, score: int):
        """Display visual health score bar"""
        print(f"\n💪 OVERALL HEALTH: {score}/100")

        # Create visual bar
        bar_length = 50
        filled = int((score / 100) * bar_length)

        if score >= 80:
            color = "\033[92m"  # Green
        elif score >= 60:
            color = "\033[93m"  # Yellow
        else:
            color = "\033[91m"  # Red

        bar = color + "█" * filled + "\033[0m" + "░" * (bar_length - filled)
        print(f"   [{bar}] {score}%")

        # Health status message
        if score >= 90:
            print("   Status: Excellent - System running optimally")
        elif score >= 80:
            print("   Status: Good - Minor issues detected")
        elif score >= 70:
            print("   Status: Fair - Attention needed")
        elif score >= 60:
            print("   Status: Poor - Multiple issues detected")
        else:
            print("   Status: Critical - Immediate action required")

    def _get_health_indicator(self, score: int) -> str:
        """Get health indicator with color"""
        if score >= 80:
            return f"\033[92m{score}/100 ✅\033[0m"
        elif score >= 60:
            return f"\033[93m{score}/100 ⚠️\033[0m"
        else:
            return f"\033[91m{score}/100 ❌\033[0m"

    def _check_alerts(self, metrics: Dict):
        """Check metrics against alert thresholds"""
        alerts = []

        # Check health score
        if metrics["health_score"] < self.alert_threshold["health_score"]:
            alerts.append({
                "type": "health_score",
                "severity": "high",
                "message": f"Health score dropped to {metrics['health_score']}/100"
            })

        # Check error rate
        if metrics["success_rate"] < (100 - self.alert_threshold["error_rate"]):
            alerts.append({
                "type": "error_rate",
                "severity": "high",
                "message": f"Error rate is {100 - metrics['success_rate']:.1f}%"
            })

        # Check unmapped users
        if metrics["user_mappings"]["unmapped_users"] >= self.alert_threshold["unmapped_users"]:
            alerts.append({
                "type": "unmapped_users",
                "severity": "medium",
                "message": f"{metrics['user_mappings']['unmapped_users']} users are unmapped"
            })

        # Check connection
        if not metrics["connection"]["connected"]:
            alerts.append({
                "type": "connection",
                "severity": "critical",
                "message": "CRM connection lost"
            })

        # Send alerts if needed
        for alert in alerts:
            self._send_alert(alert, metrics)

    def _send_alert(self, alert: Dict, metrics: Dict):
        """Send alert via configured channels"""
        # Check cooldown
        alert_key = alert["type"]
        now = time.time()

        if alert_key in self.last_alert_time:
            if now - self.last_alert_time[alert_key] < self.alert_cooldown:
                return  # Skip alert due to cooldown

        self.last_alert_time[alert_key] = now

        # Console alert
        severity_icon = {
            "critical": "🔴",
            "high": "🟠",
            "medium": "🟡",
            "low": "🔵"
        }

        print(f"\n{severity_icon.get(alert['severity'], '⚠️')} ALERT: {alert['message']}")

        # Slack alert if configured
        if SLACK_WEBHOOK_URL:
            self._send_slack_alert(alert, metrics)

        # Log alert
        self._log_alert(alert, metrics)

    def _send_slack_alert(self, alert: Dict, metrics: Dict):
        """Send alert to Slack"""
        try:
            payload = {
                "text": f"{alert['severity'].upper()} Alert: Salesloft Sync Issue",
                "attachments": [{
                    "color": "danger" if alert["severity"] == "critical" else "warning",
                    "fields": [
                        {"title": "Issue", "value": alert["message"], "short": False},
                        {"title": "Health Score", "value": f"{metrics['health_score']}/100", "short": True},
                        {"title": "Success Rate", "value": f"{metrics['success_rate']:.1f}%", "short": True},
                        {"title": "Time", "value": metrics["timestamp"], "short": False}
                    ]
                }]
            }

            requests.post(SLACK_WEBHOOK_URL, json=payload, timeout=5)
        except:
            pass  # Silently fail Slack notifications

    def _log_alert(self, alert: Dict, metrics: Dict):
        """Log alert to file"""
        try:
            log_entry = {
                "timestamp": metrics["timestamp"],
                "alert": alert,
                "metrics": {
                    "health_score": metrics["health_score"],
                    "success_rate": metrics["success_rate"],
                    "error_count": metrics["error_count"]
                }
            }

            log_file = f"/tmp/salesloft_alerts_{datetime.now().strftime('%Y%m%d')}.json"

            # Read existing logs
            logs = []
            if os.path.exists(log_file):
                with open(log_file, "r") as f:
                    try:
                        logs = json.load(f)
                    except:
                        logs = []

            # Append new log
            logs.append(log_entry)

            # Write back
            with open(log_file, "w") as f:
                json.dump(logs, f, indent=2)

        except:
            pass  # Silently fail logging

    def _export_metrics(self):
        """Export collected metrics history"""
        if not self.metrics_history:
            return

        export_file = f"/tmp/salesloft_metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        with open(export_file, "w") as f:
            json.dump(list(self.metrics_history), f, indent=2)

        print(f"\nMetrics exported to: {export_file}")


def main():
    parser = argparse.ArgumentParser(description="Salesloft Sync Monitoring Dashboard")
    parser.add_argument(
        "--mode",
        choices=["dashboard", "continuous", "once"],
        default="dashboard",
        help="Monitoring mode"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Refresh interval in seconds (default: 60)"
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export metrics on exit"
    )

    args = parser.parse_args()

    # Check for API token
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN not set")
        print("\nRun: ./scripts/setup-salesloft-token.sh")
        sys.exit(1)

    # Create and run dashboard
    dashboard = MonitoringDashboard(refresh_interval=args.interval)

    try:
        dashboard.run(mode=args.mode)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped")
        if args.export:
            dashboard._export_metrics()


if __name__ == "__main__":
    main()