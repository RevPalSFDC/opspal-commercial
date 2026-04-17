#!/usr/bin/env node
/**
 * transcript-reflection-extractor
 *
 * Parses a Claude Code transcript JSONL for signals that help /reflect
 * produce richer post-compaction reflection reports. Three categories:
 *
 *   extractErrors(transcript)           - tool failures, timeouts, non-zero
 *                                          exit codes, HTTP 4xx/5xx signals
 *   extractUserCorrections(transcript)  - user messages that correct or
 *                                          redirect assistant work
 *   extractFrictionPoints(transcript)   - retry loops, "still not working",
 *                                          "why did it" patterns
 *
 * Expected input: newline-delimited JSON transcript lines, each with at
 * least `type` and either `message.content` (assistant/user) or `content`
 * (tool_result). Falls back to plain-text scanning if JSON parse fails.
 *
 * CLI usage:
 *   node transcript-reflection-extractor.js current
 *   node transcript-reflection-extractor.js pre-compact
 *   node transcript-reflection-extractor.js --transcript /path/to/file.jsonl
 *   node transcript-reflection-extractor.js --transcript - < stdin.jsonl
 *
 * Output: JSON with { errors: [...], userCorrections: [...], frictionPoints: [...] }
 * Each entry has { lineNumber, snippet, match, context } where context is
 * ~3 surrounding lines.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Pattern library
// ---------------------------------------------------------------------------

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bExit code\s+[1-9]\d*/i,
  /\btimed? ?out\b/i,
  /\btimeout\b/i,
  /\bHTTP\s+(4\d\d|5\d\d)\b/i,
  /\b(429|500|502|503|504)\b/,
  /\bPermission denied\b/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
  /\bstack\s*trace\b/i,
  /\bTraceback\b/
];

const USER_CORRECTION_PATTERNS = [
  /\bno,?\s+(that'?s|it'?s|this\s+is)\s+not\b/i,
  /\bactually,?\s+i\s+meant\b/i,
  /\bwrong\s+file\b/i,
  /\bthat'?s\s+not\s+what\b/i,
  /\bstop\s+(doing|making|trying)\b/i,
  /\bdon'?t\s+(do|use|make|try)\b/i,
  /\bthat'?s\s+wrong\b/i,
  /\bi\s+said\b/i,
  /\bnot\s+that\s+one\b/i,
  /\bundo\s+(that|what)\b/i,
  /\brevert\b/i
];

const FRICTION_PATTERNS = [
  /\btry\s+again\b/i,
  /\bstill\s+(not|doesn'?t)\s+work/i,
  /\bwhy\s+(did|does|is)\b/i,
  /\bwhat\s+happened\b/i,
  /\bthis\s+isn'?t\s+working\b/i,
  /\bcan'?t\s+you\s+just\b/i,
  /\bplease\s+just\b/i,
  /\brerun\b/i,
  /\bretry\b/i,
  /\bone\s+more\s+time\b/i
];

// ---------------------------------------------------------------------------
// Transcript normalization
// ---------------------------------------------------------------------------

/**
 * Turn a transcript JSONL buffer into an array of { lineNumber, role, text }
 * entries. Handles two shapes:
 *   - Claude Code structured: { type: 'user'|'assistant'|'tool_result', message: { content: ... } }
 *   - Plain text: each line treated as role='unknown', text=line
 */
function normalizeTranscript(buffer) {
  const out = [];
  const lines = buffer.split('\n');
  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    const lineNumber = idx + 1;
    try {
      const obj = JSON.parse(raw);
      const role = obj.type || obj.role || 'unknown';
      const text = extractText(obj);
      if (text) out.push({ lineNumber, role, text });
    } catch (_) {
      // Not JSON — treat as free text line
      out.push({ lineNumber, role: 'unknown', text: raw });
    }
  });
  return out;
}

function extractText(obj) {
  // Structured content may be:
  //   obj.message.content (string | array of blocks with .text / .content)
  //   obj.content (string | array)
  //   obj.text
  const candidates = [
    obj?.message?.content,
    obj?.content,
    obj?.text,
    obj?.message?.text
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length) return c;
    if (Array.isArray(c)) {
      return c.map(block => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          return block.text || block.content || JSON.stringify(block);
        }
        return '';
      }).filter(Boolean).join('\n');
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Given normalized entries and a pattern list, returns matches with
 * context (up to `contextBefore` + `contextAfter` surrounding entries).
 */
