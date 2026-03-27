#!/usr/bin/env node
/**
 * Gemini CLI Invoker
 *
 * Invokes Google's Gemini CLI in non-interactive mode and returns parsed responses.
 * Designed for use by the gemini-consult agent.
 *
 * @module gemini-cli-invoker
 * @version 1.0.0
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

/**
 * Default configuration for Gemini invocations
 */
const DEFAULT_CONFIG = {
  model: null,  // Let Gemini CLI use its default model
  outputFormat: 'json',
  timeout: 120000, // 2 minutes
  maxBuffer: 10 * 1024 * 1024, // 10MB
  maxRetries: 2,
  retryDelay: 1000
};

function isGeminiDisabled() {
  const value = String(process.env.GEMINI_DISABLED || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * Check if Gemini CLI is installed and configured
 * @returns {object} Status object with installed, version, and apiKeySet properties
 */
function checkGeminiStatus() {
  const status = {
    installed: false,
    version: null,
    apiKeySet: false,
    disabled: false,
    error: null
  };

  if (isGeminiDisabled()) {
    status.disabled = true;
    status.error = 'Gemini CLI disabled via GEMINI_DISABLED';
    return status;
  }

  try {
    const version = execSync('gemini --version 2>/dev/null', { encoding: 'utf8' }).trim();
    status.installed = true;
    status.version = version;
  } catch (e) {
    status.error = 'Gemini CLI not installed. Run: npm install -g @google/gemini-cli';
    return status;
  }

  status.apiKeySet = !!process.env.GEMINI_API_KEY;
  if (!status.apiKeySet) {
    status.error = 'GEMINI_API_KEY not set. Get key from: https://aistudio.google.com/apikey';
  }

  return status;
}

/**
 * Escape a string for safe shell execution
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function shellEscape(str) {
  // Use single quotes and escape any existing single quotes
  return "'" + str.replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Invoke Gemini CLI with a prompt
 * @param {string} prompt - The prompt to send to Gemini
 * @param {object} options - Configuration options
 * @param {string} [options.model='gemini-2.5-pro'] - Gemini model to use
 * @param {string} [options.outputFormat='json'] - Output format (json, text, stream-json)
 * @param {number} [options.timeout=120000] - Timeout in milliseconds
 * @param {string[]} [options.includeFiles=[]] - Files to include as context
 * @param {string} [options.systemPrompt] - System prompt to prepend
 * @returns {Promise<object>} - Parsed Gemini response
 */
async function invokeGemini(prompt, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Check prerequisites
  const status = checkGeminiStatus();
  if (!status.installed || !status.apiKeySet) {
    throw new Error(status.error);
  }

  // Build the full prompt
  let fullPrompt = prompt;
  if (config.systemPrompt) {
    fullPrompt = `${config.systemPrompt}\n\n---\n\n${prompt}`;
  }

  // Build command arguments (use positional prompt, not deprecated -p flag)
  const args = [
    fullPrompt,  // Positional prompt (required first)
    '-o', config.outputFormat  // Output format
  ];

  // Add model if specified and not default
  if (config.model) {
    args.push('-m', config.model);
  }

  // Include files if specified
  if (config.includeFiles && config.includeFiles.length > 0) {
    for (const file of config.includeFiles) {
      args.push('--include-file', file);
    }
  }

  // Execute with retries
  let lastError = null;
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await executeGeminiCommand(args, config);
      return parseGeminiResponse(result, config.outputFormat);
    } catch (error) {
      lastError = error;
      if (attempt < config.maxRetries) {
        console.error(`Attempt ${attempt} failed, retrying in ${config.retryDelay}ms...`);
        await sleep(config.retryDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Execute the Gemini CLI command
 * @param {string[]} args - Command arguments
 * @param {object} config - Configuration
 * @returns {Promise<string>} - Command output
 */
function executeGeminiCommand(args, config) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('gemini', args, {
      timeout: config.timeout,
      maxBuffer: config.maxBuffer,
      env: { ...process.env }
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to execute Gemini CLI: ${err.message}`));
    });

    // Handle timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Gemini CLI timed out after ${config.timeout}ms`));
    }, config.timeout);
  });
}

