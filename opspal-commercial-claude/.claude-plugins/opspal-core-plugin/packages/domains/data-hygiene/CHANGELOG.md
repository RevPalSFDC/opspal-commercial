# Changelog

All notable changes to the Data Hygiene Plugin will be documented in this file.

## [1.0.1] - 2025-11-24

### Added
- **USAGE.md** - Quick-start guide with 6-phase workflow documentation
- Comprehensive examples for each deduplication phase
- Best practices for safety guardrails and rollback procedures

### Documentation
- Added detailed workflow documentation
- Expanded safety checkpoint descriptions
- Included integration examples with HubSpot and Salesforce

---

## [1.0.0] - 2025-11-01

### Initial Release

Cross-platform Company/Account deduplication for HubSpot and Salesforce.

### Features

#### 6-Phase Deduplication Workflow
1. **Discovery** - Identify duplicate candidates using fuzzy matching
2. **Analysis** - Analyze duplicate groups and determine canonical records
3. **Validation** - Validate merge decisions with safety checks
4. **Preparation** - Prepare merge operations with rollback points
5. **Execution** - Execute merges with real-time monitoring
6. **Verification** - Verify merge success and data integrity

#### Safety Guardrails
- **Idempotency tracking** - Prevent duplicate operations
- **Weighted canonical selection** - Intelligent survivor record selection
- **Association preservation** - Maintain all related records and associations
- **Rollback capability** - Full rollback support at any phase
- **Dry-run mode** - Preview changes before execution

#### Cross-Platform Support
- **HubSpot Companies** - Deduplicate company records
- **Salesforce Accounts** - Deduplicate account records
- **Bidirectional sync awareness** - Respects sync configurations

### Agents
- `dedup-safety-copilot` - Intelligent deduplication guidance with Type 1/2 error detection

### Scripts
- `company-dedup-analyzer.js` - Analyze duplicate candidates
- `company-dedup-executor.js` - Execute deduplication operations
- `company-dedup-validator.js` - Validate merge decisions
- `canonical-selector.js` - Weighted canonical record selection
- `rollback-manager.js` - Manage rollback operations
- `association-preserver.js` - Preserve record associations
- Plus 5 additional supporting scripts

### Commands
- `/dedup` - Interactive deduplication wizard

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.1 | 2025-11-24 | USAGE.md quick-start guide |
| 1.0.0 | 2025-11-01 | Initial release with 6-phase workflow |
