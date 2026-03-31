# shellcheck shell=bash

read_active_runtime_session_id() {
    local session_file=""
    local extracted=""

    for session_file in \
        "${HOME}/.claude/session-context/.current_session" \
        "${HOME}/.claude/session.env"; do
        if [[ ! -f "$session_file" ]]; then
            continue
        fi

        extracted="$(sed -nE "s/.*CLAUDE_SESSION_ID=['\"]?([^'\"[:space:]]+)['\"]?.*/\\1/p" "$session_file" 2>/dev/null | tail -n 1)"
        if [[ -n "$extracted" ]]; then
            printf '%s' "$extracted"
            return 0
        fi
    done

    return 1
}

resolve_session_key_with_runtime_fallback() {
    local extracted="${1:-}"
    local default_value="${2:-default-session}"
    local active_runtime_session=""

    active_runtime_session="$(read_active_runtime_session_id 2>/dev/null || true)"

    if [[ -n "${extracted// }" ]] && [[ "$extracted" != "null" ]]; then
        if [[ -n "$active_runtime_session" ]] &&
           [[ -n "${CLAUDE_SESSION_ID:-}" ]] &&
           [[ "$extracted" == "${CLAUDE_SESSION_ID}" ]] &&
           [[ "$active_runtime_session" != "${CLAUDE_SESSION_ID}" ]]; then
            printf '%s' "$active_runtime_session"
            return 0
        fi

        printf '%s' "$extracted"
        return 0
    fi

    if [[ -n "$active_runtime_session" ]]; then
        printf '%s' "$active_runtime_session"
        return 0
    fi

    if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
        printf '%s' "${CLAUDE_SESSION_ID}"
        return 0
    fi

    printf '%s' "$default_value"
}
