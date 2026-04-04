#!/usr/bin/env bash
#
# Pre-Task Template Injector Hook
#
# Purpose: Automatically inject template and branding guidance into the Agent tool
#          invocations so sub-agents know which templates and CSS to use.
#
# Behavior:
#   1. Detects agent type from Agent tool input
#   2. Looks up agent in master-template-registry.json
#   3. Injects template recommendations into the task context
#   4. Always passes through (non-blocking)
#
# Configuration:
#   TEMPLATE_INJECTION_ENABLED=1     - Enable/disable injection (default: 1)
#   TEMPLATE_INJECTION_VERBOSE=1     - Show detailed output (default: 0)
#
# Version: 1.0.0
# Date: 2026-01-14
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source standardized error handler if available
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [ -f "$ERROR_HANDLER" ]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-task-template-injector"
    set_lenient_mode 2>/dev/null || true
fi

PRETOOL_AGENT_CONTRACT="${SCRIPT_DIR}/lib/pretool-agent-contract.sh"
if [ -f "$PRETOOL_AGENT_CONTRACT" ]; then
    source "$PRETOOL_AGENT_CONTRACT"
fi

# Configuration
ENABLED="${TEMPLATE_INJECTION_ENABLED:-1}"
VERBOSE="${TEMPLATE_INJECTION_VERBOSE:-0}"
REGISTRY_FILE="$PLUGIN_ROOT/config/master-template-registry.json"

# Read hook input
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null || true)
fi

normalize_pretool_agent_event "$HOOK_INPUT"

# Early exit if disabled, no input, or this is not an Agent tool event
if [ "$ENABLED" = "0" ] || [ -z "$HOOK_INPUT" ] || ! pretool_agent_event_is_agent; then
    emit_pretool_agent_noop
    exit 0
fi

AGENT_INPUT_JSON="${PRETOOL_TOOL_INPUT:-{}}"

# ============================================================================
# Functions
# ============================================================================

log_verbose() {
    if [ "$VERBOSE" = "1" ]; then
        echo "[template-injector] $1" >&2
    fi
}

