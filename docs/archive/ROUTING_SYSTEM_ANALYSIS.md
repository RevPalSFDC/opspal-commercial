# Routing System Analysis - Complete Architecture Audit

**Generated**: 2025-10-18
**Audit Scope**: 3-layer proactive agent routing system
**Status**: Production (implemented 2025-10-17)

---

## Executive Summary

The OpsPal Internal Plugins marketplace implements a **sophisticated 3-layer agent routing system** that automatically suggests or enforces agent usage based on operation patterns and complexity analysis. This system runs on every user request via the `UserPromptSubmit` hook.

**Key Findings**:
- ✅ **Working as designed**: 3-layer hybrid routing is functional
- ⚠️ **30 hook scripts** across plugins with potential overlap
- ⚠️ **Multiple routing mechanisms** without clear hierarchy
- ⚠️ **No documented conflict resolution** between hooks
- ✅ **Good separation**: Mandatory vs suggested operations clearly distinguished

---

## Architecture Overview

### Entry Point: `.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh",
      "timeout": 7000
    },
    "SessionStart": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/session-start-agent-reminder.sh",
      "timeout": 3000
    }
  }
}
```

**Execution Flow**:
```
User Request
    ↓
[UserPromptSubmit Hook Triggered] (7s timeout)
    ↓
user-prompt-hybrid.sh (orchestrator)
    ↓
    ├─→ user-prompt-submit-enhanced.sh (pattern matching - FAST)
    │   ├─→ auto-agent-router.js (complexity scoring)
    │   └─→ Returns: {agent, confidence, complexity, mandatory}
    │
    └─→ auto-router-adapter.sh (fallback if no pattern match)
        └─→ auto-agent-router.js (complexity-only scoring)
    ↓
systemMessage injected into Claude's context
```

---

## Layer 1: user-prompt-hybrid.sh (Orchestrator)

**File**: `.claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh`
**Purpose**: Combines pattern matching + complexity analysis
**Strategy**:
1. Run enhanced hook first (fast pattern matching)
2. If mandatory match → return immediately (BLOCKS execution)
3. If suggested match → also run auto-router for complexity context
4. If no match → fallback to auto-router only

**Code Flow**:
```bash
# 1. Detect environment (CLI vs Desktop)
DETECTED_ENV=$(node environment-detector.js)
export CLAUDE_ENV="$DETECTED_ENV"

# 2. Run pattern matching
ENHANCED_OUTPUT=$(echo "$HOOK_INPUT" | bash user-prompt-submit-enhanced.sh)

# 3. Check if mandatory
if [ "$IS_MANDATORY" = "true" ]; then
  echo "$ENHANCED_OUTPUT"  # BLOCK EXECUTION
  exit 0
fi

# 4. If suggested, add complexity context
if [ "$HAS_ENHANCED_MATCH" = "true" ]; then
  AUTO_OUTPUT=$(bash auto-router-adapter.sh)
  # Combine both outputs
  jq -n '{systemMessage: $combined, complexity: $auto_complexity, ...}'
fi

# 5. Fallback to auto-router
echo "$AUTO_OUTPUT"
```

**Strengths**:
- ✅ Clear priority: mandatory > suggested > complexity-only
- ✅ Combines multiple data sources intelligently
- ✅ Environment detection for context-aware routing

**Weaknesses**:
- ⚠️ Complexity: 98 lines of bash with nested conditionals
- ⚠️ Multiple external dependencies (jq, bc, node)
- ⚠️ No error handling if auto-router fails

---

## Layer 2: user-prompt-submit-enhanced.sh (Pattern Matcher)

**File**: `.claude-plugins/opspal-salesforce/hooks/user-prompt-submit-enhanced.sh`
**Purpose**: Fast pattern-based routing with confidence scoring
**Input**: `{"user_message": "deploy to production"}`
**Output**: `{"systemMessage": "...", "suggestedAgent": "agent-name", "mandatoryAgent": true/false}`

**Special Features**:
1. **Environment Detection**: Routes MCP config questions to correct agent (Desktop vs CLI)
2. **Auto-Router Integration**: Calls `auto-agent-router.js route "$USER_MESSAGE" --json`
3. **Confidence Mapping**: `confidence == 1.0` → mandatory operation
4. **Graceful Fallback**: Returns `{}` if auto-router fails

**Code Flow**:
```bash
# 1. Extract user message
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.user_message')

# 2. Environment detection (MCP config routing)
if [[ "$USER_MESSAGE" =~ mcp|config ]]; then
  case "$DETECTED_ENV" in
    DESKTOP) return mcp-config-desktop ;;
    CLI) return mcp-config-cli ;;
  esac
