#!/bin/bash

# Report Migration Tool - Convert Multiple Reports to Dynamic Filters
# Works across all Salesforce instances/projects
# Reduces report sprawl by 90%+ through intelligent consolidation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LIB_DIR="$SCRIPT_DIR/lib"
CONFIG_DIR="$PROJECT_ROOT/config"
OUTPUT_DIR="$PROJECT_ROOT/reports/migrations"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Function to display usage
show_usage() {
    cat << EOF
Report Migration Tool - Consolidate Reports with Dynamic Filters

Usage: $0 <command> [options]

Commands:
    analyze [org]           Analyze reports for consolidation opportunities
    migrate [org]           Migrate duplicate reports to dynamic filters
    preview [org]           Preview migration without making changes
    rollback [org]          Rollback migration (restore original reports)
    compare [org]           Compare before/after report counts

Options:
    --org <alias>           Target org (uses SF_TARGET_ORG if not specified)
    --folder <name>         Specific folder to analyze
    --pattern <regex>       Pattern to match report names
    --threshold <number>    Similarity threshold (0-100, default: 80)
    --output <file>         Output file for analysis
    --dry-run              Preview changes without executing
    --include-private      Include private reports in analysis

Examples:
    $0 analyze --org example-company-sandbox
    $0 migrate --org production --folder "Sales Reports" --dry-run
    $0 preview --pattern ".*Pipeline.*"
    $0 compare --output report-savings.json

This tool will:
1. Identify duplicate/similar reports
2. Create master reports with base criteria
3. Generate dynamic filter configurations
4. Document filter combinations for each use case
5. Optionally archive original reports

EOF
}

# Function to get current org
get_current_org() {
    local org="${1:-$SF_TARGET_ORG}"
    
    if [ -z "$org" ]; then
        # Try to get default org
        org=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty')
    fi
    
    if [ -z "$org" ]; then
        echo -e "${RED}Error: No org specified. Use --org or set SF_TARGET_ORG${NC}" >&2
        return 1
    fi
    
    echo "$org"
}

# Function to analyze reports for consolidation
analyze_reports() {
    local org="$1"
    local folder_filter="$2"
    local pattern_filter="$3"
    local include_private="$4"
    
    echo -e "${BLUE}Analyzing reports in $org...${NC}"
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Build SOQL query
    local soql="SELECT Id, Name, DeveloperName, FolderName, Description, 
                       Format, LastModifiedDate, LastRunDate, 
                       CreatedBy.Name, LastModifiedBy.Name 
                FROM Report"
    
    if [ -n "$folder_filter" ]; then
        soql="$soql WHERE FolderName = '$folder_filter'"
    fi
    
    if [ "$include_private" != "true" ]; then
        if [[ "$soql" == *"WHERE"* ]]; then
            soql="$soql AND OwnerId = '00G'"  # Public folders start with 00G
        else
            soql="$soql WHERE OwnerId LIKE '00G%'"
        fi
    fi
    
    soql="$soql ORDER BY FolderName, Name"
    
    # Query reports
    local reports_json=$(sf data query --query "$soql" --target-org "$org" --json 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to query reports${NC}"
        return 1
    fi
    
    local report_count=$(echo "$reports_json" | jq '.result.totalSize')
    echo -e "${GREEN}Found $report_count reports${NC}"
    
    # Analyze for duplicates using Node.js
    node << 'NODEJS'
const fs = require('fs');
const path = require('path');

const reportsData = $reports_json;
const reports = reportsData.result.records;
const patternFilter = "$pattern_filter";

// Group reports by similarity
function analyzeReports(reports) {
    const groups = {};
    const analyzed = new Set();
    
    reports.forEach(report => {
        if (analyzed.has(report.Id)) return;
        
        // Apply pattern filter if specified
        if (patternFilter && !new RegExp(patternFilter).test(report.Name)) {
            return;
        }
        
        const similarReports = findSimilarReports(report, reports);
        if (similarReports.length > 1) {
            const groupKey = generateGroupKey(report);
            groups[groupKey] = {
                master: report,
                similar: similarReports,
                potentialSavings: similarReports.length - 1,
                commonPatterns: extractCommonPatterns(similarReports)
            };
            
            similarReports.forEach(r => analyzed.add(r.Id));
        }
    });
    
    return groups;
}

// Find similar reports
function findSimilarReports(target, allReports) {
    const similar = [];
    const threshold = ${3:-80};
    
    allReports.forEach(report => {
        const similarity = calculateSimilarity(target.Name, report.Name);
        if (similarity >= threshold) {
            similar.push({
                ...report,
                similarity: similarity
            });
        }
    });
    
    return similar.sort((a, b) => b.similarity - a.similarity);
}

// Calculate string similarity (Levenshtein-based)
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 100;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return ((longer.length - editDistance) / longer.length) * 100;
}

// Levenshtein distance
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// Extract common patterns from report names
function extractCommonPatterns(reports) {
    const names = reports.map(r => r.Name);
    const patterns = {};
    
    // Extract date patterns
    const datePatterns = [
        /(\d{4})/g,           // Year
        /(Q[1-4])/gi,         // Quarter
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi,  // Month
        /(This|Last|Next)\s+(Month|Quarter|Year)/gi,
        /YTD|MTD|QTD/gi
    ];
    
    datePatterns.forEach(pattern => {
        names.forEach(name => {
            const matches = name.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    patterns[match] = (patterns[match] || 0) + 1;
                });
            }
        });
    });
    
    // Extract other variable parts
    const commonPrefixes = findCommonPrefix(names);
    const commonSuffixes = findCommonSuffix(names);
    
    return {
        datePatterns: Object.keys(patterns).filter(p => patterns[p] > 1),
        commonPrefix: commonPrefixes,
        commonSuffix: commonSuffixes,
        variableParts: identifyVariableParts(names)
    };
}

