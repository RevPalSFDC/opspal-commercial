#!/bin/bash

# Batch Processing Utility for Cross-Platform Sync Operations
# Handles large dataset synchronization with intelligent batching

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/cross-platform-config.yaml"
LOG_DIR="${SCRIPT_DIR}/../logs"
TEMP_DIR="${SCRIPT_DIR}/../temp"

# Default values
DEFAULT_BATCH_SIZE=50
DEFAULT_PARALLEL_BATCHES=3
DEFAULT_RETRY_COUNT=3
DRY_RUN=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create necessary directories
mkdir -p "${LOG_DIR}"
mkdir -p "${TEMP_DIR}"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1" >> "${LOG_DIR}/batch_processor.log"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1" >> "${LOG_DIR}/batch_processor.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" >> "${LOG_DIR}/batch_processor.log"
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG] $1" >> "${LOG_DIR}/batch_processor.log"
}

# Display usage information
usage() {
    cat << EOF
Batch Processing Utility for Cross-Platform Sync

Usage: $0 [OPTIONS] <OPERATION> <OBJECT_TYPE>

OPERATIONS:
    sync        Full synchronization of records
    export      Export records from source system
    import      Import records to target system
    validate    Validate records without syncing
    reconcile   Reconcile differences between systems

OBJECT_TYPES:
    contacts    Contact/Lead records
    accounts    Account/Company records
    deals       Opportunity/Deal records
    all         All configured object types

OPTIONS:
    -b, --batch-size SIZE      Batch size (default: 50)
    -p, --parallel NUM         Number of parallel batches (default: 3)
    -r, --retry COUNT         Retry count for failed batches (default: 3)
    -d, --dry-run            Simulate operation without making changes
    -v, --verbose            Enable verbose output
    -c, --config FILE        Configuration file path
    -f, --filter QUERY       Filter records by query
    -s, --start-date DATE    Start date for incremental sync
    -e, --end-date DATE      End date for incremental sync
    -h, --help              Display this help message

EXAMPLES:
    # Sync all contacts with default settings
    $0 sync contacts

    # Dry run with custom batch size
    $0 -d -b 100 sync accounts

    # Incremental sync for last 7 days
    $0 -s "7 days ago" sync deals

    # Validate with verbose output
    $0 -v validate all

EOF
    exit 0
}

# Parse command line arguments
parse_args() {
    local args=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            -b|--batch-size)
                BATCH_SIZE="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL_BATCHES="$2"
                shift 2
                ;;
            -r|--retry)
                RETRY_COUNT="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -f|--filter)
                FILTER_QUERY="$2"
                shift 2
                ;;
            -s|--start-date)
                START_DATE="$2"
                shift 2
                ;;
            -e|--end-date)
                END_DATE="$2"
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                args+=("$1")
                shift
                ;;
        esac
    done

    # Set positional parameters
    set -- "${args[@]}"

    # Validate required arguments
    if [ $# -lt 2 ]; then
        log_error "Missing required arguments"
        usage
    fi

    OPERATION="$1"
    OBJECT_TYPE="$2"

    # Set defaults if not provided
    BATCH_SIZE="${BATCH_SIZE:-$DEFAULT_BATCH_SIZE}"
    PARALLEL_BATCHES="${PARALLEL_BATCHES:-$DEFAULT_PARALLEL_BATCHES}"
    RETRY_COUNT="${RETRY_COUNT:-$DEFAULT_RETRY_COUNT}"
}

