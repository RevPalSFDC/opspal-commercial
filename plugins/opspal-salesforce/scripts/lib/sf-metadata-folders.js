'use strict';

/**
 * Canonical SFDX source-format folder → MDAPI metadata type mapping.
 * Single source of truth for the deployment validator. Adding a folder
 * type is a one-file change.
 */
const METADATA_FOLDERS = Object.freeze({
  // Apex
  'classes': 'ApexClass',
  'triggers': 'ApexTrigger',
  'components': 'ApexComponent',
  'pages': 'ApexPage',
  // Lightning
  'lwc': 'LightningComponentBundle',
  'aura': 'AuraDefinitionBundle',
  'flexipages': 'FlexiPage',
  // Declarative automation
  'flows': 'Flow',
  'workflows': 'Workflow',
  'approvalProcesses': 'ApprovalProcess',
  'assignmentRules': 'AssignmentRules',
  'autoResponseRules': 'AutoResponseRules',
  'escalationRules': 'EscalationRules',
  'sharingRules': 'SharingRules',
  // Schema
  'objects': 'CustomObject',
  'objectTranslations': 'CustomObjectTranslation',
  'recordTypes': 'RecordType',
  'customMetadata': 'CustomMetadata',
  'globalValueSets': 'GlobalValueSet',
  'globalValueSetTranslations': 'GlobalValueSetTranslation',
  'standardValueSets': 'StandardValueSet',
  'standardValueSetTranslations': 'StandardValueSetTranslation',
  'customLabels': 'CustomLabels',
  'labels': 'CustomLabels',
  // UI
  'layouts': 'Layout',
  'tabs': 'CustomTab',
  'applications': 'CustomApplication',
  'quickActions': 'QuickAction',
  'homePageLayouts': 'HomePageLayout',
  'homePageComponents': 'HomePageComponent',
  'appMenus': 'AppMenu',
  // Security
  'permissionsets': 'PermissionSet',
  'permissionsetgroups': 'PermissionSetGroup',
  'profiles': 'Profile',
  'roles': 'Role',
  'groups': 'Group',
  'queues': 'Queue',
  'customPermissions': 'CustomPermission',
  'sharingSets': 'SharingSet',
  'connectedApps': 'ConnectedApp',
  'remoteSiteSettings': 'RemoteSiteSetting',
  'namedCredentials': 'NamedCredential',
  // Reports & dashboards
  'reports': 'Report',
  'dashboards': 'Dashboard',
  'reportTypes': 'ReportType',
  // Communication
  'emailTemplates': 'EmailTemplate',
  'letterhead': 'Letterhead',
  // Assets
  'staticresources': 'StaticResource',
  'documents': 'Document',
  // Platform
  'cachePartitions': 'PlatformCachePartition',
  'territory2Models': 'Territory2Model',
  'territory2Types': 'Territory2Type',
  // Analytics
  'analyticSnapshots': 'AnalyticSnapshot'
});

const ROOT_DETECTION_FOLDERS = Object.freeze(new Set(Object.keys(METADATA_FOLDERS)));

module.exports = { METADATA_FOLDERS, ROOT_DETECTION_FOLDERS };
