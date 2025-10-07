#!/bin/bash

# Unified Release Management Script
# Usage: ./publish-release.sh --project=ClaudeHubSpot --version=v2.0.0

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
PROJECT=""
VERSION=""
MESSAGE=""
SKIP_SLACK=false
SKIP_GITHUB=false

for arg in "$@"; do
  case $arg in
    --project=*)
      PROJECT="${arg#*=}"
      shift
      ;;
    --version=*)
      VERSION="${arg#*=}"
      shift
      ;;
    --message=*)
      MESSAGE="${arg#*=}"
      shift
      ;;
    --skip-slack)
      SKIP_SLACK=true
      shift
      ;;
    --skip-github)
      SKIP_GITHUB=true
      shift
      ;;
    --help)
      echo "Usage: $0 --project=PROJECT --version=VERSION [options]"
      echo ""
      echo "Required:"
      echo "  --project=NAME     Project name (ClaudeHubSpot, ClaudeSFDC, or main)"
      echo "  --version=VERSION  Version tag (e.g., v2.0.0)"
      echo ""
      echo "Optional:"
      echo "  --message=MESSAGE  Custom release message"
      echo "  --skip-slack       Skip Slack notification"
      echo "  --skip-github      Skip GitHub release creation"
      echo ""
      exit 0
      ;;
  esac
done

# Validate required arguments
if [ -z "$PROJECT" ] || [ -z "$VERSION" ]; then
  echo -e "${RED}Error: --project and --version are required${NC}"
  echo "Run $0 --help for usage"
  exit 1
fi

# Set project directory
case $PROJECT in
  ClaudeHubSpot)
    PROJECT_DIR="../opspal-internal/HS"
    PROJECT_NAME="ClaudeHubSpot"
    REPO_NAME="claude-hs"
    ;;
  ClaudeSFDC)
    PROJECT_DIR="../opspal-internal/SFDC"
    PROJECT_NAME="ClaudeSFDC"
    REPO_NAME="claude-sfdc"
    ;;
  main|Agents)
    PROJECT_DIR=".."
    PROJECT_NAME="RevPal Agents"
    REPO_NAME="Agents"
    ;;
  *)
    echo -e "${RED}Error: Unknown project: $PROJECT${NC}"
    exit 1
    ;;
esac

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Release Management System${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Project: ${GREEN}$PROJECT_NAME${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo -e "Repository: ${GREEN}$REPO_NAME${NC}"
echo ""

# Function to create git tag
create_tag() {
  echo -e "${YELLOW}Creating git tag...${NC}"
  cd "$PROJECT_DIR"
  
  # Check if tag exists
  if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}Tag $VERSION already exists. Skipping...${NC}"
  else
    if [ -z "$MESSAGE" ]; then
      MESSAGE="Release $VERSION for $PROJECT_NAME"
    fi
    git tag -a "$VERSION" -m "$MESSAGE"
    echo -e "${GREEN}✓ Tag created${NC}"
  fi
  
  # Push tag
  echo -e "${YELLOW}Pushing tag to origin...${NC}"
  git push origin "$VERSION" 2>/dev/null || echo -e "${YELLOW}Tag already pushed${NC}"
  
  cd - > /dev/null
}

# Function to create GitHub release
create_github_release() {
  if [ "$SKIP_GITHUB" = true ]; then
    echo -e "${YELLOW}Skipping GitHub release${NC}"
    return
  fi
  
  echo -e "${YELLOW}Creating GitHub release...${NC}"
  cd "$PROJECT_DIR"
  
  # Check if release exists
  if gh release view "$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}GitHub release $VERSION already exists${NC}"
  else
    # Generate release notes based on version
    if [ "$VERSION" = "v2.0.0" ]; then
      RELEASE_TITLE="$VERSION - Optional Multi-Model AI Support"
      RELEASE_NOTES="## 🎉 Major Feature Release

### Optional Multi-Model AI Support
- Seamlessly switch between Claude, GPT-5, and other AI models
- Natural language commands in Claude Code
- Intelligent routing based on operation type
- Cost tracking and optimization
- Completely optional - disabled by default
- Zero impact on existing workflows

### Quick Start
\`\`\`bash
./scripts/enable-model-proxy.sh
\`\`\`

### Claude Code Commands
- \`/model-proxy enable\` - Enable feature
- \`/use-gpt5\` - Switch to GPT-5
- \"Use GPT-5 for this project\" - Natural language

**Note**: This feature is completely optional and has zero impact unless explicitly enabled."
    else
      RELEASE_TITLE="$VERSION"
      RELEASE_NOTES="Release $VERSION for $PROJECT_NAME

See CHANGELOG.md for details."
    fi
    
    # Create release
    gh release create "$VERSION" \
      --title "$RELEASE_TITLE" \
      --notes "$RELEASE_NOTES" \
      --target main
    
    echo -e "${GREEN}✓ GitHub release created${NC}"
  fi
  
  cd - > /dev/null
}

# Function to send Slack notification
send_slack_notification() {
  if [ "$SKIP_SLACK" = true ]; then
    echo -e "${YELLOW}Skipping Slack notification${NC}"
    return
  fi
  
  echo -e "${YELLOW}Sending Slack notification...${NC}"
  
  # Load environment variables (with hardcoded fallback)
  if [ -f ../.env ]; then
    source ../.env
  fi
  
  # Use hardcoded webhook as fallback
  if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo -e "${YELLOW}Using hardcoded Slack webhook${NC}"
    export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/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"
  fi
  
  # Use the updated send-slack-notification.js script
  node send-slack-notification.js "$VERSION" "$PROJECT_NAME"
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Slack notification sent${NC}"
  else
    echo -e "${RED}✗ Slack notification failed${NC}"
  fi
}

# Function to update changelog
update_changelog() {
  echo -e "${YELLOW}Checking CHANGELOG.md...${NC}"
  
  CHANGELOG_FILE="$PROJECT_DIR/CHANGELOG.md"
  
  if [ -f "$CHANGELOG_FILE" ]; then
    echo -e "${GREEN}✓ CHANGELOG.md exists${NC}"
    
    # Check if version is already in changelog
    if grep -q "## \[$VERSION\]" "$CHANGELOG_FILE"; then
      echo -e "${GREEN}✓ Version $VERSION already in CHANGELOG${NC}"
    else
      echo -e "${YELLOW}Note: Remember to update CHANGELOG.md with $VERSION details${NC}"
    fi
  else
    echo -e "${YELLOW}No CHANGELOG.md found in project${NC}"
  fi
}

# Main execution
echo -e "${BLUE}Starting release process...${NC}"
echo ""

# Step 1: Update changelog reminder
update_changelog

# Step 2: Create git tag
create_tag

# Step 3: Create GitHub release
create_github_release

# Step 4: Send Slack notification
send_slack_notification

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  Release Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Project: ${GREEN}$PROJECT_NAME${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"

if [ "$PROJECT" != "main" ]; then
  echo -e "GitHub: ${BLUE}https://github.com/RevPalSFDC/$REPO_NAME/releases/tag/$VERSION${NC}"
fi

echo ""
echo -e "${GREEN}✓ All done!${NC}"