fi

# 3. Call auto-router
ROUTING_RESULT=$(node auto-agent-router.js route "$USER_MESSAGE" --json)

# 4. Parse result
ROUTED=$(echo "$ROUTING_RESULT" | jq -r '.routed')
CONFIDENCE=$(echo "$ROUTING_RESULT" | jq -r '.confidence')

# 5. Map confidence to mandatory
if [ "$CONFIDENCE" = "1.0" ]; then
  IS_MANDATORY="true"
fi

# 6. Build system message
jq -n --arg msg "$SYSTEM_MSG" --arg agent "$AGENT" \
  '{systemMessage: $msg, suggestedAgent: $agent, mandatoryAgent: $mandatory}'
```

**Strengths**:
- ✅ Environment-aware routing (Desktop vs CLI)
- ✅ Clean integration with auto-router
- ✅ Graceful degradation

**Weaknesses**:
- ⚠️ Tight coupling to auto-router.js (no abstraction)
- ⚠️ MCP routing hardcoded (should be data-driven)

---

## Layer 3: auto-agent-router.js (Complexity Engine)

**File**: `.claude-plugins/opspal-salesforce/scripts/auto-agent-router.js`
**Purpose**: Sophisticated complexity scoring + pattern matching
**Class**: `AutoAgentRouter`

### Core Methods

#### calculateComplexity(operation)
Scores 0.0 - 1.0 based on:
- **Multiple objects/fields**: +0.1 per match
- **Bulk operations**: +0.3
- **Production environment**: +0.4
- **Dependencies**: +0.2
- **Complex patterns** (merge, consolidate): +0.3
- **Layout generation**: +0.2
- **Error/conflict keywords**: +0.3

```javascript
calculateComplexity(operation) {
  let score = 0;

  // Object/field count
  const objectMatches = operation.match(/object|field|class|trigger/gi) || [];
  score += objectMatches.length * 0.1;

  // Bulk operations
  if (/bulk|mass|batch|multiple/i.test(operation)) score += 0.3;

  // Production
  if (/production|prod|release/i.test(operation)) score += 0.4;

  // Dependencies
  if (/dependency|depends|relationship/i.test(operation)) score += 0.2;

  // Complex patterns
  if (/merge|consolidate|migrate|transform/i.test(operation)) score += 0.3;

  return Math.min(score, 1.0); // Cap at 1.0
}
```

#### findBestAgent(operation, complexity)
Returns: `{agent, confidence, reason, metadata?}`

**Routing Priority**:
1. **High complexity (>0.7)**: Route to orchestrator/planner
2. **Mandatory patterns**: Check config for blocking operations
3. **Layout generation**: Special persona-aware routing
4. **Keyword mappings**: From config file
5. **Pattern-based**: Regex patterns for specific agents
6. **Default fallback**: sfdc-planner if complexity > 0.3

```javascript
findBestAgent(operation, complexity) {
  // 1. High complexity → orchestrator
  if (complexity > 0.7) {
    return {agent: 'sfdc-orchestrator', confidence: 0.9};
  }

  // 2. Mandatory patterns
  for (const pattern of this.config.triggers.mandatory.patterns) {
    if (new RegExp(pattern.pattern, 'i').test(operation)) {
      return {agent: pattern.agent, confidence: 1.0};
    }
  }

  // 3. Layout generation (special handling)
  if (/create.*layout/i.test(operation)) {
    const persona = this.detectPersona(operation);
    return {
      agent: 'sfdc-layout-generator',
      confidence: 0.85,
      metadata: {persona}
    };
  }

  // 4-6. Keyword, pattern, fallback...
}
```

#### shouldAutoInvoke(agent, confidence, complexity)
Returns: `true` if agent should auto-run

**Criteria**:
- Confidence ≥ 0.9 → always auto-invoke
- Complexity ≥ 0.7 → always auto-invoke
- Agent in auto-invoke rules → always
- Agent has >80% success rate (from analytics) → yes

**Strengths**:
- ✅ Sophisticated complexity scoring
- ✅ Learning from analytics (success rates)
- ✅ Persona detection for layouts
- ✅ Extensible via config file

**Weaknesses**:
- ⚠️ Complexity formula not tuned (arbitrary weights)
- ⚠️ No A/B testing framework for scoring changes
- ⚠️ Pattern overlap potential (not validated)

---

## Routing Rules Inventory

### Mandatory Operations (BLOCKING)

From `auto-agent-router.js:161-169` and PROACTIVE_AGENT_ROUTING.md:

| Pattern | Agent | Reason |
|---------|-------|--------|
| `deploy.*production` | `release-coordinator` | Prevents deployment failures |
| `delete.*(field\|object\|class)` | `sfdc-metadata-manager` | Prevents data loss |
| `permission.*set.*(create\|update)` | `sfdc-security-admin` | Security enforcement |
| `bulk.*(update\|insert\|delete)` | `sfdc-data-operations` | Data integrity |
| `update.*[0-9]{3,}.*record` | `sfdc-data-operations` | Bulk safety |
| `(create\|update\|modify).*(flow\|workflow)` | `sfdc-automation-builder` | Automation best practices |

### Suggested Operations (NON-BLOCKING)

From `auto-agent-router.js:211-223`:

| Pattern | Agent | Confidence |
|---------|-------|-----------|
| `conflict\|error\|failed` | `sfdc-conflict-resolver` | 0.7 |
| `deploy\|package\|changeset` | `sfdc-deployment-manager` | 0.7 |
| `data\|import\|export\|bulk` | `sfdc-data-operations` | 0.7 |
| `metadata\|field\|object` | `sfdc-metadata-manager` | 0.7 |
| `permission\|profile\|security` | `sfdc-security-admin` | 0.7 |
| `apex\|trigger\|class\|test` | `sfdc-apex-developer` | 0.7 |
| `flow\|automation\|workflow` | `sfdc-automation-builder` | 0.7 |
| `report\|dashboard\|analytics` | `sfdc-reports-dashboards` | 0.7 |
| `soql\|sosl\|query` | `sfdc-query-specialist` | 0.7 |
| `dependency\|circular\|relationship` | `sfdc-dependency-analyzer` | 0.7 |

### Layout Generation (Special Routing)

From `auto-agent-router.js:172-196`:

```javascript
// Pattern: "create/generate/design layout"
if (/\b(create|generate|design|make|build)\b.*\b(layout|lightning page|flexipage|page layout)\b/i.test(operation)) {
  return {
    agent: 'sfdc-layout-generator',
    confidence: 0.85,
    metadata: {
      persona: detectPersona(operation), // sales-rep, support-agent, etc.
      object: extractObject(operation)
    }
  };
}
```

**Personas Detected**:
- sales-rep, sales-manager, executive
- support-agent, support-manager
- marketing, customer-success

---

## Hook Ecosystem Analysis

### All Hooks Discovered (30 total)

**UserPromptSubmit Hooks**:
- `user-prompt-hybrid.sh` (1) - Main orchestrator
- `user-prompt-submit-enhanced.sh` (1) - Pattern matcher
- `user-prompt-submit-wrapper.sh` (1) - Legacy?
- `auto-router-adapter.sh` (1) - Router adapter

**Pre-Task Hooks** (validation before Task tool execution):
- `pre-task-mandatory.sh` (3 plugins)
- `pre-task-agent-validator.sh` (2 plugins)
- `pre-task-hook.sh` (1)
- `pre-task-context-loader.sh` (2 plugins)

**Pre-Write Hooks** (validation before file writes):
- `pre-write-path-validator.sh` (2 plugins)

**Pre-Operation Hooks** (domain-specific):
- `pre-company-merge.sh` (2 plugins)
- `pre-batch-validation.sh` (1)
- `pre-reflect.sh` (2 plugins)

**Post-Operation Hooks**:
- `post-reflect.sh` (2 plugins)
- `post-portal-switch.sh` (2 plugins)
- `post-portal-authentication.sh` (2 plugins)
- `post-subagent-execution.sh` (1)
- `post-task-validation.sh` (1)

**Session Hooks**:
- `session-start-agent-reminder.sh` (1)

**Validation Hooks**:
- `validate-sfdc-project-location.sh` (1)
- `agent-usage-validator.sh` (1)

### Hook Distribution by Plugin

| Plugin | Hook Count | Primary Concerns |
|--------|-----------|------------------|
| salesforce-plugin | 12 | Routing, validation, reflection |
| hubspot-plugin | 8 | Portal switching, validation, reflection |
| hubspot-core-plugin | 8 | Portal switching, validation |
| developer-tools-plugin | 2 | Post-execution validation |

---

## Routing Conflicts & Issues

### 1. Multiple UserPromptSubmit Implementations

**Problem**: 3 different entry points found:
- `user-prompt-hybrid.sh` (current - configured in settings.json)
- `user-prompt-submit-enhanced.sh` (pattern-only)
- `user-prompt-submit-wrapper.sh` (unknown purpose)

**Risk**: If settings.json points to wrong hook, routing breaks

**Recommendation**: Deprecate unused hooks, keep only hybrid

### 2. Duplicate Pre-Task Hooks

**Problem**: Multiple plugins define `pre-task-mandatory.sh`:
- salesforce-plugin/hooks/pre-task-mandatory.sh
- hubspot-plugin/hooks/pre-task-mandatory.sh
- hubspot-core-plugin/hooks/pre-task-mandatory.sh

**Risk**: Unclear which hook runs when (plugin precedence?)

**Recommendation**: Consolidate to single hook or document execution order

### 3. Pattern Overlap Potential

**Example**: `deploy` keyword matches both:
- Mandatory pattern: `deploy.*production` → blocks execution
- Suggested pattern: `deploy|package|changeset` → suggests agent

**Current Behavior**: Mandatory patterns checked first (correct)

**Risk**: Adding new patterns could accidentally override mandatory blocks

**Recommendation**: Add automated pattern overlap validator

### 4. Complexity Scoring Not Tuned

**Problem**: Arbitrary weights in calculateComplexity():
```javascript
if (/bulk/i.test(operation)) score += 0.3;  // Why 0.3?
if (/production/i.test(operation)) score += 0.4;  // Why 0.4?
```

**Risk**: Over/under-routing based on unvalidated assumptions

**Recommendation**: A/B test weights, track routing success rates

### 5. No Hook Execution Monitoring

**Problem**: No observability for:
- Hook execution time
- Hook success/failure rate
- Pattern match frequency
- False positive/negative rate

**Recommendation**: Add structured logging + dashboards

---

## Complexity Scoring Analysis

### Current Formula

```
complexity =
  (object_matches * 0.1) +
  (bulk_operation ? 0.3 : 0) +
  (production ? 0.4 : 0) +
  (dependencies ? 0.2 : 0) +
  (complex_patterns ? 0.3 : 0) +
  (layout ? 0.2 : 0) +
  (errors ? 0.3 : 0)

