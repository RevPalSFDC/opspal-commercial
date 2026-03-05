---
description: Analyze task and suggest the most appropriate specialized agent
argument-hint: "[options]"
allowed-tools: Bash
---

Analyze the user's current task request and suggest the most appropriate specialized agent using the task-pattern-detector library.

Steps:
1. Capture the user's most recent task description or request from the conversation context
2. Run task pattern analysis: `node scripts/lib/task-pattern-detector.js "<user task description>"`
3. Parse the JSON output from the detector
4. Display results to user in a friendly format:

```
╔════════════════════════════════════════════════════════════════╗
║              🤖 AGENT SUGGESTION ANALYSIS 🤖                   ║
╚════════════════════════════════════════════════════════════════╝

Your Task:
  "{task description}"

📊 Analysis Results:
  Operation Type: {operation_type}
  Complexity Score: {complexity_score}/1.0
  Risk Level: {risk_level}
  Confidence: {confidence_level}%

✅ Recommended Agent: {recommended_agent}

💡 Reasoning:
  {reasoning}

🔑 Keywords Detected:
  {keywords_matched}

{if alternative_agents exist}
🔄 Alternative Agents:
  {list alternative agents}
{end if}

📋 Next Steps:
  Use the Task tool with:
    subagent_type: "{recommended_agent}"
    description: "{brief description}"
    prompt: "{detailed task description}"

For more details, see:
  .claude/agents/{recommended_agent}.md
  .claude/AGENT_DECISION_CARD.md
```

5. If confidence_level < 50:
   - Show warning: "⚠️ Low confidence in agent suggestion"
   - Recommend manual review of: .claude/AGENT_REMINDER.md
   - Suggest default agents: principal-engineer or sfdc-orchestrator

6. If operation_type is "unknown":
   - Show all available agents by category
   - Suggest reviewing the task description for clarity
   - Offer to analyze a rephrased version

7. If risk_level is "critical" or "high":
   - Add prominent warning: "🚨 HIGH RISK OPERATION"
   - Remind user that agent usage is MANDATORY
   - Reference: .claude/AGENT_DECISION_CARD.md - Mandatory Agents section

Output Format:
- Use clear visual separators (boxes, lines)
- Color-code by risk level (critical=red, high=yellow, medium/low=green)
- Show confidence score prominently
- Provide actionable next steps

Example Usage:
User: "I need to update 500 account records with new owner values"
→ Run /suggest-agent
→ Analyzes task
→ Recommends: sfdc-data-operations (95% confidence, high risk)
→ Provides Task tool invocation template
