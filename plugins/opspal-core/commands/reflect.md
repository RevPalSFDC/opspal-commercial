---
name: reflect
description: Analyze session for errors, feedback, and generate improvement playbook
argument-hint: "[options]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
thinking-mode: enabled
---

# Session Reflection & Improvement Analysis

## Purpose

**What this command does**: Analyzes your development session to detect errors, patterns, and friction points, then generates a structured improvement playbook and submits it to a centralized database for trend analysis.

**When to use it**:
- After completing a development session (Salesforce, HubSpot, or any platform)
- When you encountered errors or friction worth documenting
- After discovering patterns that could be automated
- When you have feedback about tool/agent behavior

**When NOT to use it**:
- During read-only exploration (no development work performed)
- For documentation-only review sessions
- Mid-session (wait until the session is complete)

## Prerequisites

### Configuration (Supabase Required for Submission)

**Reflection generation works out-of-the-box; Supabase submission requires config:**

- **Supabase submission**: Requires environment variables
  - `SUPABASE_URL` (required)
  - `SUPABASE_SERVICE_ROLE_KEY` (recommended - bypasses Row Level Security)
  - `SUPABASE_ANON_KEY` (fallback - may fail due to RLS policies)
  - Example:
    ```bash
    export SUPABASE_URL='https://your-project.supabase.co'
    export SUPABASE_SERVICE_ROLE_KEY='eyJ...'  # From Supabase Dashboard > Settings > API
    ```
  - **Important**: The anonymous key (`SUPABASE_ANON_KEY`) CANNOT reliably write to the reflections table due to Row Level Security (RLS) policies. Use `SUPABASE_SERVICE_ROLE_KEY` for reliable submissions.
  - If missing, /reflect still saves locally and skips submission
  - Auto-load: /reflect loads `.env` and `.env.local` from the nearest project root

- **User attribution** (Optional): Set `USER_EMAIL` environment variable for attribution
  - Default: Anonymous submission (works without USER_EMAIL)
  - How to set:
    ```bash
    export USER_EMAIL='your-email@example.com'
    ```

**No configuration needed** to generate reflections; submission needs Supabase env vars.

### Execution Required
**These are MANDATORY before running the command**:

- **Completed development session** - Must have performed actual development work (not just exploration)
  - Verify: Review your conversation history for tool calls, agent invocations, or code changes
  - Impact: Reflection will have nothing to analyze if session is empty

### Submission Schema Contract

`/reflect` now enforces a canonical payload shape before Supabase submission:

- `issues_identified` MUST be an array
  - Valid: `[]` or `[{ ...issue }]`
  - Invalid scalar/object inputs are coerced to `[]` in non-strict mode, and rejected when `ENFORCE_DATA_QUALITY=1`.
- Issue taxonomy should use canonical names
  - Canonical examples: `schema/parse`, `config/env`, `tool-contract`, `data-quality`, `prompt-mismatch`, `idempotency/state`, `external-api`, `auth/permissions`.
  - Known variants (for example `schema-parse`, `tool-contract mismatch`, `prompt/llm-mismatch`) are auto-normalized at submit time.
- Issue priority should be `P0`, `P1`, `P2`, or `P3`
  - Common variants (`critical`, `high`, `medium`, `low`, numeric `0-3`) are normalized automatically.
- ROI guardrail for urgent issues
  - If any `P0`/`P1` issues exist and ROI is missing/zero, `/reflect` computes a fallback ROI estimate and marks it as inferred in data quality metadata.

## Usage

### Basic Usage
```bash
/reflect
```

**What happens**:
1. Agent analyzes your session history (conversation, tool calls, agent invocations)
2. Detects errors and categorizes by taxonomy (config, auth, schema, etc.)
3. Captures user feedback (clarifications, frustrations, suggestions)
4. Generates improvement playbook with root cause analysis
5. Saves reflection JSON to `.claude/SESSION_REFLECTION_<timestamp>.json`
6. Submits to Supabase if credentials are configured
7. Reports success with local file path and submission status

**Duration**: 30-60 seconds depending on session length

## Examples

### Example 1: After Development Session with Errors

**Scenario**: You worked on metadata deployment and encountered 2 errors

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

