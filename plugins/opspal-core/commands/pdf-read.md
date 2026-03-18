---
name: pdf-read
description: Intelligently read large PDFs using optimized page ranges. Leverages Claude Code v2.1.30+ pages parameter.
argument-hint: "<path> [query]"
visibility: user-invocable
arguments:
  - name: path
    description: Path to the PDF file
    required: true
  - name: query
    description: What to search for in the PDF (e.g., "validation rules", "CPQ findings")
    required: false
tags:
  - pdf
  - document
  - read
  - context
aliases:
  - read-pdf
  - pdf
---

# PDF Read Command

Intelligently read large PDF documents by analyzing structure and selecting relevant page ranges.

## Usage

```bash
/pdf-read <path> [query]
```

## Examples

```bash
# Analyze PDF and get reading recommendations
/pdf-read ./reports/acme-audit.pdf

# Get pages relevant to a specific topic
/pdf-read ./reports/acme-audit.pdf "validation rules"

# Read CPQ-related content
/pdf-read ./exports/salesforce-config.pdf "cpq pricing"
```

## Execution Steps

When this command is invoked:

1. **Check if PDF exists** at the specified path
2. **Run PDF Context Optimizer** to analyze structure:
   ```bash
   # Source shared path resolver
   RESOLVE_SCRIPT=""
   for _candidate in \
     "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
     "$HOME/.claude/plugins/cache/revpal-internal-plugins/opspal-core"/*/scripts/resolve-script.sh \
     "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
     "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
     "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
     [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
   done
   if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
   source "$RESOLVE_SCRIPT"

   node "$(find_script "pdf-context-optimizer.js")" analyze <path>
   ```
3. **If query provided**, get relevant pages:
   ```bash
   node "$(find_script "pdf-context-optimizer.js")" pages <path> "<query>"
   ```
4. **Read the recommended pages** using Claude Code's Read tool with `pages` parameter
5. **Summarize findings** based on the query

## How It Works

The PDF Context Optimizer:
- Analyzes PDF structure and estimates sections
- Matches your query to relevant sections
- Returns optimal page ranges (max 20 per read)
- Caches structure for 24 hours

## Document Types

Auto-detected from filename/path:
- **Salesforce**: Objects, flows, permissions, validation rules
- **HubSpot**: Workflows, properties, forms
- **Audit/Assessment**: Executive summary, findings, recommendations
- **Report**: Overview, metrics, analysis

## Notes

- Large PDFs (>10 pages) benefit most from this optimization
- Section boundaries are estimated - actual content may vary
- For very large PDFs (100+ pages), consider using chunking:
  ```bash
  node "$(find_script "pdf-context-optimizer.js")" chunks <path>
  ```
