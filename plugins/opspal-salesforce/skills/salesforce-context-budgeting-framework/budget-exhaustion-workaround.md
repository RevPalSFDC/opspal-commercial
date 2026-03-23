# Budget Exhaustion Detection and Recovery

## Problem

When sub-agents hit their token budget during multi-agent orchestration (e.g., territory deployment, large metadata operations), they go idle silently. The idle notification is indistinguishable from normal completion. This causes:

- Phases left incomplete with no error signal
- Orchestrator assumes success when work is unfinished
- Manual detection required, breaking autonomous operation

## Detection Heuristic

After every `Task()` call to a sub-agent, the orchestrator MUST verify expected outputs:

1. Check for the expected output artifact (file, status update, or structured result)
2. If the artifact is absent AND the agent returned without error → treat as **probable budget exhaustion**
3. If the agent produced partial output (e.g., 3 of 7 territories created) → treat as **confirmed budget exhaustion**

### Decision Matrix

| Agent returned | Output present | Partial output | Diagnosis |
|----------------|----------------|----------------|-----------|
| Success | Yes, complete | N/A | Normal completion |
| Success | Missing | N/A | Probable budget exhaustion |
| Success | Yes, incomplete | Yes | Confirmed budget exhaustion |
| Error | N/A | N/A | Normal failure — handle error |

## Recovery Pattern

1. **Checkpoint state**: Before spawning a sub-agent, record the current state (e.g., territories created so far, fields deployed, records migrated)
2. **Scope narrowing**: Spawn a fresh agent with a narrower scope — single phase, not multi-phase. Pass explicit context:
   - Last known checkpoint state
   - Remaining work items only
   - Do NOT pass full conversation history
3. **Continuation, not restart**: The fresh agent should continue from the checkpoint, not re-execute completed work
4. **Budget sizing**: Decompose operations so each `Task()` call fits within a single agent budget window. The territory orchestrator's 7-phase structure is a good example — each phase should be a separate `Task()` call

## Example: Territory Deployment

```javascript
// BAD: One agent for all phases
Task(agent='territory-orchestrator', prompt='Deploy all 7 phases')

// GOOD: One agent per phase with checkpoint tracking
for (const phase of phases) {
  const checkpoint = loadCheckpoint();
  const result = Task(agent='territory-orchestrator', prompt=`Execute phase ${phase.id} only. Current state: ${checkpoint}`);
  if (!result.expectedArtifact) {
    // Budget exhaustion detected — spawn fresh agent for same phase
    const retry = Task(agent='territory-orchestrator', prompt=`Resume phase ${phase.id}. Checkpoint: ${checkpoint}`);
  }
  saveCheckpoint(result);
}
```

## Platform Limitation

This is a Claude Code platform limitation. There is no `budget_remaining` or `budget_exhausted` flag available in agent idle notifications. The detection heuristic above is the recommended workaround until the platform provides an explicit signal.

## Cross-references

- See `SKILL.md` in this directory for budget threshold tables
- See `agents/sfdc-territory-orchestrator.md` for the 7-phase territory workflow structure
