'use strict';

class AgentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }
}

function formatUserMessage(err) {
  const base = `Error [${err.code || 'UNKNOWN'}]: ${err.message}`;
  const parts = [base];
  if (err.details && Object.keys(err.details).length) {
    parts.push('Details:');
    for (const [k, v] of Object.entries(err.details)) {
      parts.push(`- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  }
  return parts.join('\n');
}

module.exports = { AgentError, formatUserMessage };

