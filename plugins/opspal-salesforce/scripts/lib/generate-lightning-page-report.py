#!/usr/bin/env python3
"""
Generate Lightning Page Executive Summary Report

Purpose: Analyze enriched field inventory CSVs and generate executive summary with
         statistics, recommendations, and optimization opportunities

Usage:
    python3 generate-lightning-page-report.py \
        --org {org-alias} \
        --object {Object} \
        --input-dir {csv-directory} \
        --output-file {summary.md}

Example:
    python3 generate-lightning-page-report.py \
        --org my-production \
        --object Opportunity \
        --input-dir /tmp \
        --output-file /workspace/instances/salesforce/my-production/Opportunity_Summary.md

Author: RevPal Operations Team
Version: 1.0
Created: 2025-10-17
"""

import csv
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path


def analyze_csv(csv_path):
    """
    Analyze a single field inventory CSV

    Args:
        csv_path (str): Path to enriched CSV file

    Returns:
        dict: Statistics about the CSV
              {
                  'page_name': str,
                  'field_count': int,
                  'custom_count': int,
                  'required_count': int,
                  'help_text_count': int,
                  'fields': list
              }
    """
    page_name = Path(csv_path).stem.replace('_fields', '').replace('_enriched', '')

    stats = {
        'page_name': page_name,
        'field_count': 0,
        'custom_count': 0,
        'required_count': 0,
        'help_text_count': 0,
        'fields': []
    }

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stats['field_count'] += 1
            stats['fields'].append(row)

            if row.get('Field_Classification') == 'Custom':
                stats['custom_count'] += 1

            if row.get('UI_Behavior') == 'required':
                stats['required_count'] += 1

            if row.get('Help_Text', '').strip():
                stats['help_text_count'] += 1

    return stats


def generate_recommendations(all_stats):
    """
    Generate optimization recommendations based on analysis

    Args:
        all_stats (list): List of stats dicts from analyze_csv

    Returns:
        list: List of recommendation dicts
              [{'title': str, 'issue': str, 'recommendation': str, 'impact': str}, ...]
    """
    recommendations = []

    # Calculate overall statistics
    total_pages = len(all_stats)
    field_counts = [s['field_count'] for s in all_stats]
    max_fields = max(field_counts) if field_counts else 0
    min_fields = min(field_counts) if field_counts else 0
    avg_fields = sum(field_counts) / len(field_counts) if field_counts else 0

    # Recommendation 1: Page complexity
    if max_fields > 200:
        complex_pages = [s['page_name'] for s in all_stats if s['field_count'] > 200]
        recommendations.append({
            'title': 'Page Complexity Optimization',
            'issue': f"{len(complex_pages)} page(s) contain over 200 fields, which may overwhelm users and impact page load performance.",
            'recommendation': "Conduct field usage analysis to identify which fields are actively populated. Consider implementing dynamic forms that show/hide fields based on record type or stage. Use collapsible sections to reduce visual clutter.",
            'impact': "Improved user experience, faster page load times, reduced training burden"
        })

    # Recommendation 2: Help text coverage
    total_fields_all_pages = sum(s['field_count'] for s in all_stats)
    total_help_text = sum(s['help_text_count'] for s in all_stats)
    help_text_coverage = (total_help_text / total_fields_all_pages * 100) if total_fields_all_pages > 0 else 0

    if help_text_coverage < 30:
        recommendations.append({
            'title': 'Field Documentation Gap',
            'issue': f"Only {help_text_coverage:.1f}% of fields have help text, leaving users without guidance on field purpose and usage.",
            'recommendation': "Prioritize adding help text for custom fields and fields with low completion rates. Include examples, valid values, and integration notes where applicable.",
            'impact': "Reduced support tickets, improved data quality, faster user onboarding"
        })

    # Recommendation 3: Standardization opportunity
    if total_pages > 3 and (max_fields - min_fields) > 100:
        recommendations.append({
            'title': 'Page Standardization',
            'issue': f"Field counts vary widely across pages ({min_fields}-{max_fields} fields), suggesting inconsistent user experiences.",
            'recommendation': "Establish standard field placement patterns across pages. Identify core fields that should appear on all pages. Create reusable field sections for consistency.",
            'impact': "Consistent user experience, easier training, simplified maintenance"
        })

    # Recommendation 4: Custom field proliferation
    total_custom = sum(s['custom_count'] for s in all_stats)
    custom_percentage = (total_custom / total_fields_all_pages * 100) if total_fields_all_pages > 0 else 0

    if custom_percentage > 60:
        recommendations.append({
            'title': 'Custom Field Management',
            'issue': f"{custom_percentage:.1f}% of fields on Lightning Pages are custom fields, which may indicate schema complexity.",
            'recommendation': "Review custom field usage to identify candidates for archival. Consider whether standard fields could meet requirements. Document business logic for each custom field.",
            'impact': "Reduced org complexity, improved upgrade compatibility, clearer data model"
        })

    # If no specific recommendations, add generic best practice
    if not recommendations:
        recommendations.append({
            'title': 'Continuous Optimization',
            'issue': f"Current Lightning Pages appear well-optimized (average {avg_fields:.0f} fields per page).",
            'recommendation': "Maintain regular audits of field usage. Monitor page performance metrics. Gather user feedback on field organization and visibility.",
            'impact': "Sustained user satisfaction, proactive issue prevention"
        })

    return recommendations