Session Summary:
   - Duration: 45 minutes
   - Tool calls: 23
   - Agent invocations: 3
   - Errors detected: 2

Error Analysis:
   Issue #1: Field history tracking limit exceeded (schema/parse)
      Root cause: Attempted to add 21st tracked field to Account object
      Priority: P1
      Blast radius: HIGH

   Issue #2: Invalid picklist formula using ISBLANK() (schema/parse)
      Root cause: ISBLANK() not supported on picklist fields
      Priority: P0
      Blast radius: MEDIUM

Playbook Generated:
   - Pre-deployment validation checks
   - Picklist formula validation patterns
   - Field history tracking verification

Saved: .claude/SESSION_REFLECTION_20251013_143022.json

Submitting to Supabase...
Submission successful

Query your reflections:
   node .claude-plugins/opspal-core/scripts/lib/query-reflections.js recent
```

### Example 2: Successful Session with Feedback

**Scenario**: Deployment succeeded but you noticed a friction point in the workflow

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

Session Summary:
   - Duration: 20 minutes
   - Tool calls: 8
   - Agent invocations: 1
   - Errors detected: 0
   - User feedback: 1

User Feedback:
   "Had to manually verify object relationships - this could be automated"
   Classification: suggestion
   Proposed action: Add pre-flight relationship validator

Playbook Generated:
   - Object relationship verification workflow

Saved: .claude/SESSION_REFLECTION_20251013_145530.json

Submitting to Supabase...
Submission successful
```

### Example 3: Supabase Not Configured

**Scenario**: Running /reflect without SUPABASE_URL/credentials

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

Session Summary:
   - Duration: 35 minutes
   - Errors detected: 3

Saved: .claude/SESSION_REFLECTION_20251013_150145.json

Attempting submission...
Supabase not configured (missing SUPABASE_URL or credentials)

Manual submission (auto-loads .env/.env.local):
   node .claude-plugins/opspal-core/scripts/lib/submit-reflection.js \
     .claude/SESSION_REFLECTION_20251013_150145.json
```

## Decision Tree

**Use this decision tree to determine if you should run /reflect:**

```
Start Here
  |
Did your session involve actual development work (not just exploration)?
  |-- YES -> Did you encounter errors, friction, or have feedback?
  |         |-- YES -> Run /reflect
  |         |         (Document errors and patterns)
  |         |
  |         +-- NO -> Optional but recommended
  |                   (Positive feedback helps track what works well)
  |
  +-- NO -> Was this just documentation reading or exploration?
            |-- YES -> Skip /reflect
            |         (Nothing to reflect on for read-only sessions)
            |
            +-- NO -> Consider /reflect if you have feedback about the tools
