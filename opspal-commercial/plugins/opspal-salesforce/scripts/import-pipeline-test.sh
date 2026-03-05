#!/bin/bash

# Enhanced Import Pipeline Test Suite
# Tests the auto-import-pipeline with new bulk API and performance monitoring
# Works with any Salesforce instance using SF CLI OAuth

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_DATA_DIR="$PROJECT_ROOT/test-data"
RESULTS_DIR="$PROJECT_ROOT/test-results"
PIPELINE_SCRIPT="$SCRIPT_DIR/auto-import-pipeline.sh"

# Import new libraries
BULK_HANDLER="$SCRIPT_DIR/lib/bulk-api-handler.js"
QUERY_MONITOR="$SCRIPT_DIR/monitoring/query-monitor.js"
COMPOSITE_API="$SCRIPT_DIR/lib/composite-api.js"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test configuration
TEST_CONFIG='{
    "smallFile": 100,
    "mediumFile": 5000,
    "largeFile": 15000,
    "testObjects": ["Account", "Contact", "Lead", "Opportunity"],
    "errorScenarios": [
        "invalid_picklist",
        "missing_required",
        "duplicate_external_id",
        "validation_rule_violation",
        "wrong_record_type"
    ]
}'

# Function to display usage
show_usage() {
    cat << EOF
Enhanced Import Pipeline Test Suite

Usage: $0 <command> [options]

Commands:
    generate           Generate test data files
    validate          Validate existing test files
    run               Run import tests
    benchmark         Run performance benchmarks
    stress            Run stress tests
    report            Generate test report

Options:
    --org <alias>     Target org (uses SF_TARGET_ORG if not specified)
    --object <type>   Salesforce object type
    --size <number>   Number of records to test
    --scenario <type> Error scenario to test
    --use-bulk       Force bulk API usage
    --monitor        Enable performance monitoring
    --output <file>  Output file for results

Examples:
    $0 generate --object Account --size 1000
    $0 run --org example-company-sandbox --object Contact --use-bulk
    $0 benchmark --org production --monitor
    $0 stress --size 50000 --object Opportunity

This tests:
1. CSV validation and sanitization
2. Bulk vs sync API switching
3. Error handling and recovery
4. Performance monitoring
5. API limit management

EOF
}

# Function to get current org
get_current_org() {
    local org="${1:-$SF_TARGET_ORG}"
    
    if [ -z "$org" ]; then
        org=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty')
    fi
    
    if [ -z "$org" ]; then
        echo -e "${RED}Error: No org specified. Use --org or set SF_TARGET_ORG${NC}" >&2
        return 1
    fi
    
    echo "$org"
}

