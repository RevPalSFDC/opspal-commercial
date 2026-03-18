/**
 * Mermaid Preprocessor
 *
 * Pre-renders Mermaid diagrams to PNG and embeds them as base64 data URLs
 * in markdown before PDF generation. Prevents broken image links.
 *
 * Related reflections: 72a3db58, 6dd64b89, 37018faf, ca41ce4e
 * ROI: $12,000/yr
 *
 * @module mermaid-preprocessor
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');

// Mermaid code block regex
const MERMAID_REGEX = /```mermaid\s*([\s\S]*?)```/g;

// RevPal brand theme for Mermaid
const REVPAL_MERMAID_THEME = {
  theme: 'base',
  themeVariables: {
    primaryColor: '#5F3B8C',
    primaryTextColor: '#FFFFFF',
    primaryBorderColor: '#4A2D6B',
    secondaryColor: '#E99560',
    secondaryTextColor: '#3E4A61',
    secondaryBorderColor: '#D4845A',
    tertiaryColor: '#EAE4DC',
    tertiaryTextColor: '#3E4A61',
    tertiaryBorderColor: '#D8D2CA',
    lineColor: '#3E4A61',
    textColor: '#3E4A61',
    mainBkg: '#FFFFFF',
    nodeBorder: '#5F3B8C',
    clusterBkg: '#F5F2EF',
    clusterBorder: '#5F3B8C',
    titleColor: '#5F3B8C',
    edgeLabelBackground: '#FFFFFF',
    actorBkg: '#5F3B8C',
    actorBorder: '#4A2D6B',
    actorTextColor: '#FFFFFF',
    actorLineColor: '#3E4A61',
    signalColor: '#3E4A61',
    signalTextColor: '#3E4A61',
    labelBoxBkgColor: '#EAE4DC',
    labelBoxBorderColor: '#5F3B8C',
    labelTextColor: '#3E4A61',
    loopTextColor: '#3E4A61',
    noteBorderColor: '#E99560',
    noteBkgColor: '#FDF5F0',
    noteTextColor: '#3E4A61',
    activationBorderColor: '#5F3B8C',
    activationBkgColor: '#E8E0F0',
    sequenceNumberColor: '#FFFFFF',
    sectionBkgColor: '#E8E0F0',
    altSectionBkgColor: '#F5F2EF',
    sectionBkgColor2: '#EAE4DC',
    taskBorderColor: '#5F3B8C',
    taskBkgColor: '#E8E0F0',
    taskTextColor: '#3E4A61',
    taskTextLightColor: '#FFFFFF',
    taskTextOutsideColor: '#3E4A61',
    taskTextClickableColor: '#5F3B8C',
    activeTaskBorderColor: '#E99560',
    activeTaskBkgColor: '#FDF5F0',
    gridColor: '#D8D2CA',
    doneTaskBkgColor: '#6FBF73',
    doneTaskBorderColor: '#5AA95D',
    critBorderColor: '#DC3545',
    critBkgColor: '#FDE8EA',
    todayLineColor: '#E99560',
    relationColor: '#3E4A61',
    relationLabelBackground: '#FFFFFF',
    relationLabelColor: '#3E4A61'
  }
};

/**
 * Check if Mermaid CLI is available
 * @returns {Object} Availability status and path
 */
function checkMermaidCli() {
  const result = {
    available: false,
    path: null,
    version: null,
    error: null
  };

  // Check for mmdc in PATH
  try {
    const output = execSync('which mmdc 2>/dev/null || where mmdc 2>nul', {
      encoding: 'utf8',
      timeout: 5000
    }).trim();

    if (output) {
      result.path = output.split('\n')[0];
      result.available = true;

      // Get version
      try {
        result.version = execSync('mmdc --version', {
          encoding: 'utf8',
          timeout: 5000
        }).trim();
      } catch (e) {
        // Version check failed but mmdc exists
      }
    }
  } catch (e) {
    // Try npx mmdc
    try {
      const npxResult = spawnSync('npx', ['--yes', 'mmdc', '--version'], {
        encoding: 'utf8',
        timeout: 30000
      });

      if (npxResult.status === 0) {
        result.available = true;
        result.path = 'npx mmdc';
        result.version = npxResult.stdout?.trim();
      }
    } catch (e2) {
      result.error = 'Mermaid CLI (mmdc) not found. Install with: npm install -g @mermaid-js/mermaid-cli';
    }
  }

  return result;
}

