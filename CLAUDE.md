# OpsPal Commercial Marketplace

This repository is the commercial OpsPal marketplace. It publishes 10 plugins and uses the plugin manifests under `plugins/*/.claude-plugin/plugin.json` as the source of truth for marketplace metadata.

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
| `opspal-ai-consult` | 1.4.11 | active |
| `opspal-core` | 2.46.1 | active |
| `opspal-data-hygiene` | 1.2.2 | deprecated |
| `opspal-gtm-planning` | 2.3.4 | active |
| `opspal-hubspot` | 3.9.14 | active |
| `opspal-marketo` | 2.6.24 | active |
| `opspal-mcp-client` | 1.1.2 | active |
| `opspal-monday` | 1.4.7 | experimental |
| `opspal-okrs` | 3.0.8 | active |
| `opspal-salesforce` | 3.86.8 | active |

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
