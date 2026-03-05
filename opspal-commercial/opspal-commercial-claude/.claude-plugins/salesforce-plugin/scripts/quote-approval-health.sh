#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME=$(basename "$0")
DEBUG_LEVEL_NAME=${DEBUG_LEVEL_NAME:-FlowDeep}
TRACE_DURATION_MINUTES=${TRACE_DURATION_MINUTES:-30}
WAIT_SECONDS=${WAIT_SECONDS:-5}
LOOKBACK_MINUTES=${LOOKBACK_MINUTES:-15}
LOG_ROOT=${LOG_ROOT:-logs/flow-health}
SOBJECT_API=${SOBJECT_API:-Quote}
SF_MAX_RETRIES=${SF_MAX_RETRIES:-3}
SF_RETRY_SLEEP=${SF_RETRY_SLEEP:-2}
SF_RETRY_JITTER=${SF_RETRY_JITTER:-2}

export SF_DISABLE_LOG_FILE=${SF_DISABLE_LOG_FILE:-true}
export SF_DISABLE_TELEMETRY=${SF_DISABLE_TELEMETRY:-true}
export SF_DISABLE_AUTOUPDATE=${SF_DISABLE_AUTOUPDATE:-true}

usage() {
    cat <<USAGE
Usage: $SCRIPT_NAME --quote-id <QuoteId> [--target-org <alias>] [--skip-trace]

Options:
  --quote-id <QuoteId>   Required. Quote identifier to drive the flow.
  --target-org <alias>   Optional. Salesforce alias or username; defaults to the configured target-org.
  --skip-trace           Skip creation of debug level + trace flags (use existing ones).
  --sobject <api>        Override the quote object API name (default: Quote).
  --wait-seconds <n>     Seconds to wait after the Apex update (default: ${WAIT_SECONDS}).
  --lookback-minutes <n> Window for Approval_Request__c query (default: ${LOOKBACK_MINUTES}).
USAGE
}

QUOTE_ID=""
TARGET_ORG=""
SKIP_TRACE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --quote-id)
            QUOTE_ID=${2:-}
            shift 2
            ;;
        --target-org)
            TARGET_ORG=${2:-}
            shift 2
            ;;
        --skip-trace)
            SKIP_TRACE=1
            shift
            ;;
        --sobject)
            SOBJECT_API=${2:-Quote}
            shift 2
            ;;
        --wait-seconds)
            WAIT_SECONDS=${2:-5}
            shift 2
            ;;
        --lookback-minutes)
            LOOKBACK_MINUTES=${2:-15}
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ -z $QUOTE_ID ]]; then
    echo "[ERROR] --quote-id is required" >&2
    usage >&2
    exit 1
fi

if ! command -v sf >/dev/null 2>&1; then
    echo "[ERROR] Salesforce CLI (sf) is not installed or not on PATH" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "[ERROR] jq is required for JSON parsing" >&2
    exit 1
fi

mkdir -p "$LOG_ROOT"

ORG_ARGS=()
if [[ -n $TARGET_ORG ]]; then
    ORG_ARGS+=(--target-org "$TARGET_ORG")
fi

