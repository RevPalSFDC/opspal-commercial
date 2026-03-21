# OpsPal Commercial

Commercial Claude Code marketplace for RevOps delivery across Salesforce, HubSpot, Marketo, GTM planning, and executive reporting. This repo currently ships 10 plugins with 302 agents, 272 commands, and 164 hooks.

## Install

```bash
/plugin marketplace add RevPalSFDC/opspal-commercial
/plugin install opspal-core@opspal-commercial
/plugin install opspal-salesforce@opspal-commercial
/plugin install opspal-hubspot@opspal-commercial
/plugin install opspal-marketo@opspal-commercial
/plugin install opspal-gtm-planning@opspal-commercial
/plugin install opspal-okrs@opspal-commercial
```

## Update

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

## Plugin Catalog

| Plugin | Version | Status | Agents | Commands | Hooks |
|--------|---------|--------|--------|----------|-------|
| `opspal-ai-consult` | 1.4.8 | active | 2 | 3 | 1 |
| `opspal-core` | 2.42.18 | active | 79 | 112 | 78 |
| `opspal-data-hygiene` | 1.2.2 | deprecated | 2 | 1 | 1 |
| `opspal-gtm-planning` | 2.3.3 | active | 13 | 16 | 4 |
| `opspal-hubspot` | 3.9.4 | active | 59 | 33 | 13 |
| `opspal-marketo` | 2.6.18 | active | 30 | 30 | 19 |
| `opspal-mcp-client` | 1.1.1 | active | 3 | 3 | 3 |
| `opspal-monday` | 1.4.6 | experimental | 6 | 1 | 0 |
| `opspal-okrs` | 3.0.5 | active | 14 | 14 | 3 |
| `opspal-salesforce` | 3.84.8 | active | 94 | 59 | 42 |

Deprecated compatibility note: `opspal-data-hygiene` remains published for compatibility, but new installs should prefer the deduplication commands in `opspal-core`.

## Support

- Marketplace repository: https://github.com/RevPalSFDC/opspal-commercial
- Issues: https://github.com/RevPalSFDC/opspal-commercial/issues
