# Claude Hook Smoke Testing

These checks exercise the candidate commercial hook/runtime changes before deployment.

## Commands

- `npm run smoke:claude-hooks:static`
  - Builds isolated temp project and user hook settings.
  - Runs hook config validation, quick hook health, and routing health without calling the Claude API.

- `npm run smoke:claude-hooks`
  - Runs the static checks above.
  - Then runs live Claude smoke scenarios against the real local CLI and current login state.
  - Uses isolated temp repo/settings so the hooks under test come from the candidate repo, not installed user state.
  - Writes real Claude debug logs for the live Bash and Agent scenarios via `--debug-file`.

- `npm run verify:claude-installed-runtime`
  - Builds an isolated temp Claude home.
  - Adds this repo as a local marketplace.
  - Installs `opspal-core` and `opspal-salesforce`.
  - Verifies the generated cache/settings/runtime artifacts.

## Notes

- `smoke:claude-hooks` requires a working Claude login. The script performs a real `claude -p` auth probe first. If `claude auth status` says you are logged in but the auth probe still fails, run `claude auth login` and retry.
- `smoke:claude-hooks` supports `--allow-auth-failure` for local debugging when you want to keep the static/runtime checks but skip the live API scenarios.
- On failure, `test-claude-hooks-smoke.sh` preserves its temp directory automatically so the generated Claude debug logs can be inspected.
- The live smoke currently checks two deterministic flows:
  - `Bash`-only prompt to exercise `PermissionRequest` and `PreToolUse`
  - `Agent`-only prompt using a CLI-defined smoke agent to exercise `Agent` hook execution

## Failure Signals

The smoke scripts fail if they detect any of these in generated settings or captured debug output:

- legacy matcher strings such as `Task(*)`, `Agent(*)`, `Bash(*jq*)`
- blanket Bash deny rules such as `Bash*`
- `readonly variable`
- `invalid matcher`
- `BYPASS ATTEMPT DETECTED`
- `command not found`
- `integer expression expected`
- `Could not determine tool name`
- deprecated top-level `PermissionRequest` decision output

Notes:

- `Hook output does not start with {` in Claude debug logs is not automatically a failure. The current Claude hooks contract allows plain-text context output for `SessionStart` and `UserPromptSubmit`. Treat it as a failure only when it comes from a hook that should be structured or when it accompanies shell/runtime errors.
