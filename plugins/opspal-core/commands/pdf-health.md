---
name: pdf-health
description: Check PDF generation pipeline health and diagnose issues
argument-hint: "[--verbose] [--fix]"
userInvocable: true
---

# /pdf-health - PDF Pipeline Health Check

Run comprehensive diagnostics on the PDF generation pipeline.

## What It Checks

1. **Dependencies**: mmdc, md-to-pdf, Chromium/Puppeteer
2. **CSS Files**: Canonical theme files exist and contain branding
3. **Mermaid Rendering**: Can render diagrams to PNG
4. **PDF Generation**: End-to-end PDF creation works
5. **Reliability System**: Verification hooks are working

## Usage

```bash
/pdf-health                    # Quick health check
/pdf-health --verbose          # Detailed output
/pdf-health --fix              # Attempt to fix issues
```

## Instructions for Claude

When the user runs `/pdf-health`, execute:

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

node "$(find_script "test-pdf-pipeline.js")" --verbose
```

If issues are found, provide specific remediation steps:

### Missing mmdc (Mermaid CLI)

```bash
npm install -g @mermaid-js/mermaid-cli
```

### Missing md-to-pdf

```bash
cd plugins/opspal-core && npm install md-to-pdf
```

### Missing Chromium

```bash
# Ubuntu/Debian
sudo apt-get install chromium-browser

# Or via Puppeteer
npx puppeteer browsers install chrome
```

### Environment Blockers (Sandbox/Crashpad)

If you see errors like **"Operation not permitted"**, **"crashpad"**, or **"sandbox"** when rendering Mermaid or generating PDFs, Chromium cannot launch in the current environment.

Common fixes:
- Enable unprivileged user namespaces on the host
- In Docker, run with a less restrictive seccomp profile (e.g., `--security-opt seccomp=unconfined`)
- Ensure `PUPPETEER_EXECUTABLE_PATH` points to a valid Chrome/Chromium binary

### CSS Branding Issues

Check that these files contain RevPal colors (#5F3B8C, #E99560):

- `plugins/opspal-core/templates/pdf-styles/themes/revpal.css`
- `plugins/opspal-core/templates/pdf-styles/themes/revpal-brand.css`

## Expected Output

```
═══════════════════════════════════════════════════════════
  PDF PIPELINE INTEGRATION TEST
═══════════════════════════════════════════════════════════

TEST 1: Dependencies
✓ mmdc (Mermaid CLI) available
✓ md-to-pdf available
✓ node available

TEST 2: CSS Files
✓ Found: templates/pdf-styles/themes/revpal.css
✓ Found: templates/pdf-styles/themes/revpal-brand.css
✓ Found: templates/pdf-styles/base.css

TEST 3: CSS Branding Verification
✓ CSS contains Grape color
✓ CSS contains Apricot color
✓ CSS contains Montserrat font
✓ CSS contains Figtree font

TEST 4: Mermaid Rendering
✓ Mermaid rendered successfully (15KB)

TEST 5: PDF Generation
✓ PDF generated successfully (42KB)

TEST 6: Reliability System
✓ Reliability system pre-check works

═══════════════════════════════════════════════════════════
  SUMMARY
═══════════════════════════════════════════════════════════
  Passed:  13
  Failed:  0
  Skipped: 0

✅ PDF pipeline is healthy
```

## Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "mmdc not found" | Mermaid CLI not installed | `npm install -g @mermaid-js/mermaid-cli` |
| "md-to-pdf not available" | Missing dependency | `npm install md-to-pdf` in plugin dir |
| "PDF invalid" | Chromium issues | Install Chromium or check Puppeteer |
| "CSS missing color" | Corrupted CSS file | Re-copy from templates |
| "Mermaid output too small" | Rendering failed | Check diagram syntax |
| "Operation not permitted" / "crashpad" / "sandbox" | Chromium cannot launch | Enable user namespaces or relax container seccomp |
