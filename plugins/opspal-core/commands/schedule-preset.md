---
name: schedule-preset
description: Load a batch of scheduled tasks from a preset file
arguments:
  - name: preset_name
    description: "Preset name (e.g., 'autonomous-maintenance') or full path to preset JSON"
    required: false
user_facing: true
---

# /schedule-preset

Load a preset of scheduled maintenance tasks into the scheduler. Presets are JSON files containing multiple task definitions that get loaded idempotently (existing tasks are skipped).

## Available Presets

| Preset | Tasks | Description |
|--------|-------|-------------|
| `autonomous-maintenance` | 10 | Daily/weekly/monthly self-improvement pipeline tasks |

## Instructions

1. If no argument is provided, list available presets from `${PLUGIN_ROOT}/scheduler/presets/`
2. If a preset name is given (without `.json`), resolve it to `${PLUGIN_ROOT}/scheduler/presets/<name>.json`
3. If a full file path is given, use it directly
4. Run: `node ${PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js load-preset <resolved-path>`
5. Show the output (added, skipped, errors)
6. Run `node ${PLUGIN_ROOT}/scheduler/scripts/lib/scheduler-manager.js list` to confirm

## Example Usage

```bash
# Load the autonomous maintenance preset
/schedule-preset autonomous-maintenance

# Load from a custom path
/schedule-preset /path/to/my-preset.json

# List available presets
/schedule-preset
```
