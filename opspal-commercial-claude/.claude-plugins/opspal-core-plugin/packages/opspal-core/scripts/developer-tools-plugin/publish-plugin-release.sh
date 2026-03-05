#!/bin/bash

# Plugin Release Management Script
# Usage: ./publish-plugin-release.sh --plugin=salesforce-plugin --version=v3.5.0

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
PLUGIN=""
VERSION=""
MESSAGE=""
SKIP_SLACK=false
SKIP_GITHUB=false
SKIP_TESTS=false

for arg in "$@"; do
  case $arg in
    --plugin=*)
      PLUGIN="${arg#*=}"
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
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --help)
      echo "Usage: $0 --plugin=PLUGIN --version=VERSION [options]"
      echo ""
      echo "Required:"
      echo "  --plugin=NAME      Plugin name (e.g., salesforce-plugin)"
      echo "  --version=VERSION  Version tag (e.g., v3.5.0)"
      echo ""
      echo "Optional:"
      echo "  --message=MESSAGE  Custom release message"
      echo "  --skip-slack       Skip Slack notification"
      echo "  --skip-github      Skip GitHub release creation"
      echo "  --skip-tests       Skip pre-release tests"
      echo ""
      exit 0
      ;;
  esac
done

# Validate required arguments
if [ -z "$PLUGIN" ] || [ -z "$VERSION" ]; then
  echo -e "${RED}Error: --plugin and --version are required${NC}"
  echo "Run $0 --help for usage"
  exit 1
fi

# Set paths
MARKETPLACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PLUGIN_DIR="$MARKETPLACE_ROOT/.claude-plugins/$PLUGIN"
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"

# Validate plugin exists
if [ ! -d "$PLUGIN_DIR" ]; then
  echo -e "${RED}Error: Plugin not found: $PLUGIN${NC}"
  echo "Plugin directory: $PLUGIN_DIR"
  exit 1
fi

if [ ! -f "$PLUGIN_JSON" ]; then
  echo -e "${RED}Error: plugin.json not found${NC}"
  echo "Expected: $PLUGIN_JSON"
  exit 1
