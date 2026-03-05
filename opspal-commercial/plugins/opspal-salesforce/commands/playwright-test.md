---
description: Test Playwright browser automation setup and session status for Salesforce
argument-hint: "[options]"
---

Test Playwright integration for Salesforce:

1. **Verify Installation**: Check that Playwright MCP server is available
2. **Check Sessions**: List existing org sessions and their age
3. **Show Configuration**: Display Playwright settings from .mcp.json
4. **Test Scraper**: Optionally run a test scrape (with user confirmation)

Commands to run:
```bash
# Test MCP server
npx -y @modelcontextprotocol/server-playwright --help

# List session files
find instances -name ".salesforce-session.json" -exec echo "Session found: {}" \; -exec stat -c "Modified: %y" {} \;

# Show configuration
cat .mcp.json | jq '.mcpServers.playwright'

# Check if new scraper exists
if [ -f scripts/scrape-sf-connected-apps.js ]; then
  echo "✅ Salesforce Connected Apps scraper available"
  echo "Test with: ORG=production node scripts/scrape-sf-connected-apps.js"
fi
```

If user wants to run a test scrape:
1. Ask which org to use
2. Ask if they want headed (HEAD=1) or headless mode
3. Run the scraper with appropriate flags:
   - `HEAD=1 ORG=[org-name] node scripts/scrape-sf-connected-apps.js` (headed, for initial auth)
   - `ORG=[org-name] node scripts/scrape-sf-connected-apps.js` (headless, uses saved session)
4. Report results from `instances/{org}/connected-apps-snapshot.json`

Report the status and any issues found.