```

**Key Decision Factors**:
- **RUN** after: Deployments (success or failure), implementations, debugging, automation work
- **OPTIONAL** after: Successful sessions with no issues (but helpful for positive patterns)
- **SKIP** after: Pure exploration, documentation review, read-only queries

## OBJECTIVE (For Agent Context)
From the latest run(s), extract errors, fragilities, and user feedback. Propose instance-agnostic fixes and output a reusable playbook. Produce actionable wiring steps for our tools and sub-agents.

## INPUTS (For Agent Context)
Analyze the following from this session:
- Execution traces (conversation history, tool calls, agent invocations)
- Tool I/O (requests, responses, status codes, failures)
- Environment/config snapshot (check error logs, recent operations)
- Current tool registry (scripts, agents, MCP tools used)
- User feedback (comments, corrections, clarifications during session)

## PROCESS

### 1) Snapshot (50 words max)
Summarize what we attempted and the outcome.

### 2) Error Sweep
Cluster issues using taxonomy:
- **config/env**: Missing env vars, wrong paths, misconfigured services
- **auth/permissions**: Auth issues, permission errors
- **tool-contract mismatch**: Wrong parameters, unexpected responses
- **schema/parse**: JSON/XML parsing failures, field name errors
- **idempotency/state**: State management issues, duplicate operations
- **rate limit/timeouts**: API throttling, timeout failures
- **external API drift**: API changes, breaking updates
- **data quality**: Missing data, malformed records, validation failures
- **concurrency/order**: Sequencing issues, dependency problems
- **prompt/LLM mismatch**: Misunderstood instructions, wrong agent choice

### 3) Feedback Sweep
Parse user comments and classify:
- **clarification**: User had to explain/correct something
- **dissatisfaction**: User expressed frustration or disappointment
- **suggestion**: User proposed improvements or alternatives
- **constraint**: User added requirements mid-session

Link each to error clusters OR create new issues if user-only.

### 4) Root Cause -> Fix
For each cluster, produce:
- **reproducible_trigger**: How to recreate the issue
- **root_cause**: One sentence explanation
- **minimal_patch**: Instance-specific quick fix
- **agnostic_fix**: Generalizable solution (script/agent/doc update)
- **blast_radius**: Scope of impact (LOW/MEDIUM/HIGH)
- **priority**: Urgency (P0/P1/P2/P3)

### 5) Generalize -> Playbook
Create reusable playbook templates for common patterns:
- Pre-flight checks
- Validation sequences
- Error recovery procedures
- Best practice workflows

### 6) Wiring Plan
Actionable steps to implement fixes:
- Script updates (file paths, changes needed)
- Agent enhancements (which agents, what capabilities)
- Documentation additions (where, what content)
- Tool integrations (new MCP tools, slash commands)

### 7) Tests & Monitors
Preventive measures:
- Validation checks to add
- Pre-deployment tests
- Monitoring/alerting improvements
- Automated guards

### 8) Skill Usage Analysis (ACE Framework)
Identify skills, playbooks, and strategies used during this session:
- **skills_used**: List skill IDs from the skill registry that were applied
- **skill_feedback**: Per-skill success/failure feedback
- **new_skills_discovered**: Patterns that could become new skills
- **skill_improvements**: Suggestions to refine existing skills

### 9) Debugging Context Extraction (Production Debugging Integration)
Extract debugging metrics from production infrastructure:
- **trace_ids**: Capture recent trace IDs from `~/.claude/logs/traces.jsonl`
- **span_summary**: Summarize spans (total, failed, avg duration, critical path)
- **correlation_ids**: Extract correlation IDs for request tracing
- **log_metrics**: Count errors, warnings, detect gaps
- **recovery_events**: Extract error recovery attempts and outcomes
- **instrumentation_gaps**: Identify missing spans, correlation IDs, or telemetry

**IMPORTANT**: If debugging context is available, include it in the reflection JSON.

### 10) Persistence
Where to save improvements:
- Script location and naming
- Documentation updates
- Agent configuration changes
- Shared library additions

## OUTPUT SCHEMA (JSON)

**IMPORTANT**: The reflection JSON MUST include the following REQUIRED fields for data quality:

### Required Metadata Fields
| Field | Type | Description | How to Determine |
|-------|------|-------------|------------------|
| `outcome` | string | Session outcome: success, partial, failure, blocked | See Outcome Decision Tree below |
| `session_metadata.duration_minutes` | number | Session duration in minutes | Calculate from session start/end |
| `session_metadata.session_start` | ISO string | When session started | First user message timestamp |
| `session_metadata.session_end` | ISO string | When reflection created | Current timestamp |

### Outcome Decision Tree
```
Did the primary task complete successfully?
|-- YES -> Did all subtasks complete?
|   |-- YES -> outcome: "success"
|   +-- NO -> outcome: "partial"
+-- NO -> Was it due to external factors (permissions, API limits, missing data)?
    |-- YES -> outcome: "blocked"
    +-- NO -> outcome: "failure"