fi

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Plugin Release Management System${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Plugin: ${GREEN}$PLUGIN${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo -e "Plugin Dir: ${GREEN}$PLUGIN_DIR${NC}"
echo ""

# Function to run pre-release tests
run_tests() {
  if [ "$SKIP_TESTS" = true ]; then
    echo -e "${YELLOW}Skipping tests${NC}"
    return
  fi

  echo -e "${YELLOW}Running pre-release tests...${NC}"

  # Run validation
  if [ -f "$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js" ]; then
    node "$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js" "$PLUGIN_DIR" || {
      echo -e "${RED}✗ Plugin validation failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Plugin validation passed${NC}"
  fi

  # Run integration tests (Levels 1-3)
  if [ -f "$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/test-plugin-installation.js" ]; then
    node "$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/test-plugin-installation.js" \
      --plugin "$PLUGIN" --level 1-3 || {
      echo -e "${RED}✗ Integration tests failed${NC}"
      exit 1
    }
    echo -e "${GREEN}✓ Integration tests passed${NC}"
  fi
}

# Function to update plugin version
update_version() {
  echo -e "${YELLOW}Updating plugin version...${NC}"

  # Extract version number (remove 'v' prefix)
  VERSION_NUMBER="${VERSION#v}"

  # Update plugin.json
  if command -v jq &> /dev/null; then
    tmp=$(mktemp)
    jq --arg ver "$VERSION_NUMBER" '.version = $ver' "$PLUGIN_JSON" > "$tmp"
    mv "$tmp" "$PLUGIN_JSON"
    echo -e "${GREEN}✓ Updated $PLUGIN/plugin.json to $VERSION_NUMBER${NC}"
  else
    echo -e "${YELLOW}Warning: jq not found, skipping plugin.json update${NC}"
  fi

  # Update marketplace.json
  MARKETPLACE_JSON="$MARKETPLACE_ROOT/.claude-plugin/marketplace.json"
  if [ -f "$MARKETPLACE_JSON" ] && command -v jq &> /dev/null; then
    tmp=$(mktemp)
    jq --arg plugin "$PLUGIN" --arg ver "$VERSION_NUMBER" \
      '(.plugins[] | select(.name == $plugin) | .version) = $ver' \
      "$MARKETPLACE_JSON" > "$tmp"
    mv "$tmp" "$MARKETPLACE_JSON"
    echo -e "${GREEN}✓ Updated marketplace.json${NC}"
  fi
}

# Function to check changelog
check_changelog() {
  echo -e "${YELLOW}Checking CHANGELOG.md...${NC}"

  CHANGELOG_FILE="$PLUGIN_DIR/CHANGELOG.md"

  if [ -f "$CHANGELOG_FILE" ]; then
    if grep -q "## \[$VERSION\]" "$CHANGELOG_FILE" || grep -q "## \[${VERSION#v}\]" "$CHANGELOG_FILE"; then
      echo -e "${GREEN}✓ CHANGELOG.md updated with $VERSION${NC}"
    else
      echo -e "${YELLOW}⚠  CHANGELOG.md missing $VERSION entry${NC}"
      echo -e "${YELLOW}   Please update CHANGELOG.md before release${NC}"
    fi
  else
    echo -e "${YELLOW}⚠  No CHANGELOG.md found${NC}"
  fi
}

# Function to create git tag
create_tag() {
  echo -e "${YELLOW}Creating git tag...${NC}"
  cd "$MARKETPLACE_ROOT"

  # Check if tag exists
  if git rev-parse "$PLUGIN-$VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}Tag $PLUGIN-$VERSION already exists${NC}"
  else
    if [ -z "$MESSAGE" ]; then
      MESSAGE="Release $VERSION for $PLUGIN"
    fi
    git tag -a "$PLUGIN-$VERSION" -m "$MESSAGE"
    echo -e "${GREEN}✓ Tag created: $PLUGIN-$VERSION${NC}"
  fi

  # Push tag
  echo -e "${YELLOW}Pushing tag to origin...${NC}"
  git push origin "$PLUGIN-$VERSION" 2>/dev/null || echo -e "${YELLOW}Tag already pushed${NC}"
  echo -e "${GREEN}✓ Tag pushed${NC}"
}

# Function to create GitHub release
create_github_release() {
  if [ "$SKIP_GITHUB" = true ]; then
    echo -e "${YELLOW}Skipping GitHub release${NC}"
    return
  fi

  echo -e "${YELLOW}Creating GitHub release...${NC}"
  cd "$MARKETPLACE_ROOT"

  TAG_NAME="$PLUGIN-$VERSION"

  # Check if release exists
  if gh release view "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${YELLOW}GitHub release $TAG_NAME already exists${NC}"
  else
    # Extract release notes from CHANGELOG
    CHANGELOG_FILE="$PLUGIN_DIR/CHANGELOG.md"
    RELEASE_NOTES="Release $VERSION for $PLUGIN"

    if [ -f "$CHANGELOG_FILE" ]; then
      # Try to extract section for this version
      RELEASE_NOTES=$(awk "/## \[$VERSION\]|## \[${VERSION#v}\]/,/## \[/{
        if (/## \[/ && !/## \[$VERSION\]|## \[${VERSION#v}\]/) exit;
        if (!/## \[$VERSION\]|## \[${VERSION#v}\]/) print
      }" "$CHANGELOG_FILE" | sed '/^$/d' || echo "See CHANGELOG.md for details")

      if [ -z "$RELEASE_NOTES" ]; then
        RELEASE_NOTES="Release $VERSION for $PLUGIN\n\nSee CHANGELOG.md for details."
      fi
    fi

    # Create release
    echo "$RELEASE_NOTES" | gh release create "$TAG_NAME" \
      --title "$PLUGIN $VERSION" \
      --notes-file - \
      --target main

    echo -e "${GREEN}✓ GitHub release created${NC}"
  fi
}

# Function to send Slack notification
send_slack_notification() {
  if [ "$SKIP_SLACK" = true ]; then
    echo -e "${YELLOW}Skipping Slack notification${NC}"
    return
  fi

  echo -e "${YELLOW}Sending Slack notification...${NC}"

  # Load environment variables
  if [ -f "$MARKETPLACE_ROOT/.env" ]; then
    source "$MARKETPLACE_ROOT/.env"
  elif [ -f "$MARKETPLACE_ROOT/../.env" ]; then
    source "$MARKETPLACE_ROOT/../.env"
  fi

  if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo -e "${YELLOW}⚠  SLACK_WEBHOOK_URL not configured${NC}"
    echo -e "${YELLOW}   Set in .env file to enable notifications${NC}"
    return
  fi

  # Use the send-plugin-release-notification.js script
  SCRIPT_PATH="$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/send-plugin-release-notification.js"
  if [ -f "$SCRIPT_PATH" ]; then
    node "$SCRIPT_PATH" "$VERSION" "$PLUGIN"
    echo -e "${GREEN}✓ Slack notification sent${NC}"
  else
    echo -e "${YELLOW}⚠  Notification script not found${NC}"
  fi
}

# Function to regenerate catalog
regenerate_catalog() {
  echo -e "${YELLOW}Regenerating marketplace catalog...${NC}"

  CATALOG_SCRIPT="$MARKETPLACE_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/build-marketplace-catalog.js"
  if [ -f "$CATALOG_SCRIPT" ]; then
    cd "$MARKETPLACE_ROOT"
    node "$CATALOG_SCRIPT" --all --json > marketplace-catalog.json 2>&1
    echo -e "${GREEN}✓ Marketplace catalog regenerated${NC}"
  else
    echo -e "${YELLOW}⚠  Catalog script not found${NC}"
  fi
}

# Function to commit changes
commit_changes() {
  echo -e "${YELLOW}Committing version updates...${NC}"
  cd "$MARKETPLACE_ROOT"

  git add "$PLUGIN_JSON" "$MARKETPLACE_ROOT/.claude-plugin/marketplace.json" \
    "$MARKETPLACE_ROOT/marketplace-catalog.json" 2>/dev/null || true

  if git diff --staged --quiet; then
    echo -e "${YELLOW}No changes to commit${NC}"
  else
    git commit -m "chore($PLUGIN): Release $VERSION

Updated version to ${VERSION#v} in plugin.json and marketplace.json

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
    echo -e "${GREEN}✓ Changes committed${NC}"

    # Push commits
    git push origin main
    echo -e "${GREEN}✓ Changes pushed${NC}"
  fi
}

# Main execution
echo -e "${BLUE}Starting plugin release process...${NC}"
echo ""

# Step 1: Run tests
run_tests

# Step 2: Update version
update_version

# Step 3: Check changelog
check_changelog

# Step 4: Regenerate catalog
regenerate_catalog

# Step 5: Commit changes
commit_changes

# Step 6: Create git tag
create_tag

# Step 7: Create GitHub release
create_github_release

# Step 8: Send Slack notification
send_slack_notification

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  Plugin Release Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Plugin: ${GREEN}$PLUGIN${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo -e "Tag: ${GREEN}$PLUGIN-$VERSION${NC}"
echo -e "GitHub: ${BLUE}https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/releases/tag/$PLUGIN-$VERSION${NC}"
echo ""
echo -e "${GREEN}✓ All done!${NC}"
