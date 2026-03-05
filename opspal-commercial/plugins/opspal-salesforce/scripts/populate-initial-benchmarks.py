#!/usr/bin/env python3
"""
Populate Initial Benchmarks
Seeds the benchmark database with realistic anonymized data
Provides a starting point for comparisons
"""

import json
import hashlib
import random
from datetime import datetime, timedelta
from pathlib import Path

class BenchmarkPopulator:
    def __init__(self):
        self.benchmark_dir = Path(__file__).parent.parent / 'benchmarks' / 'database'
        self.index_file = self.benchmark_dir / 'INDEX.json'
        self.orgs_dir = self.benchmark_dir / 'orgs'

        # Ensure directories exist
        self.benchmark_dir.mkdir(parents=True, exist_ok=True)
        self.orgs_dir.mkdir(exist_ok=True)

    def generate_realistic_metrics(self, profile):
        """Generate realistic metrics based on profile"""

        # Base metrics influenced by company size and maturity
        size_factor = {
            'Small': 0.8,
            'Medium': 1.0,
            'Large': 1.1,
            'Enterprise': 1.2
        }.get(profile['size'], 1.0)

        maturity_factor = min(1.2, 0.7 + (profile['implementation_age_months'] / 60))

        # Industry factors
        industry_factors = {
            'Technology': 1.15,
            'Healthcare': 0.95,
            'Finance': 1.05,
            'Retail': 0.90,
            'Manufacturing': 0.85,
            'Non-Profit': 0.75
        }.get(profile['industry'], 1.0)

        base_quality = 65 + random.gauss(10, 5)
        base_automation = 40 + random.gauss(15, 8)
        base_adoption = 60 + random.gauss(12, 6)

        # Apply factors
        data_quality = min(100, base_quality * size_factor * maturity_factor)
        automation = min(100, base_automation * industry_factors * maturity_factor)
        adoption = min(100, base_adoption * size_factor)

        return {
            'report_health': {
                'total_reports': int(100 * size_factor + random.gauss(50, 20)),
                'unused_percent': max(5, 45 - (maturity_factor * 20) + random.gauss(0, 5)),
                'static_date_percent': max(5, 30 - (maturity_factor * 15) + random.gauss(0, 3)),
                'missing_groupings_percent': max(5, 25 - (maturity_factor * 10) + random.gauss(0, 4)),
                'invalid_fields_percent': max(1, 10 - (maturity_factor * 5) + random.gauss(0, 2))
            },
            'dashboard_health': {
                'total_dashboards': int(20 * size_factor + random.gauss(10, 5)),
                'no_refresh_schedule_percent': max(10, 50 - (maturity_factor * 25) + random.gauss(0, 5)),
                'stale_components_percent': max(5, 35 - (maturity_factor * 15) + random.gauss(0, 5)),
                'average_load_time_ms': int(3000 / maturity_factor + random.gauss(0, 500))
            },
            'data_quality': {
                'overall_score': round(data_quality, 1),
                'field_completion_rate': round(data_quality + random.gauss(5, 3), 1),
                'duplicate_rate': max(0.5, 5 - (maturity_factor * 2) + random.gauss(0, 1)),
                'stale_opportunity_percent': max(5, 25 - (maturity_factor * 10) + random.gauss(0, 3)),
                'missing_activity_percent': max(10, 30 - (maturity_factor * 10) + random.gauss(0, 4))
            },
            'process_metrics': {
                'lead_to_opp_conversion': round(8 * industry_factors + random.gauss(3, 2), 1),
                'average_sales_cycle_days': int(90 / industry_factors + random.gauss(0, 15)),
                'win_rate': round(20 * industry_factors + random.gauss(5, 3), 1),
                'pipeline_velocity_score': round(50 * maturity_factor + random.gauss(10, 5), 1),
                'forecast_accuracy': round(60 * maturity_factor + random.gauss(10, 5), 1)
            },
            'automation_metrics': {
                'flow_count': int(20 * maturity_factor + random.gauss(10, 5)),
                'process_builder_count': int(15 * (2 - maturity_factor) + random.gauss(5, 3)),
                'workflow_rule_count': int(25 * (2 - maturity_factor) + random.gauss(8, 4)),
                'automation_coverage_percent': round(automation, 1),
                'automation_error_rate': max(0.5, 5 - (maturity_factor * 2) + random.gauss(0, 1))
            },
            'adoption_metrics': {
                'daily_active_users_percent': round(adoption, 1),
                'report_usage_percent': round(adoption * 0.6 + random.gauss(5, 3), 1),
                'dashboard_views_per_user': round(2 * maturity_factor + random.gauss(1, 0.5), 1),
                'mobile_adoption_percent': round(20 * industry_factors + random.gauss(10, 5), 1)
            }
        }

    def create_sample_org(self, industry, size, age_months):
        """Create a sample organization with metrics"""

        profile = {
            'industry': industry,
            'size': size,
            'employee_range': {
                'Small': '1-50',
                'Medium': '51-200',
                'Large': '201-1000',
                'Enterprise': '1000+'
            }.get(size, '51-200'),
            'annual_revenue_range': {
                'Small': '0-10M',
                'Medium': '10-50M',
                'Large': '50-200M',
                'Enterprise': '200M+'
            }.get(size, '10-50M'),
            'salesforce_edition': {
                'Small': 'Professional',
                'Medium': 'Enterprise',
                'Large': 'Enterprise',
                'Enterprise': 'Unlimited'
            }.get(size, 'Enterprise'),
            'implementation_age_months': age_months
        }

        metrics = self.generate_realistic_metrics(profile)

        # Create unique hash
        unique_string = f"{industry}{size}{age_months}{datetime.now().isoformat()}{random.random()}"
        org_hash = hashlib.sha256(unique_string.encode()).hexdigest()

        return {
            'org_hash': org_hash,
            'profile': profile,
            'revops_metrics': metrics,
            'contributed_at': datetime.now().isoformat()
        }

    def populate_database(self, num_orgs=50):
        """Populate database with sample organizations"""

        print(f"🚀 Populating benchmark database with {num_orgs} sample organizations...")

        industries = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Non-Profit']
        sizes = ['Small', 'Medium', 'Large', 'Enterprise']

        # Load or create index
        if self.index_file.exists():
            with open(self.index_file, 'r') as f:
                index = json.load(f)
        else:
            index = {
                'version': '1.0',
                'last_updated': datetime.now().isoformat(),
                'total_orgs': 0,
                'orgs': []
            }

        created_count = 0

        for _ in range(num_orgs):
            # Random but realistic distribution
            industry = random.choices(
                industries,
                weights=[30, 20, 15, 15, 15, 5]  # Tech-heavy distribution
            )[0]

            size = random.choices(
                sizes,
                weights=[20, 40, 30, 10]  # More medium/large companies
            )[0]

            # Implementation age (newer implementations less likely)
            age_months = int(random.gammavariate(2, 12))  # Most 6-36 months
            age_months = min(age_months, 120)  # Cap at 10 years

            # Create org
            org_data = self.create_sample_org(industry, size, age_months)

            # Save to file
            org_file = self.orgs_dir / f"{org_data['org_hash']}.json"
            with open(org_file, 'w') as f:
                json.dump(org_data, f, indent=2)

            # Update index
            index['orgs'].append({
                'hash': org_data['org_hash'],
                'profile': org_data['profile'],
                'contributed_at': org_data['contributed_at']
            })

            created_count += 1

            if created_count % 10 == 0:
                print(f"  Created {created_count} organizations...")

        # Update index totals
        index['total_orgs'] = len(index['orgs'])
        index['last_updated'] = datetime.now().isoformat()

        # Save index
        with open(self.index_file, 'w') as f:
            json.dump(index, f, indent=2)

        print(f"\n✅ Successfully populated database with {created_count} organizations")
        print(f"📁 Database location: {self.benchmark_dir}")

        # Print distribution summary
        self.print_summary(index)

    def print_summary(self, index):
        """Print summary of populated database"""

        print("\n📊 Database Summary:")
        print("-" * 40)

        # Count by industry
        industry_counts = {}
        size_counts = {}

        for org_info in index['orgs']:
            industry = org_info['profile'].get('industry', 'Unknown')
            size = org_info['profile'].get('size', 'Unknown')

            industry_counts[industry] = industry_counts.get(industry, 0) + 1
            size_counts[size] = size_counts.get(size, 0) + 1

        print("\nBy Industry:")
        for industry, count in sorted(industry_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {industry:15} {count:3} orgs")

        print("\nBy Size:")
        for size, count in sorted(size_counts.items(), key=lambda x: ['Small', 'Medium', 'Large', 'Enterprise'].index(x[0]) if x[0] in ['Small', 'Medium', 'Large', 'Enterprise'] else 99):
            print(f"  {size:15} {count:3} orgs")

        print("\n🎯 Ready for benchmark comparisons!")
        print("\nUsage:")
        print("  python3 scripts/cross-org-comparison.py")
        print("  python3 scripts/query-benchmarks.py top_performers")

    def add_high_performers(self, num_orgs=5):
        """Add some high-performing organizations to show best practices"""

        print(f"\n⭐ Adding {num_orgs} high-performing organizations...")

        for i in range(num_orgs):
            # High performers are typically mature, larger orgs
            industry = random.choice(['Technology', 'Finance'])
            size = random.choice(['Large', 'Enterprise'])
            age_months = random.randint(36, 84)  # 3-7 years

            profile = {
                'industry': industry,
                'size': size,
                'employee_range': '1000+' if size == 'Enterprise' else '201-1000',
                'annual_revenue_range': '200M+' if size == 'Enterprise' else '50-200M',
                'salesforce_edition': 'Unlimited',
                'implementation_age_months': age_months
            }

            # High-performing metrics
            metrics = {
                'report_health': {
                    'total_reports': random.randint(150, 250),
                    'unused_percent': round(random.uniform(8, 15), 1),
                    'static_date_percent': round(random.uniform(3, 8), 1),
                    'missing_groupings_percent': round(random.uniform(5, 10), 1),
                    'invalid_fields_percent': round(random.uniform(0.5, 2), 1)
                },
                'dashboard_health': {
                    'total_dashboards': random.randint(30, 50),
                    'no_refresh_schedule_percent': round(random.uniform(5, 15), 1),
                    'stale_components_percent': round(random.uniform(3, 10), 1),
                    'average_load_time_ms': random.randint(1500, 2500)
                },
                'data_quality': {
                    'overall_score': round(random.uniform(88, 95), 1),
                    'field_completion_rate': round(random.uniform(90, 98), 1),
                    'duplicate_rate': round(random.uniform(0.5, 2), 1),
                    'stale_opportunity_percent': round(random.uniform(5, 10), 1),
                    'missing_activity_percent': round(random.uniform(5, 12), 1)
                },
                'process_metrics': {
                    'lead_to_opp_conversion': round(random.uniform(18, 25), 1),
                    'average_sales_cycle_days': random.randint(45, 75),
                    'win_rate': round(random.uniform(28, 35), 1),
                    'pipeline_velocity_score': round(random.uniform(80, 90), 1),
                    'forecast_accuracy': round(random.uniform(82, 92), 1)
                },
                'automation_metrics': {
                    'flow_count': random.randint(40, 60),
                    'process_builder_count': random.randint(5, 10),
                    'workflow_rule_count': random.randint(10, 20),
                    'automation_coverage_percent': round(random.uniform(80, 92), 1),
                    'automation_error_rate': round(random.uniform(0.5, 1.5), 1)
                },
                'adoption_metrics': {
                    'daily_active_users_percent': round(random.uniform(85, 95), 1),
                    'report_usage_percent': round(random.uniform(60, 75), 1),
                    'dashboard_views_per_user': round(random.uniform(4, 6), 1),
                    'mobile_adoption_percent': round(random.uniform(40, 60), 1)
                }
            }

            # Create unique hash
            unique_string = f"highperf{i}{datetime.now().isoformat()}{random.random()}"
            org_hash = hashlib.sha256(unique_string.encode()).hexdigest()

            org_data = {
                'org_hash': org_hash,
                'profile': profile,
                'revops_metrics': metrics,
                'contributed_at': datetime.now().isoformat()
            }

            # Save to file
            org_file = self.orgs_dir / f"{org_data['org_hash']}.json"
            with open(org_file, 'w') as f:
                json.dump(org_data, f, indent=2)

            print(f"  Added high performer: {industry} - {size}")

def main():
    populator = BenchmarkPopulator()

    # Check if database already exists
    if populator.index_file.exists():
        response = input("Benchmark database already exists. Add more organizations? (y/n): ")
        if response.lower() != 'y':
            print("Exiting without changes.")
            return

        num_to_add = int(input("How many organizations to add? (default 20): ") or 20)
        populator.populate_database(num_to_add)
    else:
        print("Creating new benchmark database...")
        populator.populate_database(50)  # Initial 50 orgs
        populator.add_high_performers(5)  # Add 5 high performers

if __name__ == "__main__":
    main()