def generate_markdown_report(org_name, object_name, all_stats, recommendations, output_path):
    """
    Generate executive summary markdown report

    Args:
        org_name (str): Salesforce org alias
        object_name (str): Object API name
        all_stats (list): List of stats dicts
        recommendations (list): List of recommendation dicts
        output_path (str): Where to save markdown file
    """
    # Calculate summary statistics
    total_pages = len(all_stats)
    total_fields = sum(s['field_count'] for s in all_stats)
    field_counts = [s['field_count'] for s in all_stats]
    max_fields = max(field_counts) if field_counts else 0
    min_fields = min(field_counts) if field_counts else 0

    # Sort pages by field count
    sorted_stats = sorted(all_stats, key=lambda x: x['field_count'], reverse=True)

    # Generate markdown
    md = []
    md.append(f"# {object_name} Lightning Pages - Executive Summary")
    md.append(f"**Salesforce Org**: {org_name}")
    md.append(f"**Analysis Date**: {datetime.now().strftime('%B %d, %Y')}")
    md.append(f"**Analyst**: Claude Code (OpsPal Plugin)")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Executive Overview")
    md.append("")
    md.append(f"This report provides a comprehensive analysis of Lightning Page assignments for {object_name} "
              f"in the {org_name} Salesforce organization, identifying page complexity, field usage patterns, "
              f"and optimization opportunities.")
    md.append("")
    md.append("---")
    md.append("")
    md.append("## Key Findings")
    md.append("")
    md.append(f"### {total_pages} Lightning Page(s) Identified")
    md.append("")
    md.append("| Page Name | Field Count | Custom Fields | Required Fields | Help Text Coverage |")
    md.append("|-----------|-------------|---------------|-----------------|-------------------|")

    for stats in sorted_stats:
        help_coverage = f"{stats['help_text_count']}/{stats['field_count']} ({stats['help_text_count']/stats['field_count']*100:.1f}%)" if stats['field_count'] > 0 else "N/A"
        md.append(f"| **{stats['page_name']}** | {stats['field_count']} | {stats['custom_count']} | {stats['required_count']} | {help_coverage} |")

    md.append("")
    md.append("### Complexity Analysis")
    md.append("")
    md.append(f"- **Total fields across all pages**: {total_fields}")
    md.append(f"- **Field count range**: {min_fields}-{max_fields} fields per page")
    md.append(f"- **Average fields per page**: {sum(field_counts)/len(field_counts):.1f}") if field_counts else md.append("")
    md.append("")

    # Complexity categorization
    if max_fields > 200:
        md.append("**Complexity Assessment**: High - Pages with 200+ fields may benefit from simplification")
    elif max_fields > 150:
        md.append("**Complexity Assessment**: Moderate-High - Consider reviewing field organization")
    elif max_fields > 100:
        md.append("**Complexity Assessment**: Moderate - Standard complexity for business objects")
    else:
        md.append("**Complexity Assessment**: Low - Streamlined field sets")

    md.append("")
    md.append("---")
    md.append("")
    md.append("## Recommendations")
    md.append("")

    for i, rec in enumerate(recommendations, 1):
        md.append(f"### {i}. {rec['title']}")
        md.append("")
        md.append(f"**Issue**: {rec['issue']}")
        md.append("")
        md.append(f"**Recommendation**: {rec['recommendation']}")
        md.append("")
        md.append(f"**Expected Impact**: {rec['impact']}")
        md.append("")
        md.append("---")
        md.append("")

    md.append("## Technical Details")
    md.append("")
    md.append("### Data Sources")
    md.append("- Salesforce Metadata API (FlexiPage retrieval)")
    md.append("- Salesforce Describe API (Object and field metadata)")
    md.append("")
    md.append("### Analysis Artifacts")
    md.append(f"Field inventory CSVs available in the same directory as this report:")
    md.append("")

    for stats in sorted_stats:
        md.append(f"- `{stats['page_name']}_fields.csv` ({stats['field_count']} fields)")

    md.append("")
    md.append("Each CSV contains:")
    md.append("- Field API Name")
    md.append("- Field Label")
    md.append("- Field Type")
    md.append("- Field Classification (Standard/Custom)")
    md.append("- Help Text")
    md.append("- UI Behavior (required/readonly/none)")
    md.append("")
    md.append("---")
    md.append("")
    md.append("**End of Report**")
    md.append("")
    md.append("*Generated by /sfpageaudit command (salesforce-plugin)*")

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(md))


