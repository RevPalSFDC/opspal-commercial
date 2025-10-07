#!/usr/bin/env python3
"""
Real-time Salesforce-Salesloft Sync Dashboard

Interactive dashboard for monitoring sync status, errors, and performance metrics
in real-time with automated issue detection and alerting.
"""

import os
import sys
import json
import time
import requests
import subprocess
import curses
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict, deque
from threading import Thread, Lock
import asyncio
import websocket
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.text import Text

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SALESFORCE_ORG = os.getenv("SALESFORCE_ORG_ALIAS", "production")
REFRESH_INTERVAL = 5  # seconds
ALERT_THRESHOLD_ERROR_RATE = 0.1  # 10% error rate triggers alert
ALERT_THRESHOLD_LATENCY = 10  # 10 second latency triggers alert

# Dashboard state
dashboard_state = {
    "sync_status": "Unknown",
    "last_sync": None,
    "current_errors": [],
    "error_rate": 0.0,
    "success_rate": 100.0,
    "sync_latency": 0.0,
    "records_synced": 0,
    "alerts": deque(maxlen=20),
    "metrics_history": deque(maxlen=100),
    "active_syncs": {},
    "error_trends": defaultdict(int)
}

# Thread safety
state_lock = Lock()


class SyncMonitor:
    """Real-time sync monitoring engine"""

    def __init__(self):
        self.console = Console()
        self.running = True
        self.sl_headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json",
            "User-Agent": "sync-dashboard/1.0"
        }

    def start_monitoring(self):
        """Start the monitoring threads"""
        # Start data collection threads
        threads = [
            Thread(target=self.monitor_sync_status, daemon=True),
            Thread(target=self.monitor_errors, daemon=True),
            Thread(target=self.monitor_performance, daemon=True),
            Thread(target=self.monitor_salesforce, daemon=True)
        ]

        for thread in threads:
            thread.start()

        # Start the dashboard UI
        self.run_dashboard()

    def monitor_sync_status(self):
        """Monitor overall sync status"""
        while self.running:
            try:
                # Check Salesloft sync status
                response = requests.get(
                    f"{SALESLOFT_BASE_URL}/team",
                    headers=self.sl_headers,
                    timeout=10
                )

                if response.status_code == 200:
                    data = response.json().get("data", {})

                    with state_lock:
                        dashboard_state["sync_status"] = "Active" if data.get("crm_connected") else "Disconnected"
                        dashboard_state["last_sync"] = data.get("last_sync_at")

                        # Check for sync issues
                        if not data.get("crm_connected"):
                            self.add_alert("CRITICAL", "CRM sync is disconnected!")

            except Exception as e:
                with state_lock:
                    dashboard_state["sync_status"] = "Error"
                    self.add_alert("ERROR", f"Failed to check sync status: {str(e)}")

            time.sleep(REFRESH_INTERVAL)

    def monitor_errors(self):
        """Monitor sync errors in real-time"""
        while self.running:
            try:
                # Get recent errors
                end_time = datetime.now(timezone.utc)
                start_time = end_time - timedelta(minutes=5)

                response = requests.get(
                    f"{SALESLOFT_BASE_URL}/crm_activities",
                    headers=self.sl_headers,
                    params={
                        "created_at[gte]": start_time.isoformat(),
                        "per_page": 50,
                        "sort": "created_at",
                        "sort_direction": "desc"
                    },
                    timeout=10
                )

                if response.status_code == 200:
                    activities = response.json().get("data", [])

                    errors = []
                    success_count = 0
                    error_count = 0

                    for activity in activities:
                        if activity.get("sync_status") == "failed" or activity.get("error"):
                            errors.append({
                                "id": activity.get("id"),
                                "type": activity.get("activity_type"),
                                "error": activity.get("error_message", "Unknown error"),
                                "time": activity.get("created_at")
                            })
                            error_count += 1

                            # Track error trends
                            error_type = self._categorize_error(activity.get("error_message", ""))
                            with state_lock:
                                dashboard_state["error_trends"][error_type] += 1

                        elif activity.get("sync_status") == "success":
                            success_count += 1

                    # Update state
                    with state_lock:
                        dashboard_state["current_errors"] = errors[:10]  # Keep last 10 errors

                        total = success_count + error_count
                        if total > 0:
                            dashboard_state["error_rate"] = (error_count / total) * 100
                            dashboard_state["success_rate"] = (success_count / total) * 100

                            # Check alert thresholds
                            if dashboard_state["error_rate"] > ALERT_THRESHOLD_ERROR_RATE * 100:
                                self.add_alert("WARNING", f"High error rate: {dashboard_state['error_rate']:.1f}%")

            except Exception as e:
                self.add_alert("ERROR", f"Error monitoring failed: {str(e)}")

            time.sleep(REFRESH_INTERVAL)

    def monitor_performance(self):
        """Monitor sync performance metrics"""
        while self.running:
            try:
                # Track sync timing
                response = requests.get(
                    f"{SALESLOFT_BASE_URL}/activities/calls",
                    headers=self.sl_headers,
                    params={
                        "per_page": 10,
                        "sort": "created_at",
                        "sort_direction": "desc"
                    },
                    timeout=10
                )

                if response.status_code == 200:
                    calls = response.json().get("data", [])

                    # Calculate average sync latency
                    latencies = []
                    for call in calls:
                        created = call.get("created_at")
                        synced = call.get("crm_updated_at")

                        if created and synced:
                            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                            synced_dt = datetime.fromisoformat(synced.replace("Z", "+00:00"))
                            latency = (synced_dt - created_dt).total_seconds()
                            latencies.append(latency)

                    if latencies:
                        avg_latency = sum(latencies) / len(latencies)

                        with state_lock:
                            dashboard_state["sync_latency"] = avg_latency
                            dashboard_state["metrics_history"].append({
                                "timestamp": datetime.now(timezone.utc),
                                "latency": avg_latency,
                                "error_rate": dashboard_state["error_rate"]
                            })

                            if avg_latency > ALERT_THRESHOLD_LATENCY:
                                self.add_alert("WARNING", f"High sync latency: {avg_latency:.1f} seconds")

            except Exception as e:
                self.add_alert("ERROR", f"Performance monitoring failed: {str(e)}")

            time.sleep(REFRESH_INTERVAL * 2)  # Check less frequently

    def monitor_salesforce(self):
        """Monitor Salesforce side of the sync"""
        while self.running:
            try:
                # Query for recent sync activity in Salesforce
                query = """
                SELECT COUNT(Id)
                FROM Task
                WHERE CreatedDate >= LAST_N_MINUTES:5
                AND Salesloft_Activity_Id__c != null
                """

                result = subprocess.run(
                    ["sf", "data", "query", "--query", query, "--target-org", SALESFORCE_ORG, "--json"],
                    capture_output=True,
                    text=True,
                    timeout=15
                )

                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    count = data.get("result", {}).get("records", [{}])[0].get("expr0", 0)

                    with state_lock:
                        dashboard_state["records_synced"] = count

            except Exception as e:
                self.add_alert("ERROR", f"Salesforce monitoring failed: {str(e)}")

            time.sleep(REFRESH_INTERVAL * 3)  # Check less frequently

    def _categorize_error(self, error_msg: str) -> str:
        """Categorize error type"""
        error_msg = error_msg.lower()

        if "permission" in error_msg or "access" in error_msg:
            return "Permission"
        elif "duplicate" in error_msg:
            return "Duplicate"
        elif "validation" in error_msg or "invalid" in error_msg:
            return "Validation"
        elif "required" in error_msg:
            return "Required Field"
        elif "timeout" in error_msg:
            return "Timeout"
        elif "rate" in error_msg:
            return "Rate Limit"
        else:
            return "Other"

    def add_alert(self, level: str, message: str):
        """Add alert to dashboard"""
        with state_lock:
            dashboard_state["alerts"].append({
                "level": level,
                "message": message,
                "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S")
            })

    def run_dashboard(self):
        """Run the interactive dashboard"""
        layout = self.create_layout()

        with Live(layout, refresh_per_second=1, console=self.console) as live:
            try:
                while self.running:
                    self.update_layout(layout)
                    time.sleep(1)
            except KeyboardInterrupt:
                self.running = False
                print("\n\nDashboard stopped by user")

    def create_layout(self) -> Layout:
        """Create dashboard layout"""
        layout = Layout()

        layout.split(
            Layout(name="header", size=3),
            Layout(name="main"),
            Layout(name="footer", size=3)
        )

        layout["main"].split_row(
            Layout(name="left", ratio=1),
            Layout(name="center", ratio=2),
            Layout(name="right", ratio=1)
        )

        layout["left"].split(
            Layout(name="status"),
            Layout(name="metrics")
        )

        layout["center"].split(
            Layout(name="errors"),
            Layout(name="performance")
        )

        layout["right"].split(
            Layout(name="alerts"),
            Layout(name="trends")
        )

        return layout

    def update_layout(self, layout: Layout):
        """Update dashboard with current data"""
        with state_lock:
            # Header
            header_text = Text("Salesforce-Salesloft Sync Monitor", style="bold blue")
            header_text.append(f"\nLast Update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", style="dim")
            layout["header"].update(Panel(header_text))

            # Status panel
            status_table = Table(show_header=False, box=None)
            status_table.add_column("Field", style="cyan")
            status_table.add_column("Value")

            status_color = "green" if dashboard_state["sync_status"] == "Active" else "red"
            status_table.add_row("Sync Status:", Text(dashboard_state["sync_status"], style=status_color))

            if dashboard_state["last_sync"]:
                last_sync_dt = datetime.fromisoformat(dashboard_state["last_sync"].replace("Z", "+00:00"))
                mins_ago = (datetime.now(timezone.utc) - last_sync_dt).total_seconds() / 60
                status_table.add_row("Last Sync:", f"{mins_ago:.0f} mins ago")

            status_table.add_row("Records Synced:", str(dashboard_state["records_synced"]))

            layout["status"].update(Panel(status_table, title="Status", border_style="green"))

            # Metrics panel
            metrics_table = Table(show_header=False, box=None)
            metrics_table.add_column("Metric", style="cyan")
            metrics_table.add_column("Value")

            success_color = "green" if dashboard_state["success_rate"] > 95 else "yellow"
            metrics_table.add_row("Success Rate:", Text(f"{dashboard_state['success_rate']:.1f}%", style=success_color))

            error_color = "red" if dashboard_state["error_rate"] > 5 else "green"
            metrics_table.add_row("Error Rate:", Text(f"{dashboard_state['error_rate']:.1f}%", style=error_color))

            latency_color = "red" if dashboard_state["sync_latency"] > 10 else "green"
            metrics_table.add_row("Avg Latency:", Text(f"{dashboard_state['sync_latency']:.1f}s", style=latency_color))

            layout["metrics"].update(Panel(metrics_table, title="Metrics", border_style="blue"))

            # Errors panel
            if dashboard_state["current_errors"]:
                error_table = Table()
                error_table.add_column("Time", style="dim")
                error_table.add_column("Type")
                error_table.add_column("Error", overflow="fold")

                for error in dashboard_state["current_errors"][:5]:
                    error_time = error.get("time", "")
                    if error_time:
                        dt = datetime.fromisoformat(error_time.replace("Z", "+00:00"))
                        error_time = dt.strftime("%H:%M:%S")

                    error_table.add_row(
                        error_time,
                        error.get("type", "Unknown"),
                        error.get("error", "No message")[:50]
                    )

                layout["errors"].update(Panel(error_table, title="Recent Errors", border_style="red"))
            else:
                layout["errors"].update(Panel(Text("No recent errors", style="green"), title="Recent Errors"))

            # Performance graph (simplified)
            perf_text = Text("Latency Trend (last 100 checks):\n", style="cyan")

            if dashboard_state["metrics_history"]:
                # Create simple ASCII graph
                max_latency = max(m["latency"] for m in dashboard_state["metrics_history"])
                if max_latency > 0:
                    for metric in list(dashboard_state["metrics_history"])[-20:]:  # Last 20 points
                        bar_length = int((metric["latency"] / max_latency) * 30)
                        perf_text.append("█" * bar_length + "\n", style="blue")

            layout["performance"].update(Panel(perf_text, title="Performance", border_style="cyan"))

            # Alerts panel
            alerts_text = Text()
            for alert in reversed(list(dashboard_state["alerts"])[-10:]):  # Last 10 alerts
                level_style = {
                    "CRITICAL": "bold red",
                    "ERROR": "red",
                    "WARNING": "yellow",
                    "INFO": "cyan"
                }.get(alert["level"], "white")

                alerts_text.append(f"[{alert['timestamp']}] ", style="dim")
                alerts_text.append(f"{alert['level']}: ", style=level_style)
                alerts_text.append(f"{alert['message']}\n")

            layout["alerts"].update(Panel(alerts_text or Text("No alerts", style="green"), title="Alerts"))

            # Error trends
            trends_text = Text("Error Trends:\n", style="cyan")
            for error_type, count in sorted(dashboard_state["error_trends"].items(), key=lambda x: x[1], reverse=True)[:5]:
                trends_text.append(f"{error_type}: {count}\n")

            layout["trends"].update(Panel(trends_text, title="Error Trends", border_style="yellow"))

            # Footer
            footer_text = Text("Press Ctrl+C to exit | ", style="dim")
            footer_text.append("R", style="bold yellow")
            footer_text.append(" to refresh | ", style="dim")
            footer_text.append("E", style="bold yellow")
            footer_text.append(" to export report", style="dim")

            layout["footer"].update(Panel(footer_text))


