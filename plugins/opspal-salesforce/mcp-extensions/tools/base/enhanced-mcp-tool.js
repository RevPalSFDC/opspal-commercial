const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class EnhancedMCPTool {
  constructor(config = {}) {
    this.config = { ...config };
    this.name = config.name || 'enhanced-mcp-tool';
    this.version = config.version || '0.0.0';
    this.stage = config.stage || 'development';
    this.description = config.description || '';
    this.verbose = Boolean(config.verbose);
    this.auditTrail = [];
  }

  async execute(params) {
    throw new Error('EnhancedMCPTool.execute() must be implemented by subclass');
  }

  async validate(params) {
    return { valid: true };
  }

  validateParams(params, required = []) {
    if (!params || typeof params !== 'object') {
      throw this.enhanceError(new Error('Params must be an object'), {
        operation: 'validateParams'
      });
    }
    const missing = required.filter((key) =>
      params[key] === undefined || params[key] === null || params[key] === ''
    );
    if (missing.length > 0) {
      throw this.enhanceError(new Error(`Missing required parameters: ${missing.join(', ')}`), {
        operation: 'validateParams',
        missing
      });
    }
  }

  logOperation(operation, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      operation,
      details
    };
    this.auditTrail.push(entry);
    if (this.verbose) {
      console.log(`[${this.name}] ${operation}`, details);
    }
    return entry;
  }

  getAuditTrail() {
    return [...this.auditTrail];
  }

  async executeCommand(command, options = {}) {
    const execOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      timeout: options.timeout,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024
    };

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      return { stdout, stderr, code: 0 };
    } catch (error) {
      const stdout = error.stdout || '';
      const stderr = error.stderr || '';
      const code = typeof error.code === 'number' ? error.code : 1;
      if (options.allowFailure) {
        return { stdout, stderr, code, error };
      }
      const enhanced = this.enhanceError(error, {
        operation: 'executeCommand',
        command,
        code
      });
      enhanced.stdout = stdout;
      enhanced.stderr = stderr;
      enhanced.exitCode = code;
      throw enhanced;
    }
  }

  parseJSON(text, context = {}, options = {}) {
    if (text === undefined || text === null || text === '') {
      throw this.enhanceError(new Error('Empty JSON output'), {
        operation: 'parseJSON',
        ...context
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const cleaned = String(text)
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/^[^{[]+/, '')
        .replace(/[^}\]]+$/, '');
      try {
        parsed = JSON.parse(cleaned);
      } catch (cleanError) {
        const lines = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
        const jsonLine = lines.find((line) => line.startsWith('{') || line.startsWith('['));
        if (jsonLine) {
          try {
            parsed = JSON.parse(jsonLine);
          } catch (lineError) {
            parsed = null;
          }
        }
      }
    }

    if (!parsed) {
      throw this.enhanceError(new Error('Failed to parse JSON output'), {
        operation: 'parseJSON',
        snippet: String(text).slice(0, 500),
        ...context
      });
    }

    if (!options.allowStatus && typeof parsed.status === 'number' && parsed.status !== 0) {
      const message = parsed.message || parsed.result?.message || 'Command failed';
      throw this.enhanceError(new Error(message), {
        operation: 'parseJSON',
        status: parsed.status,
        ...context
      });
    }

    return parsed;
  }

  enhanceError(error, context = {}) {
    const message = error && error.message ? error.message : String(error);
    const enhancedError = new Error(message);
    enhancedError.originalError = error;
    enhancedError.context = context;
    if (error && error.stack) {
      enhancedError.stack = error.stack;
    }
    return enhancedError;
  }
}

module.exports = EnhancedMCPTool;
