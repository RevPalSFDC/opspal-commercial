# Warning Output Template

## Format

```
⚠️  {title}

{description}

{context}

{suggestions}

{footer}
```

## Fields

- **title**: Warning title (required)
- **description**: What triggered the warning (required)
- **context**: Additional context about the situation (optional)
- **suggestions**: How to address or when to ignore (optional)
- **footer**: Configuration or bypass instructions (optional)

## Example Usage

```markdown
⚠️  **Low Confidence Routing**

The routing system has moderate confidence (65%) in the agent recommendation.

**Context:**
- Recommended Agent: sfdc-metadata-manager
- Confidence: 65%
- Complexity: 0.45 (Medium)
- Keywords Matched: 3/5

**Suggestions:**
- Consider reviewing alternative agents if task has specific requirements
- Use `[USE: agent-name]` to override routing
- Set ROUTING_CONFIDENCE_THRESHOLD higher to require more certainty

**Proceeding with recommended agent...**
```

## Color Scheme

- Title: Yellow/orange bold
- Description: Normal text
- Context: Bulleted list or table
- Suggestions: Numbered list with actionable items
- Footer: Muted text with configuration hints

## Exit Code

Use with: `exit 2` (automatic feedback to Claude)
