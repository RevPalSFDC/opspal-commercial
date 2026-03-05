#!/bin/bash

# Trust Verification System Rollout Script
# Deploys verification to all Salesforce instances

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
INSTANCES_DIR="${SCRIPT_DIR}/../instances"
LIB_DIR="${SCRIPT_DIR}/lib"
LOG_FILE="${SCRIPT_DIR}/verification-rollout.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to test instance
test_instance() {
    local instance=$1
    echo -e "${YELLOW}Testing instance: $instance${NC}"

    # Check if instance directory exists
    if [ ! -d "${INSTANCES_DIR}/${instance}" ]; then
        echo -e "${RED}✗ Instance directory not found${NC}"
        return 1
    fi

    # Run verification
    if python3 "${LIB_DIR}/trustworthy_assessment.py" "$instance" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Verification successful${NC}"

        # Check trust score
        latest_report=$(ls -t "${INSTANCES_DIR}/${instance}"/trustworthy_assessment_*.json 2>/dev/null | head -1)
        if [ -f "$latest_report" ]; then
            trust_score=$(python3 -c "import json; print(json.load(open('$latest_report'))['verification_status']['trust_score']['score'])" 2>/dev/null || echo "0")
            echo "  Trust Score: ${trust_score}/100"

            if [ "$trust_score" -lt 50 ]; then
                echo -e "${RED}  ⚠️  Low trust score - needs investigation${NC}"
            fi
        fi
        return 0
    else
        echo -e "${RED}✗ Verification failed${NC}"
        return 1
    fi
}

# Main rollout process
main() {
    log "=== Starting Trust Verification Rollout ==="

    # Check prerequisites
    echo "Checking prerequisites..."

    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Python 3 is required${NC}"
        exit 1
    fi

    if ! command -v sf &> /dev/null; then
        echo -e "${RED}Salesforce CLI is required${NC}"
        exit 1
    fi

    # Check if verification scripts exist
    if [ ! -f "${LIB_DIR}/trustworthy_assessment.py" ]; then
        echo -e "${RED}Verification scripts not found in ${LIB_DIR}${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Prerequisites met${NC}\n"

    # Get instance list or use provided instance
    if [ $# -eq 0 ]; then
        # No arguments - process all instances
        instances=($(ls -d ${INSTANCES_DIR}/*/ 2>/dev/null | xargs -n 1 basename))

        if [ ${#instances[@]} -eq 0 ]; then
            echo -e "${RED}No instances found in ${INSTANCES_DIR}${NC}"
            exit 1
        fi

        echo "Found ${#instances[@]} instances to process:"
        printf '%s\n' "${instances[@]}" | column
        echo

        read -p "Process all instances? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Rollout cancelled"
            exit 0
        fi
    else
        # Instance name provided
        instances=("$1")
    fi

    # Process each instance
    successful=0
    failed=0

    for instance in "${instances[@]}"; do
        echo
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log "Processing: $instance"

        if test_instance "$instance"; then
            ((successful++))
            log "✓ $instance - SUCCESS"

            # Create baseline if it doesn't exist
            if [ ! -f "${INSTANCES_DIR}/${instance}/.baseline_${instance}.json" ]; then
                echo "  Creating baseline..."
            fi
        else
            ((failed++))
            log "✗ $instance - FAILED"
        fi
    done

    # Summary
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}Rollout Complete${NC}"
    echo "  Successful: $successful"
    echo "  Failed: $failed"

    if [ $failed -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Some instances failed verification${NC}"
        echo "Check $LOG_FILE for details"
        exit 1
    else
        echo -e "${GREEN}✅ All instances verified successfully${NC}"
    fi

    # Generate summary report
    echo
    echo "Generating summary report..."
    python3 << 'EOF'
import json
import glob
import os
from datetime import datetime

instances_dir = "../instances"
report = {
    "rollout_date": datetime.now().isoformat(),
    "instances": {}
}

for instance_dir in glob.glob(f"{instances_dir}/*/"):
    instance = os.path.basename(os.path.normpath(instance_dir))

    # Find latest assessment
    assessments = glob.glob(f"{instance_dir}/trustworthy_assessment_*.json")
    if assessments:
        latest = max(assessments, key=os.path.getmtime)
        with open(latest) as f:
            data = json.load(f)
            report["instances"][instance] = {
                "trust_score": data["verification_status"]["trust_score"]["score"],
                "action": data["verification_status"]["trust_score"]["action"],
                "anomalies": data["verification_status"]["anomalies_found"],
                "timestamp": data["timestamp"]
            }

# Save report
with open("verification-rollout-summary.json", "w") as f:
    json.dump(report, f, indent=2)

# Display summary
print("\nInstance Trust Scores:")
print("-" * 40)
for instance, data in report["instances"].items():
    score = data["trust_score"]
    status = "✅" if score >= 80 else "⚠️" if score >= 50 else "🛑"
    print(f"{status} {instance}: {score}/100")
EOF

    echo
    echo "Summary saved to: verification-rollout-summary.json"
    log "=== Rollout Complete ==="
}

# Handle interrupts
trap 'echo -e "\n${RED}Rollout interrupted${NC}"; exit 1' INT TERM

# Run main function
main "$@"