#!/bin/bash

##############################################################################
# Weekly Flow Consolidation Check Script
# 
# Validates the Flow Consolidation Principle: ONE FLOW PER OBJECT PER TRIGGER TYPE
# Identifies objects with multiple flows per trigger type and generates 
# consolidation reports with actionable recommendations.
#
# Usage:
#   ./flow-consolidation-validator.sh --org <alias> [--email alerts@company.com] [--auto-fix] [--silent]
#
# Cron Example (Sunday at 6 AM):
#   0 6 * * 0 cd /path/to/project && ./scripts/monitoring/flow-consolidation-validator.sh --org production --email devteam@company.com
##############################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REPORTS_DIR="${PROJECT_ROOT}/reports/weekly-consolidation"
TIMESTAMP=$(date +%Y-%m-%d)
LOG_FILE="${REPORTS_DIR}/consolidation-check-${TIMESTAMP}.log"

# Default values
ORG_ALIAS=""
EMAIL_RECIPIENTS=""
AUTO_FIX=false
SILENT=false
THRESHOLD_VIOLATIONS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Logging and Output Functions
##############################################################################

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_message="[${timestamp}] [${level}] ${message}"
    
    # Write to log file
    echo "${log_message}" >> "${LOG_FILE}"
    
    # Output to console unless silent
    if [[ "${SILENT}" != "true" ]]; then
        case "${level}" in
            "ERROR")
                echo -e "${RED}${log_message}${NC}" >&2
                ;;
            "WARN")
                echo -e "${YELLOW}${log_message}${NC}"
                ;;
            "SUCCESS")
                echo -e "${GREEN}${log_message}${NC}"
                ;;
            "INFO")
                echo -e "${BLUE}${log_message}${NC}"
                ;;
            *)
                echo "${log_message}"
                ;;
        esac
    fi
}

##############################################################################
# Validation Functions
##############################################################################

validate_prerequisites() {
    log "INFO" "Validating prerequisites..."
    
    # Check if sf CLI is installed
    if ! command -v sf &> /dev/null; then
        log "ERROR" "Salesforce CLI (sf) is not installed or not in PATH"
        exit 1
    fi
    
    # Check if jq is installed for JSON parsing
    if ! command -v jq &> /dev/null; then
        log "ERROR" "jq is not installed. Please install jq for JSON parsing"
        exit 1
    fi
    
    # Create reports directory
    mkdir -p "${REPORTS_DIR}"
    
    # Validate org connection
    if ! sf org display --target-org "${ORG_ALIAS}" --json >/dev/null 2>&1; then
        log "ERROR" "Cannot connect to Salesforce org '${ORG_ALIAS}'. Please check authentication."
        exit 1
    fi
    
    local org_info
    org_info=$(sf org display --target-org "${ORG_ALIAS}" --json | jq -r '.result | "\(.alias) (\(.instanceUrl))"')
    log "INFO" "Connected to org: ${org_info}"
}

##############################################################################
# Flow Analysis Functions
##############################################################################

retrieve_flow_data() {
    log "INFO" "Retrieving flow metadata from Salesforce..."
    
    local soql_query="
        SELECT Id, DurableId, ApiName, Label, Description, TriggerType, ProcessType, 
               IsActive, LastModifiedDate, CreatedDate, 
               (SELECT Id, FullName FROM Entities) 
        FROM FlowDefinition 
        WHERE IsActive = true 
        ORDER BY ApiName
    "
    
    local flows_file="${REPORTS_DIR}/flows-${TIMESTAMP}.json"
    
    if sf data query --query "${soql_query}" --target-org "${ORG_ALIAS}" --json > "${flows_file}"; then
        local flow_count
        flow_count=$(jq '.result.records | length' "${flows_file}")
        log "INFO" "Retrieved ${flow_count} active flows"
        echo "${flows_file}"
    else
        log "ERROR" "Failed to retrieve flow data"
        exit 1
    fi
}