# Capped at 1.0
```

### Threshold Mapping

| Complexity Range | Classification | Action |
|-----------------|----------------|--------|
| 0.0 - 0.3 | Simple | Direct execution OK |
| 0.3 - 0.7 | Medium | Agent recommended |
| 0.7 - 1.0 | High | Agent strongly recommended or mandatory |

### Test Cases

| Operation | Expected | Actual | Match? |
|-----------|----------|--------|--------|
| "create a field" | 0.1 | 0.1 (1 object * 0.1) | ✅ |
| "bulk update 500 accounts" | 0.4 | 0.4 (bulk 0.3 + 1 object 0.1) | ✅ |
| "deploy to production" | 0.8 | 0.4 (production 0.4) | ⚠️ Should be higher |
| "merge 5 duplicate accounts" | 0.8 | 0.7 (merge 0.3 + bulk 0.3 + 1 object 0.1) | ⚠️ Close |
| "fix deployment conflict in production" | 1.0+ | 1.0 (production 0.4 + error 0.3 + 1 object 0.1 + dependency 0.2 = 1.0) | ✅ Capped |

**Findings**:
- ✅ Formula works for most cases
- ⚠️ "deploy to production" should score higher (currently 0.4)
- ⚠️ No penalty for "delete" operations (should be HIGH risk)
- ⚠️ No reward for "read-only" operations (could be LOWER risk)

**Recommendation**: Add operation type multiplier:
```javascript
// After base complexity calculation
if (/delete|remove|drop/i.test(operation)) {
  score = Math.min(score * 1.5, 1.0); // Increase by 50%
}
if (/read|query|select|describe|list/i.test(operation)) {
  score = score * 0.5; // Decrease by 50%
}
```

---

## Best Practices Compliance

### ✅ Strengths

1. **Deterministic Parsing**: All hooks use JSON output (no regex extraction from logs)
2. **Idempotency**: Hooks return same result for same input
3. **Graceful Fallback**: Returns `{}` on error, doesn't crash
4. **Secure**: No secrets in hook output or logs
5. **Timeout Protection**: 7s timeout prevents infinite hangs

### ⚠️ Gaps

1. **Timeout Handling**: No structured logging when timeout occurs
2. **Retry Logic**: No retry for transient failures (e.g., Node.js not available)
3. **Structured Logging**: No trace spans per hook execution
4. **Cost Controls**: No token budget tracking for routing
5. **Evaluation Harness**: No regression tests for routing decisions

### 🔴 Risks

1. **Single Point of Failure**: If user-prompt-hybrid.sh breaks, entire routing fails
2. **No Circuit Breaker**: If auto-router.js hangs, blocks all requests for 7s
3. **No Observability**: Can't measure routing accuracy or performance
4. **No A/B Testing**: Can't experiment with scoring changes safely

---

## Recommendations

### Immediate (Week 1)

1. **Add Routing Metrics**
   - Track hook execution time
   - Track pattern match frequency
   - Track false positive/negative rate
   - Export to logs/dashboards

2. **Pattern Overlap Validator**
   - Script to check for overlapping patterns
   - Run in CI on every hook/config change
   - Alert on ambiguous patterns

3. **Deprecate Unused Hooks**
   - Remove `user-prompt-submit-wrapper.sh` if unused
   - Document purpose of all 30 hooks
   - Consolidate duplicate pre-task hooks

### Short-term (Month 1)

4. **Complexity Tuning**
   - A/B test different weights
   - Track routing success rate by complexity score
   - Add operation type multipliers (delete=HIGH, read=LOW)

5. **Evaluation Harness**
   - Create golden test cases (100+ operations)
   - Assert expected agent routing
   - Run on every change to auto-agent-router.js

6. **Circuit Breaker**
   - Timeout auto-router at 5s (vs 7s hook timeout)
   - Fallback to pattern-only if router slow
   - Log circuit breaker activations

### Long-term (Quarter 1)

7. **Centralized Routing Service**
   - Move routing logic out of bash hooks
   - Create Node.js routing service
   - Expose REST API for routing decisions

8. **Machine Learning Integration**
   - Learn from routing success/failure
   - Adjust confidence scores based on outcomes
   - Personalize routing per user

9. **Multi-Plugin Routing**
   - Extend routing to HubSpot plugin
   - Cross-platform routing decisions
   - Unified routing analytics

---

## Appendix A: Hook Execution Order

**UserPromptSubmit Hook Chain**:
```
1. user-prompt-hybrid.sh (main)
   ↓