```

Provide output in this exact structure:

```json
{
  "summary": "Brief description of what was attempted and outcome",
  "outcome": "success|partial|failure|blocked",
  "session_metadata": {
    "session_start": "ISO timestamp of first user message",
    "session_end": "ISO timestamp when reflection generated",
    "duration_minutes": 0,
    "duration_source": "auto_captured|user_provided|estimated",
    "org": "org-alias if applicable",
    "focus_area": "primary focus taxonomy"
  },
  "session_context": {
    "files_edited": [{"path": "...", "operation": "UPDATE", "lines_changed": 45}],
    "files_edited_count": 0,
    "tools_used": [{"tool": "sf data query", "invocations": 12, "success_rate": 92}],
    "tools_invoked_count": 0,
    "errors_captured": [{"type": "SOQL_SYNTAX", "message": "..."}],
    "errors_captured_count": 0,
    "agents_invoked": [{"agent": "sfdc-cpq-assessor", "task_count": 2}],
    "strategies_used": ["strategy-id-1"]
  },
  "issues": [
    {
      "id": "issue_001",
      "taxonomy": "one_of[config/env, auth/permissions, tool-contract, schema/parse, idempotency/state, rate-limit, external-api, data-quality, concurrency, prompt-mismatch]",
      "reproducible_trigger": "How to recreate",
      "root_cause": "One sentence cause",
      "minimal_patch": "Quick instance-specific fix",
      "agnostic_fix": "Generalizable solution",
      "blast_radius": "LOW|MEDIUM|HIGH",
      "priority": "P0|P1|P2|P3"
    }
  ],
  "user_feedback": [
    {
      "raw_comment": "Exact user comment or paraphrase",
      "classification": "clarification|dissatisfaction|suggestion|constraint",
      "linked_issue_id": "issue_001 or null",
      "proposed_action": "What to do about it"
    }
  ],
  "playbook": {
    "name": "Descriptive playbook name",
    "trigger": "When to use this playbook",
    "steps": [
      "Step 1: ...",
      "Step 2: ..."
    ],
    "location": "templates/playbooks/[name]/"
  },
  "wiring": {
    "scripts": [
      {
        "file": "scripts/lib/[name].js",
        "action": "create|update",
        "changes": "Description of changes"
      }
    ],
    "agents": [
      {
        "agent": "[agent-name]",
        "enhancement": "What capability to add"
      }
    ],
    "documentation": [
      {
        "file": "docs/[name].md",
        "content": "What to document"
      }
    ],
    "tools": [
      {
        "type": "slash-command|mcp-tool",
        "name": "[name]",
        "purpose": "What it does"
      }
    ]
  },
  "tests": {
    "validations": [
      "Pre-flight check to add"
    ],
    "monitors": [
      "What to monitor/alert on"
    ],
    "guards": [
      "Automated prevention mechanism"
    ]
  },
  "persistence": {
    "immediate": [
      "Quick wins to implement now"
    ],
    "backlog": [
      "Future improvements"
    ],
    "tracking": "Where to track (Asana/GitHub/docs)"
  },
  "skills": {
    "skills_used": [
      "skill_id_1",
      "skill_id_2"
    ],
    "skill_feedback": {
      "skill_id_1": {
        "success": true,
        "notes": "Worked well for this use case"
      }
    },
    "new_skills_discovered": [
      {
        "name": "Descriptive skill name",
        "category": "assessment|deployment|validation|query|automation|configuration|troubleshooting",
        "pattern": "Description of the repeatable pattern",
        "source_agent": "Agent that used this pattern"
      }
    ],
    "skill_improvements": [
      {
        "skill_id": "Existing skill to improve",
        "suggestion": "How to improve it",
        "reason": "Why it needs improvement"
      }
    ]
  },
  "roi_analysis": {
    "time_savings": {
      "hours_per_month": 0,
      "annual_hours": 0,
      "hourly_rate": 150,
      "annual_value": "$0"
    },
    "error_prevention": {
      "errors_prevented_monthly": 0,
      "cost_per_error": 500,
      "annual_value": "$0"
    },
    "total_annual_roi": "$0",
    "roi_confidence": "high|medium|low|estimated",
    "calculation_notes": "Brief explanation of ROI calculation methodology"
  },
  "debugging_context": {
    "trace_ids": ["abc123", "def456"],
    "span_summary": {
      "total_spans": 45,
      "failed_spans": 3,
      "avg_duration_ms": 120,
      "critical_path": ["agent-invocation", "sf-query", "data-transform"]
    },
    "correlation_ids": ["req-001", "req-002"],
    "log_metrics": {
      "error_count": 5,
      "warning_count": 12,
      "debug_enabled": false,
      "gaps_detected": ["no correlation ID on 3 operations"]
    },
    "recovery_events": [
      {"operation": "sf-deploy", "strategy": "retry", "attempts": 3, "outcome": "success"}
    ]
  },
  "instrumentation_gaps": {
    "severity": "LOW|MEDIUM|HIGH",
    "gaps": [
      {
        "type": "missing_correlation_id|no_span_for_operation",
        "count": 3,
        "impact": "Cannot trace request flow",
        "fix": "Add correlation ID to logger calls"
      }
    ],
    "recommendations": [
      "Enable DEBUG=1 for verbose logging",
      "Add APM export for production visibility"
    ]
  }
}
```

## CONSTRAINTS
- Output MUST be valid JSON matching the schema above
- **`outcome` field is REQUIRED** - must be one of: success, partial, failure, blocked
- **`session_metadata` object is REQUIRED** with duration_minutes, session_start, session_end
- Feedback MUST always be mapped to issues OR explicitly noted as unlinked
- Fixes MUST distinguish instance-specific vs agnostic solutions
- Wiring plan MUST include specific file paths and agent names
- Priority MUST reflect actual impact and urgency
- Skills section MUST include at least `skills_used` array (can be empty if none identified)
- **ROI calculation**: If issues identified, estimate annual ROI impact based on time savings
- All client-identifying data MUST be anonymized per the DATA ANONYMIZATION REQUIREMENTS below. Reflections containing obvious client names, org slugs, revenue figures, or account-specific data will fail automated validation and be rejected.

## DATA ANONYMIZATION REQUIREMENTS

**CRITICAL**: All reflection output MUST be anonymized to prevent client-identifying data from leaking into external systems (Supabase, Asana, Slack).

### MUST Anonymize
- **Client/company names** → Use "Client-A", "Client-B" (consistent within the reflection)
- **Account/record names** → "[Account Name]", "[Record Name]"
- **Revenue figures** → "[AMOUNT]" (never include dollar amounts, ARR, ACV, TCV, MRR)
- **Deal/contract names** → "[Deal Name]", "[Contract Name]"
- **Custom labels** → Note that customization exists without naming (e.g., "Quote object has been relabeled" NOT "Quote is called 'Order Form'")
- **Domain names** → "[client-domain]" (e.g., NOT "acme.io")
- **Employee/contact names** → "[Contact]", "[User]"
- **Org slugs** → "Client-A" (never use the actual org-slug like "acme-corp" or "hivemq")
- **Record counts with context** → "[N] accounts" instead of "47,000 accounts"

### Keep As-Is (DO NOT anonymize)
- Taxonomy categories (config/env, tool-contract, schema/parse, etc.)
- System error messages and stack traces
- Script names, agent names, hook names, file paths
- Platform names (Salesforce, HubSpot, Marketo, Asana)
- Salesforce object API names (SBQQ__Quote__c, Opportunity, etc.)
- Technical patterns and code snippets
- Priority levels (P0, P1, P2, P3)
- Blast radius assessments (LOW, MEDIUM, HIGH)

### Examples

**BAD (contains client data):**
```json
{
  "summary": "CPQ assessment for HiveMQ revealed Order Form configuration issues with $1.2M pipeline impact",
  "session_metadata": { "org": "hivemq" },
  "issues": [{"root_cause": "HiveMQ's custom Quote label caused discovery failure"}]
}
```

**GOOD (properly anonymized):**
```json
{
  "summary": "CPQ assessment revealed custom Quote object labeling caused discovery failure with significant pipeline impact",
  "session_metadata": { "org": "Client-A" },
  "issues": [{"root_cause": "Client's custom Quote label caused the SBQQ__Quote__c object discovery to fail"}]
}
```

---

## INTERNAL EXECUTION STEPS (For Agent Context)

Before and after generating the reflection JSON, you MUST perform these steps in order:

### Step 0: Load Auto-Captured Session Context (Hybrid Mode)
BEFORE analyzing the current session, load any auto-captured session context.

**Session Context Auto-Capture**:
The reflection system now automatically captures session metrics in the background:
- Files edited (paths, operations, line counts)
- Tools invoked (names, success rates, durations)
- Errors encountered (types, messages, contexts)
- Agents used (names, task summaries)

**Debugging Context Auto-Capture** (NEW):
The reflection system also extracts production debugging metrics:
- Trace IDs and span summaries from `~/.claude/logs/traces.jsonl`
- Correlation IDs and log metrics from `~/.claude/logs/unified.jsonl`
- Recovery events from `./.recovery-logs/`
- Instrumentation gap analysis (missing spans, correlation IDs)

To extract debugging context, use the debugging-context-extractor:
```bash
node "$PLUGIN_ROOT/scripts/lib/debugging-context-extractor.js" extract --window=60
```

If the file exists and returns data, include the `debugging_context` and `instrumentation_gaps` sections in the reflection JSON.

### Step 0b: Locate Plugin and Check for Pending Reflections
BEFORE analyzing the current session, locate the plugin installation using multi-path discovery:

```bash
# Check multiple possible locations (marketplace, development, legacy)
# First, resolve workspace root absolutely (PWD-independent)
WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"