get_flow_triggered_objects() {
    local flow_api_name="$1"
    log "INFO" "Getting triggered objects for flow: ${flow_api_name}"
    
    # Query flow interviews to determine which objects trigger the flow
    local soql_query="
        SELECT DISTINCT SobjectType 
        FROM FlowInterview 
        WHERE FlowVersionView.DeveloperName = '${flow_api_name}'
        AND CreatedDate >= LAST_N_DAYS:30
        LIMIT 10
    "
    
    local objects_json
    objects_json=$(sf data query --query "${soql_query}" --target-org "${ORG_ALIAS}" --json 2>/dev/null || echo '{"result":{"records":[]}}')
    echo "${objects_json}" | jq -r '.result.records[].SobjectType' 2>/dev/null || echo ""
}

analyze_flow_consolidation_violations() {
    local flows_file="$1"
    local violations_file="${REPORTS_DIR}/violations-${TIMESTAMP}.json"
    local analysis_report="${REPORTS_DIR}/consolidation-analysis-${TIMESTAMP}.txt"
    
    log "INFO" "Analyzing flows for consolidation violations..."
    
    # Initialize analysis report
    cat > "${analysis_report}" << EOF
FLOW CONSOLIDATION ANALYSIS REPORT
Generated: $(date)
Organization: ${ORG_ALIAS}
Analysis Date: ${TIMESTAMP}

FLOW CONSOLIDATION PRINCIPLE:
- ONE FLOW PER OBJECT PER TRIGGER TYPE
- Multiple flows on same object/trigger = VIOLATION
- Flows should be consolidated for maintainability

================================================

EOF

    # Create violations JSON structure
    echo '{"violations": [], "summary": {}}' > "${violations_file}"
    
    # Group flows by trigger type and analyze
    local trigger_types
    trigger_types=$(jq -r '.result.records[].TriggerType // "null" | select(. != "null")' "${flows_file}" | sort -u)
    
    local total_violations=0
    local objects_analyzed=0
    
    echo "CONSOLIDATION VIOLATIONS BY TRIGGER TYPE:" >> "${analysis_report}"
    echo "=========================================" >> "${analysis_report}"
    
    while IFS= read -r trigger_type; do
        [[ -z "${trigger_type}" ]] && continue
        
        log "INFO" "Analyzing trigger type: ${trigger_type}"
        echo "" >> "${analysis_report}"
        echo "TRIGGER TYPE: ${trigger_type}" >> "${analysis_report}"
        echo "----------------------------" >> "${analysis_report}"
        
        # Get flows for this trigger type
        local flows_for_trigger
        flows_for_trigger=$(jq --arg trigger "${trigger_type}" '
            .result.records[] | 
            select(.TriggerType == $trigger) | 
            {ApiName, Label, Description, LastModifiedDate}
        ' "${flows_file}")
        
        # Group flows by potential object (extracted from name/description)
        local flow_objects=()
        
        while IFS= read -r flow_data; do
            [[ -z "${flow_data}" ]] && continue
            
            local api_name
            api_name=$(echo "${flow_data}" | jq -r '.ApiName')
            
            local label
            label=$(echo "${flow_data}" | jq -r '.Label // ""')
            
            local description
            description=$(echo "${flow_data}" | jq -r '.Description // ""')
            
            # Try to extract object name from flow name patterns
            local potential_objects
            potential_objects=$(extract_object_from_flow_name "${api_name}" "${label}" "${description}")
            
            # Get actual triggered objects from runtime data
            local runtime_objects
            runtime_objects=$(get_flow_triggered_objects "${api_name}")
            
            # Combine detected objects
            local all_objects="${potential_objects} ${runtime_objects}"
            all_objects=$(echo "${all_objects}" | tr ' ' '\n' | sort -u | tr '\n' ' ')
            
            if [[ -n "${all_objects// }" ]]; then
                for object in ${all_objects}; do
                    [[ -z "${object}" ]] && continue
                    flow_objects+=("${object}:${api_name}:${label}")
                done
            else
                # Cannot determine object - flag for manual review
                echo "  ⚠️  UNKNOWN OBJECT: ${api_name} (${label})" >> "${analysis_report}"
                log "WARN" "Cannot determine object for flow: ${api_name}"
            fi
            
        done <<< "$(echo "${flows_for_trigger}" | jq -c '.')"
        
        # Check for violations (multiple flows per object)
        declare -A object_flows
        for entry in "${flow_objects[@]}"; do
            IFS=':' read -r object flow_api flow_label <<< "${entry}"
            if [[ -z "${object_flows[$object]:-}" ]]; then
                object_flows["${object}"]="${flow_api}|${flow_label}"
            else
                object_flows["${object}"]+=" ${flow_api}|${flow_label}"
            fi
        done
        
        # Report violations
        local trigger_violations=0
        for object in "${!object_flows[@]}"; do
            local flows_list="${object_flows[$object]}"
            local flow_count
            flow_count=$(echo "${flows_list}" | tr ' ' '\n' | wc -l)
            
            if [[ ${flow_count} -gt 1 ]]; then
                echo "  🚨 VIOLATION: ${object} has ${flow_count} flows" >> "${analysis_report}"
                echo "     Flows:" >> "${analysis_report}"
                
                # Add to violations JSON
                local violation_entry
                violation_entry=$(jq -n \
                    --arg trigger_type "${trigger_type}" \
                    --arg object "${object}" \
                    --argjson flow_count "${flow_count}" \
                    --arg flows "${flows_list}" \
                    '{
                        trigger_type: $trigger_type,
                        object: $object,
                        flow_count: $flow_count,
                        flows: ($flows | split(" ") | map(split("|") | {api_name: .[0], label: .[1]})),
                        severity: (if $flow_count > 3 then "HIGH" elif $flow_count > 2 then "MEDIUM" else "LOW" end),
                        recommendation: "Consolidate flows into single master flow"
                    }')
                
                jq --argjson violation "${violation_entry}" '.violations += [$violation]' "${violations_file}" > "${violations_file}.tmp" && mv "${violations_file}.tmp" "${violations_file}"
                
                echo "${flows_list}" | tr ' ' '\n' | while IFS='|' read -r flow_api flow_label; do
                    echo "       - ${flow_api} (${flow_label})" >> "${analysis_report}"
                done
                
                echo "     Recommendation: Consolidate into single master flow" >> "${analysis_report}"
                echo "" >> "${analysis_report}"
                
                ((trigger_violations++))
                ((total_violations++))
            else
                echo "  ✅ COMPLIANT: ${object} (1 flow)" >> "${analysis_report}"
            fi
            ((objects_analyzed++))
        done
        
        if [[ ${trigger_violations} -eq 0 ]]; then
            echo "  ✅ No violations found for ${trigger_type}" >> "${analysis_report}"
        else
            echo "  📊 Found ${trigger_violations} violations for ${trigger_type}" >> "${analysis_report}"
        fi
        
    done <<< "${trigger_types}"
    
    # Update summary in violations JSON
    jq --argjson total_violations "${total_violations}" \
       --argjson objects_analyzed "${objects_analyzed}" \
       --arg timestamp "${TIMESTAMP}" \
       --arg org_alias "${ORG_ALIAS}" \
       '.summary = {
           total_violations: $total_violations,
           objects_analyzed: $objects_analyzed,
           timestamp: $timestamp,
           org_alias: $org_alias,
           compliance_rate: (($objects_analyzed - $total_violations) / $objects_analyzed * 100 | floor)
       }' "${violations_file}" > "${violations_file}.tmp" && mv "${violations_file}.tmp" "${violations_file}"
    
    # Add summary to analysis report
    cat >> "${analysis_report}" << EOF

================================================
CONSOLIDATION ANALYSIS SUMMARY:
================================================
Total Objects Analyzed: ${objects_analyzed}
Total Violations Found: ${total_violations}
Compliance Rate: $((objects_analyzed > 0 ? (objects_analyzed - total_violations) * 100 / objects_analyzed : 100))%

SEVERITY BREAKDOWN:
EOF
    
    local high_severity
    local medium_severity
    local low_severity
    high_severity=$(jq '.violations[] | select(.severity == "HIGH") | .object' "${violations_file}" | wc -l)
    medium_severity=$(jq '.violations[] | select(.severity == "MEDIUM") | .object' "${violations_file}" | wc -l)
    low_severity=$(jq '.violations[] | select(.severity == "LOW") | .object' "${violations_file}" | wc -l)
    
    cat >> "${analysis_report}" << EOF
- HIGH (>3 flows per object): ${high_severity}
- MEDIUM (3 flows per object): ${medium_severity}
- LOW (2 flows per object): ${low_severity}

RECOMMENDATIONS:
1. Prioritize HIGH severity consolidations
2. Review flow business logic for consolidation opportunities
3. Follow Flow Consolidation Best Practices
4. Schedule consolidation during maintenance windows

EOF

    log "INFO" "Analysis complete. Found ${total_violations} consolidation violations"
    echo "${violations_file}"
}

