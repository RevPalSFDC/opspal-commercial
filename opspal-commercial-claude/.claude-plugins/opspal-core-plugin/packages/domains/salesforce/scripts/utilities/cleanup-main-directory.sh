#!/bin/bash

# Script to clean up and organize the main ClaudeSFDC directory
# Moves project-specific files to appropriate folders

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}===================================================${NC}"
echo -e "${BLUE}    ClaudeSFDC Directory Cleanup & Organization${NC}"
echo -e "${BLUE}===================================================${NC}"

# Create necessary directories if they don't exist
echo -e "\n${YELLOW}Creating directory structure...${NC}"
mkdir -p scripts/deployment
mkdir -p scripts/validation
mkdir -p scripts/utilities
mkdir -p docs/guides
mkdir -p docs/implementation
mkdir -p docs/audits
mkdir -p archives/backups
mkdir -p archives/old-scripts
mkdir -p instances/sample-org-sandbox/scripts
mkdir -p instances/example-company-sandbox/scripts
mkdir -p instances/shared/scripts
mkdir -p temp/work-files

# Move deployment scripts to scripts/deployment
echo -e "\n${YELLOW}Moving deployment scripts...${NC}"
for file in deploy-*.sh deploy_*.py execute-*.sh execute_*.py run_*.py run_*.sh; do
    if [ -f "$file" ]; then
        echo "  Moving $file to scripts/deployment/"
        mv "$file" scripts/deployment/ 2>/dev/null || true
    fi
done

# Move validation and test scripts to scripts/validation
echo -e "\n${YELLOW}Moving validation scripts...${NC}"
for file in test*.py test*.sh check*.py check*.sh validate*.py quick*.py; do
    if [ -f "$file" ]; then
        echo "  Moving $file to scripts/validation/"
        mv "$file" scripts/validation/ 2>/dev/null || true
    fi
done

# Move utility scripts to scripts/utilities
echo -e "\n${YELLOW}Moving utility scripts...${NC}"
for file in make_*.py make_*.sh chmod*.sh cleanup*.sh simple*.sh retrieve*.sh query*.sh switch*.sh setup.sh; do
    if [ -f "$file" ]; then
        echo "  Moving $file to scripts/utilities/"
        mv "$file" scripts/utilities/ 2>/dev/null || true
    fi
done

# Move Python utility files
for file in add_*.py modify_*.py create_*.py update_*.py direct_*.py manual_*.py focused_*.py basic_*.py final_*.py; do
    if [ -f "$file" ]; then
        echo "  Moving $file to scripts/utilities/"
        mv "$file" scripts/utilities/ 2>/dev/null || true
    fi
done

# Move implementation guides and documentation
echo -e "\n${YELLOW}Moving documentation files...${NC}"
for file in *_GUIDE.md *_README.md *_IMPLEMENTATION*.md *_DOCUMENTATION.md *_NOTES.md *_SUMMARY.md *_PLAN.md *_SOLUTION.md; do
    if [ -f "$file" ]; then
        echo "  Moving $file to docs/implementation/"
        mv "$file" docs/implementation/ 2>/dev/null || true
    fi
done

# Move audit files to docs/audits
echo -e "\n${YELLOW}Moving audit files...${NC}"
for file in *_Audit_*.csv *_AUDIT_*.md; do
    if [ -f "$file" ]; then
        echo "  Moving $file to docs/audits/"
        mv "$file" docs/audits/ 2>/dev/null || true
    fi
done

# Move backup folders to archives
echo -e "\n${YELLOW}Archiving backup folders...${NC}"
for dir in backup-*; do
    if [ -d "$dir" ]; then
        echo "  Archiving $dir to archives/backups/"
        mv "$dir" archives/backups/ 2>/dev/null || true
    fi
done

# Move temp files to temp directory
echo -e "\n${YELLOW}Moving temporary files...${NC}"
for file in *.log diagnostic-report.json instance-file-mapping.json; do
    if [ -f "$file" ]; then
        echo "  Moving $file to temp/work-files/"
        mv "$file" temp/work-files/ 2>/dev/null || true
    fi
done

# Move CSV data files
for file in *.csv; do
    if [ -f "$file" ]; then
        echo "  Moving $file to temp/work-files/"
        mv "$file" temp/work-files/ 2>/dev/null || true
    fi
done

# Move XML templates to temp
for file in contact_layout_template.xml destructiveChanges.xml; do
    if [ -f "$file" ]; then
        echo "  Moving $file to temp/work-files/"
        mv "$file" temp/work-files/ 2>/dev/null || true
    fi
done

