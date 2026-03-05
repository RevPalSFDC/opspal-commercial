/**
 * Salesforce Folder Manager
 * Instance-agnostic utility for managing report and dashboard folders
 *
 * Handles:
 * - Folder creation before deployment
 * - Folder existence checking
 * - Special folder handling (unfiled$public)
 * - Folder permission management
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class FolderManager {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.folderCache = new Map();
    }

    /**
     * Execute SF CLI command and return JSON
     */
    async exJSON(cmd) {
        try {
            const result = await execAsync(cmd);
            return JSON.parse(result.stdout);
        } catch (e) {
            if (e.stdout) {
                try {
                    return JSON.parse(e.stdout);
                } catch {}
            }
            throw e;
        }
    }

    /**
     * Get all report folders
     */
    async getAllFolders(type = 'Report') {
        try {
            const query = `SELECT Id, Name, DeveloperName, Type, AccessType FROM Folder WHERE Type = '${type}'`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const folders = result?.result?.records || [];

            // Update cache
            folders.forEach(f => {
                this.folderCache.set(f.Name, f);
                this.folderCache.set(f.DeveloperName, f);
            });

            return folders;
        } catch (e) {
            console.error('Error fetching folders:', e.message);
            return [];
        }
    }

    /**
     * Check if folder exists
     */
    async folderExists(folderName, type = 'Report') {
        // Check cache first
        if (this.folderCache.has(folderName)) {
            const cached = this.folderCache.get(folderName);
            if (cached.Type === type) {
                return cached;
            }
        }

        try {
            const query = `SELECT Id, Name, DeveloperName, AccessType FROM Folder WHERE (Name = '${folderName}' OR DeveloperName = '${folderName.replace(/\s+/g, '_')}') AND Type = '${type}'`;
            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const folder = result?.result?.records?.[0];

            if (folder) {
                // Update cache
                this.folderCache.set(folder.Name, folder);
                this.folderCache.set(folder.DeveloperName, folder);
                return folder;
            }

            return null;
        } catch (e) {
            console.error(`Error checking folder existence: ${e.message}`);
            return null;
        }
    }

    /**
     * Create a folder
     */
    async createFolder(folderName, type = 'Report', options = {}) {
        // Check if it already exists
        const existing = await this.folderExists(folderName, type);
        if (existing) {
            console.log(`  ✓ Folder already exists: ${folderName} (${existing.Id})`);
            return existing;
        }

        try {
            const developerName = options.developerName || folderName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const accessType = options.accessType || 'Public';

            console.log(`  Creating ${type.toLowerCase()} folder: ${folderName}`);

            const values = [
                `Name='${folderName}'`,
                `Type=${type}`,
                `DeveloperName=${developerName}`,
                `AccessType=${accessType}`
            ].join(' ');

            const cmd = `sf data create record --sobject Folder --values "${values}" --target-org ${this.orgAlias} --json`;

            const result = await this.exJSON(cmd);
            const folderId = result?.result?.id;

            if (folderId) {
                console.log(`  ✓ Created folder: ${folderName} (${folderId})`);

                const newFolder = {
                    Id: folderId,
                    Name: folderName,
                    DeveloperName: developerName,
                    Type: type,
                    AccessType: accessType
                };

                // Update cache
                this.folderCache.set(folderName, newFolder);
                this.folderCache.set(developerName, newFolder);

                return newFolder;
            } else {
                throw new Error('No folder ID returned from creation');
            }
        } catch (e) {
            console.error(`  ✗ Failed to create folder: ${e.message}`);

            // Try to get more specific error
            if (e.message.includes('DUPLICATE_VALUE')) {
                console.log('  ⚠️  Folder with this developer name already exists');
                // Try to find it
                return await this.folderExists(folderName, type);
            }

            return null;
        }
    }

    /**
     * Ensure folder exists, create if not
     */
    async ensureFolder(folderName, type = 'Report', options = {}) {
        // Special handling for unfiled$public
        if (folderName === 'unfiled$public' || folderName === 'Public Reports') {
            return {
                Id: null,
                Name: 'unfiled$public',
                DeveloperName: 'unfiled$public',
                Type: type,
                AccessType: 'Public'
            };
        }

        const existing = await this.folderExists(folderName, type);
        if (existing) {
            return existing;
        }

        return await this.createFolder(folderName, type, options);
    }

    /**
     * Get folder from report/dashboard path
     */
    extractFolderFromPath(filePath) {
        // Check for patterns like /reports/FolderName/ReportName.report-meta.xml
        const reportMatch = filePath.match(/\/reports\/([^\/]+)\/[^\/]+\.report-meta\.xml$/);
        if (reportMatch) {
            const folderName = reportMatch[1];
            // Handle special folders
            if (folderName === 'unfiled$public') {
                return { name: 'unfiled$public', type: 'Report', isSpecial: true };
            }
            return {
                name: folderName.replace(/_/g, ' '),
                type: 'Report',
                isSpecial: false
            };
        }

        // Check for dashboard patterns
        const dashboardMatch = filePath.match(/\/dashboards\/([^\/]+)\/[^\/]+\.dashboard-meta\.xml$/);
        if (dashboardMatch) {
            const folderName = dashboardMatch[1];
            if (folderName === 'unfiled$public') {
                return { name: 'unfiled$public', type: 'Dashboard', isSpecial: true };
            }
            return {
                name: folderName.replace(/_/g, ' '),
                type: 'Dashboard',
                isSpecial: false
            };
        }

        return null;
    }

    /**
     * Prepare folders for deployment
     */
    async prepareDeploymentFolders(deploymentPath) {
        const folders = new Set();

        // Recursively find all report/dashboard files
        const findFiles = (dir) => {
            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(dir)) return;

            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    findFiles(fullPath);
                } else {
                    const folderInfo = this.extractFolderFromPath(fullPath);
                    if (folderInfo && !folderInfo.isSpecial) {
                        folders.add(JSON.stringify(folderInfo));
                    }
                }
            });
        };

        findFiles(deploymentPath);

        // Create all needed folders
        const created = [];
        const failed = [];

        for (const folderStr of folders) {
            const folderInfo = JSON.parse(folderStr);
            const result = await this.ensureFolder(folderInfo.name, folderInfo.type);

            if (result) {
                created.push(folderInfo);
            } else {
                failed.push(folderInfo);
            }
        }

        return { created, failed };
    }

    /**
     * Update folder permissions
     */
    async updateFolderAccess(folderName, accessType = 'Public', type = 'Report') {
        try {
            const folder = await this.folderExists(folderName, type);
            if (!folder) {
                throw new Error(`Folder not found: ${folderName}`);
            }

            const cmd = `sf data update record --sobject Folder --record-id ${folder.Id} --values "AccessType=${accessType}" --target-org ${this.orgAlias} --json`;

            await this.exJSON(cmd);
            console.log(`  ✓ Updated folder access: ${folderName} → ${accessType}`);

            // Update cache
            if (this.folderCache.has(folderName)) {
                this.folderCache.get(folderName).AccessType = accessType;
            }

            return true;
        } catch (e) {
            console.error(`  ✗ Failed to update folder access: ${e.message}`);
            return false;
        }
    }

    /**
     * Delete a folder (if empty)
     */
    async deleteFolder(folderName, type = 'Report') {
        try {
            const folder = await this.folderExists(folderName, type);
            if (!folder) {
                console.log(`  Folder not found: ${folderName}`);
                return true;
            }

            // Check if folder is empty
            const contentQuery = type === 'Report'
                ? `SELECT COUNT() FROM Report WHERE FolderName = '${folder.Name}'`
                : `SELECT COUNT() FROM Dashboard WHERE FolderName = '${folder.Name}'`;

            const checkCmd = `sf data query --query "${contentQuery}" --target-org ${this.orgAlias} --json`;
            const checkResult = await this.exJSON(checkCmd);

            if (checkResult?.result?.totalSize > 0) {
                console.log(`  ⚠️  Cannot delete non-empty folder: ${folderName} (contains ${checkResult.result.totalSize} items)`);
                return false;
            }

            // Delete the folder
            const cmd = `sf data delete record --sobject Folder --record-id ${folder.Id} --target-org ${this.orgAlias} --json`;
            await this.exJSON(cmd);

            console.log(`  ✓ Deleted folder: ${folderName}`);

            // Clear from cache
            this.folderCache.delete(folderName);
            this.folderCache.delete(folder.DeveloperName);

            return true;
        } catch (e) {
            console.error(`  ✗ Failed to delete folder: ${e.message}`);
            return false;
        }
    }

    /**
     * List folder contents
     */
    async listFolderContents(folderName, type = 'Report') {
        try {
            const folder = await this.folderExists(folderName, type);
            if (!folder && folderName !== 'unfiled$public') {
                console.log(`  Folder not found: ${folderName}`);
                return [];
            }

            const actualFolderName = folderName === 'unfiled$public' ? 'Public Reports' : folder?.Name || folderName;

            const query = type === 'Report'
                ? `SELECT Id, Name, DeveloperName, Description FROM Report WHERE FolderName = '${actualFolderName}'`
                : `SELECT Id, Name, DeveloperName, Description FROM Dashboard WHERE FolderName = '${actualFolderName}'`;

            const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;
            const result = await this.exJSON(cmd);

            return result?.result?.records || [];
        } catch (e) {
            console.error(`  Error listing folder contents: ${e.message}`);
            return [];
        }
    }
}

