/**
 * Mermaid Preview Utilities
 *
 * Generate previews of Mermaid diagrams as ASCII art, HTML, or PNG
 * for quick visualization without external tools.
 *
 * @module mermaid-preview
 * @version 1.0.0
 *
 * @example
 * const { generateASCIIPreview, generateHTMLPreview } = require('./mermaid-preview');
 *
 * const mermaidCode = 'flowchart TB...';
 * const preview = generateASCIIPreview(mermaidCode);
 * console.log(preview);
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Generate ASCII art preview of diagram
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @param {Object} options - Preview options
 * @returns {string} ASCII art representation
 */
function generateASCIIPreview(mermaidCode, options = {}) {
  const { maxWidth = 80, maxLines = 30 } = options;

  // Parse diagram type
  const lines = mermaidCode.trim().split('\n');
  const diagramType = lines[0].trim().split(/\s+/)[0];

  let preview = '';
  preview += '═'.repeat(maxWidth) + '\n';
  preview += `📊 ${diagramType.toUpperCase()} DIAGRAM PREVIEW\n`;
  preview += '═'.repeat(maxWidth) + '\n';

  // Generate simplified preview based on type
  switch (diagramType) {
    case 'flowchart':
    case 'graph':
      preview += generateFlowchartASCII(mermaidCode, maxWidth);
      break;
    case 'sequenceDiagram':
      preview += generateSequenceASCII(mermaidCode, maxWidth);
      break;
    case 'erDiagram':
      preview += generateERDASCII(mermaidCode, maxWidth);
      break;
    case 'stateDiagram':
    case 'stateDiagram-v2':
      preview += generateStateASCII(mermaidCode, maxWidth);
      break;
    default:
      preview += `[${diagramType} preview not available]\n`;
      preview += `Use Mermaid Live Editor to view: https://mermaid.live/edit\n`;
  }

  preview += '═'.repeat(maxWidth) + '\n';
  preview += `Total Lines: ${lines.length} | Max Preview: ${maxLines}\n`;

  return preview;
}

/**
 * Generate ASCII preview for flowchart
 * @private
 */
function generateFlowchartASCII(mermaidCode, maxWidth) {
  const lines = mermaidCode.split('\n').slice(1); // Skip diagram type
  let ascii = '';

  const nodes = [];
  const edges = [];

  // Parse nodes and edges
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('%%') || trimmed === '') continue;

    // Check for node
    const nodeMatch = trimmed.match(/^(\w+)[\[\(\{]/);
    if (nodeMatch) {
      const labelMatch = trimmed.match(/[\[\(\{]([^\]\)\}]+)[\]\)\}]/);
      nodes.push({
        id: nodeMatch[1],
        label: labelMatch ? labelMatch[1] : nodeMatch[1]
      });
    }

    // Check for edge
    const edgeMatch = trimmed.match(/(\w+)\s*(-->|---|-\.-|==>)\s*(\w+)/);
    if (edgeMatch) {
      edges.push({
        from: edgeMatch[1],
        to: edgeMatch[3]
      });
    }
  }

  // Generate simple ASCII representation
  ascii += '\n';
  for (const node of nodes.slice(0, 10)) { // Limit to 10 nodes for preview
    ascii += `  [${node.id}] ${node.label}\n`;
  }

  if (nodes.length > 10) {
    ascii += `  ... and ${nodes.length - 10} more nodes\n`;
  }

  ascii += '\n';
  ascii += `  Connections (${edges.length}):\n`;

  for (const edge of edges.slice(0, 10)) {
    ascii += `  ${edge.from} --> ${edge.to}\n`;
  }

  if (edges.length > 10) {
    ascii += `  ... and ${edges.length - 10} more connections\n`;
  }

  return ascii;
}

/**
 * Generate ASCII preview for sequence diagram
 * @private
 */
function generateSequenceASCII(mermaidCode, maxWidth) {
  const lines = mermaidCode.split('\n').slice(1);
  let ascii = '';

  const participants = [];
  const messages = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('%%') || trimmed === '') continue;

    // Check for participant
    const participantMatch = trimmed.match(/^(participant|actor)\s+(\w+)/);
    if (participantMatch) {
      participants.push(participantMatch[2]);
    }

    // Check for message
    const messageMatch = trimmed.match(/(\w+)\s*(--?>>?|--?>)\s*(\w+)\s*:\s*(.+)/);
    if (messageMatch) {
      messages.push({
        from: messageMatch[1],
        to: messageMatch[3],
        text: messageMatch[4]
      });
    }
  }

  // Generate ASCII
  ascii += '\n';
  ascii += `  Participants: ${participants.join(', ')}\n\n`;

  for (let i = 0; i < Math.min(messages.length, 10); i++) {
    const msg = messages[i];
    ascii += `  ${i + 1}. ${msg.from} → ${msg.to}: ${msg.text}\n`;
  }

  if (messages.length > 10) {
    ascii += `  ... and ${messages.length - 10} more messages\n`;
  }

  return ascii;
}

