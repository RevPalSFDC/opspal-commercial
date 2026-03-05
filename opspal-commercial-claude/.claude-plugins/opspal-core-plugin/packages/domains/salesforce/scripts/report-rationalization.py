#!/usr/bin/env python3
"""
Report Rationalization Script
Analyzes all reports to identify archive, consolidation, and enhancement opportunities
Target: 25-30% reduction in report count
"""

import json
import subprocess
from datetime import datetime, timedelta
import os
import sys
from collections import defaultdict
import re

class ReportRationalizer:
    def __init__(self, org_alias=None):
        self.org_alias = org_alias or os.environ.get('SF_TARGET_ORG', 'production')
        self.reports = []
        self.recommendations = {
            'archive': [],
            'consolidate': [],
            'enhance': [],
            'keep': []
        }
        self.consolidation_groups = defaultdict(list)

    def analyze_reports(self):
        """Main analysis function"""
        print("=" * 60)
        print("REPORT RATIONALIZATION ANALYSIS")
        print("=" * 60)
        print(f"Timestamp: {datetime.now().isoformat()}")
        print(f"Org: {self.org_alias}")
        print()

        # Step 1: Get all reports
        self.fetch_all_reports()

        # Step 2: Analyze usage patterns
        self.analyze_usage_patterns()

        # Step 3: Identify duplicates
        self.identify_duplicates()

        # Step 4: Generate recommendations
        self.generate_recommendations()

        # Step 5: Create consolidation plan
        self.create_consolidation_plan()

        # Step 6: Generate report
        self.generate_rationalization_report()

    def fetch_all_reports(self):
        """Fetch all reports from Salesforce"""
        print("📊 Fetching all reports...")

        query = """
        SELECT Id, Name, DeveloperName, Description, FolderName,
               CreatedDate, LastModifiedDate, LastViewedDate,
               LastReferencedDate, CreatedBy.Name, Format, ReportType
        FROM Report
        ORDER BY LastViewedDate DESC NULLS LAST
        """

        try:
            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                self.reports = data['result']['records']
                print(f"✅ Found {len(self.reports)} reports")

                # Categorize by folder
                folders = defaultdict(int)
                for report in self.reports:
                    folders[report.get('FolderName', 'Unfiled')] += 1

                print("\nReports by Folder:")
                for folder, count in sorted(folders.items(), key=lambda x: x[1], reverse=True)[:10]:
                    print(f"  - {folder}: {count}")
            else:
                print("❌ Failed to fetch reports")

        except Exception as e:
            print(f"❌ Error fetching reports: {e}")

    def analyze_usage_patterns(self):
        """Analyze report usage patterns"""
        print("\n📈 Analyzing usage patterns...")

        now = datetime.now()
        never_viewed = 0
        not_viewed_90_days = 0
        not_viewed_30_days = 0
        viewed_recently = 0

        for report in self.reports:
            last_viewed = report.get('LastViewedDate')

            if not last_viewed:
                never_viewed += 1
            else:
                # Parse Salesforce datetime
                viewed_date = datetime.fromisoformat(last_viewed.replace('Z', '+00:00').replace('.000+00:00', '+00:00'))
                days_since_viewed = (now - viewed_date).days

                if days_since_viewed > 90:
                    not_viewed_90_days += 1
                elif days_since_viewed > 30:
                    not_viewed_30_days += 1
                else:
                    viewed_recently += 1

        print(f"  Never viewed: {never_viewed}")
        print(f"  Not viewed 90+ days: {not_viewed_90_days}")
        print(f"  Not viewed 30-90 days: {not_viewed_30_days}")
        print(f"  Viewed recently (<30 days): {viewed_recently}")

        # Store for recommendations
        self.usage_stats = {
            'never_viewed': never_viewed,
            'stale_90': not_viewed_90_days,
            'stale_30': not_viewed_30_days,
            'active': viewed_recently
        }

    def identify_duplicates(self):
        """Identify potential duplicate reports"""
        print("\n🔍 Identifying duplicate patterns...")

        # Group by similar names
        name_patterns = defaultdict(list)

        for report in self.reports:
            name = report.get('Name', '')
            # Extract base name (remove dates, numbers, copy indicators)
            base_name = re.sub(r'(\d{4}[-/]\d{2}[-/]\d{2}|\d+|copy|test|temp|v\d+|old|new)', '', name, flags=re.IGNORECASE)
            base_name = re.sub(r'[_\-\s]+', ' ', base_name).strip()

            if base_name:
                name_patterns[base_name.lower()].append(report)

        # Find groups with multiple reports
        duplicate_groups = 0
        total_duplicates = 0

        for base_name, reports_list in name_patterns.items():
            if len(reports_list) > 1:
                duplicate_groups += 1
                total_duplicates += len(reports_list) - 1
                self.consolidation_groups[base_name] = reports_list

        print(f"  Found {duplicate_groups} groups of similar reports")
        print(f"  Total potential duplicates: {total_duplicates}")

        # Show top duplicate groups
        print("\n  Top duplicate patterns:")
        sorted_groups = sorted(self.consolidation_groups.items(),
                              key=lambda x: len(x[1]), reverse=True)[:5]
        for base_name, reports_list in sorted_groups:
            print(f"    - '{base_name}': {len(reports_list)} variations")

    def generate_recommendations(self):
        """Generate rationalization recommendations"""
        print("\n💡 Generating recommendations...")

        for report in self.reports:
            name = report.get('Name', '')
            last_viewed = report.get('LastViewedDate')
            folder = report.get('FolderName', '')

            # Decision logic
            if not last_viewed:
                # Never viewed - archive
                self.recommendations['archive'].append({
                    'report': report,
                    'reason': 'Never viewed',
                    'confidence': 'HIGH'
                })
            elif last_viewed:
                viewed_date = datetime.fromisoformat(last_viewed.replace('Z', '+00:00').replace('.000+00:00', '+00:00'))
                days_since = (datetime.now() - viewed_date).days

                if days_since > 90:
                    # Not viewed in 90+ days - archive
                    self.recommendations['archive'].append({
                        'report': report,
                        'reason': f'Not viewed in {days_since} days',
                        'confidence': 'HIGH'
                    })
                elif days_since > 30:
                    # Check if it's a duplicate
                    if self.is_potential_duplicate(report):
                        self.recommendations['consolidate'].append({
                            'report': report,
                            'reason': 'Potential duplicate with low usage',
                            'confidence': 'MEDIUM'
                        })
                    else:
                        self.recommendations['keep'].append({
                            'report': report,
                            'reason': 'Moderate usage, unique report'
                        })
                else:
                    # Recently viewed
                    if self.is_potential_duplicate(report):
                        # Check if it's the primary version
                        if self.is_primary_version(report):
                            self.recommendations['enhance'].append({
                                'report': report,
                                'reason': 'Primary version of duplicated report',
                                'confidence': 'HIGH'
                            })
                        else:
                            self.recommendations['consolidate'].append({
                                'report': report,
                                'reason': 'Active duplicate - consolidate to primary',
                                'confidence': 'MEDIUM'
                            })
                    else:
                        self.recommendations['keep'].append({
                            'report': report,
                            'reason': 'Active and unique'
                        })

        # Summary
        total = len(self.reports)
        archive_count = len(self.recommendations['archive'])
        consolidate_count = len(self.recommendations['consolidate'])
        reduction = archive_count + consolidate_count
        reduction_pct = (reduction / total * 100) if total > 0 else 0

        print(f"\n📊 Recommendation Summary:")
        print(f"  Total Reports: {total}")
        print(f"  Archive: {archive_count}")
        print(f"  Consolidate: {consolidate_count}")
        print(f"  Enhance: {len(self.recommendations['enhance'])}")
        print(f"  Keep As-Is: {len(self.recommendations['keep'])}")
        print(f"  🎯 Total Reduction: {reduction} reports ({reduction_pct:.1f}%)")

    def is_potential_duplicate(self, report):
        """Check if report is a potential duplicate"""
        name = report.get('Name', '')
        base_name = re.sub(r'(\d{4}[-/]\d{2}[-/]\d{2}|\d+|copy|test|temp|v\d+|old|new)', '', name, flags=re.IGNORECASE)
        base_name = re.sub(r'[_\-\s]+', ' ', base_name).strip().lower()

        return base_name in self.consolidation_groups and len(self.consolidation_groups[base_name]) > 1

    def is_primary_version(self, report):
        """Determine if this is the primary version of duplicates"""
        name = report.get('Name', '')
        base_name = re.sub(r'(\d{4}[-/]\d{2}[-/]\d{2}|\d+|copy|test|temp|v\d+|old|new)', '', name, flags=re.IGNORECASE)
        base_name = re.sub(r'[_\-\s]+', ' ', base_name).strip().lower()

        if base_name in self.consolidation_groups:
            group = self.consolidation_groups[base_name]
            # Primary = most recently viewed
            sorted_group = sorted(group,
                                key=lambda x: x.get('LastViewedDate', ''),
                                reverse=True)
            return sorted_group[0]['Id'] == report['Id']
        return True

    def create_consolidation_plan(self):
        """Create detailed consolidation plan"""
        print("\n📋 Creating consolidation plan...")

        self.consolidation_plan = []

        for base_name, reports_list in self.consolidation_groups.items():
            if len(reports_list) > 1:
                # Sort by last viewed to find primary
                sorted_reports = sorted(reports_list,
                                      key=lambda x: x.get('LastViewedDate', ''),
                                      reverse=True)

                primary = sorted_reports[0]
                duplicates = sorted_reports[1:]

                plan_item = {
                    'pattern': base_name,
                    'primary': {
                        'id': primary['Id'],
                        'name': primary['Name'],
                        'last_viewed': primary.get('LastViewedDate', 'Never')
                    },
                    'duplicates': [
                        {
                            'id': dup['Id'],
                            'name': dup['Name'],
                            'last_viewed': dup.get('LastViewedDate', 'Never')
                        } for dup in duplicates
                    ],
                    'action': 'Consolidate duplicates into primary report'
                }

                self.consolidation_plan.append(plan_item)

        print(f"  Created {len(self.consolidation_plan)} consolidation groups")

    def generate_rationalization_report(self):
        """Generate comprehensive rationalization report"""
        print("\n📄 Generating rationalization report...")

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # Create reports directory if it doesn't exist
        os.makedirs('reports', exist_ok=True)

        # Generate Markdown report
        md_file = f'reports/rationalization_plan_{timestamp}.md'

        with open(md_file, 'w') as f:
            f.write("# Report Rationalization Plan\n\n")
            f.write(f"Generated: {datetime.now().isoformat()}\n")
            f.write(f"Organization: {self.org_alias}\n\n")

            # Executive Summary
            f.write("## Executive Summary\n\n")
            total = len(self.reports)
            reduction = len(self.recommendations['archive']) + len(self.recommendations['consolidate'])
            reduction_pct = (reduction / total * 100) if total > 0 else 0

            f.write(f"- **Total Reports**: {total}\n")
            f.write(f"- **Reports to Archive**: {len(self.recommendations['archive'])}\n")
            f.write(f"- **Reports to Consolidate**: {len(self.recommendations['consolidate'])}\n")
            f.write(f"- **Target Reduction**: {reduction} reports ({reduction_pct:.1f}%)\n")
            f.write(f"- **Goal Achievement**: {'✅ Met' if reduction_pct >= 25 else '⚠️ Below target'} (Target: 25-30%)\n\n")

            # Archive List
            f.write("## Reports to Archive\n\n")
            f.write("These reports have not been viewed in 90+ days or never:\n\n")

            for item in self.recommendations['archive'][:20]:  # Top 20
                report = item['report']
                f.write(f"- **{report['Name']}**\n")
                f.write(f"  - ID: {report['Id']}\n")
                f.write(f"  - Folder: {report.get('FolderName', 'Unfiled')}\n")
                f.write(f"  - Reason: {item['reason']}\n\n")

            if len(self.recommendations['archive']) > 20:
                f.write(f"*... and {len(self.recommendations['archive']) - 20} more*\n\n")

            # Consolidation Plan
            f.write("## Consolidation Plan\n\n")
            f.write("Groups of similar reports to consolidate:\n\n")

            for plan in self.consolidation_plan[:10]:  # Top 10 groups
                f.write(f"### {plan['pattern'].title()}\n")
                f.write(f"- **Keep**: {plan['primary']['name']}\n")
                f.write(f"- **Consolidate**:\n")
                for dup in plan['duplicates']:
                    f.write(f"  - {dup['name']}\n")
                f.write("\n")

            # Enhancement Opportunities
            f.write("## Enhancement Opportunities\n\n")
            f.write("High-value reports to enhance:\n\n")

            for item in self.recommendations['enhance'][:10]:
                report = item['report']
                f.write(f"- **{report['Name']}**\n")
                f.write(f"  - Reason: {item['reason']}\n")
                f.write(f"  - Action: Consolidate variations and add missing fields\n\n")

            # Implementation Steps
            f.write("## Implementation Steps\n\n")
            f.write("1. **Week 2 - Planning**\n")
            f.write("   - Review and approve rationalization plan\n")
            f.write("   - Notify report owners\n")
            f.write("   - Create backup of reports to be modified\n\n")

            f.write("2. **Week 3 - Execution**\n")
            f.write("   - Archive unused reports\n")
            f.write("   - Consolidate duplicate reports\n")
            f.write("   - Enhance primary reports with missing fields\n")
            f.write("   - Update dashboards with new report references\n\n")

            f.write("3. **Post-Implementation**\n")
            f.write("   - Monitor adoption of consolidated reports\n")
            f.write("   - Gather user feedback\n")
            f.write("   - Fine-tune as needed\n")

        # Generate JSON data file
        json_file = f'reports/rationalization_data_{timestamp}.json'

        with open(json_file, 'w') as f:
            json.dump({
                'summary': {
                    'total_reports': total,
                    'archive_count': len(self.recommendations['archive']),
                    'consolidate_count': len(self.recommendations['consolidate']),
                    'enhance_count': len(self.recommendations['enhance']),
                    'keep_count': len(self.recommendations['keep']),
                    'reduction_percentage': reduction_pct
                },
                'recommendations': {
                    'archive': [
                        {
                            'id': item['report']['Id'],
                            'name': item['report']['Name'],
                            'reason': item['reason']
                        } for item in self.recommendations['archive']
                    ],
                    'consolidate': [
                        {
                            'id': item['report']['Id'],
                            'name': item['report']['Name'],
                            'reason': item['reason']
                        } for item in self.recommendations['consolidate']
                    ]
                },
                'consolidation_plan': self.consolidation_plan
            }, f, indent=2)

        print(f"\n✅ Reports generated:")
        print(f"  - Markdown: {md_file}")
        print(f"  - JSON: {json_file}")

        return md_file, json_file

if __name__ == "__main__":
    rationalizer = ReportRationalizer()
    rationalizer.analyze_reports()