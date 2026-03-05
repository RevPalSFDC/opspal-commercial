#!/usr/bin/env node

/**
 * Claude API Client
 *
 * Wrapper for Claude/Anthropic API interactions.
 * Used by proposal generation components for semantic analysis and enhancement.
 *
 * Features:
 * - JSON response parsing with validation
 * - Configurable model selection
 * - Error handling with retries
 * - Token usage tracking
 *
 * @example
 * const ClaudeAPIClient = require('./claude-api-client');
 * const client = new ClaudeAPIClient();
 *
 * // Simple completion
 * const response = await client.complete('Summarize this text: ...');
 *
 * // JSON response
 * const data = await client.completeJSON('Extract insights in JSON format...');
 */

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeAPIClient {
  /**
   * Initialize Claude API client
   *
   * @param {Object} options - Configuration options
   * @param {string} options.model - Model ID (default: claude-sonnet-4-20250514)
   * @param {number} options.maxTokens - Max response tokens (default: 4096)
   * @param {number} options.maxRetries - Max retry attempts (default: 3)
   * @param {boolean} options.verbose - Enable verbose logging (default: false)
   */
  constructor(options = {}) {
    this.client = new Anthropic();
    this.defaultModel = options.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    this.defaultMaxTokens = options.maxTokens || 4096;
    this.maxRetries = options.maxRetries || 3;
    this.verbose = options.verbose || false;

    // Token usage tracking
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.callCount = 0;
  }

  /**
   * Complete a prompt with Claude
   *
   * @param {string} prompt - The prompt to send
   * @param {Object} options - Override options
   * @param {string} options.model - Model to use
   * @param {number} options.maxTokens - Max response tokens
   * @param {string} options.system - System prompt
   * @param {number} options.temperature - Temperature (0-1)
   * @returns {Promise<string>} - The response text
   */
  async complete(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    const maxTokens = options.maxTokens || this.defaultMaxTokens;

    if (this.verbose) {
      console.log(`[Claude API] Calling ${model} with ${prompt.length} chars`);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const requestParams = {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        };

        // Add optional parameters
        if (options.system) {
          requestParams.system = options.system;
        }
        if (options.temperature !== undefined) {
          requestParams.temperature = options.temperature;
        }

        const response = await this.client.messages.create(requestParams);

        // Track usage
        this.callCount++;
        if (response.usage) {
          this.totalInputTokens += response.usage.input_tokens || 0;
          this.totalOutputTokens += response.usage.output_tokens || 0;
        }

        if (this.verbose) {
          console.log(`[Claude API] Response: ${response.content[0].text.length} chars`);
          if (response.usage) {
            console.log(`[Claude API] Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);
          }
        }

        return response.content[0].text;

      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (error.status === 401 || error.status === 403) {
          throw new Error(`Authentication failed: ${error.message}`);
        }

        if (error.status === 400) {
          throw new Error(`Invalid request: ${error.message}`);
        }

        // Retry on rate limits and server errors
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          if (this.verbose) {
            console.log(`[Claude API] Retry ${attempt}/${this.maxRetries} after ${delay}ms`);
          }
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Claude API failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Complete a prompt and parse JSON response
   *
   * @param {string} prompt - The prompt (will append JSON instruction)
   * @param {Object} options - Override options
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async completeJSON(prompt, options = {}) {
    // Append JSON instruction
    const jsonPrompt = `${prompt}

IMPORTANT: Respond ONLY with valid JSON. No markdown code blocks, no explanation text.`;

    const response = await this.complete(jsonPrompt, {
      ...options,
      temperature: options.temperature ?? 0.2 // Lower temperature for structured output
    });

    // Clean response - remove any markdown code blocks if present
    let cleanResponse = response.trim();

    // Remove ```json ... ``` or ``` ... ``` wrapper
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Fall through to error
        }
      }

      throw new Error(`Failed to parse JSON response: ${parseError.message}\nResponse: ${cleanResponse.substring(0, 200)}...`);
    }
  }

  /**
   * Complete with structured output schema
   *
   * @param {string} prompt - The prompt
   * @param {Object} schema - JSON schema for expected output
   * @param {Object} options - Override options
   * @returns {Promise<Object>} - Validated JSON response
   */
  async completeWithSchema(prompt, schema, options = {}) {
    const schemaPrompt = `${prompt}

Your response MUST conform to this JSON schema:
${JSON.stringify(schema, null, 2)}

Respond ONLY with valid JSON matching this schema.`;

    const result = await this.completeJSON(schemaPrompt, options);

    // Basic schema validation
    const validationErrors = this.validateSchema(result, schema);
    if (validationErrors.length > 0) {
      throw new Error(`Response does not match schema: ${validationErrors.join(', ')}`);
    }

    return result;
  }

  /**
   * Basic JSON schema validation
   *
   * @param {Object} data - Data to validate
   * @param {Object} schema - JSON schema
   * @returns {string[]} - Array of validation errors
   */
  validateSchema(data, schema) {
    const errors = [];

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const prop of schema.required) {
        if (!(prop in data)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    // Check property types
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in data) {
          const value = data[prop];
          const expectedType = propSchema.type;

          if (expectedType === 'array' && !Array.isArray(value)) {
            errors.push(`Property ${prop} should be array`);
          } else if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            errors.push(`Property ${prop} should be object`);
          } else if (expectedType === 'string' && typeof value !== 'string') {
            errors.push(`Property ${prop} should be string`);
          } else if (expectedType === 'number' && typeof value !== 'number') {
            errors.push(`Property ${prop} should be number`);
          } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
            errors.push(`Property ${prop} should be boolean`);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Get token usage statistics
   *
   * @returns {Object} - Usage statistics
   */
  getUsageStats() {
    return {
      calls: this.callCount,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      estimatedCost: this.estimateCost()
    };
  }

  /**
   * Estimate cost based on token usage
   * Claude Sonnet pricing: $3/M input, $15/M output (as of 2025)
   *
   * @returns {number} - Estimated cost in USD
   */
  estimateCost() {
    const inputCost = (this.totalInputTokens / 1000000) * 3;
    const outputCost = (this.totalOutputTokens / 1000000) * 15;
    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.callCount = 0;
  }

  /**
   * Sleep helper for retry backoff
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ClaudeAPIClient;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Claude API Client - Test utility

Usage:
  node claude-api-client.js --test              Test API connection
  node claude-api-client.js --prompt "text"     Send a prompt
  node claude-api-client.js --json "prompt"     Get JSON response

Options:
  --model <id>      Model to use (default: claude-sonnet-4-20250514)
  --verbose         Enable verbose output
  --help            Show this help
`);
    process.exit(0);
  }

  const client = new ClaudeAPIClient({
    verbose: args.includes('--verbose')
  });

  (async () => {
    try {
      if (args.includes('--test')) {
        console.log('Testing Claude API connection...');
        const response = await client.complete('Say "API connection successful" in exactly those words.');
        console.log(`Response: ${response}`);
        console.log('Usage:', client.getUsageStats());

      } else if (args.includes('--prompt')) {
        const idx = args.indexOf('--prompt');
        const prompt = args[idx + 1];
        if (!prompt) {
          console.error('Error: --prompt requires a value');
          process.exit(1);
        }
        const response = await client.complete(prompt);
        console.log(response);

      } else if (args.includes('--json')) {
        const idx = args.indexOf('--json');
        const prompt = args[idx + 1];
        if (!prompt) {
          console.error('Error: --json requires a value');
          process.exit(1);
        }
        const response = await client.completeJSON(prompt);
        console.log(JSON.stringify(response, null, 2));

      } else {
        console.log('Use --help for usage information');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}
