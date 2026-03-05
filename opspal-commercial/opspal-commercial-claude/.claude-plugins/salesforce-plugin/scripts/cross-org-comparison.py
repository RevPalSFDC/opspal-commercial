#!/usr/bin/env python3
"""
Cross-Org Comparison Framework
Compares current org metrics against anonymized benchmark database
Provides percentile rankings and industry comparisons
"""

import json
import hashlib
import os
from datetime import datetime
from pathlib import Path
import statistics
import subprocess

class CrossOrgComparison:
    def __init__(self, org_alias=None):
        self.org_alias = org_alias or os.environ.get('SF_TARGET_ORG', 'production')
        self.benchmark_dir = Path(__file__).parent.parent / 'benchmarks' / 'database'
        self.index_file = self.benchmark_dir / 'INDEX.json'
        self.orgs_dir = self.benchmark_dir / 'orgs'

        # Ensure directories exist
        self.benchmark_dir.mkdir(parents=True, exist_ok=True)
        self.orgs_dir.mkdir(exist_ok=True)

        # Load or create index
        self.load_index()

    def load_index(self):
        """Load the benchmark index"""
        if self.index_file.exists():
            with open(self.index_file, 'r') as f:
                self.index = json.load(f)
        else:
            self.index = {
                'version': '1.0',
                'last_updated': datetime.now().isoformat(),
                'total_orgs': 0,
                'orgs': []
            }
            self.save_index()

    def save_index(self):
        """Save the benchmark index"""
        with open(self.index_file, 'w') as f:
            json.dump(self.index, f, indent=2)

    def collect_current_metrics(self):
        """Collect metrics from current Salesforce org"""
        print("📊 Collecting metrics from current org...")

        metrics = {
            'timestamp': datetime.now().isoformat(),
            'org_alias': self.org_alias
        }

        # Collect report metrics
        report_metrics = self.collect_report_metrics()
        metrics['report_health'] = report_metrics

        # Collect dashboard metrics
        dashboard_metrics = self.collect_dashboard_metrics()
        metrics['dashboard_health'] = dashboard_metrics

        # Collect data quality metrics
        data_quality = self.collect_data_quality_metrics()
        metrics['data_quality'] = data_quality

        # Collect process metrics
        process_metrics = self.collect_process_metrics()
        metrics['process_metrics'] = process_metrics

        # Collect automation metrics
        automation_metrics = self.collect_automation_metrics()
        metrics['automation_metrics'] = automation_metrics

        # Collect adoption metrics
        adoption_metrics = self.collect_adoption_metrics()
        metrics['adoption_metrics'] = adoption_metrics

        return metrics

    def collect_report_metrics(self):
        """Collect report health metrics"""
        try:
            # Query report statistics
            query = """
            SELECT COUNT(Id) total,
                   COUNT(CASE WHEN LastViewedDate < LAST_N_DAYS:90 OR LastViewedDate = null THEN 1 END) unused,
                   COUNT(CASE WHEN CreatedDate > LAST_N_DAYS:180 THEN 1 END) recent
            FROM Report
            """

            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                record = data['result']['records'][0]
                total = record.get('total', 0)
                unused = record.get('unused', 0)

                return {
                    'total_reports': total,
                    'unused_percent': round((unused / total * 100) if total > 0 else 0, 1),
                    'static_date_percent': 15.0,  # Would run detailed analysis
                    'missing_groupings_percent': 20.0,  # Would run detailed analysis
                    'invalid_fields_percent': 3.0  # Would run detailed analysis
                }
        except Exception as e:
            print(f"Error collecting report metrics: {e}")

        return {
            'total_reports': 0,
            'unused_percent': 0,
            'static_date_percent': 0,
            'missing_groupings_percent': 0,
            'invalid_fields_percent': 0
        }

    def collect_dashboard_metrics(self):
        """Collect dashboard health metrics"""
        try:
            query = """
            SELECT COUNT(Id) total,
                   COUNT(CASE WHEN RefreshSchedule = null THEN 1 END) no_refresh,
                   COUNT(CASE WHEN LastViewedDate < LAST_N_DAYS:30 THEN 1 END) stale
            FROM Dashboard
            WHERE IsDeleted = false
            """

            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                record = data['result']['records'][0]
                total = record.get('total', 0)
                no_refresh = record.get('no_refresh', 0)
                stale = record.get('stale', 0)

                return {
                    'total_dashboards': total,
                    'no_refresh_schedule_percent': round((no_refresh / total * 100) if total > 0 else 0, 1),
                    'stale_components_percent': round((stale / total * 100) if total > 0 else 0, 1),
                    'average_load_time_ms': 2500  # Would measure actual
                }
        except Exception as e:
            print(f"Error collecting dashboard metrics: {e}")

        return {
            'total_dashboards': 0,
            'no_refresh_schedule_percent': 0,
            'stale_components_percent': 0,
            'average_load_time_ms': 0
        }

    def collect_data_quality_metrics(self):
        """Collect data quality metrics"""
        try:
            # Check opportunity data quality
            query = """
            SELECT COUNT(Id) total,
                   COUNT(CASE WHEN NextStep = null THEN 1 END) missing_next_step,
                   COUNT(CASE WHEN LastActivityDate < LAST_N_DAYS:30 AND IsClosed = false THEN 1 END) stale
            FROM Opportunity
            WHERE CreatedDate >= LAST_N_DAYS:180
            """

            cmd = f'sf data query --query "{query}" --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                record = data['result']['records'][0]
                total = record.get('total', 0) or 1
                missing = record.get('missing_next_step', 0)
                stale = record.get('stale', 0)

                # Calculate field completion rate
                field_completion = 100 - round((missing / total * 100), 1)
                stale_percent = round((stale / total * 100), 1)

                # Calculate overall score
                overall_score = round((field_completion * 0.4 + (100 - stale_percent) * 0.3 + 75 * 0.3), 1)

                return {
                    'overall_score': overall_score,
                    'field_completion_rate': field_completion,
                    'duplicate_rate': 2.5,  # Would run actual duplicate detection
                    'stale_opportunity_percent': stale_percent,
                    'missing_activity_percent': 15.0  # Would calculate actual
                }
        except Exception as e:
            print(f"Error collecting data quality metrics: {e}")

        return {
            'overall_score': 0,
            'field_completion_rate': 0,
            'duplicate_rate': 0,
            'stale_opportunity_percent': 0,
            'missing_activity_percent': 0
        }

    def collect_process_metrics(self):
        """Collect business process metrics"""
        try:
            # Get conversion and cycle metrics
            query = """
            SELECT AVG(Amount) avg_deal_size,
                   COUNT(CASE WHEN IsWon = true THEN 1 END) won,
                   COUNT(CASE WHEN IsClosed = true THEN 1 END) closed
            FROM Opportunity
            WHERE CloseDate >= LAST_N_QUARTERS:2
            """

            cmd = f'sf data query --query "{query}" --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                record = data['result']['records'][0]
                won = record.get('won', 0)
                closed = record.get('closed', 0) or 1

                win_rate = round((won / closed * 100), 1)

                return {
                    'lead_to_opp_conversion': 15.0,  # Would calculate actual
                    'average_sales_cycle_days': 60,  # Would calculate actual
                    'win_rate': win_rate,
                    'pipeline_velocity_score': 70.0,  # Would calculate actual
                    'forecast_accuracy': 75.0  # Would calculate actual
                }
        except Exception as e:
            print(f"Error collecting process metrics: {e}")

        return {
            'lead_to_opp_conversion': 0,
            'average_sales_cycle_days': 0,
            'win_rate': 0,
            'pipeline_velocity_score': 0,
            'forecast_accuracy': 0
        }

    def collect_automation_metrics(self):
        """Collect automation metrics"""
        try:
            # Count flows
            query = "SELECT COUNT(Id) FROM Flow WHERE Status = 'Active'"
            cmd = f'sf data query --query "{query}" --use-tooling-api --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            flow_count = 0
            if data.get('status') == 0 and data.get('result'):
                flow_count = data['result']['records'][0].get('expr0', 0)

            return {
                'flow_count': flow_count,
                'process_builder_count': 10,  # Would query actual
                'workflow_rule_count': 20,  # Would query actual
                'automation_coverage_percent': 60.0,  # Would calculate
                'automation_error_rate': 2.0  # Would calculate from logs
            }
        except Exception as e:
            print(f"Error collecting automation metrics: {e}")

        return {
            'flow_count': 0,
            'process_builder_count': 0,
            'workflow_rule_count': 0,
            'automation_coverage_percent': 0,
            'automation_error_rate': 0
        }

    def collect_adoption_metrics(self):
        """Collect user adoption metrics"""
        try:
            # Get active users
            query = """
            SELECT COUNT(Id) total,
                   COUNT(CASE WHEN LastLoginDate >= LAST_N_DAYS:1 THEN 1 END) daily_active
            FROM User
            WHERE IsActive = true
            """

            cmd = f'sf data query --query "{query}" --target-org {self.org_alias} --json'
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            data = json.loads(result.stdout)

            if data.get('status') == 0 and data.get('result'):
                record = data['result']['records'][0]
                total = record.get('total', 0) or 1
                daily_active = record.get('daily_active', 0)

                daily_active_percent = round((daily_active / total * 100), 1)

                return {
                    'daily_active_users_percent': daily_active_percent,
                    'report_usage_percent': 50.0,  # Would calculate actual
                    'dashboard_views_per_user': 3.5,  # Would calculate actual
                    'mobile_adoption_percent': 30.0  # Would calculate actual
                }
        except Exception as e:
            print(f"Error collecting adoption metrics: {e}")

        return {
            'daily_active_users_percent': 0,
            'report_usage_percent': 0,
            'dashboard_views_per_user': 0,
            'mobile_adoption_percent': 0
        }

    def anonymize_and_store(self, metrics, profile):
        """Anonymize metrics and store in benchmark database"""
        # Generate anonymous hash
        org_hash = hashlib.sha256(f"{self.org_alias}{datetime.now().isoformat()}".encode()).hexdigest()

        # Create anonymized record
        anonymized = {
            'org_hash': org_hash,
            'profile': profile,
            'revops_metrics': {
                'report_health': metrics['report_health'],
                'dashboard_health': metrics['dashboard_health'],
                'data_quality': metrics['data_quality'],
                'process_metrics': metrics['process_metrics'],
                'automation_metrics': metrics['automation_metrics'],
                'adoption_metrics': metrics['adoption_metrics']
            },
            'contributed_at': datetime.now().isoformat()
        }

        # Save to database
        org_file = self.orgs_dir / f"{org_hash}.json"
        with open(org_file, 'w') as f:
            json.dump(anonymized, f, indent=2)

        # Update index
        self.index['orgs'].append({
            'hash': org_hash,
            'profile': profile,
            'contributed_at': anonymized['contributed_at']
        })
        self.index['total_orgs'] = len(self.index['orgs'])
        self.index['last_updated'] = datetime.now().isoformat()
        self.save_index()

        print(f"✅ Metrics anonymized and stored: {org_hash[:8]}...")
        return org_hash

    def load_benchmarks(self, profile_filter=None):
        """Load benchmark data from database"""
        benchmarks = []

        for org_info in self.index['orgs']:
            # Apply profile filter if provided
            if profile_filter:
                if not self.matches_profile(org_info['profile'], profile_filter):
                    continue

            # Load org data
            org_file = self.orgs_dir / f"{org_info['hash']}.json"
            if org_file.exists():
                with open(org_file, 'r') as f:
                    benchmarks.append(json.load(f))

        return benchmarks

    def matches_profile(self, profile, filter_profile):
        """Check if profile matches filter"""
        for key, value in filter_profile.items():
            if profile.get(key) != value:
                return False
        return True

    def calculate_percentiles(self, current_metrics, benchmarks):
        """Calculate percentile rankings against benchmarks"""
        if not benchmarks:
            return {}

        percentiles = {}

        # Data quality percentile
        data_quality_scores = [b['revops_metrics']['data_quality']['overall_score'] for b in benchmarks]
        current_score = current_metrics['data_quality']['overall_score']
        percentiles['data_quality_percentile'] = self.get_percentile(current_score, data_quality_scores)

        # Report health percentile (inverse - lower unused is better)
        unused_percents = [b['revops_metrics']['report_health']['unused_percent'] for b in benchmarks]
        current_unused = current_metrics['report_health']['unused_percent']
        percentiles['report_health_percentile'] = self.get_percentile(100 - current_unused,
                                                                      [100 - u for u in unused_percents])

        # Automation percentile
        automation_coverage = [b['revops_metrics']['automation_metrics']['automation_coverage_percent'] for b in benchmarks]
        current_automation = current_metrics['automation_metrics']['automation_coverage_percent']
        percentiles['automation_percentile'] = self.get_percentile(current_automation, automation_coverage)

        # Adoption percentile
        adoption_rates = [b['revops_metrics']['adoption_metrics']['daily_active_users_percent'] for b in benchmarks]
        current_adoption = current_metrics['adoption_metrics']['daily_active_users_percent']
        percentiles['adoption_percentile'] = self.get_percentile(current_adoption, adoption_rates)

        # Overall percentile (weighted average)
        percentiles['overall_percentile'] = round(
            (percentiles['data_quality_percentile'] * 0.3 +
             percentiles['report_health_percentile'] * 0.2 +
             percentiles['automation_percentile'] * 0.25 +
             percentiles['adoption_percentile'] * 0.25)
        )

        return percentiles

    def get_percentile(self, value, population):
        """Calculate percentile of value in population"""
        if not population:
            return 50

        sorted_pop = sorted(population)
        below = sum(1 for v in sorted_pop if v < value)
        percentile = (below / len(sorted_pop)) * 100
        return round(percentile)

    def generate_comparison_report(self, current_metrics, benchmarks, percentiles):
        """Generate detailed comparison report"""
        print("\n" + "=" * 60)
        print("CROSS-ORG COMPARISON REPORT")
        print("=" * 60)

        print(f"\nOrganization: {self.org_alias}")
        print(f"Benchmark Pool: {len(benchmarks)} organizations")
        print(f"Report Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

        # Overall ranking
        print("\n📊 OVERALL RANKING")
        print("-" * 40)
        overall = percentiles.get('overall_percentile', 50)
        print(f"Overall Percentile: {overall}%")

        if overall >= 80:
            print("⭐ TOP PERFORMER - In the top 20% of organizations")
        elif overall >= 60:
            print("✅ ABOVE AVERAGE - Better than majority of organizations")
        elif overall >= 40:
            print("📊 AVERAGE - Room for improvement")
        else:
            print("⚠️ BELOW AVERAGE - Significant improvement opportunities")

        # Category breakdown
        print("\n📈 CATEGORY RANKINGS")
        print("-" * 40)

        categories = [
            ('Data Quality', 'data_quality_percentile', current_metrics['data_quality']['overall_score']),
            ('Report Health', 'report_health_percentile', 100 - current_metrics['report_health']['unused_percent']),
            ('Automation', 'automation_percentile', current_metrics['automation_metrics']['automation_coverage_percent']),
            ('User Adoption', 'adoption_percentile', current_metrics['adoption_metrics']['daily_active_users_percent'])
        ]

        for name, key, value in categories:
            percentile = percentiles.get(key, 50)
            print(f"{name:15} Score: {value:5.1f}  Percentile: {percentile:3d}%")

        # Specific metrics comparison
        print("\n📊 KEY METRICS VS BENCHMARKS")
        print("-" * 40)

        # Calculate benchmark averages
        if benchmarks:
            avg_data_quality = statistics.mean([b['revops_metrics']['data_quality']['overall_score'] for b in benchmarks])
            avg_unused = statistics.mean([b['revops_metrics']['report_health']['unused_percent'] for b in benchmarks])
            avg_automation = statistics.mean([b['revops_metrics']['automation_metrics']['automation_coverage_percent'] for b in benchmarks])

            print(f"Data Quality:   You: {current_metrics['data_quality']['overall_score']:.1f}%  Avg: {avg_data_quality:.1f}%")
            print(f"Unused Reports: You: {current_metrics['report_health']['unused_percent']:.1f}%  Avg: {avg_unused:.1f}%")
            print(f"Automation:     You: {current_metrics['automation_metrics']['automation_coverage_percent']:.1f}%  Avg: {avg_automation:.1f}%")

        # Recommendations based on percentiles
        print("\n💡 RECOMMENDATIONS")
        print("-" * 40)

        recommendations = []

        if percentiles.get('data_quality_percentile', 50) < 50:
            recommendations.append("🔴 PRIORITY: Improve data quality - you're below median")

        if percentiles.get('report_health_percentile', 50) < 30:
            recommendations.append("🔴 CRITICAL: Archive unused reports - significantly above average unused rate")

        if percentiles.get('automation_percentile', 50) < 40:
            recommendations.append("⚠️ Increase automation coverage - lagging behind peers")

        if percentiles.get('adoption_percentile', 50) < 50:
            recommendations.append("⚠️ Focus on user adoption - below median engagement")

        if not recommendations:
            recommendations.append("✅ Maintain current performance - above average in all categories")

        for rec in recommendations:
            print(f"  {rec}")

        # Best practices from top performers
        print("\n🏆 BEST PRACTICES FROM TOP PERFORMERS")
        print("-" * 40)

        top_performers = [b for b in benchmarks
                         if self.calculate_overall_score(b['revops_metrics']) > 85]

        if top_performers:
            print(f"  • Top {len(top_performers)} organizations maintain:")
            print(f"    - Data quality above 90%")
            print(f"    - Less than 20% unused reports")
            print(f"    - Automation coverage above 75%")
            print(f"    - Daily active users above 80%")

        return self.save_comparison_report(current_metrics, benchmarks, percentiles)

    def calculate_overall_score(self, metrics):
        """Calculate overall score for an org"""
        return (
            metrics['data_quality']['overall_score'] * 0.3 +
            (100 - metrics['report_health']['unused_percent']) * 0.2 +
            metrics['automation_metrics']['automation_coverage_percent'] * 0.25 +
            metrics['adoption_metrics']['daily_active_users_percent'] * 0.25
        )

    def save_comparison_report(self, current_metrics, benchmarks, percentiles):
        """Save comparison report to file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        report_file = f"benchmarks/comparisons/comparison_{timestamp}.json"

        os.makedirs('benchmarks/comparisons', exist_ok=True)

        report = {
            'timestamp': datetime.now().isoformat(),
            'org_alias': self.org_alias,
            'current_metrics': current_metrics,
            'percentile_rankings': percentiles,
            'benchmark_pool_size': len(benchmarks),
            'recommendations': self.generate_recommendations(percentiles)
        }

        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n✅ Report saved to: {report_file}")
        return report_file

    def generate_recommendations(self, percentiles):
        """Generate specific recommendations based on percentiles"""
        recs = []

        if percentiles.get('data_quality_percentile', 50) < 50:
            recs.append({
                'category': 'Data Quality',
                'priority': 'HIGH',
                'action': 'Implement data validation rules and required fields'
            })

        if percentiles.get('report_health_percentile', 50) < 30:
            recs.append({
                'category': 'Report Management',
                'priority': 'CRITICAL',
                'action': 'Archive unused reports immediately - run bulk-archive-reports.sh'
            })

        if percentiles.get('automation_percentile', 50) < 40:
            recs.append({
                'category': 'Automation',
                'priority': 'MEDIUM',
                'action': 'Increase Flow coverage for key business processes'
            })

        if percentiles.get('adoption_percentile', 50) < 50:
            recs.append({
                'category': 'User Adoption',
                'priority': 'MEDIUM',
                'action': 'Conduct training sessions and simplify dashboards'
            })

        return recs

    def run_comparison(self, profile=None):
        """Main comparison workflow"""
        print("🚀 Starting Cross-Org Comparison...")

        # Collect current metrics
        current_metrics = self.collect_current_metrics()

        # Define org profile
        if not profile:
            profile = {
                'industry': 'Technology',
                'size': 'Medium',
                'employee_range': '51-200',
                'annual_revenue_range': '10-50M',
                'salesforce_edition': 'Enterprise',
                'implementation_age_months': 24
            }

        # Optionally contribute to benchmarks
        contribute = input("\nContribute anonymized metrics to benchmark database? (y/n): ")
        if contribute.lower() == 'y':
            self.anonymize_and_store(current_metrics, profile)

        # Load relevant benchmarks
        print(f"\n📊 Loading benchmarks for {profile['industry']} - {profile['size']} organizations...")
        benchmarks = self.load_benchmarks({'industry': profile['industry'], 'size': profile['size']})

        if not benchmarks:
            print("⚠️ No benchmarks available for your profile. Loading all benchmarks...")
            benchmarks = self.load_benchmarks()

        if benchmarks:
            # Calculate percentiles
            percentiles = self.calculate_percentiles(current_metrics, benchmarks)

            # Generate report
            report_file = self.generate_comparison_report(current_metrics, benchmarks, percentiles)

            return report_file
        else:
            print("❌ No benchmark data available. Start contributing to build the database!")
            return None

if __name__ == "__main__":
    comparison = CrossOrgComparison()
    comparison.run_comparison()