/**
 * Generate a unique hash for mermaid content
 * @param {string} content - Mermaid diagram content
 * @returns {string} Short hash
 */
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

/**
 * Render a single Mermaid diagram to PNG
 * @param {string} mermaidContent - The Mermaid diagram code
 * @param {Object} options - Rendering options
 * @param {string} options.outputDir - Directory for temp files
 * @param {boolean} options.useTheme - Apply RevPal theme (default: true)
 * @param {number} options.width - Output width in pixels
 * @param {number} options.height - Output height in pixels
 * @returns {Object} Rendering result with base64 data
 */
function renderMermaidToPng(mermaidContent, options = {}) {
  const result = {
    success: false,
    base64: null,
    pngPath: null,
    error: null,
    fallbackAscii: null
  };

  const outputDir = options.outputDir || path.join(os.tmpdir(), 'mermaid-render');
  const useTheme = options.useTheme !== false;
  const width = options.width || 1200;
  const height = options.height || 800;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const hash = generateHash(mermaidContent);
  const mmdPath = path.join(outputDir, `diagram-${hash}.mmd`);
  const pngPath = path.join(outputDir, `diagram-${hash}.png`);
  const configPath = path.join(outputDir, `config-${hash}.json`);

  try {
    // Write mermaid content to file
    fs.writeFileSync(mmdPath, mermaidContent, 'utf8');

    // Write theme config if using RevPal theme
    if (useTheme) {
      fs.writeFileSync(configPath, JSON.stringify(REVPAL_MERMAID_THEME), 'utf8');
    }

    // Build mmdc command
    const args = [
      '-i', mmdPath,
      '-o', pngPath,
      '-w', width.toString(),
      '-H', height.toString(),
      '-b', 'white'
    ];

    if (useTheme) {
      args.push('-c', configPath);
    }

    // Execute mmdc
    const cli = checkMermaidCli();
    if (!cli.available) {
      throw new Error(cli.error || 'Mermaid CLI not available');
    }

    let execResult;
    if (cli.path === 'npx mmdc') {
      execResult = spawnSync('npx', ['--yes', 'mmdc', ...args], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });
    } else {
      execResult = spawnSync(cli.path, args, {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024
      });
    }

    if (execResult.status !== 0) {
      throw new Error(execResult.stderr || 'mmdc execution failed');
    }

    // Verify PNG was created
    if (!fs.existsSync(pngPath)) {
      throw new Error('PNG file was not created');
    }

    const stats = fs.statSync(pngPath);
    if (stats.size === 0) {
      throw new Error('PNG file is empty');
    }

    // Read PNG and convert to base64
    const pngData = fs.readFileSync(pngPath);
    result.base64 = pngData.toString('base64');
    result.pngPath = pngPath;
    result.success = true;

  } catch (err) {
    result.error = err.message;

    // Generate ASCII fallback
    result.fallbackAscii = generateAsciiFallback(mermaidContent);
  }

  // Cleanup temp files
  try {
    if (fs.existsSync(mmdPath)) fs.unlinkSync(mmdPath);
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    // Keep PNG for debugging if failed
    if (result.success && fs.existsSync(pngPath)) {
      // Optionally keep for caching
    }
  } catch (e) {
    // Ignore cleanup errors
  }

  return result;
}

/**
 * Generate ASCII art fallback for a diagram
 * @param {string} mermaidContent - The Mermaid diagram code
 * @returns {string} ASCII representation
 */