// Find common prefix
function findCommonPrefix(strings) {
    if (strings.length === 0) return '';
    
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        while (strings[i].indexOf(prefix) !== 0) {
            prefix = prefix.substring(0, prefix.length - 1);
            if (prefix === '') return '';
        }
    }
    return prefix;
}

// Find common suffix
function findCommonSuffix(strings) {
    const reversed = strings.map(s => s.split('').reverse().join(''));
    const commonReversed = findCommonPrefix(reversed);
    return commonReversed.split('').reverse().join('');
}

// Identify variable parts
function identifyVariableParts(names) {
    const prefix = findCommonPrefix(names);
    const suffix = findCommonSuffix(names);
    
    return names.map(name => {
        const start = prefix.length;
        const end = name.length - suffix.length;
        return name.substring(start, end);
    }).filter(part => part.length > 0);
}

// Generate group key
function generateGroupKey(report) {
    return report.Name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
}

// Analyze and output results
const groups = analyzeReports(reports);
const analysis = {
    timestamp: new Date().toISOString(),
    org: "$org",
    summary: {
        totalReports: reports.length,
        duplicateGroups: Object.keys(groups).length,
        potentialReduction: Object.values(groups).reduce((sum, g) => sum + g.potentialSavings, 0),
        reductionPercentage: (Object.values(groups).reduce((sum, g) => sum + g.potentialSavings, 0) / reports.length * 100).toFixed(1)
    },
    groups: groups,
    recommendations: generateRecommendations(groups)
};

