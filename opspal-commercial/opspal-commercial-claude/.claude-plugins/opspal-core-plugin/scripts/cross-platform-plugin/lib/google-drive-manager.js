#!/usr/bin/env node

/**
 * Google Drive Manager
 *
 * Manages Google Drive folder operations for Project Connect workflow.
 *
 * Supports multiple modes:
 * - API mode: Uses Google Drive API (requires credentials)
 * - Manual mode: User creates folder and provides ID/URL
 * - Dry-run mode: Simulates operations without making changes
 *
 * Features:
 * - Find existing folders by customer/customerId/aliases
 * - Create new folders with standardized naming
 * - Connect to existing folders
 * - Idempotent operations (safe to retry)
 */

const fs = require('fs');
const path = require('path');

class GoogleDriveManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.mode = options.mode || 'auto'; // 'auto', 'api', 'manual'
    this.parentFolderId = options.parentFolderId || null;

    // API client (lazy loaded)
    this.drive = null;

    this.log('GoogleDriveManager initialized', {
      mode: this.mode,
      dryRun: this.dryRun,
      parentFolderId: this.parentFolderId || 'root'
    });
  }

  /**
   * Initialize Google Drive API client
   *
   * @private
   * @returns {Promise<void>}
   */
  async _initializeApiClient() {
    if (this.drive) return; // Already initialized

    try {
      // Try to load Google Drive API
      const { google } = require('googleapis');
      const { authenticate } = require('@google-cloud/local-auth');

      this.log('Initializing Google Drive API client');

      // Define scopes
      const SCOPES = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/presentations'  // For Google Slides integration
      ];

      // Path to credentials (adjust as needed)
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                              path.join(process.env.HOME, '.credentials', 'google-drive-credentials.json');

      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Google Drive credentials not found at: ${credentialsPath}`);
      }

      // Authenticate
      const auth = await authenticate({
        keyfilePath: credentialsPath,
        scopes: SCOPES,
      });

      // Initialize Drive client
      this.drive = google.drive({ version: 'v3', auth });

      this.log('Google Drive API client initialized');

    } catch (error) {
      this.log('Failed to initialize Google Drive API client', error.message);

      if (this.mode === 'api') {
        throw new Error(`Google Drive API initialization failed: ${error.message}`);
      }

      // Fall back to manual mode
      console.warn('⚠️  Google Drive API not available. Falling back to manual mode.');
      console.warn('   Install dependencies: npm install googleapis @google-cloud/local-auth');
      console.warn('   Or set mode to "manual" to provide folder IDs directly.');
      this.mode = 'manual';
    }
  }

  /**
   * Find existing folder by customer information
   *
   * @param {Object} options
   * @param {string} [options.customerId] - Customer ID (e.g., RP-ACM123456)
   * @param {string} [options.customer] - Customer name (e.g., "Acme Robotics")
   * @param {string[]} [options.aliases] - Customer aliases
   * @returns {Promise<{exists: boolean, folderId?: string, url?: string, name?: string}>}
   */
  async findFolder({ customerId, customer, aliases = [] }) {
    this.log('Finding folder', { customerId, customer, aliases });

    // In manual mode, cannot search
    if (this.mode === 'manual') {
      this.log('Manual mode: Cannot search for folders. User must provide folder ID.');
      return {
        exists: false,
        manualRequired: true,
        message: 'Manual mode: Please create folder and provide ID'
      };
    }

    // Initialize API client
    await this._initializeApiClient();

    try {
      // Build search query
      const searchNames = [];

      if (customerId && customer) {
        searchNames.push(`RevPal • ${customer} • ${customerId}`);
      }

      if (customer) {
        searchNames.push(`RevPal • ${customer}`);
      }

      if (aliases && aliases.length > 0) {
        aliases.forEach(alias => {
          searchNames.push(`RevPal • ${alias}`);
        });
      }

      this.log('Search names', searchNames);

      // Search for folders
      for (const name of searchNames) {
        const query = [
          `name = '${name.replace(/'/g, "\\'")}'`,
          "mimeType = 'application/vnd.google-apps.folder'",
          'trashed = false',
          this.parentFolderId ? `'${this.parentFolderId}' in parents` : ''
        ].filter(Boolean).join(' and ');

        this.log('Search query', query);

        const response = await this.drive.files.list({
          q: query,
          fields: 'files(id, name, webViewLink)',
          spaces: 'drive'
        });

        const folders = response.data.files;

        if (folders && folders.length > 0) {
          const folder = folders[0];

          this.log('Folder found', folder);

          return {
            exists: true,
            folderId: folder.id,
            url: folder.webViewLink,
            name: folder.name
          };
        }
      }

      this.log('No folder found');
      return { exists: false };

    } catch (error) {
      throw new Error(`Failed to search folders: ${error.message}`);
    }
  }

  /**
   * Create new folder
   *
   * @param {Object} options
   * @param {string} options.name - Folder name
   * @param {string} [options.parentId] - Parent folder ID (default: root)
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {Promise<{folderId: string, url: string, name: string, created: boolean}>}
   */
  async createFolder({ name, parentId = null, metadata = {} }) {
    this.log('Creating folder', { name, parentId, metadata });

    // Validate name
    if (!name || typeof name !== 'string') {
      throw new Error('Folder name is required and must be a string');
    }

    // Manual mode: Return instructions
    if (this.mode === 'manual') {
      console.log('\n📁 Manual Folder Creation Required');
      console.log('─'.repeat(50));
      console.log(`1. Go to Google Drive: https://drive.google.com`);
      console.log(`2. Create a folder named: "${name}"`);
      console.log(`3. Right-click → Share → Get link → Copy link`);
      console.log(`4. Extract folder ID from URL: https://drive.google.com/drive/folders/{FOLDER_ID}`);
      console.log(`5. Provide the folder ID when prompted`);
      console.log('─'.repeat(50));

      return {
        folderId: 'MANUAL_CREATION_REQUIRED',
        url: 'MANUAL_CREATION_REQUIRED',
        name,
        created: false,
        manualRequired: true
      };
    }

    // Dry-run mode
    if (this.dryRun) {
      this.log('[DRY RUN] Would create folder', { name, parentId: parentId || this.parentFolderId || 'root' });
      return {
        folderId: `DRYRUN_${Date.now()}`,
        url: `https://drive.google.com/drive/folders/DRYRUN_${Date.now()}`,
        name,
        created: false,
        dryRun: true
      };
    }

    // Initialize API client
    await this._initializeApiClient();

    try {
      // Check if folder already exists
      const existing = await this.findFolder({ customer: name });
      if (existing.exists) {
        this.log('Folder already exists', existing);
        return {
          folderId: existing.folderId,
          url: existing.url,
          name: existing.name,
          created: false
        };
      }

      // Create folder
      const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId || this.parentFolderId || 'root']
      };

      // Add metadata to description if provided
      if (metadata && Object.keys(metadata).length > 0) {
        fileMetadata.description = JSON.stringify(metadata);
      }

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name, webViewLink'
      });

      const folder = response.data;

      this.log('Folder created', folder);

      return {
        folderId: folder.id,
        url: folder.webViewLink,
        name: folder.name,
        created: true
      };

    } catch (error) {
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Connect to existing folder (verify it exists and return metadata)
   *
   * @param {string} folderIdOrUrl - Folder ID or URL
   * @returns {Promise<{folderId: string, url: string, name?: string}>}
   */
  async connectFolder(folderIdOrUrl) {
    this.log('Connecting to folder', folderIdOrUrl);

    // Extract folder ID from URL if needed
    let folderId = folderIdOrUrl;
    if (folderIdOrUrl.includes('drive.google.com')) {
      const match = folderIdOrUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match) {
        folderId = match[1];
      }
    }

    // Manual mode: Just return the ID
    if (this.mode === 'manual') {
      return {
        folderId,
        url: `https://drive.google.com/drive/folders/${folderId}`,
        name: 'Manual connection (name not retrieved)',
        manual: true
      };
    }

    // Initialize API client
    await this._initializeApiClient();

    try {
      // Get folder metadata
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, webViewLink'
      });

      const folder = response.data;

      this.log('Connected to folder', folder);

      return {
        folderId: folder.id,
        url: folder.webViewLink,
        name: folder.name
      };

    } catch (error) {
      throw new Error(`Failed to connect to folder: ${error.message}`);
    }
  }

  /**
   * Generate standardized folder name
   *
   * @param {string} customer - Customer name (e.g., "Acme Robotics")
   * @param {string} customerId - Customer ID (e.g., RP-ACM123456)
   * @returns {string} - Folder name (e.g., "RevPal • Acme Robotics • RP-ACM123456")
   */
  generateFolderName(customer, customerId) {
    return `RevPal • ${customer} • ${customerId}`;
  }

  /**
   * Delete folder (use with caution!)
   *
   * @param {string} folderId - Folder ID
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteFolder(folderId) {
    this.log('Deleting folder', folderId);

    // Manual mode: Cannot delete
    if (this.mode === 'manual') {
      console.log('\n🗑️  Manual Folder Deletion Required');
      console.log('─'.repeat(50));
      console.log(`1. Go to Google Drive: https://drive.google.com`);
      console.log(`2. Find folder ID: ${folderId}`);
      console.log(`3. Right-click → Move to trash`);
      console.log('─'.repeat(50));

      return {
        deleted: false,
        manualRequired: true
      };
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would delete folder', folderId);
      return { deleted: false, dryRun: true };
    }

    // Initialize API client
    await this._initializeApiClient();

    try {
      await this.drive.files.delete({
        fileId: folderId
      });

      this.log('Folder deleted', folderId);

      return { deleted: true };

    } catch (error) {
      throw new Error(`Failed to delete folder: ${error.message}`);
    }
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message - Log message
   * @param {*} [data] - Optional data to log
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleDriveManager] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: node google-drive-manager.js <command> [options]

Commands:
  find       Find folder by customer information
  create     Create new folder
  connect    Connect to existing folder
  delete     Delete folder (use with caution!)

Options:
  --mode <mode>           Mode: 'auto', 'api', 'manual' (default: auto)
  --parent-folder <id>    Parent folder ID
  --dry-run               Simulate without making changes

Examples:
  # Find folder
  node google-drive-manager.js find --customer "Acme Robotics" --customerId "RP-ACM123456"

  # Create folder
  node google-drive-manager.js create --name "RevPal • Acme Robotics • RP-ACM123456"

  # Create folder (manual mode)
  node google-drive-manager.js create --name "RevPal • Acme Robotics • RP-ACM123456" --mode manual

  # Connect to folder
  node google-drive-manager.js connect 1aBcDeFgHiJkLmNoPqRsTuVwXyZ

  # Delete folder
  node google-drive-manager.js delete 1aBcDeFgHiJkLmNoPqRsTuVwXyZ
    `);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const manager = new GoogleDriveManager({
    verbose: true,
    dryRun: options['dry-run'] || false,
    mode: options.mode || 'auto',
    parentFolderId: options['parent-folder'] || null
  });

  (async () => {
    try {
      switch (command) {
        case 'find':
          const findResult = await manager.findFolder({
            customerId: options.customerId,
            customer: options.customer,
            aliases: options.aliases ? options.aliases.split(',') : []
          });
          console.log(JSON.stringify(findResult, null, 2));
          break;

        case 'create':
          const createResult = await manager.createFolder({
            name: options.name,
            parentId: options['parent-folder'] || null
          });
          console.log(JSON.stringify(createResult, null, 2));
          break;

        case 'connect':
          const connectResult = await manager.connectFolder(args[1]);
          console.log(JSON.stringify(connectResult, null, 2));
          break;

        case 'delete':
          const deleteResult = await manager.deleteFolder(args[1]);
          console.log(JSON.stringify(deleteResult, null, 2));
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = GoogleDriveManager;