extract_object_from_flow_name() {
    local api_name="$1"
    local label="$2"
    local description="$3"
    
    # Common Salesforce object patterns
    local objects=()
    
    # Extract from API name (common patterns)
    if [[ "${api_name}" =~ Account ]]; then objects+=("Account"); fi
    if [[ "${api_name}" =~ Contact ]]; then objects+=("Contact"); fi
    if [[ "${api_name}" =~ Opportunity ]]; then objects+=("Opportunity"); fi
    if [[ "${api_name}" =~ Lead ]]; then objects+=("Lead"); fi
    if [[ "${api_name}" =~ Case ]]; then objects+=("Case"); fi
    if [[ "${api_name}" =~ User ]]; then objects+=("User"); fi
    if [[ "${api_name}" =~ Task ]]; then objects+=("Task"); fi
    if [[ "${api_name}" =~ Event ]]; then objects+=("Event"); fi
    
    # Extract from label and description
    for text in "${label}" "${description}"; do
        if [[ "${text,,}" =~ account ]]; then objects+=("Account"); fi
        if [[ "${text,,}" =~ contact ]]; then objects+=("Contact"); fi
        if [[ "${text,,}" =~ opportunity ]]; then objects+=("Opportunity"); fi
        if [[ "${text,,}" =~ lead ]]; then objects+=("Lead"); fi
        if [[ "${text,,}" =~ case ]]; then objects+=("Case"); fi
        if [[ "${text,,}" =~ user ]]; then objects+=("User"); fi
        if [[ "${text,,}" =~ task ]]; then objects+=("Task"); fi
        if [[ "${text,,}" =~ event ]]; then objects+=("Event"); fi
    done
    
    # Remove duplicates and output
    printf '%s\n' "${objects[@]}" | sort -u | tr '\n' ' '
}

