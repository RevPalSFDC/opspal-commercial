/**
 * Asana Diagram Embedder
 *
 * Embeds Lucidchart diagrams in Asana tasks and projects.
 * Supports both live URL embedding and static image attachments.
 *
 * @module asana-diagram-embedder
 */

const https = require('https');
const fs = require('fs').promises;

const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

/**
 * Embed a Lucidchart diagram in an Asana task
 *
 * @param {string} taskId - Asana task GID
 * @param {Object} diagram - Diagram information
 * @param {string} diagram.url - Lucidchart document URL
 * @param {string} diagram.title - Diagram title
 * @param {string} diagram.description - Optional description
 * @param {string} mode - 'url' (live embed) or 'image' (static attachment)
 * @returns {Promise<Object>} Embed result
 */
async function embedDiagramInTask(taskId, diagram, mode = 'url') {
  const {
    url,
    title = 'Diagram',
    description = ''
  } = diagram;

  if (!ASANA_ACCESS_TOKEN) {
    throw new Error('ASANA_ACCESS_TOKEN environment variable not set');
  }

  if (mode === 'url') {
    return await embedDiagramURL(taskId, url, title, description);
  } else if (mode === 'image') {
    return await attachDiagramImage(taskId, diagram.imageBuffer, title);
  } else {
    throw new Error(`Unsupported embed mode: ${mode}`);
  }
}

/**
 * Embed Lucidchart URL in task description or comment
 *
 * Asana automatically creates a preview for Lucidchart URLs
 *
 * @param {string} taskId - Asana task GID
 * @param {string} lucidUrl - Lucidchart document URL
 * @param {string} title - Diagram title
 * @param {string} description - Optional description
 * @returns {Promise<Object>} Story (comment) result
 */
async function embedDiagramURL(taskId, lucidUrl, title, description) {
  const commentText = `**${title}**\n\n${description}\n\n${lucidUrl}\n\n_Diagram created automatically from Mermaid code_`;

  const requestBody = JSON.stringify({
    data: {
      text: commentText,
      resource_type: 'task',
      resource_subtype: 'comment_added'
    }
  });

  return asanaRequest('POST', `/tasks/${taskId}/stories`, requestBody);
}

/**
 * Attach diagram image to Asana task
 *
 * @param {string} taskId - Asana task GID
 * @param {Buffer} imageBuffer - PNG image buffer
 * @param {string} title - Attachment title/filename
 * @returns {Promise<Object>} Attachment result
 */
async function attachDiagramImage(taskId, imageBuffer, title) {
  const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.png`;

  // Create multipart form data
  const boundary = `----AsanaFormBoundary${Date.now()}`;

  let formData = '';

  // Add parent field (task ID)
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="parent"\r\n\r\n`;
  formData += `${taskId}\r\n`;

  // Add file
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
  formData += `Content-Type: image/png\r\n\r\n`;

  const formDataBuffer = Buffer.from(formData, 'utf8');
  const endBoundaryBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const fullFormData = Buffer.concat([
    formDataBuffer,
    imageBuffer,
    endBoundaryBuffer
  ]);

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'app.asana.com',
      port: 443,
      path: '/api/1.0/attachments',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(fullFormData)
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
            resolve(result.data);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`Asana API failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    req.write(fullFormData);
    req.end();
  });
}

/**
 * Embed diagram in Asana project brief
 *
 * @param {string} projectId - Asana project GID
 * @param {string} lucidUrl - Lucidchart document URL
 * @param {string} title - Diagram title
 * @param {string} section - Section to add to (e.g., "Architecture", "Process Flow")
 * @returns {Promise<Object>} Project brief update result
 */
async function embedDiagramInProjectBrief(projectId, lucidUrl, title, section = 'Diagrams') {
  // First, get current project brief
  const project = await asanaRequest('GET', `/projects/${projectId}`);
  const currentNotes = project.notes || '';

  // Append diagram to notes
  const diagramSection = `\n\n## ${section}\n\n**${title}**\n\n${lucidUrl}\n`;
  const updatedNotes = currentNotes + diagramSection;

  // Update project with new notes
  const requestBody = JSON.stringify({
    data: {
      notes: updatedNotes
    }
  });

  return asanaRequest('PUT', `/projects/${projectId}`, requestBody);
}

/**
 * Create a custom field on task with diagram URL
 *
 * @param {string} taskId - Asana task GID
 * @param {string} lucidUrl - Lucidchart document URL
 * @param {string} customFieldId - Custom field GID (must be text type)
 * @returns {Promise<Object>} Task update result
 */
async function setDiagramCustomField(taskId, lucidUrl, customFieldId) {
  const requestBody = JSON.stringify({
    data: {
      custom_fields: {
        [customFieldId]: lucidUrl
      }
    }
  });

  return asanaRequest('PUT', `/tasks/${taskId}`, requestBody);
}

/**
 * Helper: Make Asana API request
 *
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {string} body - Request body (optional)
 * @returns {Promise<Object>} Response data
 */
function asanaRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'app.asana.com',
      port: 443,
      path: `/api/1.0${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    };

    if (body) {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result.data);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`Asana API failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Batch embed multiple diagrams in Asana tasks
 *
 * @param {Array<Object>} embeddings - Array of {taskId, diagram} objects
 * @param {Object} options - Batch options
 * @param {string} options.mode - 'url' or 'image'
 * @param {number} options.concurrency - Max concurrent requests (default: 5)
 * @returns {Promise<Array>} Results array
 */
async function batchEmbedDiagrams(embeddings, options = {}) {
  const {
    mode = 'url',
    concurrency = 5
  } = options;

  const results = [];
  const errors = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < embeddings.length; i += concurrency) {
    const batch = embeddings.slice(i, i + concurrency);

    const batchPromises = batch.map(async ({ taskId, diagram }) => {
      try {
        const result = await embedDiagramInTask(taskId, diagram, mode);
        results.push({ taskId, success: true, result });
      } catch (error) {
        errors.push({ taskId, success: false, error: error.message });
      }
    });

    await Promise.all(batchPromises);

    // Rate limit: wait 1 second between batches
    if (i + concurrency < embeddings.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return {
    results,
    errors,
    total: embeddings.length,
    successful: results.length,
    failed: errors.length
  };
}

module.exports = {
  embedDiagramInTask,
  embedDiagramInProjectBrief,
  setDiagramCustomField,
  attachDiagramImage,
  batchEmbedDiagrams
};