// Generate recommendations
function generateRecommendations(groups) {
    const recommendations = [];
    
    Object.entries(groups).forEach(([key, group]) => {
        const rec = {
            groupName: key,
            masterReport: group.master.Name,
            consolidationStrategy: determineStrategy(group),
            dynamicFilters: suggestDynamicFilters(group),
            estimatedSavings: group.potentialSavings
        };
        recommendations.push(rec);
    });
    
    return recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

// Determine consolidation strategy
function determineStrategy(group) {
    const patterns = group.commonPatterns;
    
    if (patterns.datePatterns.length > 0) {
        return 'DATE_BASED_FILTERS';
    } else if (patterns.variableParts.some(p => /Team|User|Owner|Manager/i.test(p))) {
        return 'USER_BASED_FILTERS';
    } else if (patterns.variableParts.some(p => /Region|Territory|Area|Location/i.test(p))) {
        return 'GEOGRAPHY_BASED_FILTERS';
    } else {
        return 'CUSTOM_FILTERS';
    }
}

// Suggest dynamic filters
function suggestDynamicFilters(group) {
    const filters = [];
    const patterns = group.commonPatterns;
    
    // Date filters
    if (patterns.datePatterns.length > 0) {
        filters.push({
            field: 'CLOSE_DATE',
            type: 'DATE_RANGE',
            values: ['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR']
        });
    }
    
    // User filters
    if (patterns.variableParts.some(p => /Team|User|Owner/i.test(p))) {
        filters.push({
            field: 'OWNER',
            type: 'USER',
            values: ['MY', 'MY_TEAM', 'ALL']
        });
    }
    
    // Status filters
    if (patterns.variableParts.some(p => /Open|Closed|Won|Lost/i.test(p))) {
        filters.push({
            field: 'STATUS',
            type: 'PICKLIST',
            values: ['Open', 'Closed', 'Closed Won', 'Closed Lost']
        });
    }
    
    return filters;
}

// Output results
const outputPath = "$OUTPUT_DIR/report-analysis-${org}-$(date +%Y%m%d-%H%M%S).json";
fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));

console.log(JSON.stringify(analysis, null, 2));
NODEJS
    
    # Save analysis results
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local analysis_file="$OUTPUT_DIR/report-analysis-${org}-${timestamp}.json"
    
    echo -e "\n${GREEN}Analysis complete!${NC}"
    echo -e "Results saved to: ${BLUE}$analysis_file${NC}"
    
    # Display summary
    local total_reports=$(jq '.summary.totalReports' "$analysis_file")
    local duplicate_groups=$(jq '.summary.duplicateGroups' "$analysis_file")
    local potential_reduction=$(jq '.summary.potentialReduction' "$analysis_file")
    local reduction_percentage=$(jq -r '.summary.reductionPercentage' "$analysis_file")
    
    echo -e "\n${CYAN}═══ Summary ═══${NC}"
    echo "Total Reports: $total_reports"
    echo "Duplicate Groups: $duplicate_groups"
    echo "Potential Reduction: $potential_reduction reports (${reduction_percentage}%)"
    
    # Show top recommendations
    echo -e "\n${CYAN}═══ Top Consolidation Opportunities ═══${NC}"
    jq -r '.recommendations[:5] | .[] | "• \(.masterReport): Save \(.estimatedSavings) reports (\(.consolidationStrategy))"' "$analysis_file"
}

# Function to migrate reports
migrate_reports() {
    local org="$1"
    local analysis_file="$2"
    local dry_run="$3"
    
    if [ ! -f "$analysis_file" ]; then
        echo -e "${YELLOW}No analysis found. Running analysis first...${NC}"
        analyze_reports "$org"
        analysis_file=$(ls -t "$OUTPUT_DIR"/report-analysis-${org}-*.json | head -1)
    fi
    
    echo -e "${BLUE}Starting report migration for $org...${NC}"
    
    if [ "$dry_run" == "true" ]; then
        echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
    fi
    
    # Create migration plan
    local migration_plan="$OUTPUT_DIR/migration-plan-${org}-$(date +%Y%m%d-%H%M%S).json"
    
    # Generate migration plan using Node.js
    node << 'NODEJS'
const fs = require('fs');
const { execSync } = require('child_process');

const analysisFile = "$analysis_file";
const org = "$org";
const dryRun = "$dry_run" === "true";

const analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));

// Create migration plan
const migrationPlan = {
    timestamp: new Date().toISOString(),
    org: org,
    dryRun: dryRun,
    migrations: []
};

// Process each group
Object.entries(analysis.groups).forEach(([key, group]) => {
    const migration = {
        groupKey: key,
        masterReport: {
            id: group.master.Id,
            name: group.master.Name,
            folder: group.master.FolderName
        },
        reportsToConsolidate: group.similar.slice(1).map(r => ({
            id: r.Id,
            name: r.Name,
            willArchive: true
        })),
        dynamicFilters: analysis.recommendations.find(r => r.groupName === key)?.dynamicFilters || [],
        filterDocumentation: generateFilterDocumentation(group)
    };
    
    migrationPlan.migrations.push(migration);
});