def main():
    """Main execution function"""

    parser = argparse.ArgumentParser(
        description='Generate Lightning Page executive summary from enriched field CSVs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
  python3 generate-lightning-page-report.py \\
    --org my-production \\
    --object Opportunity \\
    --input-dir /tmp \\
    --output-file /workspace/instances/salesforce/my-production/Opportunity_Summary.md
        """
    )

    parser.add_argument('--org', required=True, help='Salesforce org alias')
    parser.add_argument('--object', required=True, help='Object API name')
    parser.add_argument('--input-dir', required=True, help='Directory containing enriched CSVs')
    parser.add_argument('--output-file', required=True, help='Path for output markdown file')

    args = parser.parse_args()

    # Find all enriched CSVs in input directory
    csv_files = []
    for file in os.listdir(args.input_dir):
        if file.endswith('_fields.csv') or file.endswith('_enriched.csv'):
            csv_files.append(os.path.join(args.input_dir, file))

    if not csv_files:
        print(f"❌ Error: No field CSV files found in {args.input_dir}")
        print(f"   Expected files ending with: _fields.csv or _enriched.csv")
        sys.exit(1)

    print(f"✓ Found {len(csv_files)} field inventory CSV(s)")

    # Analyze each CSV
    all_stats = []
    for csv_path in csv_files:
        try:
            stats = analyze_csv(csv_path)
            all_stats.append(stats)
            print(f"  ✓ Analyzed {stats['page_name']}: {stats['field_count']} fields")
        except Exception as e:
            print(f"  ⚠️  Warning: Could not analyze {csv_path}: {e}")

    if not all_stats:
        print("❌ Error: Could not analyze any CSV files")
        sys.exit(1)

    # Generate recommendations
    recommendations = generate_recommendations(all_stats)

    # Generate report
    try:
        generate_markdown_report(args.org, args.object, all_stats, recommendations, args.output_file)
        print(f"✓ Generated executive summary: {args.output_file}")
        print(f"  - {len(all_stats)} Lightning Pages analyzed")
        print(f"  - {len(recommendations)} recommendation(s) provided")
    except Exception as e:
        print(f"❌ Error generating report: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