# Function to generate test data
generate_test_data() {
    local object_type="$1"
    local size="$2"
    local scenario="$3"
    
    echo -e "${BLUE}Generating test data for $object_type (${size} records)...${NC}"
    
    mkdir -p "$TEST_DATA_DIR"
    
    # Use Node.js to generate realistic test data
    node << NODEJS
const fs = require('fs');
const path = require('path');

const objectType = "$object_type";
const recordCount = $size;
const scenario = "$scenario";

// Generate test records based on object type
function generateRecord(index) {
    const record = {};
    
    switch(objectType) {
        case 'Account':
            record.Name = \`Test Account \${index}\`;
            record.Type = ['Customer', 'Partner', 'Prospect'][index % 3];
            record.Industry = ['Technology', 'Healthcare', 'Finance'][index % 3];
            record.AnnualRevenue = Math.floor(Math.random() * 10000000);
            record.NumberOfEmployees = Math.floor(Math.random() * 10000);
            record.Website = \`https://testaccount\${index}.com\`;
            record.Phone = \`555-\${String(index).padStart(4, '0')}\`;
            break;
            
        case 'Contact':
            record.FirstName = \`Test\${index}\`;
            record.LastName = \`Contact\${index}\`;
            record.Email = \`test.contact\${index}@example.com\`;
            record.Phone = \`555-\${String(index).padStart(4, '0')}\`;
            record.Title = ['Manager', 'Director', 'VP', 'CEO'][index % 4];
            record.Department = ['Sales', 'Marketing', 'Engineering'][index % 3];
            break;
            
        case 'Lead':
            record.FirstName = \`Test\${index}\`;
            record.LastName = \`Lead\${index}\`;
            record.Company = \`Company \${index}\`;
            record.Email = \`test.lead\${index}@example.com\`;
            record.Status = ['Open', 'Working', 'Qualified'][index % 3];
            record.LeadSource = ['Web', 'Phone', 'Email'][index % 3];
            record.Rating = ['Hot', 'Warm', 'Cold'][index % 3];
            break;
            
        case 'Opportunity':
            record.Name = \`Opportunity \${index}\`;
            record.StageName = ['Prospecting', 'Qualification', 'Proposal'][index % 3];
            record.CloseDate = new Date(Date.now() + (index * 86400000)).toISOString().split('T')[0];
            record.Amount = Math.floor(Math.random() * 1000000);
            record.Probability = [10, 25, 50, 75][index % 4];
            record.Type = ['New Business', 'Renewal', 'Upsell'][index % 3];
            break;
            
        default:
            record.Name = \`Test \${objectType} \${index}\`;
    }
    
    // Inject errors based on scenario
    if (scenario && index % 10 === 0) {
        switch(scenario) {
            case 'invalid_picklist':
                if (record.Type) record.Type = 'INVALID_VALUE';
                break;
            case 'missing_required':
                delete record.Name;
                break;
            case 'duplicate_external_id':
                record.External_ID__c = 'DUPLICATE001';
                break;
            case 'validation_rule_violation':
                record.Amount = -1000; // Negative amount
                break;
            case 'wrong_record_type':
                record.RecordTypeId = '012000000000000AAA'; // Invalid ID
                break;
        }
    }
    
    // Add problematic characters for testing
    if (index % 20 === 0) {
        record.Description = 'Test with, commas\\nand newlines\\r\\nand "quotes"';
    }
    
    return record;
}

// Generate CSV
const records = [];
for (let i = 1; i <= recordCount; i++) {
    records.push(generateRecord(i));
}

// Convert to CSV
const headers = Object.keys(records[0]);
const csv = [
    headers.join(','),
    ...records.map(record => 
        headers.map(header => {
            const value = record[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\\n'))) {
                return '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        }).join(',')
    )
].join('\\n');

// Add different line endings for testing
let finalCsv = csv;
if (scenario === 'crlf_issue') {
    finalCsv = csv.replace(/\\n/g, '\\r\\n');
}

// Save file
const filename = \`\${objectType.toLowerCase()}-test-\${recordCount}-\${scenario || 'clean'}.csv\`;
const filepath = path.join("$TEST_DATA_DIR", filename);
fs.writeFileSync(filepath, finalCsv);

console.log(\`Generated: \${filepath}\`);
console.log(\`Records: \${recordCount}\`);
console.log(\`Size: \${(finalCsv.length / 1024).toFixed(2)} KB\`);

// Also generate a metadata file
const metadata = {
    file: filename,
    object: objectType,
    recordCount: recordCount,
    scenario: scenario || 'clean',
    headers: headers,
    generatedAt: new Date().toISOString(),
    checksums: {
        records: recordCount,
        bytes: finalCsv.length,
        lines: finalCsv.split('\\n').length
    }
};

fs.writeFileSync(filepath.replace('.csv', '.meta.json'), JSON.stringify(metadata, null, 2));
NODEJS
    
    echo -e "${GREEN}✓ Test data generated${NC}"
}

# Function to validate test files
validate_test_files() {
    local org="$1"
    
    echo -e "${BLUE}Validating test files with new validators...${NC}"
    
    mkdir -p "$RESULTS_DIR"
    local validation_report="$RESULTS_DIR/validation-$(date +%Y%m%d-%H%M%S).json"
    
    # Run validation on all test files
    for test_file in "$TEST_DATA_DIR"/*.csv; do
        [ -f "$test_file" ] || continue
        
        local filename=$(basename "$test_file")
        echo -e "\nValidating: $filename"
        
        # Extract object type from filename
        local object_type=$(echo "$filename" | cut -d'-' -f1 | sed 's/^\(.\)/\U\1/')
        
        # Run validators
        echo "  1. Field verification..."
        "$SCRIPT_DIR/field-verifier.sh" "$test_file" --object "$object_type" --org "$org" 2>/dev/null
        
        echo "  2. Picklist validation..."
        "$SCRIPT_DIR/picklist-validator.sh" "$test_file" --object "$object_type" --org "$org" 2>/dev/null
        
        echo "  3. CSV sanitization..."
        "$SCRIPT_DIR/csv-sanitizer.sh" "$test_file" --check 2>/dev/null
        
        echo "  4. Validation rule analysis..."
        "$SCRIPT_DIR/validation-rule-analyzer.sh" check "$object_type" --org "$org" 2>/dev/null
        
        echo "  5. Preflight check..."
        "$SCRIPT_DIR/preflight-check.sh" "$test_file" --object "$object_type" --org "$org" 2>/dev/null
    done
    
    echo -e "\n${GREEN}Validation complete. Report: $validation_report${NC}"
}

# Function to run import tests
run_import_tests() {
    local org="$1"
    local object_type="$2"
    local use_bulk="$3"
    local monitor="$4"
    
    echo -e "${BLUE}Running import tests for $object_type in $org...${NC}"
    
    mkdir -p "$RESULTS_DIR"
    local test_id="test-$(date +%Y%m%d-%H%M%S)"
    local test_log="$RESULTS_DIR/${test_id}.log"
    
    # Start performance monitoring if requested
    if [ "$monitor" == "true" ]; then
        echo -e "${CYAN}Starting performance monitor...${NC}"
        node "$QUERY_MONITOR" monitor --org "$org" > "$RESULTS_DIR/${test_id}-monitor.log" 2>&1 &
        local monitor_pid=$!
    fi
    
    # Find test files for object
    local test_files=$(ls "$TEST_DATA_DIR"/${object_type,,}-test-*.csv 2>/dev/null)
    
    if [ -z "$test_files" ]; then
        echo -e "${YELLOW}No test files found. Generating...${NC}"
        generate_test_data "$object_type" 1000 "mixed"
        test_files=$(ls "$TEST_DATA_DIR"/${object_type,,}-test-*.csv)
    fi
    
    # Run tests
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    echo "Test ID: $test_id" | tee "$test_log"
    echo "Org: $org" | tee -a "$test_log"
    echo "Object: $object_type" | tee -a "$test_log"
    echo "Started: $(date)" | tee -a "$test_log"
    echo "" | tee -a "$test_log"
    
    for test_file in $test_files; do
        [ -f "$test_file" ] || continue
        
        local filename=$(basename "$test_file")
        echo -e "\n${CYAN}Testing: $filename${NC}" | tee -a "$test_log"
        
        ((total_tests++))
        
        # Determine if we should use bulk based on file size
        local record_count=$(wc -l < "$test_file")
        local force_bulk=""
        
        if [ "$use_bulk" == "true" ] || [ "$record_count" -gt 10000 ]; then
            force_bulk="--use-bulk"
            echo "  Using Bulk API (${record_count} records)" | tee -a "$test_log"
        else
            echo "  Using Sync API (${record_count} records)" | tee -a "$test_log"
        fi
        
        # Run the import pipeline
        local start_time=$(date +%s)
        
        if "$PIPELINE_SCRIPT" "$test_file" \
            --object "$object_type" \
            --org "$org" \
            $force_bulk \
            --max-errors 50 \
            --retry 3 >> "$test_log" 2>&1; then
            
            ((passed_tests++))
            local duration=$(($(date +%s) - start_time))
            echo -e "  ${GREEN}✓ PASSED${NC} (${duration}s)" | tee -a "$test_log"
            
            # Calculate throughput
            local throughput=$(echo "scale=2; $record_count / $duration" | bc)
            echo "  Throughput: ${throughput} records/second" | tee -a "$test_log"
            
        else
            ((failed_tests++))
            echo -e "  ${RED}✗ FAILED${NC}" | tee -a "$test_log"
            
            # Analyze failure
            echo "  Analyzing failure..." | tee -a "$test_log"
            tail -20 "$test_log" | grep -E "ERROR|FAILED|Error" | tee -a "$test_log"
        fi
        
        # Check API limits
        if [ "$monitor" == "true" ]; then
            local limits=$(node "$QUERY_MONITOR" limits --org "$org" --json 2>/dev/null)
            local api_remaining=$(echo "$limits" | jq -r '.DailyApiRequests.Remaining // "unknown"')
            echo "  API Remaining: $api_remaining" | tee -a "$test_log"
            
            if [ "$api_remaining" != "unknown" ] && [ "$api_remaining" -lt 1000 ]; then
                echo -e "  ${YELLOW}⚠ Low API limit warning${NC}" | tee -a "$test_log"
            fi
        fi
    done
    
    # Stop monitor
    if [ -n "$monitor_pid" ]; then
        kill $monitor_pid 2>/dev/null
    fi
    
    # Generate summary
    echo -e "\n${CYAN}═══ Test Summary ═══${NC}" | tee -a "$test_log"
    echo "Total Tests: $total_tests" | tee -a "$test_log"
    echo -e "${GREEN}Passed: $passed_tests${NC}" | tee -a "$test_log"
    echo -e "${RED}Failed: $failed_tests${NC}" | tee -a "$test_log"
    local success_rate=$(echo "scale=2; $passed_tests * 100 / $total_tests" | bc)
    echo "Success Rate: ${success_rate}%" | tee -a "$test_log"
    echo "Completed: $(date)" | tee -a "$test_log"
    
    # Generate JSON report
    cat > "$RESULTS_DIR/${test_id}-report.json" << EOF
{
    "testId": "$test_id",
    "org": "$org",
    "object": "$object_type",
    "timestamp": "$(date -Iseconds)",
    "results": {
        "total": $total_tests,
        "passed": $passed_tests,
        "failed": $failed_tests,
        "successRate": $success_rate
    },
    "configuration": {
        "useBulk": "$use_bulk",
        "monitoring": "$monitor"
    }
}
EOF
    
    echo -e "\n${GREEN}Test complete. Report: $RESULTS_DIR/${test_id}-report.json${NC}"
}

# Function to run benchmarks
run_benchmarks() {
    local org="$1"
    
    echo -e "${BLUE}Running performance benchmarks...${NC}"
    
    mkdir -p "$RESULTS_DIR"
    local benchmark_id="benchmark-$(date +%Y%m%d-%H%M%S)"
    local benchmark_log="$RESULTS_DIR/${benchmark_id}.log"
    
    # Test different file sizes
    local sizes=(100 1000 5000 10000 25000)
    local objects=("Account" "Contact" "Opportunity")
    
    echo "Benchmark ID: $benchmark_id" | tee "$benchmark_log"
    echo "Org: $org" | tee -a "$benchmark_log"
    echo "" | tee -a "$benchmark_log"
    
    # Results array
    local results="[]"
    
    for object in "${objects[@]}"; do
        for size in "${sizes[@]}"; do
            echo -e "\n${CYAN}Benchmarking: $object with $size records${NC}" | tee -a "$benchmark_log"
            
            # Generate test data
            generate_test_data "$object" "$size" "clean" > /dev/null 2>&1
            
            local test_file="$TEST_DATA_DIR/${object,,}-test-${size}-clean.csv"
            
            # Test sync API (if under threshold)
            if [ "$size" -le 5000 ]; then
                echo "  Testing Sync API..." | tee -a "$benchmark_log"
                local sync_start=$(date +%s%N)
                
                if node "$BULK_HANDLER" query \
                    "SELECT COUNT() FROM $object" \
                    --org "$org" \
                    --sync > /dev/null 2>&1; then
                    
                    local sync_duration=$(echo "scale=3; ($(date +%s%N) - $sync_start) / 1000000000" | bc)
                    echo "    Duration: ${sync_duration}s" | tee -a "$benchmark_log"
                    
                    results=$(echo "$results" | jq ". += [{
                        \"object\": \"$object\",
                        \"size\": $size,
                        \"method\": \"sync\",
                        \"duration\": $sync_duration,
                        \"throughput\": $(echo "scale=2; $size / $sync_duration" | bc)
                    }]")
                fi
            fi
            
            # Test bulk API
            echo "  Testing Bulk API..." | tee -a "$benchmark_log"
            local bulk_start=$(date +%s%N)
            
            if node "$BULK_HANDLER" bulk-query \
                "SELECT Id FROM $object LIMIT $size" \
                --org "$org" > /dev/null 2>&1; then
                
                local bulk_duration=$(echo "scale=3; ($(date +%s%N) - $bulk_start) / 1000000000" | bc)
                echo "    Duration: ${bulk_duration}s" | tee -a "$benchmark_log"
                
                results=$(echo "$results" | jq ". += [{
                    \"object\": \"$object\",
                    \"size\": $size,
                    \"method\": \"bulk\",
                    \"duration\": $bulk_duration,
                    \"throughput\": $(echo "scale=2; $size / $bulk_duration" | bc)
                }]")
            fi
            
            # Test composite API (for small batches)
            if [ "$size" -le 25 ]; then
                echo "  Testing Composite API..." | tee -a "$benchmark_log"
                local composite_start=$(date +%s%N)
                
                # Create composite request
                if node "$COMPOSITE_API" test --org "$org" > /dev/null 2>&1; then
                    local composite_duration=$(echo "scale=3; ($(date +%s%N) - $composite_start) / 1000000000" | bc)
                    echo "    Duration: ${composite_duration}s" | tee -a "$benchmark_log"
                    
                    results=$(echo "$results" | jq ". += [{
                        \"object\": \"$object\",
                        \"size\": $size,
                        \"method\": \"composite\",
                        \"duration\": $composite_duration,
                        \"throughput\": $(echo "scale=2; $size / $composite_duration" | bc)
                    }]")
                fi
            fi
        done
    done
    
    # Save benchmark results
    echo "$results" | jq '.' > "$RESULTS_DIR/${benchmark_id}-results.json"
    
    # Generate summary
    echo -e "\n${CYAN}═══ Benchmark Summary ═══${NC}" | tee -a "$benchmark_log"
    
    # Find best method for each size range
    echo "$results" | jq -r '
        group_by(.size) | 
        map({
            size: .[0].size,
            bestMethod: (sort_by(.duration) | .[0].method),
            bestThroughput: (sort_by(.duration) | .[0].throughput)
        }) | 
        .[] | 
        "Size \(.size): Best method is \(.bestMethod) (\(.bestThroughput) rec/s)"
    ' | tee -a "$benchmark_log"
    
    echo -e "\n${GREEN}Benchmark complete. Results: $RESULTS_DIR/${benchmark_id}-results.json${NC}"
}

# Function to run stress tests
run_stress_tests() {
    local org="$1"
    local size="$2"
    local object_type="${3:-Account}"
    
    echo -e "${BLUE}Running stress test with $size records...${NC}"
    
    # Generate large dataset
    echo "Generating stress test data..."
    generate_test_data "$object_type" "$size" "mixed"
    
    local test_file="$TEST_DATA_DIR/${object_type,,}-test-${size}-mixed.csv"
    
    # Monitor system resources
    echo "Starting resource monitoring..."
    (while true; do
        echo "$(date +%s),$(free -m | awk 'NR==2{print $3}'),$(top -bn1 | grep "Cpu(s)" | awk '{print $2}')"
        sleep 5
    done) > "$RESULTS_DIR/stress-resources.csv" &
    local monitor_pid=$!
    
    # Run import with monitoring
    echo "Starting import..."
    local start_time=$(date +%s)
    
    "$PIPELINE_SCRIPT" "$test_file" \
        --object "$object_type" \
        --org "$org" \
        --use-bulk \
        --monitor \
        --max-errors 100 > "$RESULTS_DIR/stress-output.log" 2>&1
    
    local exit_code=$?
    local duration=$(($(date +%s) - start_time))
    
    # Stop monitoring
    kill $monitor_pid 2>/dev/null
    
    # Analyze results
    echo -e "\n${CYAN}═══ Stress Test Results ═══${NC}"
    echo "Records: $size"
    echo "Duration: ${duration}s"
    echo "Throughput: $(echo "scale=2; $size / $duration" | bc) records/second"
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ Stress test PASSED${NC}"
    else
        echo -e "${RED}✗ Stress test FAILED${NC}"
        echo "Check $RESULTS_DIR/stress-output.log for details"
    fi
    
    # Analyze resource usage
    echo -e "\nResource Usage:"
    awk -F',' '{mem+=$2; cpu+=$3; count++} END {
        print "  Avg Memory: " mem/count " MB"
        print "  Avg CPU: " cpu/count "%"
    }' "$RESULTS_DIR/stress-resources.csv"
}

# Function to generate test report
generate_report() {
    echo -e "${BLUE}Generating test report...${NC}"
    
    # Collect all test results
    local report_file="$RESULTS_DIR/test-report-$(date +%Y%m%d-%H%M%S).html"
    
    cat > "$report_file" << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>Import Pipeline Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .passed { color: green; font-weight: bold; }
        .failed { color: red; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #4CAF50; color: white; }
        .chart { margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Import Pipeline Test Report</h1>
    <div class="summary">
        <h2>Summary</h2>
HTML
    
    # Add test results
    local total_tests=$(ls "$RESULTS_DIR"/test-*.log 2>/dev/null | wc -l)
    local passed=$(grep -l "PASSED" "$RESULTS_DIR"/test-*.log 2>/dev/null | wc -l)
    local failed=$((total_tests - passed))
    
    cat >> "$report_file" << HTML
        <p>Total Tests: $total_tests</p>
        <p class="passed">Passed: $passed</p>
        <p class="failed">Failed: $failed</p>
        <p>Success Rate: $(echo "scale=2; $passed * 100 / $total_tests" | bc)%</p>
    </div>
    
    <h2>Test Details</h2>
    <table>
        <tr>
            <th>Test ID</th>
            <th>Object</th>
            <th>Records</th>
            <th>Method</th>
            <th>Duration</th>
            <th>Status</th>
        </tr>
HTML
    
    # Add individual test results
    for test_report in "$RESULTS_DIR"/*-report.json; do
        [ -f "$test_report" ] || continue
        
        local test_id=$(jq -r '.testId' "$test_report")
        local object=$(jq -r '.object' "$test_report")
        local status=$(jq -r 'if .results.successRate >= 100 then "PASSED" else "FAILED" end' "$test_report")
        
        echo "<tr>" >> "$report_file"
        echo "<td>$test_id</td>" >> "$report_file"
        echo "<td>$object</td>" >> "$report_file"
        echo "<td>-</td>" >> "$report_file"
        echo "<td>-</td>" >> "$report_file"
        echo "<td>-</td>" >> "$report_file"
        echo "<td class='$(echo $status | tr '[:upper:]' '[:lower:]')'>$status</td>" >> "$report_file"
        echo "</tr>" >> "$report_file"
    done
    
    cat >> "$report_file" << 'HTML'
    </table>
    
    <h2>Performance Benchmarks</h2>
    <p>Best methods by record count:</p>
    <ul>
        <li>&lt; 1,000 records: Synchronous API</li>
        <li>1,000 - 10,000 records: Smart Query (auto-switch)</li>
        <li>&gt; 10,000 records: Bulk API 2.0</li>
        <li>Composite operations: For related records</li>
    </ul>
    
    <p>Generated: <script>document.write(new Date().toLocaleString())</script></p>
</body>
</html>
HTML
    
    echo -e "${GREEN}Report generated: $report_file${NC}"
    
    # Try to open in browser (WSL-aware)
    if command -v wslview > /dev/null 2>&1; then
        wslview "$report_file"
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        open "$report_file"
    elif command -v xdg-open > /dev/null 2>&1; then
        xdg-open "$report_file"
    elif command -v sensible-browser > /dev/null 2>&1; then
        sensible-browser "$report_file"
    fi
}

# Main execution
main() {
    local command="${1:-help}"
    shift || true
    
    local org=""
    local object_type="Account"
    local size=1000
    local scenario=""
    local use_bulk=""
    local monitor=""
    local output=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --org)
                org="$2"
                shift 2
                ;;
            --object)
                object_type="$2"
                shift 2
                ;;
            --size)
                size="$2"
                shift 2
                ;;
            --scenario)
                scenario="$2"
                shift 2
                ;;
            --use-bulk)
                use_bulk="true"
                shift
                ;;
            --monitor)
                monitor="true"
                shift
                ;;
            --output)
                output="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Get org if not specified
    org=$(get_current_org "$org") || exit 1
    
    case "$command" in
        generate)
            generate_test_data "$object_type" "$size" "$scenario"
            ;;
        validate)
            validate_test_files "$org"
            ;;
        run)
            run_import_tests "$org" "$object_type" "$use_bulk" "$monitor"
            ;;
        benchmark)
            run_benchmarks "$org"
            ;;
        stress)
            run_stress_tests "$org" "$size" "$object_type"
            ;;
        report)
            generate_report
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