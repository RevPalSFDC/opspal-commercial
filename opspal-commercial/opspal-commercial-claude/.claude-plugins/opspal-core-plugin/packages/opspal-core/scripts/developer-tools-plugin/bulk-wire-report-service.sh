#!/bin/bash
#
# Bulk Wire Report Service to Agents
#
# Updates all report-generating agents to use the centralized report_service
#

set -euo pipefail

# Define the report service wiring content
REPORT_SERVICE_SECTION='
## 📊 Report Generation (CENTRALIZED SERVICE)

**IMPORTANT**: All report generation now uses the **centralized report_service** for consistency, quality, and zero hallucinations.

### Service Contract
**Path**: `../../../developer-tools-plugin/scripts/lib/report-service.js`
**Documentation**: `../../../developer-tools-plugin/config/central_services.json`

### Quick Reference

```javascript
const ReportService = require('\''../../../developer-tools-plugin/scripts/lib/report-service.js'\'');
const service = new ReportService();

const report = await service.generateReport({
  report_type: '\''assessment'\'',  // or exec_update, audit, postmortem, etc.
  audience: '\''exec'\'',          // or engineering, customer, pm, gtm, internal
  objectives: [
    '\''Primary goal of the report'\'',
    '\''Secondary goal if applicable'\''
  ],
  key_messages: [
    '\''Top finding 1'\'',
    '\''Top finding 2'\'',
    '\''Top finding 3'\''
  ],
  inputs: {
    facts: [
      '\''Data point 1 from analysis'\'',
      '\''Data point 2 from queries'\''
    ],
    metrics: {
      score: 85,
      issues_found: 12,
      roi_annual: 125000
    },
    risks: ['\''Risk 1'\'', '\''Risk 2'\''],
    decisions: ['\''Decision 1'\'', '\''Decision 2'\''],
    tables: [
      {
        headers: ['\''Column 1'\'', '\''Column 2'\''],
        rows: [['\''Data 1'\'', '\''Data 2'\'']]
      }
    ]
  },
  constraints: {
    length: '\''medium'\'',       // short (<500 words), medium (500-1500), long (>1500)
    style: '\''analytical'\'',    // neutral, persuasive, analytical
    pii_policy: '\''mask'\'',     // mask, remove, allow_internal
    format: '\''markdown'\''      // markdown, html, pdf, json
  }
});

// Use report.content for your output
console.log(report.content);
```

### When to Use

✅ **Use report_service for:**
- Executive summaries (audience='\''exec'\'')
- Customer-facing reports (pii_policy='\''mask'\'')
- Audit/assessment reports (report_type='\''audit'\''/'\''assessment'\'')
- PDF/HTML output (format='\''pdf'\''/'\''html'\'')

❌ **Continue local generation for:**
- Internal debug logs (tokens < 300)
- Real-time query results
- Temporary analysis notes

### Automatic Routing

The routing enforcer hook automatically ensures compliance:
- Blocks direct report generation for exec/customer audiences
- Enforces PII masking policies
- Logs all routing decisions
- Validates zero hallucinations

See: `.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/logs/routing_decisions.jsonl`
'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DOMAIN_ROOT="$SCRIPT_DIR/../../../domains/salesforce"
LEGACY_ROOT="$PLUGIN_ROOT/../salesforce-plugin"

AGENT_ROOT="$DOMAIN_ROOT"
if [ ! -d "$AGENT_ROOT/agents" ]; then
  AGENT_ROOT="$LEGACY_ROOT"
fi

# Agents to update
AGENTS=(
  "$AGENT_ROOT/agents/sfdc-cpq-assessor.md"
  "$AGENT_ROOT/agents/sfdc-automation-auditor.md"
  "$AGENT_ROOT/agents/sfdc-quality-auditor.md"
)

echo "=== Bulk Wiring Report Service to Agents ==="
echo ""

for agent in "${AGENTS[@]}"; do
  if [[ ! -f "$agent" ]]; then
    echo "⚠️  Agent not found: $agent"
    continue
  fi

  echo "📝 Updating $(basename "$agent")..."

  # Check if already wired
  if grep -q "CENTRALIZED SERVICE" "$agent"; then
    echo "  ✅ Already wired - skipping"
    continue
  fi

  # Find insertion point (before ## Advanced Features or at end)
  if grep -q "## Advanced Features" "$agent"; then
    # Insert before Advanced Features
    awk -v section="$REPORT_SERVICE_SECTION" '
      /^## Advanced Features/ {
        print section
        print ""
      }
      {print}
    ' "$agent" > "$agent.tmp"
    mv "$agent.tmp" "$agent"
    echo "  ✅ Inserted before Advanced Features section"
  else
    # Append to end
    echo "$REPORT_SERVICE_SECTION" >> "$agent"
    echo "  ✅ Appended to end of agent"
  fi
done

echo ""
echo "✅ Bulk wiring complete!"
echo ""
echo "Next steps:"
echo "1. Review updated agents"
echo "2. Run validation: node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-migration.js"
echo "3. Test agents with report generation tasks"
