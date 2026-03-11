---
description: Set up and verify Gemini CLI connection for cross-model consultation
argument-hint: [--check | --setup | --test "prompt"]
---

# Gemini Link Command

You are helping the user set up and verify their Gemini CLI connection for cross-model AI consultation.

## What to Do

Based on the arguments provided, perform the appropriate action:

### No Arguments or `--check`
Run a comprehensive prerequisites check:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/lib/prereq-check.sh
```

Report the results and guide the user through any missing prerequisites.

### `--setup`
Guide the user through complete Gemini setup:

1. **Check Node.js**:
   ```bash
   node --version
   ```
   If missing, instruct: "Install Node.js from https://nodejs.org/"

2. **Install Gemini CLI**:
   ```bash
   npm install -g @google/gemini-cli
   ```

3. **Verify Installation**:
   ```bash
   gemini --version
   ```

4. **Guide API Key Setup**:
   - Direct user to: https://aistudio.google.com/apikey
   - Instruct them to:
     1. Sign in with Google account
     2. Click "Create API key"
     3. Copy the key
   - Help them set the environment variable:
     ```bash
     export GEMINI_API_KEY="their-key-here"
     ```
   - Suggest adding to shell profile:
     ```bash
     echo 'export GEMINI_API_KEY="their-key-here"' >> ~/.bashrc
     # or for zsh:
     echo 'export GEMINI_API_KEY="their-key-here"' >> ~/.zshrc
     ```

5. **Verify Complete Setup**:
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/lib/prereq-check.sh
   ```

### `--test "prompt"` or `--test`
Test the Gemini connection with a simple query:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/gemini-cli-invoker.js --check
```

If `--check` passes, run a test prompt:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/gemini-cli-invoker.js \
  --prompt "Hello! Please respond with a brief greeting to confirm the connection is working."
```

Report success or failure with clear next steps.

## Output Format

Provide a clear status report:

```
## Gemini Link Status

| Component | Status |
|-----------|--------|
| Node.js | ✅ Installed (vX.X.X) |
| Gemini CLI | ✅ Installed (vX.X.X) |
| API Key | ✅ Set (XXXX...XXXX) |
| Connection | ✅ Working |

**Status**: Ready for cross-model consultation!

To use: Ask for a "second opinion" or use:
  Task(subagent_type='opspal-ai-consult:gemini-consult', prompt='your question')
```

Or if issues:

```
## Gemini Link Status

| Component | Status |
|-----------|--------|
| Node.js | ✅ Installed |
| Gemini CLI | ❌ Not installed |
| API Key | ⚠️ Not set |

**Next Steps**:
1. Install Gemini CLI: `npm install -g @google/gemini-cli`
2. Get API key: https://aistudio.google.com/apikey
3. Set key: `export GEMINI_API_KEY="your-key"`
4. Run `/gemini-link --check` to verify
```

## Free Tier Information

Remind users about the free tier limits:
- **60 requests per minute**
- **1,000 requests per day**
- **1M token context window** (Gemini 2.5 Pro)

No credit card required for free tier!
