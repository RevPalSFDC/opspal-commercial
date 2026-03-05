## Security & Access

{{#if featureDetails.userAccess}}
**Custom Permission Sets:** {{featureDetails.userAccess.customPermissionSets}}
**Active Profiles:** {{featureDetails.userAccess.activeProfiles}}
**Permission Set Groups:** {{featureDetails.userAccess.permissionSetGroups}}

### Complexity Assessment

{{#if featureDetails.userAccess.isComplex}}
**Status:** Complex configuration detected
- High number of custom permission sets or profiles indicates potential fragmentation
- Consider running permission set assessment for consolidation opportunities
{{else}}
**Status:** Standard configuration
- Permission model is within normal parameters
{{/if}}

{{#if featureDetails.userAccess.fragmentationWarning}}
**Warning:** Permission set fragmentation detected (>50 custom sets)
- Recommend: Run `/assess-permissions` for full analysis
- Consider: Two-tier permission set architecture for maintainability
{{/if}}
{{else}}
User access information not available. Run feature detection to populate.
{{/if}}
