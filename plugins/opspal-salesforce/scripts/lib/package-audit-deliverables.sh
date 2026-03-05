#!/bin/bash

###############################################################################
# Package Audit Deliverables
#
# Packages all quality audit artifacts into a timestamped archive.
# Invoked by Stop hook in sfdc-quality-auditor agent.
#
# Usage:
#   bash package-audit-deliverables.sh <working-dir> [--org-alias <alias>]
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
WORKING_DIR="$1"
ORG_ALIAS="${2:-unknown}"

if [ $# -lt 1 ]; then
    echo "Usage: bash package-audit-deliverables.sh <working-dir> [--org-alias <alias>]"
    echo ""
    echo "Packages quality audit artifacts into timestamped archive."
    echo "Invoked by Stop hook in sfdc-quality-auditor agent."
    exit 1
fi

# Validate working directory
if [ ! -d "$WORKING_DIR" ]; then
    echo -e "${RED}❌ Working directory not found: $WORKING_DIR${NC}"
    exit 1
fi

# Extract org alias from --org-alias flag if provided
if [ "$ORG_ALIAS" = "--org-alias" ] && [ $# -ge 3 ]; then
    ORG_ALIAS="$3"
fi

echo -e "${BLUE}📦 Package Audit Deliverables${NC}\n"
echo -e "Working Dir: ${WORKING_DIR}"
echo -e "Org Alias: ${ORG_ALIAS}\n"

# Phase 1: Collect artifacts
echo -e "${GREEN}Phase 1: Collecting artifacts...${NC}"

# Find all relevant files
REPORTS=$(find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.html" \) ! -name "*.mmd" | wc -l | tr -d ' ')
DIAGRAMS=$(find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*diagram*" -o -name "*drift*" -o -name "*consolidation*" -o -name "*trends*" -o -name "*conflict*" \) | wc -l | tr -d ' ')
DATA=$(find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*.json" -o -name "*.csv" \) | wc -l | tr -d ' ')

echo -e "  ✅ Found ${REPORTS} reports"
echo -e "  ✅ Found ${DIAGRAMS} diagrams"
echo -e "  ✅ Found ${DATA} data files\n"

# Phase 2: Create archive directory structure
echo -e "${GREEN}Phase 2: Creating archive structure...${NC}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="quality-audit-${ORG_ALIAS}-${TIMESTAMP}"
ARCHIVE_DIR="${WORKING_DIR}/${ARCHIVE_NAME}"

mkdir -p "${ARCHIVE_DIR}"/{reports,diagrams,data,metadata}

echo -e "  ✅ Created ${ARCHIVE_DIR}\n"

# Phase 3: Copy files to archive structure
echo -e "${GREEN}Phase 3: Organizing files...${NC}"

# Copy reports
if [ "$REPORTS" -gt 0 ]; then
    find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*.md" -o -name "*.html" \) ! -name "*.mmd" \
        -exec cp {} "${ARCHIVE_DIR}/reports/" \;
    echo -e "  ✅ Copied ${REPORTS} reports"
fi

# Copy diagrams
if [ "$DIAGRAMS" -gt 0 ]; then
    find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*diagram*" -o -name "*drift*" -o -name "*consolidation*" -o -name "*trends*" -o -name "*conflict*" -o -name "*.mmd" \) \
        -exec cp {} "${ARCHIVE_DIR}/diagrams/" \;
    echo -e "  ✅ Copied ${DIAGRAMS} diagrams"
fi

# Copy data files
if [ "$DATA" -gt 0 ]; then
    find "$WORKING_DIR" -maxdepth 1 -type f \( -name "*.json" -o -name "*.csv" \) \
        -exec cp {} "${ARCHIVE_DIR}/data/" \;
    echo -e "  ✅ Copied ${DATA} data files"
fi

echo ""

# Phase 4: Generate metadata
echo -e "${GREEN}Phase 4: Generating metadata...${NC}"

cat > "${ARCHIVE_DIR}/metadata/package-info.json" <<EOF
{
  "packageName": "${ARCHIVE_NAME}",
  "orgAlias": "${ORG_ALIAS}",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "generatedBy": "package-audit-deliverables.sh",
  "hookType": "Stop",
  "agentName": "sfdc-quality-auditor",
  "artifactCounts": {
    "reports": ${REPORTS},
    "diagrams": ${DIAGRAMS},
    "data": ${DATA},
    "total": $((REPORTS + DIAGRAMS + DATA))
  },
  "structure": {
    "reports": "Markdown and HTML audit reports",
    "diagrams": "Mermaid diagrams and visualizations",
    "data": "JSON and CSV data files",
    "metadata": "Package metadata and manifest"
  }
}
EOF

echo -e "  ✅ Generated package-info.json\n"

# Phase 5: Generate README
echo -e "${GREEN}Phase 5: Generating README...${NC}"

cat > "${ARCHIVE_DIR}/README.md" <<EOF
# Quality Audit Deliverables - ${ORG_ALIAS}

**Generated:** $(date)
**Archive:** ${ARCHIVE_NAME}

## Contents

### Reports (${REPORTS} files)
Executive summaries, detailed analysis, and findings reports.

### Diagrams (${DIAGRAMS} files)
Visual representations of metadata drift, validation rule consolidation, health trends, and flow conflicts.

### Data (${DATA} files)
Raw data extracts in JSON and CSV formats for further analysis.

### Metadata
Package information and manifest files.

## Usage

### View Reports
Navigate to \`reports/\` directory and open any .md or .html file.

### View Diagrams
Navigate to \`diagrams/\` directory. Mermaid diagrams (.mmd) can be viewed at:
- https://mermaid.live/
- VS Code with Mermaid extension
- GitHub (renders .mmd files automatically)

### Analyze Data
Import JSON/CSV files from \`data/\` directory into your analysis tool.

## Quality Score

See \`reports/quality-audit-summary-*.html\` for the consolidated quality score and executive summary.

## Support

For questions about this audit, contact the RevOps team or review the audit methodology documentation.

---
Generated by sfdc-quality-auditor agent (Stop hook)
EOF

echo -e "  ✅ Generated README.md\n"

# Phase 6: Create compressed archive
echo -e "${GREEN}Phase 6: Creating compressed archive...${NC}"

ARCHIVE_ZIP="${ARCHIVE_NAME}.zip"
cd "$WORKING_DIR"

zip -q -r "$ARCHIVE_ZIP" "$ARCHIVE_NAME"

ARCHIVE_SIZE=$(du -h "${ARCHIVE_ZIP}" | cut -f1)

echo -e "  ✅ Created ${ARCHIVE_ZIP} (${ARCHIVE_SIZE})\n"

# Phase 7: Copy to instances directory (if applicable)
echo -e "${GREEN}Phase 7: Archiving to instances directory...${NC}"

INSTANCES_DIR="$(dirname "$(dirname "$WORKING_DIR")")/instances/${ORG_ALIAS}/quality-audits"

if [ -d "$(dirname "$INSTANCES_DIR")" ]; then
    mkdir -p "$INSTANCES_DIR"
    cp "$ARCHIVE_ZIP" "$INSTANCES_DIR/"
    echo -e "  ✅ Copied to ${INSTANCES_DIR}/\n"
else
    echo -e "  ⚠️  Instances directory not found, skipping archive\n"
fi

# Phase 8: Generate summary
echo -e "${GREEN}📊 Packaging Summary${NC}\n"

echo -e "  Archive: ${YELLOW}${ARCHIVE_ZIP}${NC}"
echo -e "  Size: ${ARCHIVE_SIZE}"
echo -e "  Location: ${WORKING_DIR}/${ARCHIVE_ZIP}"
if [ -d "$INSTANCES_DIR" ]; then
    echo -e "  Backup: ${INSTANCES_DIR}/${ARCHIVE_ZIP}"
fi
echo -e "\n  Contents:"
echo -e "    📝 ${REPORTS} reports"
echo -e "    📊 ${DIAGRAMS} diagrams"
echo -e "    💾 ${DATA} data files"
echo -e "    ✨ $((REPORTS + DIAGRAMS + DATA)) total artifacts"

echo -e "\n${GREEN}✅ Packaging Complete${NC}"

# Return paths for downstream hooks
cat <<EOF_JSON

{
  "success": true,
  "archive": "${WORKING_DIR}/${ARCHIVE_ZIP}",
  "archiveSize": "${ARCHIVE_SIZE}",
  "artifactCount": $((REPORTS + DIAGRAMS + DATA)),
  "orgAlias": "${ORG_ALIAS}",
  "timestamp": "${TIMESTAMP}"
}
EOF_JSON

exit 0