/**
 * Parse Gemini response based on output format
 * @param {string} output - Raw output from Gemini CLI
 * @param {string} format - Output format
 * @returns {object} - Parsed response
 */
function parseGeminiResponse(output, format) {
  const response = {
    success: true,
    format: format,
    timestamp: new Date().toISOString(),
    raw: output
  };

  try {
    if (format === 'json') {
      response.data = JSON.parse(output);
      response.content = extractContent(response.data);
    } else if (format === 'stream-json') {
      // Parse newline-delimited JSON
      const lines = output.trim().split('\n').filter(line => line.trim());
      response.data = lines.map(line => JSON.parse(line));
      response.content = response.data.map(d => extractContent(d)).join('');
    } else {
      response.content = output.trim();
    }
  } catch (parseError) {
    // If JSON parsing fails, treat as text
    response.content = output.trim();
    response.parseError = parseError.message;
  }

  return response;
}

/**
 * Extract the main content from a Gemini response object
 * @param {object} data - Parsed JSON response
 * @returns {string} - Extracted content
 */
function extractContent(data) {
  // Handle Gemini CLI output format: { "response": "...", "stats": {...} }
  if (data.response) return data.response;

  // Handle raw API format (in case it changes)
  if (data.candidates && data.candidates[0]) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts) {
      return candidate.content.parts.map(p => p.text || '').join('');
    }
  }
  if (data.text) return data.text;
  if (data.content) return data.content;
  return JSON.stringify(data);
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Invoke Gemini with file context
 * @param {string} prompt - The prompt
 * @param {string[]} filePaths - Paths to files to include
 * @param {object} options - Additional options
 * @returns {Promise<object>} - Gemini response
 */
async function invokeWithFiles(prompt, filePaths, options = {}) {
  const fs = require('fs').promises;

  // Read files and build context
  const fileContents = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const fileName = path.basename(filePath);
        return `### File: ${fileName}\n\`\`\`\n${content}\n\`\`\``;
      } catch (err) {
        return `### File: ${filePath}\n(Could not read: ${err.message})`;
      }
    })
  );

  const contextPrompt = `${fileContents.join('\n\n')}\n\n---\n\n${prompt}`;

  return invokeGemini(contextPrompt, options);
}

// Export functions
module.exports = {
  invokeGemini,
  invokeWithFiles,
  checkGeminiStatus,
  isGeminiDisabled,
  DEFAULT_CONFIG
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--check')) {
    const status = checkGeminiStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.error ? 1 : 0);
  }

  if (args.includes('--help')) {
    console.log(`
Gemini CLI Invoker

Usage:
  node gemini-cli-invoker.js --check              Check prerequisites
  node gemini-cli-invoker.js --prompt "..."       Send a prompt
  node gemini-cli-invoker.js "prompt text here"   Send a prompt (positional)
  node gemini-cli-invoker.js --help               Show this help

Options:
  --model MODEL      Gemini model (uses CLI default if not specified)
  --timeout MS       Timeout in milliseconds (default: 120000)
  --file PATH        Include file as context (can be repeated)

Environment:
  GEMINI_API_KEY     Required. Get from https://aistudio.google.com/apikey
`);
    process.exit(0);
  }

  // Parse CLI arguments - support both --prompt and positional
  let prompt;
  const promptIdx = args.indexOf('--prompt');
  if (promptIdx !== -1 && args[promptIdx + 1]) {
    prompt = args[promptIdx + 1];
  } else {
    // Use first non-flag argument as prompt
    prompt = args.find(arg => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--'));
  }

  if (!prompt) {
    console.error('Error: prompt is required (use --prompt "..." or positional argument)');
    process.exit(1);
  }

  const options = {};

  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1) options.model = args[modelIdx + 1];

  const timeoutIdx = args.indexOf('--timeout');
  if (timeoutIdx !== -1) options.timeout = parseInt(args[timeoutIdx + 1]);

  // Collect files
  const files = [];
  args.forEach((arg, i) => {
    if (arg === '--file' && args[i + 1]) files.push(args[i + 1]);
  });

  // Execute
  (async () => {
    try {
      const result = files.length > 0
        ? await invokeWithFiles(prompt, files, options)
        : await invokeGemini(prompt, options);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}