/**
 * Generate ASCII preview for ERD
 * @private
 */
function generateERDASCII(mermaidCode, maxWidth) {
  const lines = mermaidCode.split('\n').slice(1);
  let ascii = '';

  const entities = [];
  const relationships = [];

  let currentEntity = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('%%') || trimmed === '') continue;

    // Check for entity start
    const entityMatch = trimmed.match(/^(\w+)\s*\{/);
    if (entityMatch) {
      currentEntity = { name: entityMatch[1], fields: [] };
      entities.push(currentEntity);
      continue;
    }

    // Check for entity end
    if (trimmed === '}') {
      currentEntity = null;
      continue;
    }

    // Check for field
    if (currentEntity) {
      const fieldMatch = trimmed.match(/(\w+)\s+(\w+)/);
      if (fieldMatch) {
        currentEntity.fields.push(`${fieldMatch[1]} ${fieldMatch[2]}`);
      }
    }

    // Check for relationship
    const relMatch = trimmed.match(/(\w+)\s+([\|\}][\|\o]--[\|\o]?[\|\{])\s+(\w+)/);
    if (relMatch) {
      relationships.push({
        from: relMatch[1],
        to: relMatch[3],
        type: relMatch[2]
      });
    }
  }

  // Generate ASCII
  ascii += '\n';
  ascii += `  Entities (${entities.length}):\n`;

  for (const entity of entities.slice(0, 5)) {
    ascii += `  [${entity.name}]\n`;
    for (const field of entity.fields.slice(0, 5)) {
      ascii += `    - ${field}\n`;
    }
    if (entity.fields.length > 5) {
      ascii += `    ... and ${entity.fields.length - 5} more fields\n`;
    }
  }

  if (entities.length > 5) {
    ascii += `  ... and ${entities.length - 5} more entities\n`;
  }

  ascii += `\n  Relationships (${relationships.length}):\n`;

  for (const rel of relationships.slice(0, 10)) {
    ascii += `  ${rel.from} ${rel.type} ${rel.to}\n`;
  }

  if (relationships.length > 10) {
    ascii += `  ... and ${relationships.length - 10} more relationships\n`;
  }

  return ascii;
}

/**
 * Generate ASCII preview for state diagram
 * @private
 */
function generateStateASCII(mermaidCode, maxWidth) {
  const lines = mermaidCode.split('\n').slice(1);
  let ascii = '';

  const states = [];
  const transitions = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('%%') || trimmed === '') continue;

    // Check for state
    const stateMatch = trimmed.match(/^(\w+)\s*:\s*(.+)/);
    if (stateMatch) {
      states.push({ id: stateMatch[1], label: stateMatch[2] });
    }

    // Check for transition
    const transMatch = trimmed.match(/(\w+|\[\*\])\s*-->\s*(\w+|\[\*\])(\s*:\s*(.+))?/);
    if (transMatch) {
      transitions.push({
        from: transMatch[1],
        to: transMatch[2],
        label: transMatch[4] || ''
      });
    }
  }

  // Generate ASCII
  ascii += '\n';
  ascii += `  States (${states.length}):\n`;

  for (const state of states.slice(0, 10)) {
    ascii += `  [${state.id}] ${state.label}\n`;
  }

  if (states.length > 10) {
    ascii += `  ... and ${states.length - 10} more states\n`;
  }

  ascii += `\n  Transitions (${transitions.length}):\n`;

  for (const trans of transitions.slice(0, 10)) {
    const label = trans.label ? ` (${trans.label})` : '';
    ascii += `  ${trans.from} → ${trans.to}${label}\n`;
  }

  if (transitions.length > 10) {
    ascii += `  ... and ${transitions.length - 10} more transitions\n`;
  }

  return ascii;
}

/**
 * Generate HTML preview with Mermaid rendering
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @param {string} outputPath - Path to save HTML file
 * @returns {Promise<string>} Path to HTML file
 */