SCRIPT_PATHS=()

# If CLAUDE_PLUGIN_ROOT is set, check both direct and workspace-root interpretations
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    SCRIPT_PATHS+=(
        "${CLAUDE_PLUGIN_ROOT}"                                    # Direct plugin path
        "${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core"        # Workspace root → installed
        "${CLAUDE_PLUGIN_ROOT}/plugins/opspal-core"                # Workspace root → source
    )
fi

# Absolute paths via git
if [ -n "$WORKSPACE_ROOT" ]; then
    SCRIPT_PATHS+=(
        "$WORKSPACE_ROOT/.claude-plugins/opspal-core"
        "$WORKSPACE_ROOT/plugins/opspal-core"
    )
fi

# Marketplace and relative fallbacks
SCRIPT_PATHS+=(
    "${HOME}/.claude/plugins/opspal-core@revpal-internal-plugins"
    "./plugins/opspal-core"
    "./.claude-plugins/opspal-core"
)

PLUGIN_ROOT=""
for p in "${SCRIPT_PATHS[@]}"; do
    if [ -n "$p" ] && [ -d "$p/scripts/lib" ]; then
        PLUGIN_ROOT="$p"
        echo "Found plugin: $PLUGIN_ROOT"
        break
    fi
done

if [ -z "$PLUGIN_ROOT" ]; then
    echo "Plugin not found - will save reflection locally only"
    echo "   Checked: ${SCRIPT_PATHS[*]}"
    echo "   Set CLAUDE_PLUGIN_ROOT to override"