function generateAsciiFallback(mermaidContent) {
  const lines = mermaidContent.trim().split('\n');
  const type = lines[0]?.toLowerCase() || 'unknown';

  let ascii = '```\n';
  ascii += '+' + '-'.repeat(50) + '+\n';
  ascii += '|' + ' DIAGRAM (Mermaid rendering failed)'.padEnd(50) + '|\n';
  ascii += '+' + '-'.repeat(50) + '+\n';
  ascii += '| Type: ' + type.substring(0, 43).padEnd(43) + '|\n';
  ascii += '+' + '-'.repeat(50) + '+\n';

  // Extract key elements based on diagram type
  if (type.includes('flowchart') || type.includes('graph')) {
    const nodes = mermaidContent.match(/\[([^\]]+)\]/g) || [];
    const uniqueNodes = [...new Set(nodes)].slice(0, 5);
    uniqueNodes.forEach(node => {
      ascii += '| ' + node.padEnd(49) + '|\n';
    });
  } else if (type.includes('sequence')) {
    const participants = mermaidContent.match(/participant\s+(\w+)/gi) || [];
    participants.slice(0, 5).forEach(p => {
      ascii += '| ' + p.padEnd(49) + '|\n';
    });
  } else if (type.includes('erdiagram')) {
    const entities = mermaidContent.match(/^\s*(\w+)\s*{/gm) || [];
    entities.slice(0, 5).forEach(e => {
      ascii += '| Entity: ' + e.trim().padEnd(41) + '|\n';
    });
  }

  ascii += '+' + '-'.repeat(50) + '+\n';
  ascii += '```\n';
  ascii += '\n_Note: Diagram could not be rendered. See source for details._\n';

  return ascii;
}

/**
 * Process markdown content, replacing Mermaid blocks with images
 * @param {string} markdownContent - The markdown content
 * @param {Object} options - Processing options
 * @param {string} options.outputDir - Directory for temp files
 * @param {boolean} options.useTheme - Apply RevPal theme
 * @param {boolean} options.useFallback - Use ASCII fallback on failure (default: true)
 * @param {boolean} options.embedBase64 - Embed as base64 data URL (default: true)
 * @returns {Object} Processed result
 */
function processMarkdown(markdownContent, options = {}) {
  const result = {
    content: markdownContent,
    diagramsFound: 0,
    diagramsRendered: 0,
    diagramsFailed: 0,
    details: []
  };

  const useFallback = options.useFallback !== false;
  const embedBase64 = options.embedBase64 !== false;

  // Find all mermaid blocks
  const matches = [...markdownContent.matchAll(MERMAID_REGEX)];
  result.diagramsFound = matches.length;

  if (matches.length === 0) {
    return result;
  }

  // Process each mermaid block
  let processedContent = markdownContent;

  for (const match of matches) {
    const fullMatch = match[0];
    const mermaidCode = match[1].trim();
    const hash = generateHash(mermaidCode);

    const renderResult = renderMermaidToPng(mermaidCode, options);

    if (renderResult.success && embedBase64) {
      // Replace with base64 image
      const imgTag = `![Diagram ${hash}](data:image/png;base64,${renderResult.base64})`;
      processedContent = processedContent.replace(fullMatch, imgTag);
      result.diagramsRendered++;
      result.details.push({
        hash,
        status: 'rendered',
        method: 'base64'
      });
    } else if (renderResult.success && renderResult.pngPath) {
      // Replace with file path
      const imgTag = `![Diagram ${hash}](${renderResult.pngPath})`;
      processedContent = processedContent.replace(fullMatch, imgTag);
      result.diagramsRendered++;
      result.details.push({
        hash,
        status: 'rendered',
        method: 'file',
        path: renderResult.pngPath
      });
    } else if (useFallback && renderResult.fallbackAscii) {
      // Replace with ASCII fallback
      processedContent = processedContent.replace(fullMatch, renderResult.fallbackAscii);
      result.diagramsFailed++;
      result.details.push({
        hash,
        status: 'fallback',
        error: renderResult.error
      });
    } else {
      // Keep original and log error
      result.diagramsFailed++;
      result.details.push({
        hash,
        status: 'failed',
        error: renderResult.error
      });
    }
  }

  result.content = processedContent;
  return result;
}

