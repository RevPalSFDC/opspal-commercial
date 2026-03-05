#!/bin/bash

# Organization cleanup script for SFDC directory
# Moves scattered files into proper project structures

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SFDC Directory Organization Cleanup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

SFDC_DIR="${PROJECT_ROOT:-/path/to/project}/legacy/SFDC"
cd "$SFDC_DIR"

# Create organized structure for misc directories
echo -e "${YELLOW}Creating organized directory structure...${NC}"
mkdir -p projects/misc/{analysis,analytics,api,automation,benchmarks,deployments}
mkdir -p archives/old-backups
mkdir -p archives/old-deploys

# Move analysis files
if [ -d "analysis" ] && [ "$(ls -A analysis)" ]; then
    echo -e "${YELLOW}Moving analysis files...${NC}"
    mv analysis/* projects/misc/analysis/ 2>/dev/null || true
    rmdir analysis 2>/dev/null || true
fi

# Move analytics files
if [ -d "analytics" ] && [ "$(ls -A analytics)" ]; then
    echo -e "${YELLOW}Moving analytics files...${NC}"
    mv analytics/* projects/misc/analytics/ 2>/dev/null || true
    rmdir analytics 2>/dev/null || true
fi

# Move API files
if [ -d "api" ] && [ "$(ls -A api)" ]; then
    echo -e "${YELLOW}Moving API files...${NC}"
    mv api/* projects/misc/api/ 2>/dev/null || true
    rmdir api 2>/dev/null || true
fi

# Move automation audit
if [ -d "automation-audit-20250910" ]; then
    echo -e "${YELLOW}Moving automation audit...${NC}"
    mv automation-audit-20250910 projects/misc/automation/ 2>/dev/null || true
fi

# Move benchmarks
if [ -d "benchmarks" ] && [ "$(ls -A benchmarks)" ]; then
    echo -e "${YELLOW}Moving benchmarks...${NC}"
    mv benchmarks/* projects/misc/benchmarks/ 2>/dev/null || true
    rmdir benchmarks 2>/dev/null || true
fi

# Move old deployments
if [ -d "BusinessUnit-deploy" ]; then
    echo -e "${YELLOW}Moving BusinessUnit deployments...${NC}"
    mv BusinessUnit-deploy* projects/misc/deployments/ 2>/dev/null || true
fi

# Move backups to archives
if [ -d "backup" ] || [ -d "backups" ]; then
    echo -e "${YELLOW}Consolidating backups...${NC}"
    [ -d "backup" ] && mv backup/* archives/old-backups/ 2>/dev/null || true
    [ -d "backups" ] && mv backups/* archives/old-backups/ 2>/dev/null || true
    rmdir backup backups 2>/dev/null || true
fi

# Move archive subdirectories
if [ -d "archive" ]; then
    echo -e "${YELLOW}Consolidating archive...${NC}"
    mv archive/* archives/ 2>/dev/null || true
    rmdir archive 2>/dev/null || true
fi

# Clean up old backup files
echo -e "${YELLOW}Moving old backup files...${NC}"
mv *.bak.* archives/old-backups/ 2>/dev/null || true

# Move agent-related temporary files
echo -e "${YELLOW}Organizing agent-related files...${NC}"
mkdir -p docs/agent-updates
mv AGENT_PROMOTION_ACTIVATED.md docs/agent-updates/ 2>/dev/null || true
mv AGENT_UPDATES_COMPLETE.md docs/agent-updates/ 2>/dev/null || true

# Move implementation summaries to docs
echo -e "${YELLOW}Moving implementation docs...${NC}"
mv *_SUMMARY.md docs/ 2>/dev/null || true
mv *_GUIDE.md docs/ 2>/dev/null || true

# Move CI/CD if it exists
if [ -d "ci-cd" ]; then
    echo -e "${YELLOW}Moving CI/CD files...${NC}"
    mkdir -p projects/ci-cd-pipeline
    mv ci-cd/* projects/ci-cd-pipeline/ 2>/dev/null || true
    rmdir ci-cd 2>/dev/null || true
fi

# Move CLI files
if [ -d "cli" ]; then
    echo -e "${YELLOW}Moving CLI files...${NC}"
    mkdir -p scripts/cli-tools
    mv cli/* scripts/cli-tools/ 2>/dev/null || true
    rmdir cli 2>/dev/null || true
fi

# Move config files to proper location
if [ -d "config" ]; then
    echo -e "${YELLOW}Moving config files...${NC}"
    mkdir -p shared/config
    mv config/* shared/config/ 2>/dev/null || true
    rmdir config 2>/dev/null || true
fi

# Move audits to projects
if [ -d "audits" ]; then
    echo -e "${YELLOW}Moving audit files...${NC}"
    mkdir -p projects/audits
    mv audits/* projects/audits/ 2>/dev/null || true
    rmdir audits 2>/dev/null || true
fi

# Clean up empty directories
echo -e "${YELLOW}Cleaning up empty directories...${NC}"
find . -maxdepth 1 -type d -empty -delete 2>/dev/null || true

# Report results
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Organization Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo "Files have been organized into:"
echo "  • projects/misc/ - Various project files"
echo "  • archives/ - Old backups and archives"
echo "  • docs/ - Documentation and guides"
echo "  • scripts/ - CLI and tool scripts"
echo "  • shared/ - Shared configurations"
echo ""

# Show remaining top-level items
echo -e "${YELLOW}Remaining top-level items:${NC}"
ls -1 | grep -vE "^(scripts|docs|agents|templates|instances|shared|force-app|.git|.claude|error-logging|projects|archives|example-company-production-cleanup|test-enforcement)" | head -20 || echo "  All files organized!"

echo ""
echo -e "${GREEN}✓ Organization cleanup complete${NC}"