# Hook Env Var Isolation

PreToolUse hooks run in their own process. Exporting a variable in an interactive shell does not reliably persist into a later hook invocation unless the variable is attached to the command itself or configured in `.claude/settings.local.json`.

## Recommended Pattern

```json
{
  "env": {
    "SKIP_FLOW_VALIDATION": "1"
  }
}
```

## Toggle Reference

| Variable | Scope | Effect | Safe persistent config |
| --- | --- | --- | --- |
| `SKIP_FLOW_VALIDATION` | `pre-deploy-flow-validation.sh` | Skips flow-specific deploy validation | `.claude/settings.local.json` `env.SKIP_FLOW_VALIDATION="1"` |
| `ERROR_PREVENTION_ENABLED` | `soql-enhancer.sh` | Enables SF command interception/correction | `.claude/settings.local.json` `env.ERROR_PREVENTION_ENABLED="true"` |
| `SOQL_ENHANCEMENT_ENABLED` | `soql-enhancer.sh` | Enables query enhancement after validation | `.claude/settings.local.json` `env.SOQL_ENHANCEMENT_ENABLED="true"` |
| `SOQL_LIVE_FIRST` | `soql-enhancer.sh` | Refreshes org quirks before enhancement | `.claude/settings.local.json` `env.SOQL_LIVE_FIRST="true"` |
| `DATA_VALIDATION_ENABLED` | `pre-operation-data-validator.sh` | Enables preflight data validation | `.claude/settings.local.json` `env.DATA_VALIDATION_ENABLED="1"` |
| `DATA_VALIDATION_STRICT` | `pre-operation-data-validator.sh` | Converts warnings into blocks | `.claude/settings.local.json` `env.DATA_VALIDATION_STRICT="1"` |

## Inline Override

For one-off commands, prefer inline assignment:

```bash
SKIP_FLOW_VALIDATION=1 sf project deploy start --source-dir force-app/main/default/flows --target-org sandbox
```

This keeps the setting attached to the exact hook invocation instead of relying on shell session inheritance.