async function generateHTMLPreview(mermaidCode, outputPath) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mermaid Diagram Preview</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'default' });
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      max-width: 1200px;
      margin: 40px auto;
      padding: 20px;
      background-color: #f6f8fa;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      margin-top: 0;
      color: #24292e;
    }
    .mermaid-container {
      margin-top: 30px;
      border: 1px solid #e1e4e8;
      border-radius: 6px;
      padding: 20px;
      background: #ffffff;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e1e4e8;
      color: #586069;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Mermaid Diagram Preview</h1>
    <div class="mermaid-container">
      <pre class="mermaid">
${mermaidCode}
      </pre>
    </div>
    <div class="content-footer">
      <p>Generated by OpsPal by RevPal</p>
      <p>Edit this diagram at: <a href="https://mermaid.live/edit" target="_blank">Mermaid Live Editor</a></p>
    </div>
  </div>
</body>
</html>
  `;

  await fs.writeFile(outputPath, html, 'utf8');
  return outputPath;
}

/**
 * Generate PNG image using Mermaid CLI (if installed)
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @param {string} outputPath - Path to save PNG file
 * @returns {Promise<string>} Path to PNG file
 */
async function generatePNGPreview(mermaidCode, outputPath) {
  // Check if Mermaid CLI is installed
  try {
    await execAsync('mmdc --version');
  } catch (error) {
    throw new Error('Mermaid CLI not installed. Install with: npm install -g @mermaid-js/mermaid-cli');
  }

  // Create temp mmd file
  const tempMmdPath = path.join('/tmp', `diagram-${Date.now()}.mmd`);
  await fs.writeFile(tempMmdPath, mermaidCode, 'utf8');

  try {
    // Generate PNG
    await execAsync(`mmdc -i ${tempMmdPath} -o ${outputPath}`);

    // Clean up temp file
    await fs.unlink(tempMmdPath);

    return outputPath;
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempMmdPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    throw new Error(`Failed to generate PNG: ${error.message}`);
  }
}

/**
 * Open diagram in browser (HTML preview)
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @returns {Promise<void>}
 */
async function openInBrowser(mermaidCode) {
  const os = require('os');
  const tempPath = path.join(os.tmpdir(), `diagram-preview-${Date.now()}.html`);
  await generateHTMLPreview(mermaidCode, tempPath);

  // Try to open in browser (WSL-aware via platform-utils)
  try {
    const platformUtils = require('./platform-utils');
    platformUtils.openBrowser(tempPath);
    console.log(`Preview opened in browser: ${tempPath}`);
  } catch (error) {
    // Fallback if platform-utils not available
    const platform = process.platform;
    let command;
    if (platform === 'darwin') {
      command = `open ${tempPath}`;
    } else if (platform === 'win32') {
      command = `start ${tempPath}`;
    } else {
      command = `xdg-open ${tempPath}`;
    }
    try {
      await execAsync(command);
      console.log(`Preview opened in browser: ${tempPath}`);
    } catch (err) {
      console.error(`Failed to open browser: ${err.message}`);
      console.log(`Manual open: ${tempPath}`);
    }
  }
}

/**
 * Generate Mermaid Live Editor URL
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @returns {string} Mermaid Live Editor URL
 */
function generateLiveEditorURL(mermaidCode) {
  // Encode diagram for URL
  const encoded = Buffer.from(mermaidCode).toString('base64');
  return `https://mermaid.live/edit#pako:${encoded}`;
}

/**
 * Generate all preview formats
 * @param {string} mermaidCode - Mermaid diagram syntax
 * @param {string} basePath - Base path for output files (without extension)
 * @param {Object} options - Preview options
 * @returns {Promise<Object>} Paths to all generated files
 */
async function generateAllPreviews(mermaidCode, basePath, options = {}) {
  const { formats = ['ascii', 'html'], openBrowser = false } = options;

  const results = {
    ascii: null,
    html: null,
    png: null,
    liveEditor: null
  };

  // ASCII preview
  if (formats.includes('ascii')) {
    results.ascii = generateASCIIPreview(mermaidCode);
  }

  // HTML preview
  if (formats.includes('html')) {
    const htmlPath = `${basePath}.html`;
    results.html = await generateHTMLPreview(mermaidCode, htmlPath);

    if (openBrowser) {
      await openInBrowser(mermaidCode);
    }
  }

  // PNG preview (optional, requires CLI)
  if (formats.includes('png')) {
    try {
      const pngPath = `${basePath}.png`;
      results.png = await generatePNGPreview(mermaidCode, pngPath);
    } catch (error) {
      console.warn(`PNG generation skipped: ${error.message}`);
    }
  }

  // Always generate Live Editor URL
  results.liveEditor = generateLiveEditorURL(mermaidCode);

  return results;
}

module.exports = {
  generateASCIIPreview,
  generateHTMLPreview,
  generatePNGPreview,
  openInBrowser,
  generateLiveEditorURL,
  generateAllPreviews
};
