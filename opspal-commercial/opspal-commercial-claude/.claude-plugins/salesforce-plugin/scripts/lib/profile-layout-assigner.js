#!/usr/bin/env node

/**
 * Profile Layout Assigner
 * =======================
 * Tool for managing Salesforce profile layout assignments programmatically.
 * Handles bulk assignment of page layouts to profiles with safe merge strategies.
 * 
 * Key Features:
 * - Non-destructive profile updates
 * - Bulk assignment capabilities
 * - Rollback and recovery
 * - Permission Set alternatives
 */

const EnhancedMCPTool = require('../../mcp-extensions/tools/base/enhanced-mcp-tool');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class ProfileLayoutAssigner extends EnhancedMCPTool {
    constructor(config = {}) {
        super({
            name: 'ProfileLayoutAssigner',
            version: '1.0.0',
            stage: config.stage || 'production',
            description: 'Manages profile layout assignments for Salesforce objects',
            ...config
        });
        
        this.org = config.org || process.env.SF_TARGET_ORG;
        this.tempDir = path.join('/tmp', 'profile-layouts');
        this.backupDir = path.join(this.tempDir, 'backups');
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });
    }
    
    /**
     * Initialize working directories
     */
    async initialize() {
        await fs.mkdir(this.tempDir, { recursive: true });
        await fs.mkdir(this.backupDir, { recursive: true });
        this.logOperation('initialization', { tempDir: this.tempDir });
    }
    
    /**
     * Assign a layout to all profiles for a specific object and record type
     */
    async assignLayoutToAllProfiles(params) {
        this.validateParams(params, ['layoutName', 'objectName']);
        this.logOperation('bulk_assignment_start', params);
        
        const { layoutName, objectName, recordType = 'default' } = params;
        
        try {
            // Step 1: Retrieve all profiles
            const profiles = await this.retrieveAllProfiles();
            this.logOperation('profiles_retrieved', { count: profiles.length });
            
            // Step 2: Backup current state
            const backupId = await this.backupProfiles(profiles);
            this.logOperation('backup_created', { backupId });
            
            // Step 3: Process each profile
            const results = [];
            for (const profile of profiles) {
                try {
                    const result = await this.assignLayoutToProfile({
                        profileName: profile.Name,
                        layoutName,
                        objectName,
                        recordType
                    });
                    results.push(result);
                } catch (error) {
                    this.logOperation('profile_assignment_error', { 
                        profile: profile.Name, 
                        error: error.message 
                    });
                    results.push({
                        profile: profile.Name,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // Step 4: Deploy changes
            const deployResult = await this.deployProfileChanges(results.filter(r => r.success));
            
            this.logOperation('bulk_assignment_complete', { 
                total: profiles.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            });
            
            return {
                success: true,
                backupId,
                results,
                deployResult,
                auditTrail: this.getAuditTrail()
            };
            
        } catch (error) {
            this.logOperation('bulk_assignment_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'assignLayoutToAllProfiles', params });
        }
    }
    
    /**
     * Assign a layout to specific profiles
     */
    async assignLayoutToProfiles(params) {
        this.validateParams(params, ['profileNames', 'layoutName', 'objectName']);
        this.logOperation('selective_assignment_start', params);
        
        const { profileNames, layoutName, objectName, recordType = 'default' } = params;
        
        try {
            const results = [];
            
            for (const profileName of profileNames) {
                try {
                    const result = await this.assignLayoutToProfile({
                        profileName,
                        layoutName,
                        objectName,
                        recordType
                    });
                    results.push(result);
                } catch (error) {
                    results.push({
                        profile: profileName,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            const deployResult = await this.deployProfileChanges(results.filter(r => r.success));
            
            return {
                success: true,
                results,
                deployResult,
                auditTrail: this.getAuditTrail()
            };
            
        } catch (error) {
            this.logOperation('selective_assignment_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'assignLayoutToProfiles', params });
        }
    }
    
    /**
     * Assign layout to a single profile
     */
    async assignLayoutToProfile(params) {
        const { profileName, layoutName, objectName, recordType } = params;
        this.logOperation('profile_assignment_start', { profileName, layoutName });
        
        try {
            // Retrieve current profile metadata
            const profileMetadata = await this.retrieveProfileMetadata(profileName);
            
            // Parse XML
            const profileObj = await this.parser.parseStringPromise(profileMetadata);
            
            // Ensure layoutAssignments array exists
            if (!profileObj.Profile.layoutAssignments) {
                profileObj.Profile.layoutAssignments = [];
            }
            
            // Find existing assignment or create new one
            const layoutAssignments = profileObj.Profile.layoutAssignments;
            const existingIndex = layoutAssignments.findIndex(la => 
                la.layout && la.layout[0] === `${objectName}-${layoutName}` &&
                (recordType === 'default' || (la.recordType && la.recordType[0] === recordType))
            );
            
            const assignment = {
                layout: [`${objectName}-${layoutName}`]
            };
            
            if (recordType !== 'default') {
                assignment.recordType = [`${objectName}.${recordType}`];
            }
            
            if (existingIndex >= 0) {
                // Update existing assignment
                layoutAssignments[existingIndex] = assignment;
            } else {
                // Add new assignment
                layoutAssignments.push(assignment);
            }
            
            // Convert back to XML
            const updatedXml = this.builder.buildObject(profileObj);
            
            // Save to temp file
            const fileName = `${profileName}.profile-meta.xml`;
            const filePath = path.join(this.tempDir, fileName);
            await this.writeFile(filePath, updatedXml);
            
            this.logOperation('profile_assignment_complete', { profileName, filePath });
            
            return {
                profile: profileName,
                success: true,
                filePath,
                layoutName,
                objectName,
                recordType
            };
            
        } catch (error) {
            this.logOperation('profile_assignment_error', { profileName, error: error.message });
            throw this.enhanceError(error, { 
                operation: 'assignLayoutToProfile', 
                profile: profileName 
            });
        }
    }
    
    /**
     * Retrieve all profiles from the org
     */
    async retrieveAllProfiles() {
        this.logOperation('retrieve_profiles_start', {});
        
        try {
            const command = `sf data query -q "SELECT Id, Name FROM Profile WHERE UserType IN ('Standard', 'PowerCustomerSuccess', 'PowerPartner')" -o ${this.org} --json`;
            const result = await this.executeCommand(command);
            const data = this.parseJSON(result.stdout);
            
            if (!data.result || !data.result.records) {
                throw new Error('No profiles found');
            }
            
            this.logOperation('retrieve_profiles_complete', { 
                count: data.result.records.length 
            });
            
            return data.result.records;
            
        } catch (error) {
            this.logOperation('retrieve_profiles_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'retrieveAllProfiles' });
        }
    }
    
    /**
     * Retrieve profile metadata
     */
    async retrieveProfileMetadata(profileName) {
        this.logOperation('retrieve_metadata_start', { profileName });
        
        try {
            // First, retrieve the profile metadata
            const command = `sf project retrieve start --metadata Profile:${profileName} -o ${this.org} --json`;
            const result = await this.executeCommand(command);
            
            // Read the retrieved file
            const profilePath = path.join(
                'force-app', 'main', 'default', 'profiles', 
                `${profileName}.profile-meta.xml`
            );
            
            if (await this.fileExists(profilePath)) {
                return await this.readFile(profilePath);
            }
            
            // If not found, create a minimal profile structure
            return this.createMinimalProfileXml(profileName);
            
        } catch (error) {
            // If retrieve fails, create minimal structure
            return this.createMinimalProfileXml(profileName);
        }
    }
    
    /**
     * Create minimal profile XML structure
     */
    createMinimalProfileXml(profileName) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <custom>false</custom>
    <userLicense>Salesforce</userLicense>
</Profile>`;
    }
    
    /**
     * Deploy profile changes to Salesforce
     */
    async deployProfileChanges(assignments) {
        if (assignments.length === 0) {
            return { success: true, message: 'No profiles to deploy' };
        }
        
        this.logOperation('deploy_start', { count: assignments.length });
        
        try {
            // Create package.xml
            const packageXml = this.createPackageXml(assignments.map(a => a.profile));
            const packagePath = path.join(this.tempDir, 'package.xml');
            await this.writeFile(packagePath, packageXml);
            
            // Deploy profiles
            const command = `sf project deploy start --manifest ${packagePath} -o ${this.org} --json`;
            const result = await this.executeCommand(command, { timeout: 300000 }); // 5 min timeout
            const deployResult = this.parseJSON(result.stdout);
            
            this.logOperation('deploy_complete', { 
                success: deployResult.result?.success,
                profiles: assignments.length 
            });
            
            return deployResult;
            
        } catch (error) {
            this.logOperation('deploy_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'deployProfileChanges' });
        }
    }
    
    /**
     * Create package.xml for profile deployment
     */
    createPackageXml(profileNames) {
        const members = profileNames.map(name => `        <members>${name}</members>`).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${members}
        <name>Profile</name>
    </types>
    <version>59.0</version>
</Package>`;
    }
    
    /**
     * Backup profiles before modification
     */
    async backupProfiles(profiles) {
        const backupId = `backup_${Date.now()}`;
        const backupPath = path.join(this.backupDir, backupId);
        await fs.mkdir(backupPath, { recursive: true });
        
        this.logOperation('backup_start', { backupId, count: profiles.length });
        
        for (const profile of profiles) {
            try {
                const metadata = await this.retrieveProfileMetadata(profile.Name);
                const filePath = path.join(backupPath, `${profile.Name}.profile-meta.xml`);
                await this.writeFile(filePath, metadata);
            } catch (error) {
                this.logOperation('backup_profile_error', { 
                    profile: profile.Name, 
                    error: error.message 
                });
            }
        }
        
        this.logOperation('backup_complete', { backupId });
        return backupId;
    }
    
    /**
     * Restore profiles from backup
     */
    async restoreFromBackup(backupId) {
        this.logOperation('restore_start', { backupId });
        
        const backupPath = path.join(this.backupDir, backupId);
        
        if (!await this.fileExists(backupPath)) {
            throw new Error(`Backup ${backupId} not found`);
        }
        
        try {
            const files = await fs.readdir(backupPath);
            const profiles = files.filter(f => f.endsWith('.profile-meta.xml'));
            
            // Copy backup files to temp directory
            for (const file of profiles) {
                const sourcePath = path.join(backupPath, file);
                const destPath = path.join(this.tempDir, file);
                const content = await this.readFile(sourcePath);
                await this.writeFile(destPath, content);
            }
            
            // Deploy restored profiles
            const profileNames = profiles.map(f => f.replace('.profile-meta.xml', ''));
            const deployResult = await this.deployProfileChanges(
                profileNames.map(name => ({ profile: name, success: true }))
            );
            
            this.logOperation('restore_complete', { backupId, profiles: profileNames.length });
            
            return {
                success: true,
                backupId,
                profilesRestored: profileNames,
                deployResult
            };
            
        } catch (error) {
            this.logOperation('restore_error', { backupId, error: error.message });
            throw this.enhanceError(error, { operation: 'restoreFromBackup', backupId });
        }
    }
    
    /**
     * Create Permission Set as alternative to profile updates
     */
    async createLayoutPermissionSet(params) {
        this.validateParams(params, ['permissionSetName', 'layoutName', 'objectName']);
        this.logOperation('permission_set_create_start', params);
        
        const { permissionSetName, layoutName, objectName, description } = params;
        
        try {
            const permissionSetXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${permissionSetName}</label>
    <description>${description || `Layout assignment for ${objectName}`}</description>
    <layoutAssignments>
        <layout>${objectName}-${layoutName}</layout>
    </layoutAssignments>
</PermissionSet>`;
            
            const fileName = `${permissionSetName}.permissionset-meta.xml`;
            const filePath = path.join(this.tempDir, fileName);
            await this.writeFile(filePath, permissionSetXml);
            
            // Deploy Permission Set
            const command = `sf project deploy start --source-dir ${this.tempDir} -o ${this.org} --json`;
            const result = await this.executeCommand(command);
            const deployResult = this.parseJSON(result.stdout);
            
            this.logOperation('permission_set_create_complete', { 
                permissionSetName,
                success: deployResult.result?.success 
            });
            
            return {
                success: true,
                permissionSetName,
                filePath,
                deployResult,
                auditTrail: this.getAuditTrail()
            };
            
        } catch (error) {
            this.logOperation('permission_set_create_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'createLayoutPermissionSet', params });
        }
    }
    
    /**
     * Get current layout assignments for profiles
     */
    async getCurrentLayoutAssignments(params) {
        const { objectName, profileNames } = params;
        this.logOperation('get_assignments_start', params);
        
        try {
            const assignments = [];
            const profiles = profileNames || (await this.retrieveAllProfiles()).map(p => p.Name);
            
            for (const profileName of profiles) {
                try {
                    const metadata = await this.retrieveProfileMetadata(profileName);
                    const profileObj = await this.parser.parseStringPromise(metadata);
                    
                    const layoutAssignments = profileObj.Profile?.layoutAssignments || [];
                    const relevantAssignments = objectName 
                        ? layoutAssignments.filter(la => 
                            la.layout && la.layout[0].startsWith(`${objectName}-`))
                        : layoutAssignments;
                    
                    assignments.push({
                        profile: profileName,
                        assignments: relevantAssignments.map(la => ({
                            layout: la.layout?.[0],
                            recordType: la.recordType?.[0] || 'default'
                        }))
                    });
                } catch (error) {
                    assignments.push({
                        profile: profileName,
                        error: error.message
                    });
                }
            }
            
            this.logOperation('get_assignments_complete', { 
                profileCount: assignments.length 
            });
            
            return {
                success: true,
                objectName,
                assignments,
                auditTrail: this.getAuditTrail()
            };
            
        } catch (error) {
            this.logOperation('get_assignments_error', { error: error.message });
            throw this.enhanceError(error, { operation: 'getCurrentLayoutAssignments', params });
        }
    }
}

// Export for use in other modules
module.exports = ProfileLayoutAssigner;

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const [action, ...params] = args;
    
    const assigner = new ProfileLayoutAssigner();
    
    const commands = {
        'assign-all': async () => {
            const [layoutName, objectName, recordType] = params;
            if (!layoutName || !objectName) {
                console.error('Usage: assign-all <layoutName> <objectName> [recordType]');
                process.exit(1);
            }
            await assigner.initialize();
            const result = await assigner.assignLayoutToAllProfiles({
                layoutName,
                objectName,
                recordType: recordType || 'default'
            });
            console.log(JSON.stringify(result, null, 2));
        },
        
        'assign-specific': async () => {
            const [layoutName, objectName, ...profileNames] = params;
            if (!layoutName || !objectName || profileNames.length === 0) {
                console.error('Usage: assign-specific <layoutName> <objectName> <profile1> [profile2...]');
                process.exit(1);
            }
            await assigner.initialize();
            const result = await assigner.assignLayoutToProfiles({
                layoutName,
                objectName,
                profileNames
            });
            console.log(JSON.stringify(result, null, 2));
        },
        
        'get-assignments': async () => {
            const [objectName] = params;
            const result = await assigner.getCurrentLayoutAssignments({ objectName });
            console.log(JSON.stringify(result, null, 2));
        },
        
        'create-permission-set': async () => {
            const [permissionSetName, layoutName, objectName] = params;
            if (!permissionSetName || !layoutName || !objectName) {
                console.error('Usage: create-permission-set <name> <layoutName> <objectName>');
                process.exit(1);
            }
            await assigner.initialize();
            const result = await assigner.createLayoutPermissionSet({
                permissionSetName,
                layoutName,
                objectName
            });
            console.log(JSON.stringify(result, null, 2));
        },
        
        'restore-backup': async () => {
            const [backupId] = params;
            if (!backupId) {
                console.error('Usage: restore-backup <backupId>');
                process.exit(1);
            }
            const result = await assigner.restoreFromBackup(backupId);
            console.log(JSON.stringify(result, null, 2));
        }
    };
    
    const command = commands[action];
    if (!command) {
        console.error(`Unknown action: ${action}`);
        console.error('Available actions: ' + Object.keys(commands).join(', '));
        process.exit(1);
    }
    
    command().catch(error => {
        console.error('Error:', error.message);
        if (error.context) {
            console.error('Context:', JSON.stringify(error.context, null, 2));
        }
        process.exit(1);
    });
}