/**
 * Process a markdown file and write the result
 * @param {string} inputPath - Path to input markdown file
 * @param {string} outputPath - Path for output (optional, defaults to input with .processed.md)
 * @param {Object} options - Processing options
 * @returns {Object} Processing result
 */
function processMarkdownFile(inputPath, outputPath = null, options = {}) {
  const result = {
    success: false,
    inputPath,
    outputPath: null,
    error: null,
    stats: null
  };

  // Verify input exists
  if (!fs.existsSync(inputPath)) {
    result.error = `Input file not found: ${inputPath}`;
    return result;
  }

  // Set output path
  result.outputPath = outputPath || inputPath.replace(/\.md$/, '.processed.md');

  try {
    // Read input
    const content = fs.readFileSync(inputPath, 'utf8');

    // Process
    const processResult = processMarkdown(content, options);
    result.stats = {
      diagramsFound: processResult.diagramsFound,
      diagramsRendered: processResult.diagramsRendered,
      diagramsFailed: processResult.diagramsFailed,
      details: processResult.details
    };

    // Write output
    fs.writeFileSync(result.outputPath, processResult.content, 'utf8');
    result.success = true;

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'check':
      const cliStatus = checkMermaidCli();
      console.log(JSON.stringify(cliStatus, null, 2));
      process.exit(cliStatus.available ? 0 : 1);
      break;

    case 'render':
      if (!args[1]) {
        console.error('Usage: mermaid-preprocessor.js render <mermaid-file> [output-png]');
        process.exit(1);
      }
      const mmdContent = fs.readFileSync(args[1], 'utf8');
      const renderOpts = { outputDir: path.dirname(args[2] || args[1]) };
      const renderRes = renderMermaidToPng(mmdContent, renderOpts);
      console.log(JSON.stringify({
        success: renderRes.success,
        pngPath: renderRes.pngPath,
        error: renderRes.error,
        hasBase64: !!renderRes.base64
      }, null, 2));
      process.exit(renderRes.success ? 0 : 1);
      break;

    case 'process':
      if (!args[1]) {
        console.error('Usage: mermaid-preprocessor.js process <markdown-file> [output-file]');
        process.exit(1);
      }
      const procResult = processMarkdownFile(args[1], args[2]);
      console.log(JSON.stringify(procResult, null, 2));
      process.exit(procResult.success ? 0 : 1);
      break;

    case 'theme':
      console.log(JSON.stringify(REVPAL_MERMAID_THEME, null, 2));
      break;

    default:
      console.log(`Mermaid Preprocessor

Usage:
  mermaid-preprocessor.js check                          Check if mmdc is available
  mermaid-preprocessor.js render <file.mmd> [out.png]    Render single diagram
  mermaid-preprocessor.js process <file.md> [out.md]     Process markdown file
  mermaid-preprocessor.js theme                          Show RevPal Mermaid theme

Features:
  - Pre-renders Mermaid diagrams to PNG before PDF generation
  - Embeds images as base64 data URLs (no broken links)
  - Applies RevPal brand theme to all diagrams
  - Falls back to ASCII representation on render failure

Examples:
  # Check Mermaid CLI availability
  node mermaid-preprocessor.js check

  # Process markdown with diagrams
  node mermaid-preprocessor.js process report.md report.processed.md

  # Render single diagram
  node mermaid-preprocessor.js render diagram.mmd output.png
`);
  }
}

module.exports = {
  REVPAL_MERMAID_THEME,
  checkMermaidCli,
  renderMermaidToPng,
  generateAsciiFallback,
  processMarkdown,
  processMarkdownFile
};
