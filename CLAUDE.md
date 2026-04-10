# OpsPal Commercial Marketplace

This repository is the commercial OpsPal marketplace. It publishes 9 plugins and uses the plugin manifests under `plugins/*/.claude-plugin/plugin.json` as the source of truth for marketplace metadata.

## Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-commercial
/plugin install opspal-core@opspal-commercial
/plugin install opspal-salesforce@opspal-commercial
/plugin install opspal-hubspot@opspal-commercial
/plugin install opspal-marketo@opspal-commercial
```

## Published Versions

| Plugin | Version | Status |
|--------|---------|--------|
| `opspal-ai-consult` | 1.4.14 | active |
| `opspal-core` | 2.55.8 | active |
| `opspal-gtm-planning` | 2.3.10 | active |
| `opspal-hubspot` | 3.9.31 | active |
| `opspal-marketo` | 2.6.40 | active |
| `opspal-monday` | 1.4.10 | experimental |
| `opspal-okrs` | 3.0.13 | active |
| `opspal-salesforce` | 3.87.11 | active |

## Updating

```bash
cd ~/.claude/plugins/marketplaces/opspal-commercial
git pull origin main
/pluginupdate --fix
```

## License Activation

```bash
/activate-license <license-key> <email>
/license-status
```

## Support

- Repository: https://github.com/RevPalSFDC/opspal-commercial
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues

## Repository Stats

| Metric | Count |
|--------|-------|
| Plugins | 8 |
| Agents | 298 |
| Commands | 282 |
| Skills | 162 |
| Hooks | 204 |
| Scripts | 1852 |