utc_now() {
    if command -v python3 >/dev/null 2>&1; then
        python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
PY
        return
    fi
    if command -v gdate >/dev/null 2>&1; then
        local ts
        ts=$(gdate -u +"%Y-%m-%dT%H:%M:%S")
        echo "${ts}.000Z"
        return
    fi
    local base
    base=$(date -u +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
    if [[ -z $base ]]; then
        base=$(date -ju -u +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
    fi
    echo "${base}.000Z"
}

compute_expiration() {
    local start_iso=$1
    local minutes=$2
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$start_iso" "$minutes" <<'PY'
from datetime import datetime, timedelta
start = datetime.strptime(__import__('sys').argv[1], "%Y-%m-%dT%H:%M:%S.000Z")
minutes = int(__import__('sys').argv[2])
print((start + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
PY
        return
    fi
    if command -v gdate >/dev/null 2>&1; then
        local ts
        ts=$(gdate -u -d "$start_iso + ${minutes} minutes" +"%Y-%m-%dT%H:%M:%S")
        echo "${ts}.000Z"
        return
    fi
    local base
    base=$(date -u -d "$start_iso + ${minutes} minutes" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
    if [[ -z $base ]]; then
        local start_base
        start_base=$(date -ju -u -f "%Y-%m-%dT%H:%M:%S.000Z" "$start_iso" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
        if [[ -n $start_base ]]; then
            base=$(date -ju -u -v+${minutes}M -f "%Y-%m-%dT%H:%M:%S" "$start_base" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
        fi
    fi
    if [[ -n $base ]]; then
        echo "${base}.000Z"
    fi
}

compute_cutoff() {
    local minutes=$1
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$minutes" <<'PY'
from datetime import datetime, timedelta, timezone
minutes = int(__import__('sys').argv[1])
print((datetime.now(timezone.utc) - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
PY
        return
    fi
    if command -v gdate >/dev/null 2>&1; then
        local ts
        ts=$(gdate -u -d "-${minutes} minutes" +"%Y-%m-%dT%H:%M:%S")
        echo "${ts}.000Z"
        return
    fi
    local base
    base=$(date -u -d "-${minutes} minutes" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
    if [[ -z $base ]]; then
        base=$(date -ju -u -v-${minutes}M +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || true)
    fi
    if [[ -n $base ]]; then
        echo "${base}.000Z"
    fi
}

should_retry() {
    local message=$1
    case "$message" in
        *EAI_AGAIN*|*ENOTFOUND*|*ECONNRESET*|*ETIMEDOUT*|*ECONNABORTED*|*ECONNREFUSED*|*socket*hang*up*|*REQUEST_LIMIT_EXCEEDED*)
            return 0
            ;;
    esac
    return 1
}

sf_sleep() {
    local delay=$SF_RETRY_SLEEP
    if [[ $SF_RETRY_JITTER -gt 0 ]]; then
        local extra=$((RANDOM % (SF_RETRY_JITTER + 1)))
        delay=$((delay + extra))
    fi
    sleep "$delay"
}

sf_json() {
    local args=()
    while [[ $# -gt 0 ]]; do
        args+=("$1")
        shift
    done
    local attempt=1
    while true; do
        local stdout_file stderr_file status combined
        stdout_file=$(mktemp)
        stderr_file=$(mktemp)
        if sf "${args[@]}" "${ORG_ARGS[@]}" --json 1>"$stdout_file" 2>"$stderr_file"; then
            cat "$stdout_file"
            rm -f "$stdout_file" "$stderr_file"
            return 0
        fi
        status=$?
        combined="$(cat "$stderr_file" 2>/dev/null; cat "$stdout_file" 2>/dev/null)"
        rm -f "$stdout_file" "$stderr_file"
        if (( attempt >= SF_MAX_RETRIES )) || ! should_retry "$combined"; then
            printf '%s\n' "$combined" >&2
            return $status
        fi
        sf_sleep
        ((attempt++))
    done
}

sf_plain() {
    local args=()
    while [[ $# -gt 0 ]]; do
        args+=("$1")
        shift
    done
    local attempt=1
    while true; do
        local output
        if output=$(sf "${args[@]}" "${ORG_ARGS[@]}" 2>&1); then
            [[ -n $output ]] && printf '%s\n' "$output"
            return 0
        fi
        local status=$?
        if (( attempt >= SF_MAX_RETRIES )) || ! should_retry "$output"; then
            printf '%s\n' "$output" >&2
            return $status
        fi
        sf_sleep
        ((attempt++))
    done
}

wait_for_trace() {
    local user_id=$1
    local debug_id=$2
    local start_literal=$3
    for _ in {1..6}; do
        local trace_json
        trace_json=$({ sf_json data query --use-tooling-api -q "SELECT Id FROM TraceFlag WHERE TracedEntityId='${user_id}' AND DebugLevelId='${debug_id}' AND ExpirationDate >= ${start_literal} LIMIT 1"; } || true)
        local total
        total=$(echo "$trace_json" | jq -r '.result.totalSize // 0' 2>/dev/null || echo 0)
        if [[ ${total:-0} -gt 0 ]]; then
            return 0
        fi
        sleep 2
    done
    return 1
}

DEBUG_LEVEL_ID=""
CURRENT_USER_ID=""
AUTOMATED_USER_ID=""
START_DATETIME_UTC=""
EXPIRATION_DATETIME=""
CURRENT_TRACE_ID=""
AUTO_TRACE_ID=""

if [[ $SKIP_TRACE -eq 0 ]]; then
    echo "[INFO] Ensuring debug level $DEBUG_LEVEL_NAME exists"
    DEBUG_LOOKUP_JSON=$({ sf_json data query --use-tooling-api -q "SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName='${DEBUG_LEVEL_NAME}' LIMIT 1"; } || true)
    DEBUG_LEVEL_ID=$(echo "$DEBUG_LOOKUP_JSON" | jq -r '.result.records[0].Id // ""')

    if [[ -z $DEBUG_LEVEL_ID ]]; then
        echo "[INFO] Creating debug level $DEBUG_LEVEL_NAME"
        DEBUG_VALUES_JSON=$(cat <<JSON
{"DeveloperName":"$DEBUG_LEVEL_NAME","MasterLabel":"$DEBUG_LEVEL_NAME","ApexCode":"FINE","ApexProfiling":"INFO","Callout":"INFO","Database":"NONE","System":"FINE","Validation":"FINE","Visualforce":"NONE","Workflow":"FINEST"}
JSON
)
        DEBUG_LEVEL_ID=$(sf_json data create record --use-tooling-api --sobject DebugLevel --values-json "$DEBUG_VALUES_JSON" | jq -r '.result.id // ""')
        if [[ -z $DEBUG_LEVEL_ID ]]; then
            echo "[ERROR] Failed to create DebugLevel" >&2
            exit 1
        fi
        echo "[INFO] Debug level created: $DEBUG_LEVEL_ID"
        sleep 2
    else
        echo "[INFO] Debug level $DEBUG_LEVEL_NAME already present ($DEBUG_LEVEL_ID)"
    fi

    echo "[INFO] Resolving user ids for traces"
    ORG_DISPLAY_JSON=$(sf_json org display)
    CURRENT_USER_ID=$(echo "$ORG_DISPLAY_JSON" | jq -r '.result.userId')
    if [[ -z $CURRENT_USER_ID || $CURRENT_USER_ID == "null" ]]; then
        echo "[ERROR] Unable to resolve current user id" >&2
        exit 1
    fi

    AUTO_JSON=$({ sf_json data query -q "SELECT Id, Name FROM User WHERE Name = 'Automated Process' LIMIT 1"; } || true)
    AUTOMATED_USER_ID=$(echo "$AUTO_JSON" | jq -r '.result.records[0].Id // ""')
    if [[ -z $AUTOMATED_USER_ID ]]; then
        echo "[WARN] Automated Process user not found; skipping that trace flag"
    fi

    START_DATETIME_UTC=$(utc_now)
    EXPIRATION_DATETIME=$(compute_expiration "$START_DATETIME_UTC" "$TRACE_DURATION_MINUTES")
    if [[ -z $EXPIRATION_DATETIME ]]; then
        echo "[ERROR] Unable to compute trace flag expiration" >&2
        exit 1
    fi
    START_LITERAL="'$START_DATETIME_UTC'"

    TRACE_VALUES_JSON=$(cat <<JSON
{"TracedEntityId":"$CURRENT_USER_ID","TracedEntityType":"User","DebugLevelId":"$DEBUG_LEVEL_ID","StartDate":"$START_DATETIME_UTC","ExpirationDate":"$EXPIRATION_DATETIME","LogType":"USER_DEBUG"}
JSON
)
    TRACE_CREATE_JSON=$(sf_json data create record --use-tooling-api --sobject TraceFlag --values-json "$TRACE_VALUES_JSON")
    CURRENT_TRACE_ID=$(echo "$TRACE_CREATE_JSON" | jq -r '.result.id // ""')
    echo "[INFO] Trace flag for current user: ${CURRENT_TRACE_ID:-<unknown>}"
    wait_for_trace "$CURRENT_USER_ID" "$DEBUG_LEVEL_ID" "$START_LITERAL" || echo "[WARN] Trace flag for current user not visible yet"

    if [[ -n $AUTOMATED_USER_ID ]]; then
        AUTO_TRACE_VALUES_JSON=$(cat <<JSON
{"TracedEntityId":"$AUTOMATED_USER_ID","TracedEntityType":"User","DebugLevelId":"$DEBUG_LEVEL_ID","StartDate":"$START_DATETIME_UTC","ExpirationDate":"$EXPIRATION_DATETIME","LogType":"USER_DEBUG"}
JSON
)
        AUTO_TRACE_CREATE_JSON=$(sf_json data create record --use-tooling-api --sobject TraceFlag --values-json "$AUTO_TRACE_VALUES_JSON")
        AUTO_TRACE_ID=$(echo "$AUTO_TRACE_CREATE_JSON" | jq -r '.result.id // ""')
        echo "[INFO] Trace flag for Automated Process: ${AUTO_TRACE_ID:-<unknown>}"
        wait_for_trace "$AUTOMATED_USER_ID" "$DEBUG_LEVEL_ID" "$START_LITERAL" || echo "[WARN] Trace flag for Automated Process not visible yet"
    fi
else
    echo "[INFO] Skipping trace setup per flag"
    ORG_DISPLAY_JSON=$(sf_json org display)
    CURRENT_USER_ID=$(echo "$ORG_DISPLAY_JSON" | jq -r '.result.userId')
    AUTO_JSON=$({ sf_json data query -q "SELECT Id, Name FROM User WHERE Name = 'Automated Process' LIMIT 1"; } || true)
    AUTOMATED_USER_ID=$(echo "$AUTO_JSON" | jq -r '.result.records[0].Id // ""')
fi

APEX_FILE=$(mktemp "$LOG_ROOT/nudge-XXXXXX.apex")
cat <<APEX > "$APEX_FILE"
Id quoteId = '$QUOTE_ID';
$SOBJECT_API q = [SELECT Id, Status FROM $SOBJECT_API WHERE Id = :quoteId LIMIT 1];
String oldStatus = q.Status;
q.Status = 'In Review';
update q;
System.debug(LoggingLevel.INFO, 'quote-approval-health: Status transitioned from ' + oldStatus + ' to ' + q.Status);
APEX

echo "[INFO] Driving flow by setting $SOBJECT_API ($QUOTE_ID) to 'In Review'"
RUN_JSON=$(sf_json apex run --file "$APEX_FILE")
RUN_STATUS=$(echo "$RUN_JSON" | jq -r '.status // ""')
if [[ $RUN_STATUS != "0" ]]; then
    echo "$RUN_JSON" | jq -r '.message // "Anonymous Apex execution failed"' >&2
    exit 1
fi

rm -f "$APEX_FILE"

echo "[INFO] Waiting $WAIT_SECONDS seconds for the flow to complete"
sleep "$WAIT_SECONDS"

CUTOFF=$(compute_cutoff "$LOOKBACK_MINUTES")
if [[ -z $CUTOFF ]]; then
    echo "[ERROR] Unable to compute CreatedDate cutoff" >&2
    exit 1
fi
CUTOFF_LITERAL="'$CUTOFF'"
SOQL="SELECT Id, Name, Status__c, Object_Type__c, Sequence__c, CreatedDate, CreatedBy.Name FROM Approval_Request__c WHERE Record_ID__c = '$QUOTE_ID' AND CreatedDate >= $CUTOFF_LITERAL ORDER BY CreatedDate DESC LIMIT 10"

echo "[INFO] Checking Approval_Request__c via SOQL"
APPROVAL_JSON=$({ sf_json data query -q "$SOQL"; } || true)
APPROVAL_TOTAL=$(echo "$APPROVAL_JSON" | jq -r '.result.totalSize // 0' 2>/dev/null || echo 0)
if [[ -z $APPROVAL_TOTAL ]]; then
    APPROVAL_TOTAL=0
fi
HEALTH_STATUS="FAIL"
if [[ $APPROVAL_TOTAL -gt 0 ]]; then
    HEALTH_STATUS="PASS"
fi

LOG_LIST_JSON=$({ sf_json apex log list; } || true)
LOG_USER_FOR_FILTER=${AUTOMATED_USER_ID:-$CURRENT_USER_ID}
LATEST_LOG_ID=$(echo "$LOG_LIST_JSON" | jq -r --arg user "$LOG_USER_FOR_FILTER" '
    def ensure_array:
        if type == "array" then .
        elif . == null then []
        else [.] end;
    (.result) as $r
    | (if ($r | type) == "object" and ($r | has("logs")) then $r.logs else $r end)
    | ensure_array
    | map(select((($user != "") and ((.LogUserId // "") == $user)) or ($user == "")))
    | (map(select((.Operation // "") | test("FLOW"; "i"))) as $flow | if ($flow | length) > 0 then $flow else . end)
    | (sort_by(.StartTime // "") | last) | (.Id // "")
')

LOG_FILE="${LOG_ROOT}/flow-log-${QUOTE_ID}-$(date +%Y%m%d-%H%M%S).log"
FLOW_STARTED=0
CREATE_REACHED=0
FLOW_ERRORS=0
LAST_FLOW_ELEMENT=""

if [[ -n $LATEST_LOG_ID ]]; then
    echo "[INFO] Downloading debug log $LATEST_LOG_ID to $LOG_FILE"
    sf_plain apex log get --log-id "$LATEST_LOG_ID" --output-file "$LOG_FILE" >/dev/null
    if [[ -s $LOG_FILE ]]; then
        if grep -q 'FLOW_START_INTERVIEW' "$LOG_FILE"; then
            FLOW_STARTED=1
        fi
        if grep -q 'FLOW_ELEMENT_BEGIN.*Create_Approval_Request' "$LOG_FILE"; then
            CREATE_REACHED=1
        fi
        if grep -q 'FLOW_ELEMENT_ERROR' "$LOG_FILE"; then
            FLOW_ERRORS=1
        fi
        LAST_FLOW_ELEMENT=$(grep -E 'FLOW_ELEMENT_[A-Z]+' "$LOG_FILE" | tail -1 || true)
    else
        echo "[WARN] Debug log file is empty"
    fi
else
    echo "[WARN] No debug logs returned by sf apex log list"
fi

printf '\n=== Flow Health Summary ===\n'
printf 'Result: %s\n' "$HEALTH_STATUS"
printf 'Quote Id: %s\n' "$QUOTE_ID"
printf 'Lookback window: last %s minute(s)\n' "$LOOKBACK_MINUTES"
printf 'Trace DebugLevel: %s\n' "${DEBUG_LEVEL_ID:-<skipped>}"
if [[ ${CURRENT_TRACE_ID:-} ]]; then
    printf 'Current user trace flag: %s\n' "$CURRENT_TRACE_ID"
fi
if [[ ${AUTO_TRACE_ID:-} ]]; then
    printf 'Automated Process trace flag: %s\n' "$AUTO_TRACE_ID"
fi

if [[ $APPROVAL_TOTAL -gt 0 ]]; then
    echo "Recent Approval_Request__c rows:"
    echo "$APPROVAL_JSON" | jq -r '.result.records[] | "  - Id: \(.Id), Sequence: \(.Sequence__c // ""), Status: \(.Status__c // ""), CreatedBy: \(.CreatedBy.Name // "") @ \(.CreatedDate)"'
else
    echo "No Approval_Request__c rows created within the window (>= $CUTOFF)"
fi

if [[ -n $LAST_FLOW_ELEMENT ]]; then
    printf 'Last FLOW_ELEMENT line: %s\n' "$LAST_FLOW_ELEMENT"
fi

if [[ -f $LOG_FILE ]]; then
    printf 'Log file: %s\n' "$LOG_FILE"
fi

EXIT_CODE=0
if [[ $FLOW_STARTED -eq 0 ]]; then
    EXIT_CODE=20
elif [[ $CREATE_REACHED -eq 0 && $APPROVAL_TOTAL -eq 0 ]]; then
    EXIT_CODE=21
elif [[ $FLOW_ERRORS -eq 1 ]]; then
    EXIT_CODE=22
elif [[ $HEALTH_STATUS != "PASS" ]]; then
    EXIT_CODE=1
fi

printf '\nScript complete.\n'
exit $EXIT_CODE
