'use strict';

const { normalizeHookEvent } = require('../scripts/lib/hook-event-normalizer');

describe('hook event normalizer', () => {
  test('preserves channel metadata from legacy-style payloads', () => {
    const normalized = normalizeHookEvent(JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool: 'Bash',
      sessionKey: 'session-123',
      context: {
        channelId: 'C0AGVQFDB18'
      },
      input: {
        command: 'echo "hello"'
      }
    }));

    expect(normalized.sessionKey).toBe('session-123');
    expect(normalized.channelId).toBe('C0AGVQFDB18');
    expect(normalized.channel_id).toBe('C0AGVQFDB18');
    expect(normalized.context.channelId).toBe('C0AGVQFDB18');
    expect(normalized.context.sessionKey).toBe('session-123');
    expect(normalized.tool_input.command).toBe('echo "hello"');
  });
});