def export_dashboard_state():
    """Export current dashboard state to file"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"/home/chris/Desktop/RevPal/Agents/reports/sync_dashboard_{timestamp}.json"

    with state_lock:
        export_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sync_status": dashboard_state["sync_status"],
            "last_sync": dashboard_state["last_sync"],
            "metrics": {
                "success_rate": dashboard_state["success_rate"],
                "error_rate": dashboard_state["error_rate"],
                "sync_latency": dashboard_state["sync_latency"],
                "records_synced": dashboard_state["records_synced"]
            },
            "recent_errors": dashboard_state["current_errors"],
            "alerts": list(dashboard_state["alerts"]),
            "error_trends": dict(dashboard_state["error_trends"])
        }

    os.makedirs(os.path.dirname(filename), exist_ok=True)

    with open(filename, "w") as f:
        json.dump(export_data, f, indent=2, default=str)

    print(f"\nDashboard state exported to: {filename}")


def main():
    """Main entry point"""
    print("Starting Salesforce-Salesloft Sync Dashboard...")
    print("-" * 50)

    # Check requirements
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        print("Please set: export SALESLOFT_TOKEN='your-token-here'")
        sys.exit(1)

    # Check Salesforce CLI
    try:
        result = subprocess.run(
            ["sf", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            print("Error: Salesforce CLI not found or not configured")
            sys.exit(1)
    except Exception as e:
        print(f"Error checking Salesforce CLI: {e}")
        sys.exit(1)

    # Start monitor
    monitor = SyncMonitor()

    try:
        monitor.start_monitoring()
    except KeyboardInterrupt:
        print("\n\nShutting down dashboard...")
        export_dashboard_state()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()