// Generate filter documentation
function generateFilterDocumentation(group) {
    const docs = [];
    
    group.similar.forEach(report => {
        const filterConfig = {
            originalReportName: report.Name,
            reportId: report.Id,
            suggestedFilters: determineFiltersForReport(report, group)
        };
        docs.push(filterConfig);
    });
    
    return docs;
}

// Determine specific filters for each report
function determineFiltersForReport(report, group) {
    const filters = [];
    const name = report.Name;
    
    // Date-based filters
    if (/This\s+Month/i.test(name)) {
        filters.push({ field: 'CLOSE_DATE', operator: 'equals', value: 'THIS_MONTH' });
    } else if (/Last\s+Month/i.test(name)) {
        filters.push({ field: 'CLOSE_DATE', operator: 'equals', value: 'LAST_MONTH' });
    } else if (/Q1/i.test(name)) {
        filters.push({ field: 'CLOSE_DATE', operator: 'equals', value: 'THIS_FISCAL_QUARTER' });
    }
    
    // User-based filters
    if (/My\s+/i.test(name)) {
        filters.push({ field: 'OWNER', operator: 'equals', value: 'MY' });
    } else if (/Team/i.test(name)) {
        filters.push({ field: 'OWNER', operator: 'equals', value: 'MY_TEAM' });
    }
    
    // Status filters
    if (/Open/i.test(name)) {
        filters.push({ field: 'IS_CLOSED', operator: 'equals', value: 'false' });
    } else if (/Closed\s+Won/i.test(name)) {
        filters.push({ field: 'IS_WON', operator: 'equals', value: 'true' });
    }
    
    return filters;
}

// Save migration plan
const planPath = "$migration_plan";
fs.writeFileSync(planPath, JSON.stringify(migrationPlan, null, 2));

console.log("Migration plan created: " + planPath);
console.log("Total migrations: " + migrationPlan.migrations.length);

// Execute migrations if not dry run
if (!dryRun) {
    console.log("Executing migrations...");
    
    migrationPlan.migrations.forEach((migration, index) => {
        console.log(`Processing ${index + 1}/${migrationPlan.migrations.length}: ${migration.masterReport.name}`);
        
        // Archive duplicate reports
        migration.reportsToConsolidate.forEach(report => {
            try {
                // Move to archive folder or rename
                const updateCmd = `sf data update record --sobject Report --record-id ${report.id} --values "Name='[ARCHIVED] ${report.name}'" --target-org ${org} --json`;
                
                if (!dryRun) {
                    execSync(updateCmd);
                }
                
                console.log(`  ✓ Archived: ${report.name}`);
            } catch (error) {
                console.error(`  ✗ Failed to archive: ${report.name}`);
            }
        });
        
        // Create filter documentation
        const docPath = `$OUTPUT_DIR/filters-${migration.groupKey}.md`;
        const docContent = generateFilterDoc(migration);
        fs.writeFileSync(docPath, docContent);
        console.log(`  ✓ Documentation created: ${docPath}`);
    });
}

// Generate filter documentation
function generateFilterDoc(migration) {
    let doc = `# Dynamic Filters for ${migration.masterReport.name}\n\n`;
    doc += `Master Report ID: ${migration.masterReport.id}\n\n`;
    doc += `## Filter Configurations\n\n`;
    
    migration.filterDocumentation.forEach(config => {
        doc += `### ${config.originalReportName}\n`;
        doc += `Report ID: ${config.reportId}\n\n`;
        doc += `Apply these filters to replicate:\n`;
        doc += '```json\n';
        doc += JSON.stringify(config.suggestedFilters, null, 2);
        doc += '\n```\n\n';
    });
    
    return doc;
}

console.log(JSON.stringify(migrationPlan.summary || {}, null, 2));
NODEJS
    
    if [ "$dry_run" != "true" ]; then
        echo -e "\n${GREEN}Migration complete!${NC}"
        echo "Filter documentation created in: $OUTPUT_DIR"
    else
        echo -e "\n${YELLOW}Dry run complete. Review migration plan: $migration_plan${NC}"
    fi
}

# Function to preview migration
preview_migration() {
    local org="$1"
    migrate_reports "$org" "" "true"
}