fi
```

**What this does**:
- Searches for plugin installation in multiple locations
- Handles CLAUDE_PLUGIN_ROOT pointing to workspace root (not just plugin dir)
- Uses `git rev-parse --show-toplevel` for PWD-independent resolution
- Works in marketplace (~/.claude/plugins/), development (./plugins/), and legacy (./.claude-plugins/) installations
- Sets PLUGIN_ROOT for later steps

### Step 1: Save Reflection Locally
Save the JSON output to `.claude/SESSION_REFLECTION_<timestamp>.json` where `<timestamp>` is in format `YYYYMMDD_HHMMSS`.

Example: `.claude/SESSION_REFLECTION_20251013_143022.json`

Use the Write tool to save the file.

**IMPORTANT**: Ensure the JSON includes these required fields for Supabase submission:
- `summary` (string): Brief description of session
- `issues_identified` (array): Array of issue objects
- `plugin_name` (string): Auto-detected from plugin.json
- `plugin_version` (string): Auto-detected from plugin.json
- `org_name` (string): Auto-detected from context
- `total_issues` (number): Count of issues
- `priority_issues` (number): Count of P0/P1 issues
- `skills_used` (array): Array of skill IDs used during session (ACE Framework)

### Step 2: Attempt Submission (Fallback Mode)
After saving the reflection file, attempt submission directly as a fallback:

**IMPORTANT**: Use the PLUGIN_ROOT variable from Step 0 to locate the submission script. Try submission using Bash tool:
```bash
# Use the PLUGIN_ROOT variable already set in Step 0
node "$PLUGIN_ROOT/scripts/lib/submit-reflection.js" <reflection-path>
```

**Path Resolution**:
- PLUGIN_ROOT was set in Step 0 and contains the plugin installation directory
- Works in both development (.claude-plugins/opspal-core/) and marketplace installations (~/.claude/plugins/opspal-core@revpal-internal-plugins/)
- Never use hardcoded paths - always use $PLUGIN_ROOT for portability

**If submission succeeds**:
- Report success with confirmation

**If submission fails**:
- Report the error briefly
- Provide manual submission command for user using resolved path (auto-loads .env/.env.local)

**Error Handling**:
- Non-fatal: submission failure should NOT break /reflect command
- Always save reflection locally first (primary goal)
- Submission is secondary/best-effort

### Step 3: ACE Framework Skill Tracking (Automatic)

**Background processing** - Extract skills and update routing metrics automatically (runs silently in the background).

### Step 4: Report Status
Inform the user:
- Where the reflection was saved locally
- Submission status (succeeded, failed, or pending via hook)
- How to query their reflections
- Manual submission command if both attempts failed

---

## Querying Reflections

After submitting reflections, query the centralized database. Use the PLUGIN_ROOT variable set in Step 0:

```bash
# Your recent reflections
node "$PLUGIN_ROOT/scripts/lib/query-reflections.js" recent

