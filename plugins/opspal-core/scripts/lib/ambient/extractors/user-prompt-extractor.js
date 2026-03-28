'use strict';

const {
  createDedupKey,
  nowIso,
  readStdin,
  sanitizeString
} = require('../utils');

const SIGNALS = [
  {
    signal: 'user_correction',
    category: 'user_preference',
    priority: 'high',
    note: 'User corrected prior direction or scope.',
    regex: /\b(no,\s*actually|that(?:'s| is) wrong|not what i meant|to clarify|i meant)\b/i
  },
  {
    signal: 'user_frustration',
    category: 'issue',
    priority: 'high',
    note: 'User expressed frustration with current flow.',
    regex: /\b(frustrating|this is useless|still wrong|not helpful|you keep|why can['’]t you)\b/i
  },
  {
    signal: 'capability_request',
    category: 'skill_candidate',
    priority: 'normal',
    note: 'User requested missing capability or automation.',
    regex: /\b(i wish|can['’]t you|you should be able to|it would help if|would be nice if)\b/i
  },
  {
    signal: 'successful_reusable_pattern',
    category: 'lesson',
    priority: 'normal',
    note: 'User explicitly flagged a successful reusable pattern.',
    regex: /\b(this worked well|do it the same way|remember this pattern|save this approach)\b/i
  }
];

function extractCandidates(payload) {
  const message = payload?.user_message || payload?.message || payload?.prompt || '';
  if (!message) {
    return [];
  }

  return SIGNALS
    .map(signal => {
      const match = message.match(signal.regex);
      if (!match) {
        return null;
      }

      return {
        source: 'user_prompt',
        category: signal.category,
        priority: signal.priority,
        captured_at: nowIso(),
        confidence: signal.signal === 'successful_reusable_pattern' ? 0.85 : null,
        raw: {
          signal: signal.signal,
          matched_phrase: sanitizeString(match[0], 80),
          note: signal.note
        },
        dedup_key: createDedupKey(['user_prompt', signal.signal, match[0].toLowerCase()])
      };
    })
    .filter(Boolean);
}

if (require.main === module) {
  const payload = JSON.parse(readStdin() || '{}');
  process.stdout.write(`${JSON.stringify(extractCandidates(payload))}\n`);
}

module.exports = {
  extractCandidates
};
