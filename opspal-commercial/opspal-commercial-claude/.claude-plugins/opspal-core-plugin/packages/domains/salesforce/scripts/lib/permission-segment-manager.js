#!/usr/bin/env node

/**
 * Permission Set Segment Manager
 *
 * Manages segment-by-segment permission set creation with state tracking,
 * complexity monitoring, and validation at each step.
 *
 * Segments:
 * 1. metadata - Name, label, description, license
 * 2. object-permissions - CRUD permissions by object
 * 3. field-permissions - FLS by field
 * 4. system-permissions - System permissions (API, ViewAllData, etc.)
 * 5. application-visibility - App access
 * 6. class-accesses - Apex class access
 * 7. page-accesses - Visualforce page access
 * 8. custom-permissions - Custom permission flags
 * 9. record-type-visibilities - Record type assignments
 * 10. layout-assignments - Page layout assignments
 * 11. tab-settings - Tab visibility
 *
 * Usage:
 *   node permission-segment-manager.js start --name Sales_Manager --segment-type metadata
 *   node permission-segment-manager.js complete --name Sales_Manager --segment-type metadata
 *   node permission-segment-manager.js list --name Sales_Manager
 *   node permission-segment-manager.js status --name Sales_Manager --segment-type object-permissions
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Segment definitions
const SEGMENT_TYPES = {
    'metadata': {
        order: 1,
        label: 'Metadata',
        description: 'Name, label, description, license type',
        required: true,
        validator: 'validateMetadata'
    },
    'object-permissions': {
        order: 2,
        label: 'Object Permissions',
        description: 'CRUD permissions for each object',
        required: false,
        validator: 'validateObjectPermissions'
    },
    'field-permissions': {
        order: 3,
        label: 'Field Permissions',
        description: 'Field-Level Security for each field',
        required: false,
        validator: 'validateFieldPermissions'
    },
    'system-permissions': {
        order: 4,
        label: 'System Permissions',
        description: 'System-level permissions (API, ViewAllData, etc.)',
        required: false,
        validator: 'validateSystemPermissions'
    },
    'application-visibility': {
        order: 5,
        label: 'Application Visibility',
        description: 'App access permissions',
        required: false,
        validator: 'validateApplicationVisibility'
    },
    'class-accesses': {
        order: 6,
        label: 'Apex Class Access',
        description: 'Apex class permissions',
        required: false,
        validator: 'validateClassAccesses'
    },
    'page-accesses': {
        order: 7,
        label: 'Visualforce Page Access',
        description: 'Visualforce page permissions',
        required: false,
        validator: 'validatePageAccesses'
    },
    'custom-permissions': {
        order: 8,
        label: 'Custom Permissions',
        description: 'Custom permission definitions',
        required: false,
        validator: 'validateCustomPermissions'
    },
    'record-type-visibilities': {
        order: 9,
        label: 'Record Type Visibilities',
        description: 'Record type assignments',
        required: false,
        validator: 'validateRecordTypeVisibilities'
    },
    'layout-assignments': {
        order: 10,
        label: 'Layout Assignments',
        description: 'Page layout assignments',
        required: false,
        validator: 'validateLayoutAssignments'
    },
    'tab-settings': {
        order: 11,
        label: 'Tab Settings',
        description: 'Tab visibility settings',
        required: false,
        validator: 'validateTabSettings'
    }
};

// Segment states
const SEGMENT_STATES = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

class PermissionSegmentManager {
    constructor(permissionSetName, baseDir = '.permission-segments') {
        this.permissionSetName = permissionSetName;
        this.baseDir = baseDir;
        this.segmentDir = path.join(baseDir, permissionSetName);
        this.complexityFile = path.join(this.segmentDir, 'complexity.json');
        this.metaFile = path.join(this.segmentDir, 'meta.json');
    }

    /**
     * Initialize segment directory
     */
    initialize() {
        if (!fs.existsSync(this.segmentDir)) {
            fs.mkdirSync(this.segmentDir, { recursive: true });
        }

        // Initialize meta file if not exists
        if (!fs.existsSync(this.metaFile)) {
            const meta = {
                permissionSetName: this.permissionSetName,
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                segments: {}
            };

            // Initialize all segments as not_started
            for (const segmentType of Object.keys(SEGMENT_TYPES)) {
                meta.segments[segmentType] = {
                    status: SEGMENT_STATES.NOT_STARTED,
                    startTime: null,
                    completeTime: null
                };
            }

            this._saveMeta(meta);
        }

        // Initialize complexity file if not exists
        if (!fs.existsSync(this.complexityFile)) {
            const complexity = {
                overall: 0,
                breakdown: {},
                lastUpdated: new Date().toISOString()
            };
            this._saveComplexity(complexity);
        }
    }

    /**
     * Start a segment
     */
    startSegment(segmentType, data = {}) {
        if (!SEGMENT_TYPES[segmentType]) {
            throw new Error(`Invalid segment type: ${segmentType}`);
        }

        this.initialize();

        const meta = this._loadMeta();
        const segment = meta.segments[segmentType];

        if (segment.status === SEGMENT_STATES.COMPLETED) {
            throw new Error(`Segment ${segmentType} is already completed`);
        }

        // Update segment status
        segment.status = SEGMENT_STATES.IN_PROGRESS;
        segment.startTime = new Date().toISOString();
        meta.lastModified = new Date().toISOString();

        this._saveMeta(meta);

        // Create segment data file
        const segmentFile = this._getSegmentFile(segmentType);
        const segmentData = {
            segmentType,
            status: SEGMENT_STATES.IN_PROGRESS,
            startTime: segment.startTime,
            completeTime: null,
            data,
            validation: {},
            complexity: 0
        };

        fs.writeFileSync(segmentFile, JSON.stringify(segmentData, null, 2));

        return {
            success: true,
            message: `Started segment: ${SEGMENT_TYPES[segmentType].label}`,
            segmentFile
        };
    }

    /**
     * Complete a segment
     */
    completeSegment(segmentType, skipValidation = false) {
        if (!SEGMENT_TYPES[segmentType]) {
            throw new Error(`Invalid segment type: ${segmentType}`);
        }

        const meta = this._loadMeta();
        const segment = meta.segments[segmentType];

        if (segment.status !== SEGMENT_STATES.IN_PROGRESS) {
            throw new Error(`Segment ${segmentType} is not in progress`);
        }

        // Load segment data
        const segmentFile = this._getSegmentFile(segmentType);
        if (!fs.existsSync(segmentFile)) {
            throw new Error(`Segment data file not found: ${segmentFile}`);
        }

        const segmentData = JSON.parse(fs.readFileSync(segmentFile, 'utf-8'));

        // Validate segment (unless skipped)
        if (!skipValidation) {
            const validatorMethod = SEGMENT_TYPES[segmentType].validator;
            if (this[validatorMethod]) {
                const validationResult = this[validatorMethod](segmentData.data);
                segmentData.validation = validationResult;

                if (!validationResult.valid) {
                    throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
                }
            }
        }

        // Update segment status
        segment.status = SEGMENT_STATES.COMPLETED;
        segment.completeTime = new Date().toISOString();
        segmentData.status = SEGMENT_STATES.COMPLETED;
        segmentData.completeTime = segment.completeTime;
        meta.lastModified = new Date().toISOString();

        this._saveMeta(meta);
        fs.writeFileSync(segmentFile, JSON.stringify(segmentData, null, 2));

        // Update overall complexity
        this._updateComplexity();

        return {
            success: true,
            message: `Completed segment: ${SEGMENT_TYPES[segmentType].label}`,
            validation: segmentData.validation
        };
    }

    /**
     * List all segments
     */
    listSegments() {
        const meta = this._loadMeta();
        const complexity = this._loadComplexity();

        const segments = Object.keys(SEGMENT_TYPES)
            .sort((a, b) => SEGMENT_TYPES[a].order - SEGMENT_TYPES[b].order)
            .map(segmentType => {
                const def = SEGMENT_TYPES[segmentType];
                const state = meta.segments[segmentType];

                return {
                    order: def.order,
                    type: segmentType,
                    label: def.label,
                    description: def.description,
                    required: def.required,
                    status: state.status,
                    startTime: state.startTime,
                    completeTime: state.completeTime
                };
            });

        const completedCount = segments.filter(s => s.status === SEGMENT_STATES.COMPLETED).length;
        const totalCount = segments.length;
        const percentComplete = Math.round((completedCount / totalCount) * 100);

        return {
            permissionSetName: this.permissionSetName,
            segments,
            summary: {
                total: totalCount,
                completed: completedCount,
                inProgress: segments.filter(s => s.status === SEGMENT_STATES.IN_PROGRESS).length,
                notStarted: segments.filter(s => s.status === SEGMENT_STATES.NOT_STARTED).length,
                percentComplete
            },
            complexity: {
                overall: complexity.overall,
                rating: this._getRating(complexity.overall)
            }
        };
    }

    /**
     * Get segment status
     */
    getSegmentStatus(segmentType) {
        if (!SEGMENT_TYPES[segmentType]) {
            throw new Error(`Invalid segment type: ${segmentType}`);
        }

        const meta = this._loadMeta();
        const segmentState = meta.segments[segmentType];
        const segmentDef = SEGMENT_TYPES[segmentType];

        const result = {
            type: segmentType,
            label: segmentDef.label,
            description: segmentDef.description,
            status: segmentState.status,
            startTime: segmentState.startTime,
            completeTime: segmentState.completeTime,
            data: null,
            validation: null
        };

        // Load segment data if exists
        const segmentFile = this._getSegmentFile(segmentType);
        if (fs.existsSync(segmentFile)) {
            const segmentData = JSON.parse(fs.readFileSync(segmentFile, 'utf-8'));
            result.data = segmentData.data;
            result.validation = segmentData.validation;
        }

        return result;
    }

    /**
     * Update complexity
     */
    _updateComplexity() {
        const complexity = {
            overall: 0,
            breakdown: {},
            lastUpdated: new Date().toISOString()
        };

        // Calculate complexity from all completed segments
        const meta = this._loadMeta();
        for (const [segmentType, state] of Object.entries(meta.segments)) {
            if (state.status === SEGMENT_STATES.COMPLETED) {
                const segmentFile = this._getSegmentFile(segmentType);
                if (fs.existsSync(segmentFile)) {
                    const segmentData = JSON.parse(fs.readFileSync(segmentFile, 'utf-8'));
                    if (segmentData.complexity) {
                        complexity.breakdown[segmentType] = segmentData.complexity;
                        complexity.overall += segmentData.complexity;
                    }
                }
            }
        }

        // Cap overall at 1.0
        complexity.overall = Math.min(complexity.overall, 1.0);

        this._saveComplexity(complexity);
    }

    /**
     * Get segment file path
     */
    _getSegmentFile(segmentType) {
        return path.join(this.segmentDir, `${segmentType}.json`);
    }

    /**
     * Load meta
     */
    _loadMeta() {
        return JSON.parse(fs.readFileSync(this.metaFile, 'utf-8'));
    }

    /**
     * Save meta
     */
    _saveMeta(meta) {
        fs.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2));
    }

    /**
     * Load complexity
     */
    _loadComplexity() {
        return JSON.parse(fs.readFileSync(this.complexityFile, 'utf-8'));
    }

    /**
     * Save complexity
     */
    _saveComplexity(complexity) {
        fs.writeFileSync(this.complexityFile, JSON.stringify(complexity, null, 2));
    }

    /**
     * Get rating from score
     */
    _getRating(score) {
        if (score < 0.3) return 'simple';
        if (score < 0.7) return 'moderate';
        return 'complex';
    }

    // VALIDATORS

    validateMetadata(data) {
        const errors = [];

        if (!data.name || data.name.trim() === '') {
            errors.push('Name is required');
        }
        if (!data.label || data.label.trim() === '') {
            errors.push('Label is required');
        }
        if (data.label && data.label.length > 80) {
            errors.push('Label must be 80 characters or less');
        }
        if (!data.description || data.description.trim() === '') {
            errors.push('Description is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateObjectPermissions(data) {
        const errors = [];

        if (!Array.isArray(data) || data.length === 0) {
            errors.push('At least one object permission is required');
        }

        for (const perm of data || []) {
            if (!perm.object) {
                errors.push('Object name is required');
            }
            // CRUD consistency: if Create/Update/Delete, then Read must be true
            if ((perm.allowCreate || perm.allowEdit || perm.allowDelete) && !perm.allowRead) {
                errors.push(`Object ${perm.object}: Read permission required when Create/Edit/Delete granted`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateFieldPermissions(data) {
        const errors = [];

        for (const perm of data || []) {
            if (!perm.field) {
                errors.push('Field name is required');
            }
            // Edit requires Read
            if (perm.editable && !perm.readable) {
                errors.push(`Field ${perm.field}: Read permission required when Edit granted`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateSystemPermissions(data) {
        // System permissions are always valid (just warnings for high-risk)
        return {
            valid: true,
            errors: []
        };
    }

    validateApplicationVisibility(data) {
        const errors = [];

        for (const app of data || []) {
            if (!app.application) {
                errors.push('Application name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateClassAccesses(data) {
        const errors = [];

        for (const access of data || []) {
            if (!access.apexClass) {
                errors.push('Apex class name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validatePageAccesses(data) {
        const errors = [];

        for (const access of data || []) {
            if (!access.apexPage) {
                errors.push('Visualforce page name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateCustomPermissions(data) {
        const errors = [];

        for (const perm of data || []) {
            if (!perm.name) {
                errors.push('Custom permission name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateRecordTypeVisibilities(data) {
        const errors = [];

        for (const visibility of data || []) {
            if (!visibility.recordType) {
                errors.push('Record type is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateLayoutAssignments(data) {
        const errors = [];

        for (const assignment of data || []) {
            if (!assignment.layout) {
                errors.push('Layout name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    validateTabSettings(data) {
        const errors = [];

        for (const setting of data || []) {
            if (!setting.tab) {
                errors.push('Tab name is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * CLI Interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Permission Set Segment Manager

Usage:
  node permission-segment-manager.js <command> [options]

Commands:
  start           Start a new segment
  complete        Complete the current segment
  list            List all segments
  status          Get status of specific segment

Options:
  --name <name>              Permission set name (required)
  --segment-type <type>      Segment type (required for start/complete/status)
  --skip-validation          Skip validation when completing segment
  --format <format>          Output format: text, json (default: text)
  --help                     Show this help message

Segment Types:
  metadata, object-permissions, field-permissions, system-permissions,
  application-visibility, class-accesses, page-accesses, custom-permissions,
  record-type-visibilities, layout-assignments, tab-settings

Examples:
  # Start metadata segment
  node permission-segment-manager.js start --name Sales_Manager --segment-type metadata

  # Complete segment
  node permission-segment-manager.js complete --name Sales_Manager --segment-type metadata

  # List all segments
  node permission-segment-manager.js list --name Sales_Manager

  # Get segment status
  node permission-segment-manager.js status --name Sales_Manager --segment-type object-permissions
        `);
        process.exit(0);
    }

    const command = args[0];
    const nameIndex = args.indexOf('--name');
    const segmentTypeIndex = args.indexOf('--segment-type');
    const formatIndex = args.indexOf('--format');
    const skipValidation = args.includes('--skip-validation');

    if (nameIndex === -1 || !args[nameIndex + 1]) {
        console.error('Error: --name option is required');
        process.exit(1);
    }

    const name = args[nameIndex + 1];
    const segmentType = segmentTypeIndex !== -1 ? args[segmentTypeIndex + 1] : null;
    const format = formatIndex !== -1 ? args[formatIndex + 1] : 'text';

    const manager = new PermissionSegmentManager(name);

    try {
        let result;

        switch (command) {
            case 'start':
                if (!segmentType) {
                    console.error('Error: --segment-type is required for start command');
                    process.exit(1);
                }
                result = manager.startSegment(segmentType);
                if (format === 'json') {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(`✅ ${result.message}`);
                    console.log(`Segment file: ${result.segmentFile}`);
                }
                break;

            case 'complete':
                if (!segmentType) {
                    console.error('Error: --segment-type is required for complete command');
                    process.exit(1);
                }
                result = manager.completeSegment(segmentType, skipValidation);
                if (format === 'json') {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(`✅ ${result.message}`);
                    if (result.validation) {
                        console.log('Validation: PASSED');
                    }
                }
                break;

            case 'list':
                result = manager.listSegments();
                if (format === 'json') {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(`\n${result.permissionSetName} Segments`);
                    console.log('='.repeat(50));
                    result.segments.forEach(seg => {
                        const emoji = seg.status === 'completed' ? '✅' :
                                     seg.status === 'in_progress' ? '⏳' : '⬜';
                        console.log(`${seg.order}. ${emoji} ${seg.label} (${seg.status})`);
                    });
                    console.log('\nSummary:');
                    console.log(`  Completed: ${result.summary.completed}/${result.summary.total} (${result.summary.percentComplete}%)`);
                    console.log(`  Complexity: ${result.complexity.overall.toFixed(2)} (${result.complexity.rating})`);
                }
                break;

            case 'status':
                if (!segmentType) {
                    console.error('Error: --segment-type is required for status command');
                    process.exit(1);
                }
                result = manager.getSegmentStatus(segmentType);
                if (format === 'json') {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(`\nSegment: ${result.label}`);
                    console.log(`Status: ${result.status}`);
                    if (result.startTime) {
                        console.log(`Started: ${result.startTime}`);
                    }
                    if (result.completeTime) {
                        console.log(`Completed: ${result.completeTime}`);
                    }
                }
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Use --help to see available commands');
                process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = PermissionSegmentManager;

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}