# Most common issues across all users
node "$PLUGIN_ROOT/scripts/lib/query-reflections.js" topIssues

# Statistics by org
node "$PLUGIN_ROOT/scripts/lib/query-reflections.js" orgStats

# Search by keyword
node "$PLUGIN_ROOT/scripts/lib/query-reflections.js" search "automation"

# All reflections for your org
node "$PLUGIN_ROOT/scripts/lib/query-reflections.js" myOrg [org-name]
```

## Troubleshooting

### Issue: Supabase submission fails

**Symptoms**:
```
Connection test failed
Status: 401
This suggests the Supabase URL or API key is incorrect
```

**Cause**: Invalid credentials or network connectivity issue

**Solution**:
1. **Verify you're using the right key**:
   - `SUPABASE_SERVICE_ROLE_KEY` is recommended (bypasses RLS)
   - `SUPABASE_ANON_KEY` may fail due to Row Level Security

2. **Test credentials manually**:
   ```bash
   curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
   ```

3. **Manual submission fallback** (auto-loads .env/.env.local):
   ```bash
   # Use PLUGIN_ROOT from Step 0, or find script manually:
   node "$PLUGIN_ROOT/scripts/lib/submit-reflection.js" \
     .claude/SESSION_REFLECTION_20251016_170235.json
   ```

**Note**: Submission failure does NOT prevent the reflection from being saved locally.

### Issue: Connection refused (ECONNREFUSED)

**Symptoms**:
```
Network error: connect ECONNREFUSED
Cannot reach Supabase - check your internet connection
```

**Solution**: Check internet connection. Reflection is saved locally, submit when network restores.

### Issue: Empty or minimal reflection generated

**Symptoms**: "No significant development activity detected"

**Cause**: Session didn't include actual development work (read-only exploration)

**Solution**: Run `/reflect` after sessions that involve deployments, code changes, error troubleshooting, or agent invocations.

## Metadata Automatically Captured

Each reflection includes:
- **Plugin name and version** - Auto-detected from plugin.json
- **User email** - From `USER_EMAIL` env var (optional)
- **Org identifier** - Auto-detected from context
- **Focus area** - Determined from issue taxonomy
- **Duration** - Session length in minutes
- **Issue count** - Total and high-priority counts
- **ROI estimate** - Calculated from issue severity

## Privacy & Transparency

- **No secrets collected**: Reflections document patterns, not credentials
- **Technical PII sanitization**: Salesforce IDs, emails, API keys, file paths, IP addresses, JWT tokens are automatically redacted
- **Business data sanitization**: Revenue amounts, company names, deal names, business domains, record counts, and custom labels are automatically redacted
- **Two-tier model**: Org slugs kept in Supabase for internal analytics, anonymized in all external outputs (Asana, Slack)
- **LLM-level anonymization**: The `/reflect` command instructs the LLM to anonymize client data at generation time
- **Optional participation**: Works without Supabase configuration
- **Local-first**: Reflection saved locally before any network submission
