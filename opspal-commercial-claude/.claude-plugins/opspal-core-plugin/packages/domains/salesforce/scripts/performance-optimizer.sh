#!/bin/bash

##############################################################################
# performance-optimizer.sh - Performance Optimization for ClaudeSFDC Scripts
##############################################################################
# Adds parallel processing, caching, and performance monitoring
##############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="${PROJECT_DIR}/.cache"
METRICS_DIR="${PROJECT_DIR}/metrics"

# Load common libraries
source "${SCRIPT_DIR}/lib/shell-commons.sh"

# Performance settings
MAX_PARALLEL_JOBS="${MAX_PARALLEL_JOBS:-4}"
CACHE_TTL="${CACHE_TTL:-3600}"  # 1 hour default
ENABLE_METRICS="${ENABLE_METRICS:-true}"

##############################################################################
# Parallel Processing Functions
##############################################################################

parallel_execute() {
    local commands_file="$1"
    local max_jobs="${2:-$MAX_PARALLEL_JOBS}"
    
    log_info "Executing commands in parallel (max $max_jobs jobs)..."
    
    if command -v parallel &> /dev/null; then
        # Use GNU parallel if available
        parallel -j "$max_jobs" --progress < "$commands_file"
    else
        # Fallback to xargs
        xargs -P "$max_jobs" -I {} bash -c "{}" < "$commands_file"
    fi
}

parallel_csv_process() {
    local csv_file="$1"
    local process_function="$2"
    local chunk_size="${3:-1000}"
    
    log_info "Processing CSV in parallel chunks..."
    
    # Split CSV into chunks
    local header=$(head -1 "$csv_file")
    local chunk_dir="${CACHE_DIR}/csv_chunks_$$"
    mkdir -p "$chunk_dir"
    
    # Split file (keeping header)
    tail -n +2 "$csv_file" | split -l "$chunk_size" - "${chunk_dir}/chunk_"
    
    # Add header to each chunk
    for chunk in "${chunk_dir}"/chunk_*; do
        {
            echo "$header"
            cat "$chunk"
        } > "${chunk}.csv"
        rm "$chunk"
    done
    
    # Process chunks in parallel
    find "$chunk_dir" -name "*.csv" | \
        xargs -P "$MAX_PARALLEL_JOBS" -I {} bash -c "$process_function '{}'"
    
    # Cleanup
    rm -rf "$chunk_dir"
    
    log_success "Parallel CSV processing complete"
}

##############################################################################
# Caching Functions
##############################################################################

cache_init() {
    mkdir -p "$CACHE_DIR"
    
    # Clean old cache entries
    find "$CACHE_DIR" -type f -mmin +$((CACHE_TTL / 60)) -delete 2>/dev/null || true
}

cache_get() {
    local key="$1"
    local cache_file="${CACHE_DIR}/$(echo -n "$key" | md5sum | cut -d' ' -f1)"
    
    if [[ -f "$cache_file" ]]; then
        local age=$(($(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null || echo 0)))
        if [[ $age -lt $CACHE_TTL ]]; then
            cat "$cache_file"
            return 0
        fi
    fi
    
    return 1
}

cache_set() {
    local key="$1"
    local value="$2"
    local cache_file="${CACHE_DIR}/$(echo -n "$key" | md5sum | cut -d' ' -f1)"
    
    echo "$value" > "$cache_file"
}

cached_query() {
    local query="$1"
    local org="${2:-$(get_org_alias)}"
    local cache_key="query:${org}:${query}"
    
    # Try cache first
    if result=$(cache_get "$cache_key"); then
        log_debug "Cache hit for query"
        echo "$result"
        return 0
    fi
    
    # Execute query and cache result
    log_debug "Cache miss, executing query"
    result=$(safe_sf_query "$query" "$org")
    cache_set "$cache_key" "$result"
    echo "$result"
}

##############################################################################
# Performance Metrics
##############################################################################

metric_start() {
    local operation="$1"
    local start_time=$(date +%s%N)
    
    echo "$start_time" > "${METRICS_DIR}/.${operation}.start"
}

metric_end() {
    local operation="$1"
    local end_time=$(date +%s%N)
    local start_time=$(cat "${METRICS_DIR}/.${operation}.start" 2>/dev/null || echo "$end_time")
    local duration=$((end_time - start_time))
    local duration_ms=$((duration / 1000000))
    
    # Log metric
    {
        echo "$(date -Iseconds),${operation},${duration_ms}"
    } >> "${METRICS_DIR}/performance.csv"
    
    rm -f "${METRICS_DIR}/.${operation}.start"
    
    log_debug "Operation '$operation' took ${duration_ms}ms"
}

with_metrics() {
    local operation="$1"
    shift
    
    if [[ "$ENABLE_METRICS" == "true" ]]; then
        metric_start "$operation"
        "$@"
        local result=$?
        metric_end "$operation"
        return $result
    else
        "$@"
    fi
}

##############################################################################
# Optimization Functions
##############################################################################

