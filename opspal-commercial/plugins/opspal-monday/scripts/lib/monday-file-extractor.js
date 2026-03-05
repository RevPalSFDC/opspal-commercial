#!/usr/bin/env node
/**
 * Monday.com File Extractor
 *
 * Downloads file attachments from Monday.com items, updates, or entire boards.
 * Implements the extraction workflow from the Monday.com API runbook.
 *
 * Key features:
 * - Extract files from items (file columns)
 * - Extract files from updates (comment attachments)
 * - Bulk extraction from entire boards
 * - Download manifest generation
 * - Retry logic for failed downloads
 * - URL expiration handling (1-hour limit)
 *
 * Usage:
 *   node monday-file-extractor.js --item 1234567890
 *   node monday-file-extractor.js --update 9876543210
 *   node monday-file-extractor.js --board 1111111111 --include-updates
 *   node monday-file-extractor.js --item 1234567890 --output ./downloads
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { MondayAPIClient } = require('./monday-api-client');

// Load config
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'monday-config.json');
let config = {
  defaultDownloadDir: './monday-downloads',
  maxRetries: 3,
  retryDelayMs: 1000,
  urlExpirationMinutes: 60,
  supportedFileTypes: ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'csv', 'zip'],
  logging: {
    level: 'info'
  }
};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  }
} catch (e) {
  // Use defaults
}

class MondayFileExtractor {
  /**
   * @param {Object} options
   * @param {MondayAPIClient} options.client - API client instance
   * @param {string} options.downloadDir - Directory for downloads
   * @param {number} options.maxRetries - Max download retry attempts
   * @param {Object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.client = options.client || new MondayAPIClient();
    this.downloadDir = options.downloadDir || config.defaultDownloadDir;
    this.maxRetries = options.maxRetries || config.maxRetries;
    this.retryDelayMs = options.retryDelayMs || config.retryDelayMs;
    this.logger = options.logger || console;
    this.manifest = [];
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * Extract files from a Monday.com item
   * @param {string|number} itemId - Item ID
   * @returns {Promise<Array>} - Downloaded file info
   */
  async extractFromItem(itemId) {
    this.logger.info(`Extracting files from item: ${itemId}`);

    const assets = await this.client.getItemAssets(itemId);
    this.logger.info(`Found ${assets.length} file(s) attached to item`);

    const results = [];
    for (const asset of assets) {
      const result = await this._processAsset(asset, 'item', itemId);
      results.push(result);
    }

    return results;
  }

  /**
   * Extract files from a Monday.com update (comment)
   * @param {string|number} updateId - Update ID
   * @returns {Promise<Array>} - Downloaded file info
   */
  async extractFromUpdate(updateId) {
    this.logger.info(`Extracting files from update: ${updateId}`);

    const assets = await this.client.getUpdateAssets(updateId);
    this.logger.info(`Found ${assets.length} file(s) attached to update`);

    const results = [];
    for (const asset of assets) {
      const result = await this._processAsset(asset, 'update', updateId);
      results.push(result);
    }

    return results;
  }

  /**
   * Extract all files from a board
   * @param {string|number} boardId - Board ID
   * @param {Object} options
   * @param {boolean} options.includeUpdates - Include files from updates
   * @returns {Promise<Array>} - Downloaded file info
   */
  async extractFromBoard(boardId, options = {}) {
    const { includeUpdates = false } = options;
    this.logger.info(`Extracting files from board: ${boardId}`);
    this.logger.info(`Include update attachments: ${includeUpdates}`);

    const items = await this.client.getBoardItems(boardId, { includeUpdates });
    this.logger.info(`Found ${items.length} item(s) in board`);

    const results = [];
    for (const item of items) {
      // Process item assets
      if (item.assets && item.assets.length > 0) {
        this.logger.info(`Item ${item.id} (${item.name}): ${item.assets.length} file(s)`);
        for (const asset of item.assets) {
          const result = await this._processAsset(asset, 'item', item.id);
          results.push(result);
        }
      }

      // Process update assets if included
      if (includeUpdates && item.updates) {
        for (const update of item.updates) {
          if (update.assets && update.assets.length > 0) {
            this.logger.info(`Update ${update.id}: ${update.assets.length} file(s)`);
            for (const asset of update.assets) {
              const result = await this._processAsset(asset, 'update', update.id);
              results.push(result);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Process a single asset (query + download)
   * @private
   */
  async _processAsset(asset, sourceType, sourceId) {
    this.stats.total++;

    const record = {
      assetId: asset.id,
      filename: asset.name,
      extension: asset.file_extension,
      size: asset.file_size,
      sourceType,
      sourceId,
      publicUrl: asset.public_url,
      downloadedAt: null,
      localPath: null,
      status: 'pending',
      error: null
    };

    // Check if public_url is available
    if (!asset.public_url) {
      this.logger.warn(`No public_url for asset ${asset.id} (${asset.name})`);
      record.status = 'skipped';
      record.error = 'No public_url available';
      this.stats.skipped++;
      this.manifest.push(record);
      return record;
    }

    // Download the file
    try {
      const localPath = await this.downloadFile(asset.public_url, asset.name);
      record.localPath = localPath;
      record.downloadedAt = new Date().toISOString();
      record.status = 'success';
      this.stats.success++;
      this.logger.info(`Downloaded: ${asset.name}`);
    } catch (error) {
      record.status = 'failed';
      record.error = error.message;
      this.stats.failed++;
      this.logger.error(`Failed to download ${asset.name}: ${error.message}`);
    }

    this.manifest.push(record);
    return record;
  }

  /**
   * Download a file from public_url
   * @param {string} publicUrl - Monday.com public URL (expires in 1 hour)
   * @param {string} filename - Original filename
   * @returns {Promise<string>} - Local file path
   */
  async downloadFile(publicUrl, filename) {
    // Ensure download directory exists
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }

    // Sanitize filename
    const safeFilename = this._sanitizeFilename(filename);
    const localPath = path.join(this.downloadDir, safeFilename);

    // Handle duplicate filenames
    const uniquePath = this._getUniquePath(localPath);

    return this._downloadWithRetry(publicUrl, uniquePath);
  }

  /**
   * Download with retry logic
   * @private
   */
  async _downloadWithRetry(url, localPath, attempt = 0) {
    try {
      await this._downloadToFile(url, localPath);
      return localPath;
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      // Check if URL expired (typically 403 or 404)
      if (error.message.includes('403') || error.message.includes('404')) {
        throw new Error(`URL may have expired (${error.message}). Re-query for fresh public_url.`);
      }

      const delay = this.retryDelayMs * Math.pow(2, attempt);
      this.logger.warn(`Download attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      await this._sleep(delay);
      return this._downloadWithRetry(url, localPath, attempt + 1);
    }
  }

  /**
   * Download URL to local file
   * @private
   */
  _downloadToFile(url, localPath) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const file = fs.createWriteStream(localPath);

      const request = protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(localPath);
          return this._downloadToFile(response.headers.location, localPath)
            .then(resolve)
            .catch(reject);
        }

        // Handle errors
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(localPath);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
        reject(err);
      });

      file.on('error', (err) => {
        file.close();
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
        reject(err);
      });
    });
  }

  /**
   * Save download manifest to JSON file
   * @param {string} filename - Manifest filename (default: manifest.json)
   * @returns {string} - Path to manifest file
   */
  saveManifest(filename = 'manifest.json') {
    const manifestPath = path.join(this.downloadDir, filename);

    const manifestData = {
      extractedAt: new Date().toISOString(),
      downloadDir: path.resolve(this.downloadDir),
      stats: this.stats,
      files: this.manifest
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
    this.logger.info(`Manifest saved to: ${manifestPath}`);

    return manifestPath;
  }

  /**
   * Get extraction summary
   * @returns {Object} - Summary stats
   */
  getSummary() {
    return {
      ...this.stats,
      manifestPath: path.join(this.downloadDir, 'manifest.json'),
      downloadDir: path.resolve(this.downloadDir)
    };
  }

  /**
   * Sanitize filename for filesystem
   * @private
   */
  _sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 255);
  }

  /**
   * Get unique path (handle duplicates)
   * @private
   */
  _getUniquePath(filePath) {
    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    let counter = 1;
    let newPath = path.join(dir, `${base}_${counter}${ext}`);

    while (fs.existsSync(newPath)) {
      counter++;
      newPath = path.join(dir, `${base}_${counter}${ext}`);
    }

    return newPath;
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    item: null,
    update: null,
    board: null,
    output: config.defaultDownloadDir,
    includeUpdates: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--item':
      case '-i':
        options.item = args[++i];
        break;
      case '--update':
      case '-u':
        options.update = args[++i];
        break;
      case '--board':
      case '-b':
        options.board = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--include-updates':
        options.includeUpdates = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  // Validate input
  if (!options.item && !options.update && !options.board) {
    printHelp();
    console.error('\nError: Must specify --item, --update, or --board');
    process.exit(1);
  }

  try {
    const extractor = new MondayFileExtractor({
      downloadDir: options.output
    });

    console.log(`\nMonday.com File Extractor`);
    console.log(`Download directory: ${path.resolve(options.output)}\n`);

    if (options.item) {
      await extractor.extractFromItem(options.item);
    } else if (options.update) {
      await extractor.extractFromUpdate(options.update);
    } else if (options.board) {
      await extractor.extractFromBoard(options.board, {
        includeUpdates: options.includeUpdates
      });
    }

    // Save manifest
    extractor.saveManifest();

    // Print summary
    const summary = extractor.getSummary();
    console.log(`\n--- Extraction Complete ---`);
    console.log(`Total files:    ${summary.total}`);
    console.log(`Downloaded:     ${summary.success}`);
    console.log(`Failed:         ${summary.failed}`);
    console.log(`Skipped:        ${summary.skipped}`);
    console.log(`\nManifest: ${summary.manifestPath}`);
    console.log(`Downloads: ${summary.downloadDir}`);

    // Exit with error code if any failures
    process.exit(summary.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Monday.com File Extractor

Extract and download file attachments from Monday.com.

Usage:
  node monday-file-extractor.js [options]

Options:
  --item, -i <id>       Extract files from specific item
  --update, -u <id>     Extract files from specific update
  --board, -b <id>      Extract all files from board
  --output, -o <dir>    Download directory (default: ./monday-downloads)
  --include-updates     Include files from updates when extracting board
  --help, -h            Show this help message

Examples:
  # Extract files from a single item
  node monday-file-extractor.js --item 1234567890

  # Extract files from an update/comment
  node monday-file-extractor.js --update 9876543210

  # Extract all files from a board (items only)
  node monday-file-extractor.js --board 1111111111

  # Extract all files from a board (including update attachments)
  node monday-file-extractor.js --board 1111111111 --include-updates

  # Specify custom download directory
  node monday-file-extractor.js --item 1234567890 --output ./project-files

Environment:
  MONDAY_API_TOKEN      Required. Your Monday.com API token.

Notes:
  - File URLs expire after 1 hour. Download immediately after querying.
  - A manifest.json file is created with all download metadata.
  - Duplicate filenames are handled with numeric suffixes.
  `);
}

if (require.main === module) {
  main();
}

module.exports = { MondayFileExtractor };
