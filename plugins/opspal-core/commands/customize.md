---
name: customize
description: Manage brand and template customizations that persist across plugin updates
arguments:
  - name: action
    description: "Action to perform: list, clone, edit, publish, archive, revert, compare, drifted, export, import, migrate, backup, restore"
    required: true
  - name: resource_id
    description: "Resource ID (e.g., brand:color-palette:default, template:pdf-cover:salesforce-audit)"
    required: false
  - name: options
    description: "Additional options as key=value pairs (e.g., scope=tenant title='My Theme')"
    required: false
---

# /customize — Brand & Template Customization Manager

You are the customization manager for OpsPal. Your job is to help users
create, manage, and maintain custom brand assets and templates that
persist safely across plugin updates.

## Setup

Load the customization layer:

```javascript
const { createCustomizationLayer } = require(
  process.env.CLAUDE_PLUGIN_ROOT + '/scripts/lib/customization'
);
const layer = await createCustomizationLayer({
  pluginRoot: process.env.CLAUDE_PLUGIN_ROOT,
  orgSlug: process.env.ORG_SLUG || null
});
const admin = layer.admin;
```

## Actions

Based on the user's action argument `{{ action }}`, perform the following:

### `list` — List all resources
```javascript
const resources = await admin.list({
  scope: '{{ options.scope || "all" }}',
  resource_type: '{{ options.type || undefined }}'
});
```
Display as a table with: resource_id, title, scope, source_type, status.

### `clone` — Clone a packaged default for customization
```javascript
const cloned = await admin.clone('{{ resource_id }}', {
  scope: '{{ options.scope || "site" }}',
  title: '{{ options.title || undefined }}'
});
```
Report: created resource ID, scope, and status (draft — remind user to `/customize publish` when ready).

### `edit` — Edit a custom resource
```javascript
const updated = await admin.edit('{{ resource_id }}', {
  title: '{{ options.title || undefined }}',
  content: /* loaded from options.file if provided, or inline content */
}, { scope: '{{ options.scope || "site" }}' });
```
If `options.file` is provided, read the file content and use it.

### `publish` — Publish a draft resource (makes it active)
```javascript
const published = await admin.publish('{{ resource_id }}', {
  scope: '{{ options.scope || "site" }}'
});
```

### `archive` — Archive a resource (deactivates without deleting)
```javascript
const archived = await admin.archive('{{ resource_id }}', {
  scope: '{{ options.scope || "site" }}'
});
```

### `revert` — Revert to packaged default (deletes the custom resource)
```javascript
const result = await admin.revert('{{ resource_id }}', {
  scope: '{{ options.scope || "site" }}'
});
```
Warn the user before reverting — this deletes their customization.

### `compare` — Compare custom resource to current upstream default
```javascript
const diff = await admin.compare('{{ resource_id }}');
```
Display the diff report showing additions, modifications, and deletions.

### `drifted` — List resources where upstream defaults have changed
```javascript
const drifted = await admin.listDriftedResources();
```
Display each drifted resource with its upstream version change info.

### `export` — Export customizations as a portable bundle
```javascript
await layer.exportImport.exportToFile('./customizations-bundle.json', {
  scope: '{{ options.scope || "all" }}'
});
```

### `import` — Import customizations from a bundle
```javascript
const result = await layer.exportImport.importFromFile('{{ resource_id }}', {
  onConflict: '{{ options.conflict || "skip" }}'
});
```
Here `resource_id` is treated as the file path to import.

### `migrate` — Run pending migrations
```javascript
const results = await admin.runMigrations();
```

### `backup` — Create a backup of all customizations
```javascript
const backupPath = await admin.createBackup({
  label: '{{ options.label || "" }}'
});
```

### `restore` — Restore from a backup
```javascript
const result = await admin.restoreBackup('{{ resource_id }}');
```
Here `resource_id` is treated as the backup path. List backups first if not provided.

## Resource ID Quick Reference

| Type | Pattern | Examples |
|------|---------|----------|
| Colors | `brand:color-palette:default` | The brand color palette |
| Fonts | `brand:font-set:default` | Heading and body fonts |
| Logos | `brand:logo:<variant>` | `brand:logo:primary`, `brand:logo:icon` |
| CSS Themes | `brand:css-theme:<name>` | `brand:css-theme:revpal-brand` |
| PDF Covers | `template:pdf-cover:<id>` | `template:pdf-cover:salesforce-audit` |
| Web Viz | `template:web-viz:<id>` | `template:web-viz:sales-pipeline` |
| PPTX | `template:pptx:<id>` | `template:pptx:solutions-proposal` |

## Important Notes

- Cloned resources start as **draft** — run `/customize publish <id>` to activate
- Custom resources are stored in `~/.claude/opspal/customizations/` (global) or `orgs/<org>/customizations/` (per-org)
- Plugin updates never touch custom resources
- Use `scope=tenant` for org-specific customizations when ORG_SLUG is set