##############################################################################
# Report Generation Functions
##############################################################################

generate_html_report() {
    local violations_file="$1"
    local html_report="${REPORTS_DIR}/consolidation-report-${TIMESTAMP}.html"
    
    log "INFO" "Generating HTML consolidation report..."
    
    local summary
    summary=$(jq '.summary' "${violations_file}")
    
    local total_violations
    local objects_analyzed
    local compliance_rate
    total_violations=$(echo "${summary}" | jq '.total_violations')
    objects_analyzed=$(echo "${summary}" | jq '.objects_analyzed')
    compliance_rate=$(echo "${summary}" | jq '.compliance_rate')
    
    cat > "${html_report}" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flow Consolidation Report - ${TIMESTAMP}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
        .stat-card.violation { border-left-color: #dc3545; }
        .stat-card.compliant { border-left-color: #28a745; }
        .stat-value { font-size: 2em; font-weight: bold; color: #333; }
        .stat-label { color: #666; margin-top: 5px; }
        .violation-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .violation-table th, .violation-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .violation-table th { background-color: #f8f9fa; font-weight: bold; }
        .severity-high { color: #dc3545; font-weight: bold; }
        .severity-medium { color: #fd7e14; font-weight: bold; }
        .severity-low { color: #ffc107; font-weight: bold; }
        .flow-list { background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 5px; }
        .flow-list ul { margin: 5px 0; padding-left: 20px; }
        .recommendation { background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin-top: 5px; }
        .alert-section { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .no-violations { background: #d4edda; color: #155724; padding: 20px; border-radius: 8px; text-align: center; }
        .principle-box { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196f3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Flow Consolidation Validation Report</h1>
            <p><strong>Organization:</strong> ${ORG_ALIAS}</p>
            <p><strong>Generated:</strong> $(date)</p>
            <p><strong>Report Period:</strong> ${TIMESTAMP}</p>
        </div>

        <div class="principle-box">
            <h3>🎯 Flow Consolidation Principle</h3>
            <p><strong>ONE FLOW PER OBJECT PER TRIGGER TYPE</strong></p>
            <p>Multiple flows on the same object with the same trigger type should be consolidated into a single master flow for better maintainability, performance, and governance.</p>
        </div>

        <div class="summary">
            <div class="stat-card">
                <div class="stat-value">${objects_analyzed}</div>
                <div class="stat-label">Objects Analyzed</div>
            </div>
            <div class="stat-card $([ "${total_violations}" -gt 0 ] && echo "violation" || echo "compliant")">
                <div class="stat-value">${total_violations}</div>
                <div class="stat-label">Consolidation Violations</div>
            </div>
            <div class="stat-card $([ "${compliance_rate}" -ge 80 ] && echo "compliant" || echo "violation")">
                <div class="stat-value">${compliance_rate}%</div>
                <div class="stat-label">Compliance Rate</div>
            </div>
        </div>

        $(if [ "${total_violations}" -gt 0 ]; then
            echo '<div class="alert-section">'
            echo '<h2>⚠️ Consolidation Violations Detected</h2>'
            echo "<p>${total_violations} objects have multiple flows with the same trigger type. These should be consolidated following the Flow Consolidation Principle.</p>"
            echo '</div>'
        else
            echo '<div class="no-violations">'
            echo '<h2>✅ No Consolidation Violations Found</h2>'
            echo '<p>All flows comply with the Flow Consolidation Principle.</p>'
            echo '</div>'
        fi)

        $(if [ "${total_violations}" -gt 0 ]; then
            echo '<h2>Violation Details</h2>'
            echo '<table class="violation-table">'
            echo '<thead>'
            echo '<tr>'
            echo '<th>Object</th>'
            echo '<th>Trigger Type</th>'
            echo '<th>Flow Count</th>'
            echo '<th>Severity</th>'
            echo '<th>Conflicting Flows</th>'
            echo '<th>Recommended Action</th>'
            echo '</tr>'
            echo '</thead>'
            echo '<tbody>'
            
            # Generate table rows from violations JSON
            jq -r '.violations[] | @base64' "${violations_file}" | while read -r violation_data; do
                local violation
                violation=$(echo "${violation_data}" | base64 -d)
                
                local object
                local trigger_type
                local flow_count
                local severity
                local recommendation
                object=$(echo "${violation}" | jq -r '.object')
                trigger_type=$(echo "${violation}" | jq -r '.trigger_type')
                flow_count=$(echo "${violation}" | jq -r '.flow_count')
                severity=$(echo "${violation}" | jq -r '.severity')
                recommendation=$(echo "${violation}" | jq -r '.recommendation')
                
                echo '<tr>'
                echo "<td><strong>${object}</strong></td>"
                echo "<td>${trigger_type}</td>"
                echo "<td>${flow_count}</td>"
                echo "<td><span class=\"severity-${severity,,}\">${severity}</span></td>"
                echo '<td><div class="flow-list"><ul>'
                
                echo "${violation}" | jq -r '.flows[] | "- \(.api_name) (\(.label))"' | while read -r flow_info; do
                    echo "<li>${flow_info}</li>"
                done
                
                echo '</ul></div></td>'
                echo "<td><div class=\"recommendation\">${recommendation}</div></td>"
                echo '</tr>'
            done
            
            echo '</tbody>'
            echo '</table>'
        fi)

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666;">
            <p>Generated by Flow Consolidation Validator on $(date)</p>
        </div>
    </div>
</body>
</html>
EOF
    
    log "SUCCESS" "HTML report generated: ${html_report}"
    echo "${html_report}"
}

generate_csv_report() {
    local violations_file="$1"
    local csv_report="${REPORTS_DIR}/consolidation-violations-${TIMESTAMP}.csv"
    
    log "INFO" "Generating CSV consolidation report..."
    
    # CSV headers
    echo "Object,Trigger Type,Flow Count,Severity,Flow API Names,Flow Labels,Recommendation,Date" > "${csv_report}"
    
    # Generate CSV data from violations
    jq -r '.violations[] | 
        [
            .object, 
            .trigger_type, 
            .flow_count, 
            .severity,
            (.flows | map(.api_name) | join(";")),
            (.flows | map(.label) | join(";")),
            .recommendation,
            "'"${TIMESTAMP}"'"
        ] | @csv' "${violations_file}" >> "${csv_report}"
    
    log "SUCCESS" "CSV report generated: ${csv_report}"
    echo "${csv_report}"
}

##############################################################################
# Alert and Notification Functions
##############################################################################

send_email_alert() {
    local violations_file="$1"
    local html_report="$2"
    local csv_report="$3"
    
    if [[ -z "${EMAIL_RECIPIENTS}" ]]; then
        log "INFO" "No email recipients configured, skipping email alert"
        return
    fi
    
    local total_violations
    total_violations=$(jq '.summary.total_violations' "${violations_file}")
    
    if [[ "${total_violations}" -eq 0 ]]; then
        log "INFO" "No violations found, skipping email alert"
        return
    fi
    
    log "INFO" "Preparing email alert for ${total_violations} violations..."
    
    local subject="🚨 Flow Consolidation Violations - ${total_violations} Objects Need Attention (${ORG_ALIAS})"
    local body
    body=$(cat << EOF
Flow Consolidation Validation Alert - ${ORG_ALIAS}

EXECUTIVE SUMMARY:
================
Flow Consolidation Principle Violations Detected!

Objects Analyzed: $(jq '.summary.objects_analyzed' "${violations_file}")
Violations Found: ${total_violations}
Compliance Rate: $(jq '.summary.compliance_rate' "${violations_file}")%

VIOLATION BREAKDOWN:
===================
$(jq -r '.violations[] | "• \(.object) (\(.trigger_type)): \(.flow_count) flows - \(.severity) severity"' "${violations_file}")

IMMEDIATE ACTION REQUIRED:
=========================
1. Review attached HTML report for detailed analysis
2. Prioritize HIGH severity consolidations
3. Schedule consolidation work during maintenance windows  
4. Follow Flow Consolidation Best Practices guide
5. Update team on consolidation timeline

FLOW CONSOLIDATION PRINCIPLE:
============================
ONE FLOW PER OBJECT PER TRIGGER TYPE

Multiple flows on the same object with the same trigger type create:
- Maintenance complexity
- Order of execution issues  
- Performance degradation
- Governance challenges

NEXT STEPS:
===========
1. Schedule technical review meeting
2. Assign consolidation tasks to development team
3. Create consolidation project plan
4. Set target completion dates
5. Plan testing strategy

Reports Generated:
- HTML Report: $(basename "${html_report}")
- CSV Data: $(basename "${csv_report}")
- JSON Data: $(basename "${violations_file}")

Generated: $(date)
System: Flow Consolidation Validator
EOF
)
    
    # Log the email content for debugging
    log "INFO" "Email alert configured for: ${EMAIL_RECIPIENTS}"
    log "INFO" "Subject: ${subject}"
    
    local recipients_json
    recipients_json=$(printf '%s' "${EMAIL_RECIPIENTS}" | jq -R -s -c 'split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length>0))')

    local subject_json
    subject_json=$(printf '%s' "${subject}" | jq -R -s '.')

    local body_json
    body_json=$(printf '%s' "${body}" | jq -R -s '.')

    local payload_file
    payload_file=$(mktemp)
    cat > "${payload_file}" << EOF
{
  "subject": ${subject_json},
  "body": ${body_json},
  "recipients": ${recipients_json},
  "attachments": ["${html_report}", "${csv_report}"]
}
EOF

    if node "${SCRIPT_DIR}/monitoring-utils.js" send-email --json "${payload_file}" >/dev/null 2>&1; then
        log "SUCCESS" "Email alert sent for ${total_violations} violations"
    else
        log "WARN" "Email alert failed to send"
    fi

    rm -f "${payload_file}"
}

##############################################################################
# Auto-fix Functions (Optional)
##############################################################################

suggest_consolidation_plan() {
    local violations_file="$1"
    local plan_file="${REPORTS_DIR}/consolidation-plan-${TIMESTAMP}.md"
    
    log "INFO" "Generating consolidation plan..."
    
    cat > "${plan_file}" << EOF
# Flow Consolidation Plan

Generated: $(date)
Organization: ${ORG_ALIAS}

## Executive Summary

This document outlines the consolidation plan for flows that violate the Flow Consolidation Principle.

**Violations Found:** $(jq '.summary.total_violations' "${violations_file}")
**Target Compliance:** 100%

## Consolidation Strategy

### Phase 1: HIGH Severity Consolidations
$(jq -r '.violations[] | select(.severity == "HIGH") | "- [ ] **\(.object)** (\(.trigger_type)): Consolidate \(.flow_count) flows"' "${violations_file}")

### Phase 2: MEDIUM Severity Consolidations  
$(jq -r '.violations[] | select(.severity == "MEDIUM") | "- [ ] **\(.object)** (\(.trigger_type)): Consolidate \(.flow_count) flows"' "${violations_file}")

### Phase 3: LOW Severity Consolidations
$(jq -r '.violations[] | select(.severity == "LOW") | "- [ ] **\(.object)** (\(.trigger_type)): Consolidate \(.flow_count) flows"' "${violations_file}")

## Detailed Consolidation Steps

EOF

    jq -r '.violations[] | @base64' "${violations_file}" | while read -r violation_data; do
        local violation
        violation=$(echo "${violation_data}" | base64 -d)
        
        local object
        local trigger_type
        local severity
        object=$(echo "${violation}" | jq -r '.object')
        trigger_type=$(echo "${violation}" | jq -r '.trigger_type')
        severity=$(echo "${violation}" | jq -r '.severity')
        
        cat >> "${plan_file}" << EOF

### ${object} - ${trigger_type} (${severity} Priority)

**Current Flows:**
EOF
        echo "${violation}" | jq -r '.flows[] | "- \(.api_name) (\(.label))"' >> "${plan_file}"
        
        cat >> "${plan_file}" << EOF

**Consolidation Steps:**
1. [ ] Analyze business logic of each flow
2. [ ] Design unified flow architecture  
3. [ ] Create new master flow: \`${object}_${trigger_type}_Master\`
4. [ ] Test consolidated flow thoroughly
5. [ ] Deploy to sandbox for validation
6. [ ] Schedule production deployment
7. [ ] Deactivate old flows after validation
8. [ ] Update documentation

**Estimated Effort:** $(if [[ "${severity}" == "HIGH" ]]; then echo "8-12 hours"; elif [[ "${severity}" == "MEDIUM" ]]; then echo "4-8 hours"; else echo "2-4 hours"; fi)

EOF
    done
    
    cat >> "${plan_file}" << EOF

## Implementation Timeline

- **Phase 1 (HIGH):** 2-3 weeks
- **Phase 2 (MEDIUM):** 1-2 weeks  
- **Phase 3 (LOW):** 1 week

## Success Criteria

- [ ] All flows comply with consolidation principle
- [ ] No regression in business functionality
- [ ] Improved system maintainability
- [ ] Reduced technical debt
- [ ] Enhanced flow performance

## Risk Mitigation

- Complete testing in sandbox environment
- Staged rollout with monitoring
- Rollback plan for each consolidation
- Documentation updates
- Team training on new flows

EOF
    
    log "SUCCESS" "Consolidation plan generated: ${plan_file}"
    echo "${plan_file}"
}

##############################################################################
# Main Execution Functions  
##############################################################################

show_usage() {
    cat << EOF
Flow Consolidation Validator

Validates the Flow Consolidation Principle: ONE FLOW PER OBJECT PER TRIGGER TYPE

USAGE:
    $0 --org <alias> [OPTIONS]

OPTIONS:
    --org <alias>           Salesforce org alias (required)
    --email <addresses>     Email addresses for alerts (comma-separated)
    --auto-fix              Generate consolidation plans and suggestions
    --silent                Suppress console output
    --help                  Show this help message

EXAMPLES:
    # Basic validation
    $0 --org production
    
    # With email alerts
    $0 --org production --email devteam@company.com,admin@company.com
    
    # Generate consolidation plans
    $0 --org production --auto-fix --email devteam@company.com

CRON EXAMPLES:
    # Sunday at 6 AM
    0 6 * * 0 cd /path/to/project && $0 --org production --email team@company.com
    
    # Daily at 9 AM with consolidation plans
    0 9 * * * cd /path/to/project && $0 --org production --auto-fix --silent

REPORTS GENERATED:
    - HTML Report: Visual violation summary
    - CSV Report: Data for analysis
    - JSON Report: Detailed violation data
    - Consolidation Plan: Step-by-step remediation (with --auto-fix)

EOF
}

main() {
    local start_time
    start_time=$(date +%s)
    
    log "INFO" "Starting Flow Consolidation Validation..."
    log "INFO" "Timestamp: ${TIMESTAMP}"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Retrieve flow data
    local flows_file
    flows_file=$(retrieve_flow_data)
    
    # Analyze for violations
    local violations_file
    violations_file=$(analyze_flow_consolidation_violations "${flows_file}")
    
    # Generate reports
    local html_report
    local csv_report
    html_report=$(generate_html_report "${violations_file}")
    csv_report=$(generate_csv_report "${violations_file}")
    
    # Generate consolidation plan if auto-fix enabled
    local plan_file=""
    if [[ "${AUTO_FIX}" == "true" ]]; then
        plan_file=$(suggest_consolidation_plan "${violations_file}")
    fi
    
    # Send email alerts
    send_email_alert "${violations_file}" "${html_report}" "${csv_report}"
    
    # Final summary
    local end_time
    local duration
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    local total_violations
    local compliance_rate
    total_violations=$(jq '.summary.total_violations' "${violations_file}")
    compliance_rate=$(jq '.summary.compliance_rate' "${violations_file}")
    
    log "INFO" "=============================================="
    log "INFO" "Flow Consolidation Validation Complete"
    log "INFO" "=============================================="
    log "INFO" "Execution time: ${duration} seconds"
    log "INFO" "Violations found: ${total_violations}"
    log "INFO" "Compliance rate: ${compliance_rate}%"
    log "INFO" "Reports generated in: ${REPORTS_DIR}"
    
    if [[ "${total_violations}" -gt 0 ]]; then
        log "WARN" "⚠️ Flow consolidation violations detected!"
        log "WARN" "Review reports and implement consolidation plan"
        exit 1
    else
        log "SUCCESS" "✅ All flows comply with consolidation principle"
        exit 0
    fi
}

##############################################################################
# CLI Argument Parsing
##############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --email)
            EMAIL_RECIPIENTS="$2"
            shift 2
            ;;
        --auto-fix)
            AUTO_FIX=true
            shift
            ;;
        --silent)
            SILENT=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log "ERROR" "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "${ORG_ALIAS}" ]]; then
    log "ERROR" "Organization alias is required. Use --org <alias>"
    show_usage
    exit 1
fi

# Execute main function
main "$@"
