#!/usr/bin/env bash
# STATUS: SUPERSEDED — absorbed by a registered dispatcher or consolidated hook
set -euo pipefail
# post-tool-capture.sh - Capture tool invocations for session context
#
# Hook Type: PostToolUse
# Purpose: Record tool usage in session context for reflection enrichment
#
# Input: JSON with tool_name, tool_input, tool_result
# Output: None (notification hook)
#
# This hook runs non-blocking to avoid impacting tool performance.

# Skip if session capture is disabled
if [ "${DISABLE_SESSION_CAPTURE:-}" = "1" ]; then
    exit 0
fi

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# Load current session ID
SESSION_DIR="$HOME/.claude/session-context"
if [ -f "$SESSION_DIR/.current_session" ]; then
    source "$SESSION_DIR/.current_session"
fi

# Skip if no session
if [ -z "${CLAUDE_SESSION_ID:-}" ]; then
    exit 0
fi

SESSION_FILE="$SESSION_DIR/${CLAUDE_SESSION_ID}.json"
if [ ! -f "$SESSION_FILE" ]; then
    exit 0
fi

# Read input from stdin
INPUT=$(cat)

# Extract tool info using jq (if available)
if command -v jq &> /dev/null; then
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")
    TOOL_RESULT=$(echo "$INPUT" | jq -r '.tool_result // "success"' 2>/dev/null || echo "success")

    # Skip internal/meta tools
    case "$TOOL_NAME" in
        "TodoWrite"|"TodoRead"|"AskUserQuestion"|"ExitPlanMode"|"EnterPlanMode")
            exit 0
            ;;
    esac

    # Determine result status
    RESULT_STATUS="success"
    if echo "$TOOL_RESULT" | grep -qi "error\|failed\|exception\|timeout"; then
        RESULT_STATUS="error"
    fi

    # Check for file operations
    if [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Edit" ]; then
        FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null)
        if [ -n "$FILE_PATH" ]; then
            # Add to files_edited array
            TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            OPERATION="UPDATE"
            [ "$TOOL_NAME" = "Write" ] && OPERATION="CREATE"

            # Update session file using node for proper JSON manipulation
            if [ -f "$PLUGIN_DIR/scripts/lib/session-collector.js" ]; then
                node -e "
                    const fs = require('fs');
                    const sessionFile = '$SESSION_FILE';
                    try {
                        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

                        // Add file edit
                        data.files_edited.push({
                            path: '$FILE_PATH',
                            operation: '$OPERATION',
                            lines_changed: 0,
                            timestamp: '$TIMESTAMP'
                        });

                        // Trim to max 200 entries
                        if (data.files_edited.length > 200) {
                            data.files_edited = data.files_edited.slice(-200);
                        }

                        // Update activity time
                        data.last_activity_at = '$TIMESTAMP';
                        data.event_count++;

                        fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
                    } catch (e) {
                        // Silent fail
                    }
                " 2>/dev/null &
            fi
        fi
    fi

    # Update tool invocation stats
    if [ -f "$PLUGIN_DIR/scripts/lib/session-collector.js" ]; then
        node -e "
            const fs = require('fs');
            const sessionFile = '$SESSION_FILE';
            try {
                const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                const toolName = '$TOOL_NAME';
                const resultStatus = '$RESULT_STATUS';
                const timestamp = '$(date -u +"%Y-%m-%dT%H:%M:%SZ")';

                // Initialize tool entry if needed
                if (!data.tools_used[toolName]) {
                    data.tools_used[toolName] = {
                        invocations: 0,
                        success_count: 0,
                        error_count: 0,
                        timeout_count: 0,
                        total_duration_ms: 0,
                        last_invoked_at: null,
                        sample_args: []
                    };
                }

                const tool = data.tools_used[toolName];
                tool.invocations++;
                tool.last_invoked_at = timestamp;

                if (resultStatus === 'success') {
                    tool.success_count++;
                } else if (resultStatus === 'error') {
                    tool.error_count++;
                } else if (resultStatus === 'timeout') {
                    tool.timeout_count++;
                }

                // Update activity time
                data.last_activity_at = timestamp;
                data.event_count++;

                // Update duration
                const started = new Date(data.started_at);
                const now = new Date();
                data.duration_minutes = Math.round((now - started) / 60000);

                fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
            } catch (e) {
                // Silent fail
            }
        " 2>/dev/null &
    fi

    # Capture errors separately
    if [ "$RESULT_STATUS" = "error" ]; then
        ERROR_MSG=$(echo "$TOOL_RESULT" | head -c 500)
        node -e "
            const fs = require('fs');
            const sessionFile = '$SESSION_FILE';
            try {
                const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

                data.errors_captured.push({
                    type: 'TOOL_ERROR',
                    message: \`${TOOL_NAME}: ${ERROR_MSG}\`.substring(0, 500),
                    timestamp: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
                    context: { tool: '$TOOL_NAME' }
                });

                // Trim to max 50 entries
                if (data.errors_captured.length > 50) {
                    data.errors_captured = data.errors_captured.slice(-50);
                }

                fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
            } catch (e) {
                // Silent fail
            }
        " 2>/dev/null &
    fi
fi

# Always exit successfully (notification hook)
exit 0
