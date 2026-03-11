---
description: Get a second opinion from Gemini on code, architecture, or decisions
argument-hint: <question or topic to consult on>
---

# Gemini Consult Command

You are invoking the `gemini-consult` agent to get a second opinion from Google's Gemini AI.

## What to Do

1. **First, verify Gemini is configured**:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/gemini-cli-invoker.js --check
   ```

   If not configured, inform the user:
   ```
   ❌ Gemini not configured. Run `/gemini-link --setup` first.
   ```

2. **If configured, invoke the gemini-consult agent**:

   Use the Task tool to invoke the agent with the user's question:
   ```
   Task(subagent_type='opspal-ai-consult:gemini-consult', prompt='<user's question or topic>')
   ```

3. **If no argument provided**, ask the user what they want to consult on:
   - Code review?
   - Architecture decision?
   - Debugging help?
   - Best practices?
   - General question?

## Example Usage

User runs: `/gemini-consult How should I structure my authentication middleware?`

You should:
1. Check Gemini is configured
2. Invoke: `Task(subagent_type='opspal-ai-consult:gemini-consult', prompt='How should I structure my authentication middleware?')`
3. The agent will:
   - Develop Claude's perspective
   - Query Gemini
   - Synthesize both perspectives
   - Return comparison with recommendations

## Context Inclusion

If the user references files, read them first and include in the consultation:

```
/gemini-consult Review auth.js for security issues
```

1. Read `auth.js`
2. Include the code in the consultation prompt
3. Invoke the agent with full context

## Quick Reference

| Command | Action |
|---------|--------|
| `/gemini-consult <question>` | Get second opinion on question |
| `/gemini-consult` (no args) | Prompt for what to consult |
| `/gemini-domain-resolve ...` | Resolve domains and detect shadow duplicate clusters |
| `/gemini-link` | Set up Gemini connection |
| `/gemini-link --test` | Test connection |
