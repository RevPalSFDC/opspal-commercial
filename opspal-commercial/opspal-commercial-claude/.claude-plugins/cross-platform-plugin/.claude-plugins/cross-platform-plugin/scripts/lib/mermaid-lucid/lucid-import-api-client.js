/**
 * Lucid Standard Import API Client
 *
 * Client for uploading Lucid Standard Import JSON to create diagrams via REST API.
 * Handles document creation, file packaging (.lucid ZIP format), and authentication.
 *
 * @module lucid-import-api-client
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const LUCID_API_BASE = process.env.LUCID_API_BASE_URL || 'https://api.lucid.co';
const LUCID_API_TOKEN = process.env.LUCID_API_TOKEN;

/**
 * Create a Lucidchart document from Lucid Standard Import JSON
 *
 * @param {Object} lucidJSON - Lucid Standard Import JSON
 * @param {Object} options - Upload options
 * @param {string} options.title - Document title
 * @param {string} options.folderId - Parent folder ID (optional)
 * @param {string} options.productId - Product ID (lucidchart, lucidspark)
 * @returns {Promise<Object>} Created document info with docId and URL
 */
async function createDocumentFromJSON(lucidJSON, options = {}) {
  const {
    title = 'Untitled Diagram',
    folderId = null,
    productId = 'lucidchart'
  } = options;

  if (!LUCID_API_TOKEN) {
    throw new Error('LUCID_API_TOKEN environment variable not set');
  }

  // Step 1: Create .lucid file (ZIP with document.json)
  const lucidFilePath = await createLucidFile(lucidJSON, title);

  try {
    // Step 2: Upload to Lucid via REST API
    const uploadResult = await uploadLucidFile(lucidFilePath, { title, folderId, productId });

    return {
      docId: uploadResult.id,
      title: uploadResult.title,
      url: uploadResult.editUrl,
      viewUrl: uploadResult.viewUrl,
      productId: uploadResult.product
    };

  } finally {
    // Cleanup temp file
    await fs.unlink(lucidFilePath).catch(() => {});
  }
}

/**
 * Create a .lucid file (ZIP format) from Lucid JSON
 *
 * @param {Object} lucidJSON - Lucid Standard Import JSON
 * @param {string} title - Document title for filename
 * @returns {Promise<string>} Path to created .lucid file
 */
async function createLucidFile(lucidJSON, title) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lucid-'));
  const documentJsonPath = path.join(tempDir, 'document.json');

  // Write document.json
  await fs.writeFile(documentJsonPath, JSON.stringify(lucidJSON, null, 2));

  // Create .lucid ZIP file
  const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const lucidFilePath = path.join(os.tmpdir(), `${sanitizedTitle}_${Date.now()}.lucid`);

  // Use zip command to create archive
  try {
    execSync(`cd "${tempDir}" && zip -q "${lucidFilePath}" document.json`, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`Failed to create .lucid file: ${error.message}`);
  }

  // Cleanup temp directory
  await fs.rm(tempDir, { recursive: true, force: true });

  return lucidFilePath;
}

/**
 * Upload .lucid file to Lucid REST API
 *
 * @param {string} lucidFilePath - Path to .lucid file
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with document info
 */
async function uploadLucidFile(lucidFilePath, options) {
  const {
    title = 'Untitled',
    folderId = null,
    productId = 'lucidchart'
  } = options;

  // Read file content
  const fileContent = await fs.readFile(lucidFilePath);

  // Prepare multipart form data
  const boundary = `----LucidFormBoundary${Date.now()}`;
  const formData = buildMultipartFormData(fileContent, title, boundary, { folderId, productId });

  // Make API request
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: new URL(LUCID_API_BASE).hostname,
      port: 443,
      path: '/documents/import',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LUCID_API_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formData),
        'Lucid-Api-Version': '1'
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    req.write(formData);
    req.end();
  });
}

/**
 * Build multipart form data for file upload
 *
 * @param {Buffer} fileContent - File content buffer
 * @param {string} title - Document title
 * @param {string} boundary - Multipart boundary string
 * @param {Object} options - Additional form fields
 * @returns {string} Multipart form data string
 */
function buildMultipartFormData(fileContent, title, boundary, options = {}) {
  let formData = '';

  // Add title field
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="title"\r\n\r\n`;
  formData += `${title}\r\n`;

  // Add folderId if provided
  if (options.folderId) {
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="folderId"\r\n\r\n`;
    formData += `${options.folderId}\r\n`;
  }

  // Add productId
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="product"\r\n\r\n`;
  formData += `${options.productId || 'lucidchart'}\r\n`;

  // Add file
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="file"; filename="document.lucid"\r\n`;
  formData += `Content-Type: application/vnd.lucid.standardImport+json\r\n\r\n`;

  // Convert formData to buffer and append file content
  const formDataBuffer = Buffer.from(formData, 'utf8');
  const endBoundaryBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return Buffer.concat([
    formDataBuffer,
    fileContent,
    endBoundaryBuffer
  ]);
}

/**
 * Create a share link for a Lucidchart document
 *
 * @param {string} docId - Document ID
 * @param {Object} options - Share link options
 * @param {string} options.accessLevel - 'view' or 'comment' or 'edit'
 * @param {boolean} options.allowAnonymous - Allow anonymous access
 * @returns {Promise<Object>} Share link info with URL
 */
async function createShareLink(docId, options = {}) {
  const {
    accessLevel = 'view',
    allowAnonymous = true
  } = options;

  if (!LUCID_API_TOKEN) {
    throw new Error('LUCID_API_TOKEN environment variable not set');
  }

  const requestBody = JSON.stringify({
    accessLevel,
    allowAnonymous
  });

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: new URL(LUCID_API_BASE).hostname,
      port: 443,
      path: `/documents/${docId}/share-links`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LUCID_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Lucid-Api-Version': '1'
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve({
              linkId: result.id,
              url: result.url,
              accessLevel: result.accessLevel
            });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Export a Lucidchart document as PNG image
 *
 * @param {string} docId - Document ID
 * @param {Object} options - Export options
 * @param {number} options.pageNumber - Page number to export (default: 1)
 * @param {number} options.scale - Image scale (1-4)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function exportDocumentAsPNG(docId, options = {}) {
  const {
    pageNumber = 1,
    scale = 2
  } = options;

  if (!LUCID_API_TOKEN) {
    throw new Error('LUCID_API_TOKEN environment variable not set');
  }

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: new URL(LUCID_API_BASE).hostname,
      port: 443,
      path: `/documents/${docId}/pages/${pageNumber}/export?format=png&scale=${scale}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LUCID_API_TOKEN}`,
        'Accept': 'image/png',
        'Lucid-Api-Version': '1'
      }
    };

    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          const errorData = Buffer.concat(chunks).toString();
          reject(new Error(`Export failed with status ${res.statusCode}: ${errorData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    req.end();
  });
}

module.exports = {
  createDocumentFromJSON,
  createLucidFile,
  createShareLink,
  exportDocumentAsPNG
};
