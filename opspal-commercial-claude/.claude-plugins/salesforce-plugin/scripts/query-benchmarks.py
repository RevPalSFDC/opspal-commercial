#!/usr/bin/env python3
"""
Benchmark Query Tool
Quick queries against the benchmark database for insights and patterns
Designed for easy LLM discovery and usage
"""

import json
import statistics
from pathlib import Path
from datetime import datetime
import argparse

class BenchmarkQuery:
    def __init__(self):
        self.benchmark_dir = Path(__file__).parent.parent / 'benchmarks' / 'database'
        self.index_file = self.benchmark_dir / 'INDEX.json'
        self.orgs_dir = self.benchmark_dir / 'orgs'

        # Load index
        if self.index_file.exists():
            with open(self.index_file, 'r') as f:
                self.index = json.load(f)
        else:
            print("⚠️ No benchmark database found. Run cross-org-comparison.py to start building.")
            self.index = {'orgs': []}

    def query(self, query_type, filters=None):
        """Main query interface"""
        queries = {
            'top_performers': self.get_top_performers,
            'industry_average': self.get_industry_average,
            'percentile': self.get_percentile_for_metric,
            'best_practices': self.get_best_practices,
            'problem_patterns': self.get_problem_patterns,
            'similar_orgs': self.find_similar_orgs,
            'metric_distribution': self.get_metric_distribution,
            'improvement_opportunities': self.get_improvement_opportunities
        }

        if query_type in queries:
            return queries[query_type](filters or {})
        else:
            return {"error": f"Unknown query type: {query_type}"}

    def load_all_orgs(self, profile_filter=None):
        """Load all orgs matching filter"""
        orgs = []
        for org_info in self.index['orgs']:
            if profile_filter and not self.matches_profile(org_info.get('profile', {}), profile_filter):
                continue

            org_file = self.orgs_dir / f"{org_info['hash']}.json"
            if org_file.exists():
                with open(org_file, 'r') as f:
                    orgs.append(json.load(f))
        return orgs

    def matches_profile(self, profile, filter_profile):
        """Check if profile matches filter"""
        for key, value in filter_profile.items():
            if profile.get(key) != value:
                return False
        return True

    def get_top_performers(self, filters):
        """Get top performing organizations"""
        threshold = filters.get('threshold', 85)
        metric = filters.get('metric', 'overall')

        orgs = self.load_all_orgs(filters.get('profile'))
        top_performers = []

        for org in orgs:
            score = self.calculate_score(org['revops_metrics'], metric)
            if score >= threshold:
                top_performers.append({
                    'org_hash': org['org_hash'][:8],
                    'profile': org['profile'],
                    'score': score,
                    'metrics': org['revops_metrics']
                })

        # Sort by score
        top_performers.sort(key=lambda x: x['score'], reverse=True)

        return {
            'query': 'top_performers',
            'filters': filters,
            'count': len(top_performers),
            'results': top_performers[:10],  # Top 10
            'insights': self.extract_top_performer_insights(top_performers)
        }

    def calculate_score(self, metrics, metric_type):
        """Calculate score for a specific metric"""
        if metric_type == 'overall':
            return (
                metrics['data_quality']['overall_score'] * 0.3 +
                (100 - metrics['report_health']['unused_percent']) * 0.2 +
                metrics['automation_metrics']['automation_coverage_percent'] * 0.25 +
                metrics['adoption_metrics']['daily_active_users_percent'] * 0.25
            )
        elif metric_type == 'data_quality':
            return metrics['data_quality']['overall_score']
        elif metric_type == 'automation':
            return metrics['automation_metrics']['automation_coverage_percent']
        elif metric_type == 'adoption':
            return metrics['adoption_metrics']['daily_active_users_percent']
        else:
            return 0

    def extract_top_performer_insights(self, top_performers):
        """Extract insights from top performers"""
        if not top_performers:
            return []

        insights = []

        # Average metrics for top performers
        avg_data_quality = statistics.mean([p['metrics']['data_quality']['overall_score'] for p in top_performers])
        avg_automation = statistics.mean([p['metrics']['automation_metrics']['automation_coverage_percent'] for p in top_performers])

        insights.append(f"Top performers maintain {avg_data_quality:.1f}% data quality on average")
        insights.append(f"Top performers have {avg_automation:.1f}% automation coverage")

        # Common characteristics
        industries = {}
        for p in top_performers:
            ind = p['profile'].get('industry', 'Unknown')
            industries[ind] = industries.get(ind, 0) + 1

        if industries:
            top_industry = max(industries, key=industries.get)
            insights.append(f"Most top performers are in {top_industry} industry")

        return insights

    def get_industry_average(self, filters):
        """Get industry averages for metrics"""
        industry = filters.get('industry', 'Technology')
        orgs = self.load_all_orgs({'industry': industry})

        if not orgs:
            return {"error": f"No data for industry: {industry}"}

        # Calculate averages
        metrics_avg = {
            'data_quality': statistics.mean([o['revops_metrics']['data_quality']['overall_score'] for o in orgs]),
            'unused_reports': statistics.mean([o['revops_metrics']['report_health']['unused_percent'] for o in orgs]),
            'automation_coverage': statistics.mean([o['revops_metrics']['automation_metrics']['automation_coverage_percent'] for o in orgs]),
            'user_adoption': statistics.mean([o['revops_metrics']['adoption_metrics']['daily_active_users_percent'] for o in orgs]),
            'win_rate': statistics.mean([o['revops_metrics']['process_metrics']['win_rate'] for o in orgs])
        }

        return {
            'query': 'industry_average',
            'industry': industry,
            'sample_size': len(orgs),
            'averages': metrics_avg,
            'recommendations': self.generate_industry_recommendations(metrics_avg)
        }

    def generate_industry_recommendations(self, averages):
        """Generate recommendations based on industry averages"""
        recs = []

        if averages['data_quality'] < 70:
            recs.append("Industry-wide data quality issue - implement validation rules")

        if averages['unused_reports'] > 35:
            recs.append("Industry trend of report proliferation - standardize reporting")

        if averages['automation_coverage'] < 50:
            recs.append("Industry lagging in automation - opportunity for competitive advantage")

        return recs

    def get_percentile_for_metric(self, filters):
        """Get percentile ranking for a specific metric value"""
        metric_name = filters.get('metric', 'data_quality')
        metric_value = filters.get('value', 0)
        profile = filters.get('profile', {})

        orgs = self.load_all_orgs(profile)

        if not orgs:
            return {"error": "No benchmark data available"}

        # Extract metric values
        values = []
        for org in orgs:
            if metric_name == 'data_quality':
                values.append(org['revops_metrics']['data_quality']['overall_score'])
            elif metric_name == 'automation':
                values.append(org['revops_metrics']['automation_metrics']['automation_coverage_percent'])
            elif metric_name == 'adoption':
                values.append(org['revops_metrics']['adoption_metrics']['daily_active_users_percent'])

        if not values:
            return {"error": f"No data for metric: {metric_name}"}

        # Calculate percentile
        sorted_values = sorted(values)
        below = sum(1 for v in sorted_values if v < metric_value)
        percentile = (below / len(sorted_values)) * 100

        return {
            'query': 'percentile',
            'metric': metric_name,
            'value': metric_value,
            'percentile': round(percentile),
            'sample_size': len(values),
            'min': min(values),
            'max': max(values),
            'median': statistics.median(values),
            'interpretation': self.interpret_percentile(percentile)
        }

    def interpret_percentile(self, percentile):
        """Interpret percentile ranking"""
        if percentile >= 90:
            return "Excellent - Top 10% performer"
        elif percentile >= 75:
            return "Good - Above 75% of organizations"
        elif percentile >= 50:
            return "Average - Better than half of organizations"
        elif percentile >= 25:
            return "Below Average - Room for improvement"
        else:
            return "Poor - Bottom quartile, significant improvement needed"

    def get_best_practices(self, filters):
        """Extract best practices from high performers"""
        orgs = self.load_all_orgs(filters.get('profile'))

        # Filter for high performers (top 20%)
        scored_orgs = []
        for org in orgs:
            score = self.calculate_score(org['revops_metrics'], 'overall')
            scored_orgs.append((score, org))

        scored_orgs.sort(key=lambda x: x[0], reverse=True)
        top_20_percent = scored_orgs[:max(1, len(scored_orgs) // 5)]

        if not top_20_percent:
            return {"error": "Insufficient data for best practices"}

        best_practices = {
            'data_management': [],
            'reporting': [],
            'automation': [],
            'adoption': []
        }

        # Analyze top performers
        for score, org in top_20_percent:
            metrics = org['revops_metrics']

            if metrics['data_quality']['field_completion_rate'] > 90:
                best_practices['data_management'].append("Maintain >90% field completion rate")

            if metrics['report_health']['unused_percent'] < 15:
                best_practices['reporting'].append("Keep unused reports below 15%")

            if metrics['automation_metrics']['automation_coverage_percent'] > 75:
                best_practices['automation'].append("Achieve >75% process automation")

            if metrics['adoption_metrics']['daily_active_users_percent'] > 80:
                best_practices['adoption'].append("Maintain >80% daily active users")

        # Deduplicate
        for key in best_practices:
            best_practices[key] = list(set(best_practices[key]))

        return {
            'query': 'best_practices',
            'sample_size': len(top_20_percent),
            'practices': best_practices,
            'common_traits': self.identify_common_traits(top_20_percent)
        }

    def identify_common_traits(self, top_performers):
        """Identify common traits among top performers"""
        traits = []

        if len(top_performers) > 5:
            # Check automation levels
            avg_automation = statistics.mean([org[1]['revops_metrics']['automation_metrics']['flow_count']
                                            for _, org in top_performers])
            if avg_automation > 30:
                traits.append(f"Average of {avg_automation:.0f} active Flows")

            # Check data quality
            avg_quality = statistics.mean([org[1]['revops_metrics']['data_quality']['overall_score']
                                          for _, org in top_performers])
            if avg_quality > 85:
                traits.append(f"Maintain {avg_quality:.1f}% data quality")

        return traits

    def get_problem_patterns(self, filters):
        """Identify common problems across organizations"""
        orgs = self.load_all_orgs(filters.get('profile'))

        problems = {
            'data_quality_issues': 0,
            'high_unused_reports': 0,
            'low_automation': 0,
            'poor_adoption': 0,
            'stale_opportunities': 0
        }

        for org in orgs:
            metrics = org['revops_metrics']

            if metrics['data_quality']['overall_score'] < 60:
                problems['data_quality_issues'] += 1

            if metrics['report_health']['unused_percent'] > 40:
                problems['high_unused_reports'] += 1

            if metrics['automation_metrics']['automation_coverage_percent'] < 40:
                problems['low_automation'] += 1

            if metrics['adoption_metrics']['daily_active_users_percent'] < 50:
                problems['poor_adoption'] += 1

            if metrics['data_quality']['stale_opportunity_percent'] > 25:
                problems['stale_opportunities'] += 1

        total = len(orgs) if orgs else 1

        return {
            'query': 'problem_patterns',
            'sample_size': total,
            'problems': {k: f"{(v/total*100):.1f}%" for k, v in problems.items()},
            'top_issues': sorted(problems.items(), key=lambda x: x[1], reverse=True)[:3]
        }

    def find_similar_orgs(self, filters):
        """Find organizations with similar profiles and metrics"""
        target_profile = filters.get('profile', {})
        target_metrics = filters.get('metrics', {})

        orgs = self.load_all_orgs()
        similar = []

        for org in orgs:
            similarity_score = 0

            # Profile similarity
            for key, value in target_profile.items():
                if org['profile'].get(key) == value:
                    similarity_score += 10

            # Metric similarity (if provided)
            if target_metrics:
                if 'data_quality' in target_metrics:
                    diff = abs(org['revops_metrics']['data_quality']['overall_score'] - target_metrics['data_quality'])
                    if diff < 10:
                        similarity_score += 20 - diff

            if similarity_score > 20:
                similar.append({
                    'org_hash': org['org_hash'][:8],
                    'profile': org['profile'],
                    'similarity_score': similarity_score,
                    'metrics': org['revops_metrics']
                })

        similar.sort(key=lambda x: x['similarity_score'], reverse=True)

        return {
            'query': 'similar_orgs',
            'target_profile': target_profile,
            'found': len(similar),
            'similar_orgs': similar[:5]
        }

    def get_metric_distribution(self, filters):
        """Get distribution statistics for a metric"""
        metric_name = filters.get('metric', 'data_quality')
        profile = filters.get('profile', {})

        orgs = self.load_all_orgs(profile)
        values = []

        for org in orgs:
            if metric_name == 'data_quality':
                values.append(org['revops_metrics']['data_quality']['overall_score'])
            elif metric_name == 'unused_reports':
                values.append(org['revops_metrics']['report_health']['unused_percent'])
            elif metric_name == 'automation':
                values.append(org['revops_metrics']['automation_metrics']['automation_coverage_percent'])

        if not values:
            return {"error": f"No data for metric: {metric_name}"}

        return {
            'query': 'metric_distribution',
            'metric': metric_name,
            'statistics': {
                'count': len(values),
                'mean': round(statistics.mean(values), 1),
                'median': round(statistics.median(values), 1),
                'stdev': round(statistics.stdev(values), 1) if len(values) > 1 else 0,
                'min': round(min(values), 1),
                'max': round(max(values), 1),
                'quartiles': {
                    'q1': round(statistics.quantiles(values, n=4)[0], 1) if len(values) > 3 else 0,
                    'q2': round(statistics.quantiles(values, n=4)[1], 1) if len(values) > 3 else 0,
                    'q3': round(statistics.quantiles(values, n=4)[2], 1) if len(values) > 3 else 0
                }
            }
        }

    def get_improvement_opportunities(self, filters):
        """Identify improvement opportunities based on benchmarks"""
        current_metrics = filters.get('current_metrics', {})
        profile = filters.get('profile', {})

        if not current_metrics:
            return {"error": "Current metrics required for improvement analysis"}

        orgs = self.load_all_orgs(profile)
        opportunities = []

        # Compare against top quartile
        for metric_path, current_value in [
            ('data_quality', current_metrics.get('data_quality', 0)),
            ('automation', current_metrics.get('automation', 0)),
            ('adoption', current_metrics.get('adoption', 0))
        ]:
            benchmark_values = []
            for org in orgs:
                if metric_path == 'data_quality':
                    benchmark_values.append(org['revops_metrics']['data_quality']['overall_score'])
                elif metric_path == 'automation':
                    benchmark_values.append(org['revops_metrics']['automation_metrics']['automation_coverage_percent'])
                elif metric_path == 'adoption':
                    benchmark_values.append(org['revops_metrics']['adoption_metrics']['daily_active_users_percent'])

            if benchmark_values:
                top_quartile = statistics.quantiles(benchmark_values, n=4)[2] if len(benchmark_values) > 3 else 90
                gap = top_quartile - current_value

                if gap > 10:
                    opportunities.append({
                        'metric': metric_path,
                        'current': current_value,
                        'target': round(top_quartile, 1),
                        'gap': round(gap, 1),
                        'priority': 'HIGH' if gap > 30 else 'MEDIUM',
                        'action': self.suggest_action(metric_path, gap)
                    })

        return {
            'query': 'improvement_opportunities',
            'opportunities': sorted(opportunities, key=lambda x: x['gap'], reverse=True),
            'potential_percentile_gain': self.calculate_potential_gain(opportunities)
        }

    def suggest_action(self, metric, gap):
        """Suggest action based on metric and gap"""
        actions = {
            'data_quality': "Implement validation rules and required fields",
            'automation': "Increase Flow coverage and process automation",
            'adoption': "Conduct training and simplify user experience"
        }
        return actions.get(metric, "Review and optimize")

    def calculate_potential_gain(self, opportunities):
        """Calculate potential percentile gain"""
        if not opportunities:
            return 0

        avg_gap = statistics.mean([opp['gap'] for opp in opportunities])
        # Rough estimate: 10% gap = 15 percentile points
        return min(round(avg_gap * 1.5), 40)

def main():
    parser = argparse.ArgumentParser(description='Query RevOps Benchmark Database')
    parser.add_argument('query_type', choices=[
        'top_performers', 'industry_average', 'percentile',
        'best_practices', 'problem_patterns', 'similar_orgs',
        'metric_distribution', 'improvement_opportunities'
    ], help='Type of query to run')

    parser.add_argument('--industry', help='Filter by industry')
    parser.add_argument('--size', help='Filter by company size')
    parser.add_argument('--metric', help='Specific metric to analyze')
    parser.add_argument('--value', type=float, help='Metric value for percentile calculation')
    parser.add_argument('--threshold', type=float, default=85, help='Threshold for top performers')

    args = parser.parse_args()

    # Build filters
    filters = {}
    if args.industry or args.size:
        filters['profile'] = {}
        if args.industry:
            filters['profile']['industry'] = args.industry
        if args.size:
            filters['profile']['size'] = args.size

    if args.metric:
        filters['metric'] = args.metric
    if args.value:
        filters['value'] = args.value
    if args.threshold:
        filters['threshold'] = args.threshold

    # Run query
    query_tool = BenchmarkQuery()
    result = query_tool.query(args.query_type, filters)

    # Print results
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()