# Salesforce CLI (sf) Command Reference

**Last Updated**: 2025-10-26
**Status**: ✅ Production Ready
**Audience**: Claude Code Agents, Developers

## Overview

This guide lists the supported `sf` commands for common Salesforce operations in this plugin.
Legacy `sfdx` commands are not supported.

---

## Quick Reference (sf)

### Authentication & Org Management

```bash
sf org list
sf org login web --alias my-org --instance-url https://login.salesforce.com
sf org display --target-org my-org --json
sf org open --target-org my-org
```

### Data Operations

```bash
sf data query --query "SELECT Id, Name FROM Account LIMIT 10" --target-org my-org
sf data create record --sobject Account --values "Name='Example'" --target-org my-org
sf data update record --sobject Account --record-id 001xx000003DHPh --values "Name='Updated'" --target-org my-org
sf data delete record --sobject Account --record-id 001xx000003DHPh --target-org my-org
sf data import tree --plan data/accounts-plan.json --target-org my-org
sf data export tree --query "SELECT Id, Name FROM Account" --output-dir ./data --target-org my-org
```

### Metadata Operations

```bash
sf project deploy start --source-dir force-app/main/default --target-org my-org
sf project deploy start --source-dir force-app/main/default --dry-run --target-org my-org
sf project deploy report --target-org my-org
sf project deploy preview --source-dir force-app/main/default --target-org my-org
sf project retrieve start --metadata CustomObject,Profile --target-org my-org
sf project retrieve start --manifest package.xml --output-dir ./mdapi --target-org my-org
sf project reset tracking --target-org my-org
```

### Apex Commands

```bash
echo "System.debug('Hello');" | sf apex run --target-org my-org
sf apex run --file scripts/apex/sample.apex --target-org my-org
sf apex test run --test-level RunLocalTests --code-coverage --result-format human --target-org my-org
sf apex get test --test-run-id <test-run-id> --code-coverage --target-org my-org
```

### Packages & Limits

```bash
sf package install --package 04t... --wait 10 --target-org my-org
sf package installed list --target-org my-org
sf limits api display --target-org my-org
```

---

## Usage Patterns

- Always pass `--target-org` so operations run against the intended org.
- Use `--json` when piping output into scripts or parsers.
- Use `--dry-run` to validate deployments without applying changes.
- Keep a valid Salesforce project config file (`sfdx-project.json`) in the repo root.

---

## Resources

- `docs/sf-cli-reference/SALESFORCE_CLI_REFERENCE.md`