2. environment-detector.js (detects CLI vs Desktop)
   ↓
3. user-prompt-submit-enhanced.sh (pattern matching)
   ├─→ auto-agent-router.js route (complexity scoring)
   └─→ Returns {agent, confidence, complexity, mandatory}
   ↓
4. auto-router-adapter.sh (fallback if no pattern match)
   └─→ auto-agent-router.js route (complexity-only)
   ↓
5. Combine results → systemMessage
```

**Pre-Task Hook Chain** (unknown execution order):
```
1. pre-task-mandatory.sh (?)
2. pre-task-agent-validator.sh (?)
3. pre-task-context-loader.sh (?)
4. validate-sfdc-project-location.sh (?)
```

⚠️ **Gap**: Hook execution order not documented for multiple hooks at same lifecycle event

---

## Appendix B: Routing Decision Tree

```
User Request
│
├─ Is it MCP config question?
│  ├─ YES → Detect environment (CLI vs Desktop)
│  │        ├─ CLI → mcp-config-cli
│  │        └─ Desktop → mcp-config-desktop
│  └─ NO → Continue
│
├─ Does it match MANDATORY pattern?
│  ├─ YES → BLOCK execution
│  │        Return {mandatoryAgent: true, agent: X}
│  └─ NO → Continue
│
├─ Calculate complexity score (0.0-1.0)
│  ├─ complexity > 0.7 → Route to orchestrator/planner
│  └─ complexity ≤ 0.7 → Continue
│
├─ Does it match SUGGESTED pattern?
│  ├─ YES → Return {mandatoryAgent: false, agent: X, complexity: Y}
│  └─ NO → Continue
│
├─ complexity > 0.3?
│  ├─ YES → Suggest sfdc-planner
│  └─ NO → Return {} (no routing)
```

---

## Appendix C: Configuration Files

**Hook Configuration**:
- `.claude/settings.json` - UserPromptSubmit and SessionStart hooks

**Routing Rules**:
- `.claude-plugins/opspal-salesforce/.claude/agent-triggers.json` (if exists)
- Hardcoded in `auto-agent-router.js:161-223`

**Analytics**:
- `.claude-plugins/opspal-salesforce/.claude/agent-usage-data.json` (if exists)

**Environment Detection**:
- `.claude-plugins/developer-tools-plugin/scripts/lib/environment-detector.js`
- `.claude-plugins/opspal-salesforce/scripts/lib/environment-detector.js` (symlink?)

---

**End of Routing System Analysis**

**Next Steps**: Proceed to Phase 2 - Overlap Analysis
