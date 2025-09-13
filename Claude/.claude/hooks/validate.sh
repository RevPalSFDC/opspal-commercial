#!/usr/bin/env bash
# Session validation hook for parent orchestrator
set -euo pipefail

# Helper functions
err(){ jq -n --arg m "$1" '{"continue":false,"stopReason":$m}'; exit 1; }
ok(){ jq -n '{"continue":true}'; }

# Check we're in the parent Claude directory
if [[ ! -f "CLAUDE.md" ]] || [[ ! -d ".claude" ]]; then
  err "Not in parent Claude orchestrator directory. Expected CLAUDE.md and .claude/"
fi

# Check children.yaml exists
if [[ ! -f "children.yaml" ]]; then
  echo "⚠️  Warning: children.yaml not found. Creating template..." >&2
  cat > children.yaml << 'EOF'
# Registry of child projects to audit
projects:
  - name: platforms/SFDC
    path: ../platforms/SFDC
    description: Salesforce automation project
  - name: platforms/HS
    path: ../platforms/HS
    description: HubSpot integration project
  - name: Agents
    path: ../Agents
    description: Main RevPal agents (refactored)
EOF
  echo "✅ Created children.yaml template" >&2
fi

# Ensure reports directory exists
mkdir -p reports

# Validate at least one child project exists
if command -v yq &> /dev/null; then
  child_count=$(yq eval '.projects | length' children.yaml 2>/dev/null || echo "0")
  if [[ "$child_count" == "0" ]]; then
    err "No child projects defined in children.yaml"
  fi
fi

# Success message
echo "🔍 Parent orchestrator ready for auditing" >&2
echo "📂 Reports will be saved to: $(pwd)/reports/" >&2

ok