# Extract agent type from hook input
get_agent_type() {
    if command -v jq &>/dev/null; then
        echo "$AGENT_INPUT_JSON" | jq -r '.subagent_type // ""' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Normalize agent type (remove plugin prefix if present)
normalize_agent_type() {
    local agent="$1"
    echo "$agent" | sed -E 's/^[A-Za-z0-9-]+://'
}

# Look up agent in registry
lookup_agent_templates() {
    local agent="$1"

    if [ ! -f "$REGISTRY_FILE" ]; then
        log_verbose "Registry file not found: $REGISTRY_FILE"
        echo ""
        return 1
    fi

    if ! command -v jq &>/dev/null; then
        log_verbose "jq not available"
        echo ""
        return 1
    fi

    # Look up agent in agentMappings
    local mapping
    mapping=$(jq -r --arg agent "$agent" '.agentMappings[$agent] // empty' "$REGISTRY_FILE" 2>/dev/null)

    if [ -n "$mapping" ] && [ "$mapping" != "null" ]; then
        echo "$mapping"
        return 0
    fi

    return 1
}

# Keyword-based fallback detection
# Returns a template mapping based on keywords in the prompt
detect_templates_from_keywords() {
    local prompt="$1"
    local agent="$2"
    prompt_lower=$(echo "$prompt $agent" | tr '[:upper:]' '[:lower:]')

    local pdf_cover="default"
    local pdf_theme="revpal-brand"
    local web_viz_theme="revpal-dashboard"
    local web_viz_template=""
    local detected=false

    # Salesforce keywords
    if echo "$prompt_lower" | grep -qE "(salesforce|sfdc|apex|flow|trigger|validation rule|metadata)"; then
        pdf_cover="salesforce-audit"
        detected=true
    fi

    # HubSpot keywords
    if echo "$prompt_lower" | grep -qE "(hubspot|portal|marketing hub|sales hub|service hub)"; then
        pdf_cover="hubspot-assessment"
        detected=true
    fi

    # Marketo keywords
    if echo "$prompt_lower" | grep -qE "(marketo|munchkin|smart campaign|engagement program)"; then
        pdf_cover="marketo-assessment"
        detected=true
    fi

    # GTM/Revenue keywords
    if echo "$prompt_lower" | grep -qE "(gtm|go-to-market|arr|mrr|revenue model|forecast|capacity)"; then
        pdf_cover="gtm-planning"
        detected=true
    fi

    # Security/Permission keywords
    if echo "$prompt_lower" | grep -qE "(security|permission|profile|role|access|compliance)"; then
        pdf_cover="security-audit"
        detected=true
    fi

    # Data quality keywords
    if echo "$prompt_lower" | grep -qE "(data quality|dedup|duplicate|hygiene|cleanse|enrich)"; then
        pdf_cover="data-quality"
        web_viz_template="data-quality"
        detected=true
    fi

    # Executive/Benchmark keywords
    if echo "$prompt_lower" | grep -qE "(executive|benchmark|industry|kpi|summary|board)"; then
        pdf_cover="executive-report"
        detected=true
    fi

    # Integration keywords
    if echo "$prompt_lower" | grep -qE "(integration|sync|api|cross-platform|multi-platform)"; then
        pdf_cover="cross-platform-integration"
        detected=true
    fi

    # Automation/Flow specific
    if echo "$prompt_lower" | grep -qE "(automation|flow audit|workflow audit|process builder)"; then
        web_viz_template="automation-audit"
    fi

    # Pipeline/Funnel specific
    if echo "$prompt_lower" | grep -qE "(pipeline|funnel|stage|conversion|velocity)"; then
        web_viz_template="sales-pipeline"
    fi

    # Territory specific
    if echo "$prompt_lower" | grep -qE "(territory|geo|region|assignment)"; then
        web_viz_template="territory-planning"
    fi

    if [ "$detected" = true ]; then
        # Build JSON mapping
        local mapping="{\"pdfCover\":\"$pdf_cover\",\"pdfTheme\":\"$pdf_theme\",\"webVizTheme\":\"$web_viz_theme\""
        if [ -n "$web_viz_template" ]; then
            mapping+=",\"webVizTemplate\":\"$web_viz_template\""
        fi
        mapping+=",\"_fallbackDetected\":true}"
        echo "$mapping"
        return 0
    fi

    return 1
}

# Get prompt from hook input
get_prompt() {
    if command -v jq &>/dev/null; then
        echo "$AGENT_INPUT_JSON" | jq -r '.prompt // ""' 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Get PDF cover details
get_cover_details() {
    local cover_id="$1"

    if [ ! -f "$REGISTRY_FILE" ]; then
        return 1
    fi

    jq -r --arg id "$cover_id" '
        .categories["pdf-covers"].templates[] |
        select(.id == $id) |
        "  Cover: \(.displayName)\n  File: templates/pdf-covers/\(.file)\n  Use case: \(.useCase)"
    ' "$REGISTRY_FILE" 2>/dev/null
}

# Build template guidance message
build_guidance_message() {
    local agent="$1"
    local mapping="$2"

    local pdf_cover pdf_theme web_viz_theme web_viz_template

    pdf_cover=$(echo "$mapping" | jq -r '.pdfCover // empty' 2>/dev/null)
    pdf_theme=$(echo "$mapping" | jq -r '.pdfTheme // empty' 2>/dev/null)
    web_viz_theme=$(echo "$mapping" | jq -r '.webVizTheme // empty' 2>/dev/null)
    web_viz_template=$(echo "$mapping" | jq -r '.webVizTemplate // empty' 2>/dev/null)

    local msg=""
    msg+="
┌─────────────────────────────────────────────────────────────────┐
│  🎨 TEMPLATE & BRANDING GUIDANCE                                │
├─────────────────────────────────────────────────────────────────┤
│  Agent: $agent
│"

    if [ -n "$pdf_cover" ] && [ "$pdf_cover" != "null" ]; then
        msg+="
│  PDF Output:
│    Cover Template: $pdf_cover
│    Theme: ${pdf_theme:-revpal-brand}
│    Path: templates/pdf-covers/${pdf_cover}.md
│"
    fi

    if [ -n "$web_viz_theme" ] && [ "$web_viz_theme" != "null" ]; then
        msg+="
│  Web Dashboard:
│    Theme CSS: templates/web-viz/themes/${web_viz_theme}.css"
        if [ -n "$web_viz_template" ] && [ "$web_viz_template" != "null" ]; then
            msg+="
│    Layout: templates/web-viz/${web_viz_template}.json"
        fi
        msg+="
│"
    fi

    # Resolve brand colors — check customization store first, fall back to defaults
    local brand_grape="#5F3B8C"
    local brand_apricot="#E99560"
    local brand_sand="#EAE4DC"
    local brand_heading="Montserrat"
    local brand_body="Figtree"
    local customization_index="$HOME/.claude/opspal/customizations/index.json"
    if [ -f "$customization_index" ] && command -v jq &>/dev/null; then
        local palette
        palette=$(jq -r '
            .[] | select(.resource_id == "brand:color-palette:default" and .status == "published")
            | .content // empty
        ' "$customization_index" 2>/dev/null)
        if [ -n "$palette" ] && [ "$palette" != "null" ]; then
            local g a s
            g=$(echo "$palette" | jq -r '.grape // empty' 2>/dev/null)
            a=$(echo "$palette" | jq -r '.apricot // empty' 2>/dev/null)
            s=$(echo "$palette" | jq -r '.sand // empty' 2>/dev/null)
            [ -n "$g" ] && brand_grape="$g"
            [ -n "$a" ] && brand_apricot="$a"
            [ -n "$s" ] && brand_sand="$s"
        fi
        local fontset
        fontset=$(jq -r '
            .[] | select(.resource_id == "brand:font-set:default" and .status == "published")
            | .content // empty
        ' "$customization_index" 2>/dev/null)
        if [ -n "$fontset" ] && [ "$fontset" != "null" ]; then
            local fh fb
            fh=$(echo "$fontset" | jq -r '.headings // empty' 2>/dev/null)
            fb=$(echo "$fontset" | jq -r '.body // empty' 2>/dev/null)
            [ -n "$fh" ] && brand_heading="$fh"
            [ -n "$fb" ] && brand_body="$fb"
        fi
    fi

    msg+="
│  Brand Colors: Grape ${brand_grape} | Apricot ${brand_apricot} | Sand ${brand_sand}
│  Typography: ${brand_heading} (headings) | ${brand_body} (body)
│                                                                 │
│  Registry: config/master-template-registry.json                 │
└─────────────────────────────────────────────────────────────────┘
"
    echo "$msg"
}

# ============================================================================
# Main Logic
# ============================================================================

# Get agent type
AGENT_TYPE=$(get_agent_type)

if [ -z "$AGENT_TYPE" ]; then
    log_verbose "No agent type detected in input"
    emit_pretool_agent_noop
    exit 0
fi

# Normalize agent type (remove plugin prefix)
NORMALIZED_AGENT=$(normalize_agent_type "$AGENT_TYPE")
log_verbose "Agent type: $AGENT_TYPE -> normalized: $NORMALIZED_AGENT"

# Look up templates for this agent
TEMPLATE_MAPPING=$(lookup_agent_templates "$NORMALIZED_AGENT" || echo "")

if [ -z "$TEMPLATE_MAPPING" ]; then
    # Try with full agent type (with prefix)
    TEMPLATE_MAPPING=$(lookup_agent_templates "$AGENT_TYPE" || echo "")
fi

# Fallback: keyword-based detection from prompt
FALLBACK_USED=false
if [ -z "$TEMPLATE_MAPPING" ]; then
    PROMPT=$(get_prompt)
    if [ -n "$PROMPT" ]; then
        log_verbose "No direct mapping, trying keyword detection from prompt"
        TEMPLATE_MAPPING=$(detect_templates_from_keywords "$PROMPT" "$NORMALIZED_AGENT" || echo "")
        if [ -n "$TEMPLATE_MAPPING" ]; then
            FALLBACK_USED=true
            log_verbose "Fallback detection matched templates"
        fi
    fi
fi

if [ -n "$TEMPLATE_MAPPING" ]; then
    # Build and display guidance
    GUIDANCE=$(build_guidance_message "$NORMALIZED_AGENT" "$TEMPLATE_MAPPING")

    # Add fallback notice if applicable
    if [ "$FALLBACK_USED" = true ]; then
        GUIDANCE+="
│  ⚠️  Templates detected via keywords (agent not in registry)    │
"
    fi

    echo "$GUIDANCE" >&2

    # Inject template info into hook input for agent consumption
    if command -v jq &>/dev/null; then
        # Build branding preamble to prepend to agent prompt
        PDF_COVER=$(echo "$TEMPLATE_MAPPING" | jq -r '.pdfCover // "default"')
        PDF_THEME=$(echo "$TEMPLATE_MAPPING" | jq -r '.pdfTheme // "revpal-brand"')
        BRANDING_PREAMBLE="[BRANDING: Use #5F3B8C (REVPAL_GRAPE) for primary/headings, #E99560 (REVPAL_APRICOT) for accent/CTAs, Montserrat for headings, Figtree for body. PDF cover: ${PDF_COVER}, theme: ${PDF_THEME}. Check template_guidance in input for full details.]

"
        # Prepend branding to prompt AND add template_guidance object
        ENHANCED_INPUT=$(echo "$AGENT_INPUT_JSON" | jq \
            --arg brandingPreamble "$BRANDING_PREAMBLE" \
            --argjson templates "$TEMPLATE_MAPPING" \
            --arg registryPath "$REGISTRY_FILE" \
            --argjson fallback "$FALLBACK_USED" \
            '.prompt = ($brandingPreamble + (.prompt // "")) |
            . + {
                template_guidance: {
                    templates: $templates,
                    registry: $registryPath,
                    fallbackDetection: $fallback,
                    brand: {
                        colors: {
                            grape: "#5F3B8C",
                            apricot: "#E99560",
                            sand: "#EAE4DC",
                            indigo: "#3E4A61",
                            green: "#6FBF73"
                        },
                        typography: {
                            headings: "Montserrat",
                            body: "Figtree"
                        }
                    },
                    note: "Use these templates for branded output. See master-template-registry.json for full catalog."
                }
            }'
        )
        emit_pretool_agent_update \
          "$ENHANCED_INPUT" \
          "Injected template guidance for ${NORMALIZED_AGENT}" \
          "TEMPLATE_GUIDANCE_INJECTED: Applied branded output guidance from the master template registry." \
          "TEMPLATE_GUIDANCE_INJECTED" \
          "INFO"
        exit 0
    fi
else
    log_verbose "No template mapping found for agent: $NORMALIZED_AGENT"
fi

# No update needed for this agent
emit_pretool_agent_noop
exit 0