// Export for use as module
module.exports = { FolderManager };

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node folder-manager.js <org-alias> <action> [options]');
        console.log('\nActions:');
        console.log('  list [type]                    List all folders');
        console.log('  create <name> [type]           Create a folder');
        console.log('  ensure <name> [type]           Ensure folder exists');
        console.log('  delete <name> [type]           Delete an empty folder');
        console.log('  contents <name> [type]         List folder contents');
        console.log('  prepare <path>                 Prepare folders for deployment path');
        console.log('\nTypes: Report (default), Dashboard');
        console.log('\nExamples:');
        console.log('  node folder-manager.js myorg list');
        console.log('  node folder-manager.js myorg create "Sales Reports"');
        console.log('  node folder-manager.js myorg contents "Sales Reports"');
        console.log('  node folder-manager.js myorg prepare ./force-app');
        process.exit(1);
    }

    const [orgAlias, action, ...params] = args;
    const manager = new FolderManager(orgAlias);

    try {
        switch (action) {
            case 'list': {
                const type = params[0] || 'Report';
                const folders = await manager.getAllFolders(type);
                console.log(`\n${type} Folders:`);
                folders.forEach(f => {
                    console.log(`  - ${f.Name} (${f.DeveloperName}) - ${f.AccessType}`);
                });
                break;
            }

            case 'create': {
                const [name, type = 'Report'] = params;
                const folder = await manager.createFolder(name, type);
                if (folder) {
                    console.log('\n✅ Folder created successfully');
                } else {
                    console.log('\n❌ Failed to create folder');
                }
                break;
            }

            case 'ensure': {
                const [name, type = 'Report'] = params;
                const folder = await manager.ensureFolder(name, type);
                if (folder) {
                    console.log('\n✅ Folder ready');
                    console.log(`  ID: ${folder.Id}`);
                    console.log(`  Name: ${folder.Name}`);
                } else {
                    console.log('\n❌ Failed to ensure folder');
                }
                break;
            }

            case 'delete': {
                const [name, type = 'Report'] = params;
                const result = await manager.deleteFolder(name, type);
                if (result) {
                    console.log('\n✅ Folder deleted');
                } else {
                    console.log('\n❌ Could not delete folder');
                }
                break;
            }

            case 'contents': {
                const [name, type = 'Report'] = params;
                const items = await manager.listFolderContents(name, type);
                console.log(`\nContents of "${name}":`);
                items.forEach(item => {
                    console.log(`  - ${item.Name} (${item.DeveloperName})`);
                    if (item.Description) {
                        console.log(`    ${item.Description}`);
                    }
                });
                break;
            }

            case 'prepare': {
                const path = params[0];
                if (!path) {
                    console.log('Path required for prepare action');
                    process.exit(1);
                }
                const result = await manager.prepareDeploymentFolders(path);
                console.log('\nFolder Preparation Results:');
                if (result.created.length > 0) {
                    console.log('✅ Created/Verified:');
                    result.created.forEach(f => {
                        console.log(`  - ${f.name} (${f.type})`);
                    });
                }
                if (result.failed.length > 0) {
                    console.log('❌ Failed:');
                    result.failed.forEach(f => {
                        console.log(`  - ${f.name} (${f.type})`);
                    });
                }
                break;
            }

            default:
                console.log(`Unknown action: ${action}`);
                process.exit(1);
        }
    } catch (e) {
        console.error(`\nError: ${e.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}