function matchEntries(entries, patterns, options = {}) {
  const contextBefore = options.contextBefore ?? 1;
  const contextAfter = options.contextAfter ?? 2;
  const roleFilter = options.roleFilter || null;
  const maxMatches = options.maxMatches ?? 100;

  const matches = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (roleFilter && entry.role !== roleFilter) continue;

    let hitPattern = null;
    for (const pattern of patterns) {
      if (pattern.test(entry.text)) {
        hitPattern = pattern;
        break;
      }
    }
    if (!hitPattern) continue;

    const contextStart = Math.max(0, i - contextBefore);
    const contextEnd = Math.min(entries.length - 1, i + contextAfter);
    const contextSlice = entries.slice(contextStart, contextEnd + 1).map(e => ({
      lineNumber: e.lineNumber,
      role: e.role,
      snippet: truncate(e.text, 200)
    }));

    matches.push({
      lineNumber: entry.lineNumber,
      role: entry.role,
      match: hitPattern.toString(),
      snippet: truncate(entry.text, 300),
      context: contextSlice
    });
    if (matches.length >= maxMatches) break;
  }
  return matches;
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 3) + '...';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function extractErrors(transcriptBuffer, options = {}) {
  const entries = normalizeTranscript(transcriptBuffer);
  return matchEntries(entries, ERROR_PATTERNS, {
    // Errors can come from assistant text, tool_result, or plain-text logs.
    ...options,
    roleFilter: null
  });
}

function extractUserCorrections(transcriptBuffer, options = {}) {
  const entries = normalizeTranscript(transcriptBuffer);
  return matchEntries(entries, USER_CORRECTION_PATTERNS, {
    ...options,
    roleFilter: 'user'
  });
}

function extractFrictionPoints(transcriptBuffer, options = {}) {
  const entries = normalizeTranscript(transcriptBuffer);
  return matchEntries(entries, FRICTION_PATTERNS, {
    ...options,
    roleFilter: 'user'
  });
}

function extractAll(transcriptBuffer, options = {}) {
  return {
    errors: extractErrors(transcriptBuffer, options),
    userCorrections: extractUserCorrections(transcriptBuffer, options),
    frictionPoints: extractFrictionPoints(transcriptBuffer, options),
    summary: null // populated after caller knows counts
  };
}

// ---------------------------------------------------------------------------
// Transcript path resolution
// ---------------------------------------------------------------------------

function defaultTranscriptPath() {
  return path.join(os.homedir(), '.claude', 'transcript.jsonl');
}

function readTranscript(sourceArg) {
  // sourceArg: 'current' | 'pre-compact' | absolute path | '-' (stdin)
  if (sourceArg === '-' || sourceArg === '--stdin') {
    return fs.readFileSync(0, 'utf8');
  }
  let targetPath;
  if (!sourceArg || sourceArg === 'current') {
    targetPath = defaultTranscriptPath();
  } else if (sourceArg === 'pre-compact') {
    // Prefer the most recent backup written by pre-compact.sh.
    const backupDir = path.join(os.homedir(), '.claude', 'transcript-backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (files.length) {
        targetPath = path.join(backupDir, files[0].f);
      }
    }
    if (!targetPath) targetPath = defaultTranscriptPath();
  } else {
    targetPath = sourceArg;
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Transcript not found: ${targetPath}`);
  }
  return fs.readFileSync(targetPath, 'utf8');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { source: 'current', maxMatches: 50, format: 'json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--transcript') {
      args.source = argv[++i];
    } else if (a === '--max') {
      args.maxMatches = parseInt(argv[++i], 10) || 50;
    } else if (a === '--format') {
      args.format = argv[++i];
    } else if (a === 'current' || a === 'pre-compact') {
      args.source = a;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`transcript-reflection-extractor

Usage:
  transcript-reflection-extractor.js [current|pre-compact|--transcript <path>] [options]

Options:
  --transcript <path>   Path to transcript JSONL (or '-' for stdin)
  --max <n>             Max matches per category (default 50)
  --format <json|text>  Output format (default json)
  --help                Show this help

Examples:
  node transcript-reflection-extractor.js current
  node transcript-reflection-extractor.js pre-compact
  node transcript-reflection-extractor.js --transcript /tmp/session.jsonl
  cat transcript.jsonl | node transcript-reflection-extractor.js --transcript -
`);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  try {
    const buf = readTranscript(args.source);
    const result = extractAll(buf, { maxMatches: args.maxMatches });
    result.summary = {
      errors: result.errors.length,
      userCorrections: result.userCorrections.length,
      frictionPoints: result.frictionPoints.length,
      totalSignals: result.errors.length + result.userCorrections.length + result.frictionPoints.length
    };
    if (args.format === 'text') {
      console.log(`Errors: ${result.summary.errors}`);
      console.log(`User corrections: ${result.summary.userCorrections}`);
      console.log(`Friction points: ${result.summary.frictionPoints}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`transcript-reflection-extractor: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  extractErrors,
  extractUserCorrections,
  extractFrictionPoints,
  extractAll,
  normalizeTranscript,
  readTranscript,
  ERROR_PATTERNS,
  USER_CORRECTION_PATTERNS,
  FRICTION_PATTERNS
};
