#!/usr/bin/env python3
"""
Baseline RevOps Audit Script
Measures key metrics across reports and dashboards:
- % with static dates
- % missing groupings
- % invalid fields
- % unused (not viewed in 90 days)
"""

import json
import subprocess
from datetime import datetime, timedelta
import os
import re

class BaselineRevOpsAudit:
    def __init__(self, org_alias=None):
        self.org_alias = org_alias or os.environ.get('SF_TARGET_ORG', 'production')
        self.metrics = {
            'reports': {
                'total': 0,
                'static_dates': 0,
                'missing_groupings': 0,
                'invalid_fields': 0,
                'unused_90_days': 0
            },
            'dashboards': {
                'total': 0,
                'stale_components': 0,
                'broken_reports': 0,
                'no_refresh_schedule': 0
            }
        }
        self.issues = []

    def run_audit(self):
        """Execute complete baseline audit"""
        print("=" * 60)
        print("BASELINE REVOPS AUDIT")
        print("=" * 60)
        print(f"Org: {self.org_alias}")
        print(f"Started: {datetime.now().isoformat()}")
        print()

        # Audit reports
        self.audit_reports()

        # Audit dashboards
        self.audit_dashboards()

        # Calculate percentages
        self.calculate_metrics()

        # Generate recommendations
        self.generate_recommendations()

        # Save results
        self.save_results()

    def audit_reports(self):
        """Audit all reports for common issues"""
        print("📊 Auditing Reports...")

        # Query all reports with metadata
        query = """
        SELECT Id, Name, DeveloperName, Description, FolderName,
               CreatedDate, LastModifiedDate, LastViewedDate,
               LastReferencedDate, Format, ReportType
        FROM Report
        ORDER BY LastViewedDate DESC NULLS LAST
        """

        try:
            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                reports = data['result']['records']
                self.metrics['reports']['total'] = len(reports)
                print(f"  Found {len(reports)} reports")

                # Check each report
                for report in reports:
                    self.check_report_issues(report)

        except Exception as e:
            print(f"❌ Error auditing reports: {e}")

    def check_report_issues(self, report):
        """Check individual report for issues"""
        report_id = report['Id']
        report_name = report['Name']

        # Check if unused (90+ days)
        last_viewed = report.get('LastViewedDate')
        if not last_viewed:
            self.metrics['reports']['unused_90_days'] += 1
            self.issues.append({
                'type': 'UNUSED_REPORT',
                'name': report_name,
                'id': report_id,
                'reason': 'Never viewed'
            })
        else:
            viewed_date = datetime.fromisoformat(last_viewed.replace('Z', '+00:00').replace('.000+00:00', '+00:00'))
            if (datetime.now() - viewed_date).days > 90:
                self.metrics['reports']['unused_90_days'] += 1
                self.issues.append({
                    'type': 'UNUSED_REPORT',
                    'name': report_name,
                    'id': report_id,
                    'reason': f'Not viewed in {(datetime.now() - viewed_date).days} days'
                })

        # Get report metadata to check for static dates and groupings
        self.check_report_metadata(report_id, report_name)

    def check_report_metadata(self, report_id, report_name):
        """Check report metadata for static dates, missing groupings, invalid fields"""

        # Query report metadata
        metadata_query = f"""
        SELECT Id, Metadata
        FROM Report
        WHERE Id = '{report_id}'
        """

        try:
            cmd = f'sf data query --query "{metadata_query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result', {}).get('records'):
                metadata = data['result']['records'][0].get('Metadata', {})

                # Check for static dates
                if self.has_static_dates(metadata):
                    self.metrics['reports']['static_dates'] += 1
                    self.issues.append({
                        'type': 'STATIC_DATES',
                        'name': report_name,
                        'id': report_id,
                        'reason': 'Contains hardcoded date filters'
                    })

                # Check for missing groupings
                if self.missing_groupings(metadata):
                    self.metrics['reports']['missing_groupings'] += 1
                    self.issues.append({
                        'type': 'MISSING_GROUPINGS',
                        'name': report_name,
                        'id': report_id,
                        'reason': 'No groupings defined'
                    })

                # Check for invalid fields
                if self.has_invalid_fields(metadata):
                    self.metrics['reports']['invalid_fields'] += 1
                    self.issues.append({
                        'type': 'INVALID_FIELDS',
                        'name': report_name,
                        'id': report_id,
                        'reason': 'Contains invalid or deleted field references'
                    })

        except subprocess.TimeoutExpired:
            # Skip if metadata query times out
            pass
        except Exception as e:
            # Log but continue
            pass

    def has_static_dates(self, metadata):
        """Check if report has static date filters"""
        # Look for date filters with specific dates (not relative)
        filters = metadata.get('reportFilters', [])
        for filter_item in filters:
            if 'Date' in filter_item.get('column', ''):
                value = filter_item.get('value', '')
                # Check if it's a specific date (YYYY-MM-DD format)
                if re.match(r'\d{4}-\d{2}-\d{2}', value):
                    return True
        return False

    def missing_groupings(self, metadata):
        """Check if report is missing groupings"""
        groupings_down = metadata.get('groupingsDown', [])
        groupings_across = metadata.get('groupingsAcross', [])
        return len(groupings_down) == 0 and len(groupings_across) == 0

    def has_invalid_fields(self, metadata):
        """Check for invalid field references"""
        # This is a simplified check - in production would validate against actual schema
        columns = metadata.get('columns', [])
        for column in columns:
            field = column.get('field', '')
            # Check for common invalid patterns
            if 'INVALID' in field or field.startswith('ERROR') or field == '':
                return True
        return False

    def audit_dashboards(self):
        """Audit all dashboards"""
        print("\n📊 Auditing Dashboards...")

        query = """
        SELECT Id, Title, DeveloperName, FolderName,
               CreatedDate, LastModifiedDate, LastViewedDate,
               RefreshSchedule, RunningUser.Name
        FROM Dashboard
        WHERE IsDeleted = false
        ORDER BY LastViewedDate DESC NULLS LAST
        """

        try:
            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                dashboards = data['result']['records']
                self.metrics['dashboards']['total'] = len(dashboards)
                print(f"  Found {len(dashboards)} dashboards")

                # Check each dashboard
                for dashboard in dashboards:
                    self.check_dashboard_issues(dashboard)

        except Exception as e:
            print(f"❌ Error auditing dashboards: {e}")

    def check_dashboard_issues(self, dashboard):
        """Check individual dashboard for issues"""
        dashboard_id = dashboard['Id']
        dashboard_name = dashboard.get('Title', 'Unnamed')

        # Check for refresh schedule
        if not dashboard.get('RefreshSchedule'):
            self.metrics['dashboards']['no_refresh_schedule'] += 1
            self.issues.append({
                'type': 'NO_REFRESH_SCHEDULE',
                'name': dashboard_name,
                'id': dashboard_id,
                'reason': 'Dashboard has no automated refresh'
            })

        # Check for stale components (simplified check)
        last_viewed = dashboard.get('LastViewedDate')
        if last_viewed:
            viewed_date = datetime.fromisoformat(last_viewed.replace('Z', '+00:00').replace('.000+00:00', '+00:00'))
            if (datetime.now() - viewed_date).days > 30:
                self.metrics['dashboards']['stale_components'] += 1
                self.issues.append({
                    'type': 'STALE_DASHBOARD',
                    'name': dashboard_name,
                    'id': dashboard_id,
                    'reason': f'Not viewed in {(datetime.now() - viewed_date).days} days'
                })

    def calculate_metrics(self):
        """Calculate percentage metrics"""
        print("\n📈 Calculating Metrics...")

        # Report percentages
        if self.metrics['reports']['total'] > 0:
            total = self.metrics['reports']['total']
            static_pct = (self.metrics['reports']['static_dates'] / total) * 100
            grouping_pct = (self.metrics['reports']['missing_groupings'] / total) * 100
            invalid_pct = (self.metrics['reports']['invalid_fields'] / total) * 100
            unused_pct = (self.metrics['reports']['unused_90_days'] / total) * 100

            print(f"\n📊 Report Metrics:")
            print(f"  {static_pct:.1f}% with static dates")
            print(f"  {grouping_pct:.1f}% missing groupings")
            print(f"  {invalid_pct:.1f}% with invalid fields")
            print(f"  {unused_pct:.1f}% unused (90+ days)")

        # Dashboard percentages
        if self.metrics['dashboards']['total'] > 0:
            total = self.metrics['dashboards']['total']
            stale_pct = (self.metrics['dashboards']['stale_components'] / total) * 100
            no_refresh_pct = (self.metrics['dashboards']['no_refresh_schedule'] / total) * 100

            print(f"\n📊 Dashboard Metrics:")
            print(f"  {stale_pct:.1f}% with stale components")
            print(f"  {no_refresh_pct:.1f}% without refresh schedule")

    def generate_recommendations(self):
        """Generate actionable recommendations"""
        print("\n💡 Recommendations:")

        # Quick wins
        if self.metrics['reports']['unused_90_days'] > 0:
            print(f"\n🎯 Quick Win: Archive {self.metrics['reports']['unused_90_days']} unused reports")
            print(f"   Potential reduction: {(self.metrics['reports']['unused_90_days'] / self.metrics['reports']['total']) * 100:.1f}%")

        if self.metrics['reports']['static_dates'] > 0:
            print(f"\n⚡ Priority Fix: Convert {self.metrics['reports']['static_dates']} reports to relative dates")
            print(f"   Impact: Eliminate daily maintenance")

        if self.metrics['dashboards']['no_refresh_schedule'] > 0:
            print(f"\n🔄 Automation: Schedule refresh for {self.metrics['dashboards']['no_refresh_schedule']} dashboards")
            print(f"   Benefit: Real-time data visibility")

    def save_results(self):
        """Save audit results to file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # Create audits directory
        os.makedirs('audits', exist_ok=True)

        # Save JSON results
        results = {
            'timestamp': datetime.now().isoformat(),
            'org': self.org_alias,
            'metrics': self.metrics,
            'issues': self.issues[:100],  # Top 100 issues
            'summary': {
                'total_reports': self.metrics['reports']['total'],
                'total_dashboards': self.metrics['dashboards']['total'],
                'total_issues': len(self.issues),
                'archive_candidates': self.metrics['reports']['unused_90_days'],
                'static_date_count': self.metrics['reports']['static_dates']
            }
        }

        json_file = f'audits/baseline_audit_{timestamp}.json'
        with open(json_file, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\n✅ Results saved to: {json_file}")

        # Generate markdown report
        md_file = f'audits/baseline_audit_{timestamp}.md'
        with open(md_file, 'w') as f:
            f.write("# Baseline RevOps Audit Report\n\n")
            f.write(f"**Date**: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
            f.write(f"**Organization**: {self.org_alias}\n\n")

            f.write("## Executive Summary\n\n")
            f.write(f"- **Total Reports**: {self.metrics['reports']['total']}\n")
            f.write(f"- **Total Dashboards**: {self.metrics['dashboards']['total']}\n")
            f.write(f"- **Total Issues Found**: {len(self.issues)}\n")
            f.write(f"- **Archive Candidates**: {self.metrics['reports']['unused_90_days']}\n\n")

            f.write("## Key Metrics\n\n")
            if self.metrics['reports']['total'] > 0:
                total = self.metrics['reports']['total']
                f.write("### Report Health\n")
                f.write(f"- Static Dates: {(self.metrics['reports']['static_dates'] / total) * 100:.1f}%\n")
                f.write(f"- Missing Groupings: {(self.metrics['reports']['missing_groupings'] / total) * 100:.1f}%\n")
                f.write(f"- Invalid Fields: {(self.metrics['reports']['invalid_fields'] / total) * 100:.1f}%\n")
                f.write(f"- Unused (90+ days): {(self.metrics['reports']['unused_90_days'] / total) * 100:.1f}%\n\n")

            f.write("## Top Issues\n\n")
            for issue in self.issues[:20]:
                f.write(f"- **{issue['type']}**: {issue['name']}\n")
                f.write(f"  - Reason: {issue['reason']}\n\n")

        print(f"📄 Report saved to: {md_file}")

        return json_file, md_file

if __name__ == "__main__":
    audit = BaselineRevOpsAudit()
    audit.run_audit()