# Validate environment and dependencies
validate_environment() {
    log_info "Validating environment..."

    # Check for required commands
    local required_commands=("node" "jq" "sf" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command '$cmd' not found"
            exit 1
        fi
    done

    # Check configuration file
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Configuration file not found: $CONFIG_FILE"
        exit 1
    fi

    # Check Node.js scripts
    if [ ! -f "${SCRIPT_DIR}/batch-processor-worker.js" ]; then
        log_warn "Worker script not found, creating..."
        create_worker_script
    fi

    log_info "Environment validation complete"
}

# Create worker script if it doesn't exist
create_worker_script() {
    cat > "${SCRIPT_DIR}/batch-processor-worker.js" << 'EOF'
#!/usr/bin/env node

// Batch processor worker for handling individual batches
const fs = require('fs');
const yaml = require('js-yaml');

class BatchWorker {
    constructor(config, batchFile, operation) {
        this.config = config;
        this.batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
        this.operation = operation;
    }

    async process() {
        console.log(`Processing batch of ${this.batch.records.length} records...`);

        try {
            switch(this.operation) {
                case 'sync':
                    return await this.syncBatch();
                case 'export':
                    return await this.exportBatch();
                case 'import':
                    return await this.importBatch();
                case 'validate':
                    return await this.validateBatch();
                default:
                    throw new Error(`Unknown operation: ${this.operation}`);
            }
        } catch (error) {
            console.error(`Batch processing failed: ${error.message}`);
            process.exit(1);
        }
    }

    async syncBatch() {
        // Implement sync logic
        const results = {
            success: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const record of this.batch.records) {
            try {
                // Simulate processing
                await this.delay(Math.random() * 100);

                if (Math.random() > 0.95) {
                    throw new Error('Random failure');
                }

                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    recordId: record.id,
                    error: error.message
                });
            }
        }

        return results;
    }

    async exportBatch() {
        // Implement export logic
        return { exported: this.batch.records.length };
    }

    async importBatch() {
        // Implement import logic
        return { imported: this.batch.records.length };
    }

    async validateBatch() {
        // Implement validation logic
        const valid = this.batch.records.filter(() => Math.random() > 0.1);
        const invalid = this.batch.records.length - valid.length;

        return {
            valid: valid.length,
            invalid: invalid,
            total: this.batch.records.length
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: batch-processor-worker.js <config> <batch-file> <operation>');
        process.exit(1);
    }

    const config = yaml.load(fs.readFileSync(args[0], 'utf8'));
    const worker = new BatchWorker(config, args[1], args[2]);

    worker.process()
        .then(results => {
            console.log(JSON.stringify(results));
            process.exit(0);
        })
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
EOF

    chmod +x "${SCRIPT_DIR}/batch-processor-worker.js"
}

# Get total record count for object type
get_record_count() {
    local object_type="$1"
    local count=0

    log_debug "Getting record count for $object_type"

    case "$object_type" in
        contacts)
            if [ "$DRY_RUN" = true ]; then
                count=1000
            else
                count=$(sf data query --query "SELECT COUNT() FROM Contact" --json | jq '.result.totalSize')
            fi
            ;;
        accounts)
            if [ "$DRY_RUN" = true ]; then
                count=500
            else
                count=$(sf data query --query "SELECT COUNT() FROM Account" --json | jq '.result.totalSize')
            fi
            ;;
        deals)
            if [ "$DRY_RUN" = true ]; then
                count=750
            else
                count=$(sf data query --query "SELECT COUNT() FROM Opportunity" --json | jq '.result.totalSize')
            fi
            ;;
        all)
            count=10000  # Placeholder for all objects
            ;;
        *)
            log_error "Unknown object type: $object_type"
            exit 1
            ;;
    esac

    echo "$count"
}

# Create batches from records
create_batches() {
    local total_records="$1"
    local batch_size="$2"
    local num_batches=$((($total_records + $batch_size - 1) / $batch_size))

    log_info "Creating $num_batches batches of size $batch_size"

    # Create batch files
    for i in $(seq 1 "$num_batches"); do
        local offset=$((($i - 1) * $batch_size))
        local batch_file="${TEMP_DIR}/batch_${i}.json"

        # Create batch metadata
        cat > "$batch_file" << EOF
{
    "batchId": $i,
    "offset": $offset,
    "limit": $batch_size,
    "objectType": "$OBJECT_TYPE",
    "records": []
}
EOF

        # In real implementation, would populate with actual records
        if [ "$DRY_RUN" = false ]; then
            # Fetch actual records and append to batch file
            log_debug "Created batch $i: offset=$offset, limit=$batch_size"
        else
            # Generate dummy records for dry run
            local record_count=$batch_size
            if [ $offset -ge $total_records ]; then
                record_count=0
            elif [ $(($offset + $batch_size)) -gt $total_records ]; then
                record_count=$(($total_records - $offset))
            fi

            # Add dummy records
            jq ".records = [range($record_count) | {id: (\"REC\" + tostring), name: (\"Record \" + tostring)}]" "$batch_file" > "${batch_file}.tmp"
            mv "${batch_file}.tmp" "$batch_file"
        fi
    done

    echo "$num_batches"
}

