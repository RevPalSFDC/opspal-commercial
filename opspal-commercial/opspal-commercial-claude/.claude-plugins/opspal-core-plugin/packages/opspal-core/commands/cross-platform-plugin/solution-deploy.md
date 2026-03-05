---
description: Deploy a solution template to a target environment with parameter resolution
argument-hint: "<solution-name> --env <environment> [--validate-only] [--dry-run]"
---

# Solution Deploy Command

Deploy a solution template to a target environment with parameter resolution and validation.

## Usage

```bash
/solution-deploy <solution-name> --env <environment> [options]
```

## Arguments

- `<solution-name>` - Name or path to the solution template

## Required Options

- `--env <environment>` - Target environment profile name (e.g., production, sandbox, acme-corp)

## Optional Parameters

- `--param <name>=<value>` - Override solution parameters (can be repeated)
- `--validate-only` - Run validation without deploying
- `--check-only` - Salesforce check-only deployment (validate in org)
- `--dry-run` - Show deployment plan without executing
- `--verbose` - Enable verbose logging
- `--no-checkpoint` - Skip checkpoint creation (not recommended for production)
- `--force` - Skip confirmation prompts

## Examples

### Basic Deployment
```bash
/solution-deploy lead-management --env sandbox
```

### Production with Parameter Overrides
```bash
/solution-deploy lead-management --env production \
  --param scoringThreshold=75 \
  --param enableNurturing=false \
  --param defaultOwner=00G000000000xyz
```

### Validation Only
```bash
/solution-deploy quote-to-cash --env sandbox --validate-only
```

### Check-Only (Salesforce)
```bash
/solution-deploy lead-management --env production --check-only
```

### Dry Run
```bash
/solution-deploy lead-management --env production --dry-run
```

## Workflow

1. **Load Solution** - Parse solution.json manifest
2. **Load Environment** - Resolve environment profile with inheritance
3. **Resolve Parameters** - Merge defaults, environment values, and overrides
4. **Pre-flight Checks** - Run validation checks
5. **Dependency Resolution** - Determine deployment order
6. **Template Processing** - Render templates with parameters
7. **Create Checkpoint** - Capture pre-deployment state
8. **Deploy Components** - Deploy to target platform(s)
9. **Post-Deploy Validation** - Verify deployment success

## Output

```
[SolutionEngine] Phase 1: Loading solution...
[SolutionEngine] Phase 2: Loading environment profile...
[SolutionEngine] Phase 3: Resolving parameters...
[SolutionEngine] Phase 4: Running pre-flight checks...
[SolutionEngine] Phase 5: Resolving component dependencies...
[SolutionEngine] Phase 6: Processing templates...
[SolutionEngine] Phase 7: Creating deployment checkpoint...
[SolutionEngine] Phase 8: Deploying components...
  Deploying phase 1: lead-score-field
  Deploying phase 2: lead-routing-flow
  Deploying phase 3: lead-permission-set
[SolutionEngine] Phase 9: Running post-deployment validation...

✓ Deployment completed successfully!

Deployment ID: deploy-abc123
Duration: 45s
Components: 3 deployed
Checkpoint: chkpt-xyz789
```

## Error Handling

If deployment fails:
1. Partial deployment is recorded
2. Checkpoint is available for rollback
3. Error details are displayed

To rollback:
```bash
/solution-rollback --checkpoint chkpt-xyz789
```

## Related Commands

- `/solution-validate` - Validate solution without deploying
- `/solution-list` - List available solutions
- `/solution-rollback` - Rollback a deployment
- `/solution-status` - Check deployment status