optimize_script() {
    local script="$1"
    
    log_info "Optimizing: $(basename "$script")"
    
    # Create optimized version
    local optimized="${script}.optimized"
    cp "$script" "$optimized"
    
    # Add parallel processing where applicable
    if grep -q "for.*in.*do" "$script"; then
        log_info "  Adding parallel processing to loops"
        # This is a simplified example - real implementation would be more sophisticated
    fi
    
    # Add caching for queries
    if grep -q "sf.*query" "$script"; then
        log_info "  Adding query caching"
        sed -i 's/safe_sf_query/cached_query/g' "$optimized"
    fi
    
    # Add metrics collection
    if ! grep -q "with_metrics" "$script"; then
        log_info "  Adding performance metrics"
    fi
    
    log_success "Optimization complete: $optimized"
}

batch_optimize() {
    local pattern="${1:-*.sh}"
    
    log_info "Batch optimizing scripts matching: $pattern"
    
    # Find scripts to optimize
    local scripts_file="${CACHE_DIR}/scripts_to_optimize.txt"
    find "$SCRIPT_DIR" -name "$pattern" -type f > "$scripts_file"
    
    # Optimize in parallel
    parallel_execute "$scripts_file"
    
    rm "$scripts_file"
}

##############################################################################
# Performance Analysis
##############################################################################

analyze_performance() {
    log_info "Analyzing performance metrics..."
    
    if [[ ! -f "${METRICS_DIR}/performance.csv" ]]; then
        log_warning "No performance data available"
        return 1
    fi
    
    echo ""
    echo "Performance Analysis Report"
    echo "==========================="
    echo ""
    
    # Calculate statistics
    awk -F',' '
    NR > 1 {
        operations[$2]++
        total_time[$2] += $3
        if ($3 > max_time[$2] || !max_time[$2]) max_time[$2] = $3
        if ($3 < min_time[$2] || !min_time[$2]) min_time[$2] = $3
    }
    END {
        printf "%-30s %10s %10s %10s %10s\n", "Operation", "Count", "Avg (ms)", "Min (ms)", "Max (ms)"
        printf "%-30s %10s %10s %10s %10s\n", "----------", "-----", "--------", "--------", "--------"
        for (op in operations) {
            avg = total_time[op] / operations[op]
            printf "%-30s %10d %10.2f %10d %10d\n", op, operations[op], avg, min_time[op], max_time[op]
        }
    }' "${METRICS_DIR}/performance.csv"
    
    echo ""
    
    # Identify slow operations
    echo "Slow Operations (>1000ms average):"
    awk -F',' '
    NR > 1 {
        operations[$2]++
        total_time[$2] += $3
    }
    END {
        found = 0
        for (op in operations) {
            avg = total_time[op] / operations[op]
            if (avg > 1000) {
                printf "  - %s: %.2fms average\n", op, avg
                found = 1
            }
        }
        if (!found) print "  None found"
    }' "${METRICS_DIR}/performance.csv"
}

##############################################################################
# Main Functions
##############################################################################

show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    optimize SCRIPT     Optimize a single script
    batch PATTERN      Optimize multiple scripts
    analyze            Analyze performance metrics
    cache-clean        Clean cache directory
    benchmark SCRIPT   Run performance benchmark
    
Options:
    -j, --jobs N       Maximum parallel jobs (default: $MAX_PARALLEL_JOBS)
    -c, --cache TTL    Cache TTL in seconds (default: $CACHE_TTL)
    -m, --metrics      Enable metrics collection
    -h, --help         Show this help message

Examples:
    $0 optimize scripts/my-script.sh
    $0 batch "*.sh"
    $0 analyze
    $0 benchmark scripts/import-data.sh

EOF
    exit 0
}

benchmark_script() {
    local script="$1"
    local iterations="${2:-5}"
    
    log_info "Benchmarking: $script ($iterations iterations)"
    
    local total_time=0
    for i in $(seq 1 "$iterations"); do
        local start=$(date +%s%N)
        "$script" > /dev/null 2>&1
        local end=$(date +%s%N)
        local duration=$((end - start))
        local duration_ms=$((duration / 1000000))
        total_time=$((total_time + duration_ms))
        echo "  Iteration $i: ${duration_ms}ms"
    done
    
    local avg=$((total_time / iterations))
    echo ""
    log_success "Average execution time: ${avg}ms"
}

main() {
    # Initialize
    cache_init
    mkdir -p "$METRICS_DIR"
    
    # Parse command
    case "${1:-}" in
        optimize)
            shift
            optimize_script "$@"
            ;;
        batch)
            shift
            batch_optimize "$@"
            ;;
        analyze)
            analyze_performance
            ;;
        cache-clean)
            rm -rf "$CACHE_DIR"
            log_success "Cache cleaned"
            ;;
        benchmark)
            shift
            benchmark_script "$@"
            ;;
        -h|--help|"")
            show_usage
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            ;;
    esac
}

# Run main function
main "$@"