# Process batches in parallel
process_batches() {
    local num_batches="$1"
    local parallel="$2"

    log_info "Processing $num_batches batches with parallelism of $parallel"

    local batch_results="${TEMP_DIR}/batch_results.json"
    echo "[]" > "$batch_results"

    # Process batches in groups
    local current_batch=1
    while [ $current_batch -le $num_batches ]; do
        local batch_group=()

        # Build group of parallel batches
        for i in $(seq 1 "$parallel"); do
            if [ $current_batch -le $num_batches ]; then
                batch_group+=($current_batch)
                ((current_batch++))
            fi
        done

        # Process batch group in parallel
        log_info "Processing batch group: ${batch_group[*]}"

        for batch_id in "${batch_group[@]}"; do
            local batch_file="${TEMP_DIR}/batch_${batch_id}.json"
            local result_file="${TEMP_DIR}/result_${batch_id}.json"

            # Run worker in background
            {
                if [ "$DRY_RUN" = true ]; then
                    # Simulate processing
                    sleep 1
                    echo "{\"batchId\": $batch_id, \"success\": true, \"processed\": $(jq '.records | length' "$batch_file")}" > "$result_file"
                else
                    # Run actual worker
                    node "${SCRIPT_DIR}/batch-processor-worker.js" "$CONFIG_FILE" "$batch_file" "$OPERATION" > "$result_file" 2>&1
                fi
            } &
        done

        # Wait for all background jobs to complete
        wait

        # Collect results
        for batch_id in "${batch_group[@]}"; do
            local result_file="${TEMP_DIR}/result_${batch_id}.json"
            if [ -f "$result_file" ]; then
                jq ". += [$(cat "$result_file")]" "$batch_results" > "${batch_results}.tmp"
                mv "${batch_results}.tmp" "$batch_results"
                log_debug "Batch $batch_id completed"
            else
                log_warn "No result file for batch $batch_id"
            fi
        done
    done

    log_info "All batches processed"
}

# Generate processing report
generate_report() {
    local batch_results="${TEMP_DIR}/batch_results.json"
    local report_file="${LOG_DIR}/batch_report_$(date '+%Y%m%d_%H%M%S').json"

    log_info "Generating processing report..."

    # Calculate statistics
    local total_processed=$(jq '[.[] | .processed] | add' "$batch_results")
    local successful_batches=$(jq '[.[] | select(.success == true)] | length' "$batch_results")
    local failed_batches=$(jq '[.[] | select(.success == false)] | length' "$batch_results")

    # Create report
    cat > "$report_file" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "operation": "$OPERATION",
    "objectType": "$OBJECT_TYPE",
    "configuration": {
        "batchSize": $BATCH_SIZE,
        "parallelBatches": $PARALLEL_BATCHES,
        "retryCount": $RETRY_COUNT,
        "dryRun": $DRY_RUN
    },
    "results": {
        "totalProcessed": $total_processed,
        "successfulBatches": $successful_batches,
        "failedBatches": $failed_batches,
        "successRate": $(echo "scale=2; $successful_batches / ($successful_batches + $failed_batches) * 100" | bc)
    },
    "batches": $(cat "$batch_results")
}
EOF

    log_info "Report saved to: $report_file"

    # Display summary
    echo ""
    echo -e "${GREEN}=== Processing Summary ===${NC}"
    echo "Operation: $OPERATION"
    echo "Object Type: $OBJECT_TYPE"
    echo "Total Processed: $total_processed"
    echo "Successful Batches: $successful_batches"
    echo "Failed Batches: $failed_batches"
    echo ""

    if [ "$failed_batches" -gt 0 ]; then
        log_warn "Some batches failed. Check the report for details."
        return 1
    else
        log_info "All batches processed successfully!"
        return 0
    fi
}

# Cleanup temporary files
cleanup() {
    log_debug "Cleaning up temporary files..."
    rm -f "${TEMP_DIR}"/batch_*.json
    rm -f "${TEMP_DIR}"/result_*.json
}

# Main execution
main() {
    parse_args "$@"

    log_info "Starting batch processor: $OPERATION $OBJECT_TYPE"

    if [ "$DRY_RUN" = true ]; then
        log_warn "Running in DRY RUN mode - no actual changes will be made"
    fi

    # Validate environment
    validate_environment

    # Get record count
    local total_records=$(get_record_count "$OBJECT_TYPE")
    log_info "Total records to process: $total_records"

    if [ "$total_records" -eq 0 ]; then
        log_warn "No records to process"
        exit 0
    fi

    # Create batches
    local num_batches=$(create_batches "$total_records" "$BATCH_SIZE")

    # Process batches
    process_batches "$num_batches" "$PARALLEL_BATCHES"

    # Generate report
    generate_report

    # Cleanup
    cleanup

    log_info "Batch processing complete"
}

# Trap for cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"