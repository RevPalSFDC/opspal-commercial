'use strict';

const fs = require('fs');

function readStdin() {
  if (process.stdin.isTTY) {
    return '';
  }

  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_error) {
    return '';
  }
}

function parseJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function readEnvRawInput() {
  return {
    hook_event_name: process.env.CLAUDE_HOOK_EVENT_NAME || process.env.HOOK_EVENT_NAME || '',
    session_id: process.env.CLAUDE_SESSION_ID || '',
    session_key: process.env.CLAUDE_SESSION_ID || '',
    cwd: process.env.CLAUDE_CWD || process.cwd(),
    tool_name: process.env.CLAUDE_TOOL_NAME || process.env.HOOK_TOOL_NAME || process.env.TOOL_NAME || '',
    tool_input: process.env.CLAUDE_TOOL_INPUT || process.env.HOOK_TOOL_INPUT || process.env.TOOL_INPUT || '',
    tool_result: process.env.CLAUDE_TOOL_OUTPUT ||
      process.env.CLAUDE_TOOL_RESULT ||
      process.env.HOOK_TOOL_OUTPUT ||
      process.env.TOOL_OUTPUT ||
      '',
    tool_exit_code: process.env.CLAUDE_TOOL_EXIT_CODE ||
      process.env.HOOK_TOOL_EXIT_CODE ||
      process.env.TOOL_EXIT_CODE ||
      '',
    tool_input_path: process.env.CLAUDE_TOOL_INPUT_PATH ||
      process.env.HOOK_TOOL_INPUT_PATH ||
      process.env.TOOL_INPUT_PATH ||
      '',
    tool_use_id: process.env.CLAUDE_TOOL_USE_ID || process.env.HOOK_TOOL_USE_ID || '',
    permission_mode: process.env.CLAUDE_PERMISSION_MODE || '',
    transcript_path: process.env.CLAUDE_TRANSCRIPT_PATH || ''
  };
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function coerceToolInput(value, toolName, fallbackPath) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  const parsed = parseJson(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }

  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw && !fallbackPath) {
    return {};
  }

  if (toolName === 'Bash') {
    return { command: raw };
  }

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
    return fallbackPath ? { file_path: fallbackPath } : { file_path: raw };
  }

  if (fallbackPath) {
    return { file_path: fallbackPath };
  }

  return {};
}

function coerceToolResult(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return value;
  }

  const parsed = parseJson(value);
  return parsed === null ? String(value) : parsed;
}

function normalizeHookEvent(rawInput = null) {
  const envInput = readEnvRawInput();
  const stdinInput = rawInput === null ? parseJson(readStdin()) : parseJson(rawInput);
  const raw = normalizeObject(stdinInput || {});

  const toolName = String(
    raw.tool_name ||
    raw.tool ||
    raw.toolName ||
    raw.name ||
    envInput.tool_name ||
    ''
  ).trim();

  const directToolInput = raw.tool_input !== undefined ? raw.tool_input
    : raw.input !== undefined ? raw.input
      : raw.parameters !== undefined ? raw.parameters
        : raw.args !== undefined ? raw.args
          : null;

  let synthesizedToolInput = directToolInput;
  if (synthesizedToolInput === null) {
    const directAgentInput = {};
    const subagentType = raw.subagent_type || raw.agent_type || raw.agentType || '';
    const prompt = raw.prompt || raw.description || raw.task || raw.message || '';

    if (subagentType) {
      directAgentInput.subagent_type = subagentType;
    }
    if (prompt) {
      directAgentInput.prompt = prompt;
    }
    if (Object.keys(directAgentInput).length > 0) {
      synthesizedToolInput = directAgentInput;
    }
  }

  const toolInput = coerceToolInput(
    synthesizedToolInput !== null ? synthesizedToolInput : envInput.tool_input,
    toolName,
    raw.tool_input_path || raw.input_path || envInput.tool_input_path
  );

  const subagentType = String(
    toolInput.subagent_type ||
    raw.subagent_type ||
    raw.agent_type ||
    raw.agentType ||
    ''
  ).trim();

  const hookEventName = String(
    raw.hook_event_name ||
    raw.hookEventName ||
    envInput.hook_event_name ||
    ''
  ).trim();

  const sessionId = String(
    raw.session_id ||
    raw.sessionId ||
    raw.session_key ||
    raw.sessionKey ||
    raw.context?.session_id ||
    raw.context?.sessionId ||
    raw.context?.session_key ||
    raw.context?.sessionKey ||
    envInput.session_id ||
    ''
  ).trim();

  const toolResult = coerceToolResult(
    raw.tool_result !== undefined ? raw.tool_result
      : raw.result !== undefined ? raw.result
        : raw.output !== undefined ? raw.output
          : raw.tool_output !== undefined ? raw.tool_output
            : envInput.tool_result
  );

  const normalized = {
    hook_event_name: hookEventName,
    hookEventName: hookEventName,
    session_id: sessionId,
    sessionId: sessionId,
    session_key: sessionId,
    sessionKey: sessionId,
    cwd: raw.cwd || envInput.cwd,
    tool_name: toolName,
    tool: toolName,
    tool_input: toolInput,
    input: toolInput,
    tool_result: toolResult,
    result: toolResult,
    tool_exit_code: raw.tool_exit_code || raw.exit_code || raw.exitCode || envInput.tool_exit_code || '',
    tool_use_id: raw.tool_use_id || raw.toolUseId || envInput.tool_use_id || '',
    transcript_path: raw.transcript_path || raw.transcriptPath || envInput.transcript_path || '',
    permission_mode: raw.permission_mode || raw.permissionMode || envInput.permission_mode || '',
    agent_type: String(raw.agent_type || raw.agentType || subagentType).trim(),
    subagent_type: subagentType,
    legacy_task_event: toolName === 'Task'
  };

  return normalized;
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(normalizeHookEvent())}\n`);
}

module.exports = {
  normalizeHookEvent
};