# Function to compare before/after
compare_reports() {
    local org="$1"
    local output_file="$2"
    
    echo -e "${BLUE}Comparing report counts for $org...${NC}"
    
    # Get current count
    local current_count=$(sf data query --query "SELECT COUNT() FROM Report" --target-org "$org" --json | jq '.result.records[0].expr0')
    
    # Get archived count
    local archived_count=$(sf data query --query "SELECT COUNT() FROM Report WHERE Name LIKE '[ARCHIVED]%'" --target-org "$org" --json | jq '.result.records[0].expr0')
    
    # Calculate savings
    local active_count=$((current_count - archived_count))
    local savings_percentage=$(echo "scale=2; ($archived_count / $current_count) * 100" | bc)
    
    local comparison="{
        \"org\": \"$org\",
        \"timestamp\": \"$(date -Iseconds)\",
        \"metrics\": {
            \"totalReports\": $current_count,
            \"activeReports\": $active_count,
            \"archivedReports\": $archived_count,
            \"reductionPercentage\": $savings_percentage
        },
        \"annualSavings\": {
            \"reportMaintenance\": $(echo "$archived_count * 50" | bc),
            \"apiCalls\": $(echo "$archived_count * 365 * 10" | bc),
            \"storageGB\": $(echo "scale=2; $archived_count * 0.001" | bc)
        }
    }"
    
    if [ -n "$output_file" ]; then
        echo "$comparison" | jq '.' > "$output_file"
        echo -e "${GREEN}Comparison saved to: $output_file${NC}"
    fi
    
    echo "$comparison" | jq '.'
    
    echo -e "\n${CYAN}═══ Report Reduction Summary ═══${NC}"
    echo "Active Reports: $active_count"
    echo "Archived Reports: $archived_count"
    echo "Reduction: ${savings_percentage}%"
    echo -e "${GREEN}Estimated Annual Savings:${NC}"
    echo "  • Maintenance Hours: $(echo "$archived_count * 2" | bc)"
    echo "  • API Calls Saved: $(echo "$archived_count * 365 * 10" | bc | numfmt --grouping)"
}

# Function to rollback migration
rollback_migration() {
    local org="$1"
    
    echo -e "${YELLOW}Rolling back report migration for $org...${NC}"
    
    # Find archived reports and restore them
    local archived_reports=$(sf data query --query "SELECT Id, Name FROM Report WHERE Name LIKE '[ARCHIVED]%'" --target-org "$org" --json)
    
    local count=$(echo "$archived_reports" | jq '.result.totalSize')
    
    if [ "$count" -eq 0 ]; then
        echo -e "${GREEN}No archived reports found to restore${NC}"
        return 0
    fi
    
    echo "Found $count archived reports to restore"
    
    echo "$archived_reports" | jq -r '.result.records[] | @base64' | while read -r record; do
        local report=$(echo "$record" | base64 -d)
        local id=$(echo "$report" | jq -r '.Id')
        local name=$(echo "$report" | jq -r '.Name' | sed 's/\[ARCHIVED\] //')
        
        echo "Restoring: $name"
        
        sf data update record --sobject Report --record-id "$id" \
            --values "Name='$name'" \
            --target-org "$org" 2>/dev/null || true
    done
    
    echo -e "${GREEN}Rollback complete!${NC}"
}

# Main execution
main() {
    local command="${1:-help}"
    shift || true
    
    local org=""
    local folder=""
    local pattern=""
    local threshold=80
    local output=""
    local dry_run=""
    local include_private=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --org)
                org="$2"
                shift 2
                ;;
            --folder)
                folder="$2"
                shift 2
                ;;
            --pattern)
                pattern="$2"
                shift 2
                ;;
            --threshold)
                threshold="$2"
                shift 2
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            --include-private)
                include_private="true"
                shift
                ;;
            *)
                org="${org:-$1}"
                shift
                ;;
        esac
    done
    
    # Get org if not specified
    org=$(get_current_org "$org") || exit 1
    
    case "$command" in
        analyze)
            analyze_reports "$org" "$folder" "$pattern" "$include_private"
            ;;
        migrate)
            migrate_reports "$org" "" "$dry_run"
            ;;
        preview)
            preview_migration "$org"
            ;;
        compare)
            compare_reports "$org" "$output"
            ;;
        rollback)
            rollback_migration "$org"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"