# Move instance-specific scripts
echo -e "\n${YELLOW}Moving instance-specific scripts...${NC}"
if [ -f "update_contracts.sh" ] || [ -f "update_remaining_contracts.sh" ]; then
    echo "  Moving contract update scripts to instances/shared/scripts/"
    mv update*contracts.sh instances/shared/scripts/ 2>/dev/null || true
fi

# Move Asana-related files to integration folder
echo -e "\n${YELLOW}Moving Asana integration files...${NC}"
for file in asana*.js asana*.json update-asana*.js test_asana*.sh run-asana*.sh run-task*.sh; do
    if [ -f "$file" ]; then
        echo "  Moving $file to integration/"
        mv "$file" integration/ 2>/dev/null || true
    fi
done

# Move test time tracking files
if [ -f "test-time-tracking.js" ]; then
    mv test-time-tracking.js integration/ 2>/dev/null || true
fi

# Clean up standalone scripts that should be in utilities
echo -e "\n${YELLOW}Moving remaining standalone scripts...${NC}"
for file in *.sh; do
    if [ -f "$file" ] && [ "$file" != "cleanup-main-directory.sh" ]; then
        echo "  Moving $file to scripts/utilities/"
        mv "$file" scripts/utilities/ 2>/dev/null || true
    fi
done

# Create a project structure summary
echo -e "\n${YELLOW}Creating project structure documentation...${NC}"
cat > PROJECT_STRUCTURE.md << 'EOF'
# ClaudeSFDC Project Structure

## Directory Organization

### Core Directories
- **agents/** - Sub-agent definitions and configurations
- **force-app/** - Salesforce metadata (fields, objects, flows, etc.)
- **instances/** - Instance-specific configurations and files
- **manifest/** - Package.xml files for deployments
- **scripts/** - Organized utility and deployment scripts
- **docs/** - Documentation and guides
- **integration/** - External system integrations (Asana, etc.)
- **error-logging/** - Error monitoring and logging system
- **frameworks/** - Reusable framework components
- **testing/** - Test suites and validation tools

### Script Organization
- **scripts/deployment/** - All deployment-related scripts
- **scripts/validation/** - Test and validation scripts
- **scripts/utilities/** - General utility scripts

### Documentation Organization
- **docs/guides/** - User and setup guides
- **docs/implementation/** - Implementation documentation
- **docs/audits/** - Audit reports and field analyses

### Archive Organization
- **archives/backups/** - Old backup folders
- **archives/old-scripts/** - Deprecated scripts

### Temporary Files
- **temp/work-files/** - Temporary working files and logs

## Key Configuration Files (Remain in Root)
- CLAUDE.md - Main Claude Code instructions
- README.md - Project overview
- package.json - Node.js dependencies
- sfdx-project.json - Salesforce CLI project configuration
- LICENSE - Project license
- .mcp.json - MCP configuration (if present)

## Clean Directory Policy
Project-specific files should not be placed in the root directory. Use the appropriate subdirectory based on the file's purpose.
EOF

# Summary report
echo -e "\n${GREEN}===================================================${NC}"
echo -e "${GREEN}           Cleanup Complete!${NC}"
echo -e "${GREEN}===================================================${NC}"

# Count remaining files in root
ROOT_FILES=$(find . -maxdepth 1 -type f | wc -l)
echo -e "\nFiles remaining in root directory: ${BLUE}$ROOT_FILES${NC}"

# List key remaining files
echo -e "\n${YELLOW}Key configuration files (should remain in root):${NC}"
for file in CLAUDE.md README.md package.json sfdx-project.json LICENSE PROJECT_STRUCTURE.md; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    fi
done

# Check if any unexpected files remain
echo -e "\n${YELLOW}Checking for any remaining unexpected files...${NC}"
UNEXPECTED_FILES=$(find . -maxdepth 1 -type f \
    ! -name "CLAUDE.md" \
    ! -name "README.md" \
    ! -name "package.json" \
    ! -name "package-lock.json" \
    ! -name "sfdx-project.json" \
    ! -name "LICENSE" \
    ! -name "PROJECT_STRUCTURE.md" \
    ! -name ".mcp.json" \
    ! -name "cleanup-main-directory.sh" \
    ! -name "*.md" \
    -printf "%f\n")

if [ -n "$UNEXPECTED_FILES" ]; then
    echo -e "${YELLOW}Found unexpected files that may need manual review:${NC}"
    echo "$UNEXPECTED_FILES"
else
    echo -e "${GREEN}✓ Directory is clean!${NC}"
fi

echo -e "\n${BLUE}Note: Review PROJECT_STRUCTURE.md for the new organization${NC}"
