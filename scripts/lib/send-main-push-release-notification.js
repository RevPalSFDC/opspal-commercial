#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');

function parseArgs(argv) {
  const options = {
    eventPath: process.env.GITHUB_EVENT_PATH || '',
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--event' && argv[i + 1]) {
      options.eventPath = argv[i + 1];
      i += 1;
    } else if (arg === '--webhook' && argv[i + 1]) {
      options.webhookUrl = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  return options;
}

function normalizeSubject(message) {
  return (message || '').split('\n')[0].trim();
}

function stripConventionalPrefix(subject) {
  return subject.replace(/^[a-z]+!?(\([^)]*\))?:\s*/i, '').trim();
}

function classifyCommit(subject, body) {
  const fullText = `${subject}\n${body || ''}`;

  if (/^[a-z]+![:(]/i.test(subject) || /BREAKING CHANGE|BREAKING:/i.test(fullText)) {
    return 'breaking';
  }
  if (/^feat(\([^)]*\))?:/i.test(subject)) {
    return 'features';
  }
  if (/^fix(\([^)]*\))?:/i.test(subject)) {
    return 'fixes';
  }
  if (/^perf(\([^)]*\))?:/i.test(subject)) {
    return 'performance';
  }

  return 'other';
}

function extractBodyDetails(body) {
  if (!body) return [];

  const details = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^co-authored-by:/i.test(trimmed)) continue;
    if (/^note:/i.test(trimmed)) continue;

    if (/^[-*]\s+/.test(trimmed)) {
      details.push(trimmed.replace(/^[-*]\s+/, '').trim());
    } else if (/^[0-9]+\.\s+/.test(trimmed)) {
      details.push(trimmed.replace(/^[0-9]+\.\s+/, '').trim());
    }

    if (details.length >= 3) {
      break;
    }
  }

  return details;
}

function formatCommitEntry(commit) {
  const message = commit.message || '';
  const subject = normalizeSubject(message);
  const body = message.split('\n').slice(1).join('\n').trim();
  const readableSubject = stripConventionalPrefix(subject) || subject;
  const shortHash = (commit.id || '').slice(0, 7) || 'unknown';
  const commitLink = commit.url ? `<${commit.url}|\`${shortHash}\`>` : `\`${shortHash}\``;

  let entry = `• ${readableSubject} (${commitLink})`;
  const details = extractBodyDetails(body);
  if (details.length > 0) {
    entry += `\n${details.map((detail) => `  - ${detail}`).join('\n')}`;
  }

  return {
    section: classifyCommit(subject, body),
    entry
  };
}

function extractVersions(commits) {
  const versionSet = new Set();
  const versionRegex = /\bv\d+\.\d+\.\d+\b/gi;

  for (const commit of commits) {
    const message = commit.message || '';
    let match = versionRegex.exec(message);
    while (match) {
      versionSet.add(match[0].toLowerCase());
      match = versionRegex.exec(message);
    }
    versionRegex.lastIndex = 0;
  }

  return Array.from(versionSet).sort((a, b) => {
    const aParts = a.slice(1).split('.').map((n) => Number.parseInt(n, 10) || 0);
    const bParts = b.slice(1).split('.').map((n) => Number.parseInt(n, 10) || 0);
    if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
    if (aParts[1] !== bParts[1]) return aParts[1] - bParts[1];
    return aParts[2] - bParts[2];
  });
}

function truncateSlackText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  const suffix = '\n\n_... truncated. See compare link for full details._';
  const allowed = Math.max(0, maxLength - suffix.length);
  return `${text.slice(0, allowed)}${suffix}`;
}

function buildReleaseSections(commits) {
  const buckets = {
    breaking: [],
    features: [],
    fixes: [],
    performance: [],
    other: []
  };

  for (const commit of commits) {
    const formatted = formatCommitEntry(commit);
    buckets[formatted.section].push(formatted.entry);
  }

  const lines = [];

  if (buckets.breaking.length > 0) {
    lines.push('*Upgrade Steps*');
    lines.push('• Review the breaking changes listed below');
    lines.push('• Pull latest `main` and run plugin dependency checks');
    lines.push('• Re-run `npm run docs:ci` before deployment');
    lines.push('');
    lines.push('*Breaking Changes*');
    lines.push(...buckets.breaking);
    lines.push('');
  }

  if (buckets.features.length > 0) {
    lines.push('*New Features*');
    lines.push(...buckets.features);
    lines.push('');
  }

  if (buckets.fixes.length > 0) {
    lines.push('*Bug Fixes*');
    lines.push(...buckets.fixes);
    lines.push('');
  }

  if (buckets.performance.length > 0) {
    lines.push('*Performance Improvements*');
    lines.push(...buckets.performance);
    lines.push('');
  }

  if (buckets.other.length > 0) {
    lines.push('*Other Changes*');
    lines.push(...buckets.other);
    lines.push('');
  }

  if (lines.length === 0) {
    return '• No commit details available.';
  }

  return truncateSlackText(lines.join('\n').trim(), 2800);
}

function buildSlackPayload(event) {
  const commits = Array.isArray(event.commits) ? event.commits : [];
  const repository = event.repository || {};
  const repoName = repository.name || 'repository';
  const repoPath = repository.full_name || process.env.GITHUB_REPOSITORY || '';
  const branch = (event.ref || 'refs/heads/main').replace('refs/heads/', '');
  const pushDate = new Date().toISOString().slice(0, 10);
  const pusher = (event.pusher && event.pusher.name) || 'unknown';
  const afterSha = event.after || '';
  const shortAfter = afterSha ? afterSha.slice(0, 7) : 'unknown';
  const compareUrl = event.compare || '';
  const commitUrl = repoPath && afterSha ? `https://github.com/${repoPath}/commit/${afterSha}` : '';

  const versions = extractVersions(commits);
  const versionLabel = versions.length > 0 ? versions.join(', ') : shortAfter;
  const versionHeader = compareUrl ? `<${compareUrl}|${versionLabel}>` : versionLabel;
  const releaseSections = buildReleaseSections(commits);

  const repoLink = repoPath ? `https://github.com/${repoPath}` : '';
  const commitText = commitUrl ? `<${commitUrl}|\`${shortAfter}\`>` : `\`${shortAfter}\``;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Release Notes',
        emoji: true
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${repoName}* | \`${branch}\` | ${pushDate}`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${versionHeader}* - ${commits.length} commit(s) by ${pusher}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: releaseSections
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: repoLink
            ? `Latest commit: ${commitText} | <${repoLink}|Repository>`
            : `Latest commit: ${commitText}`
        }
      ]
    }
  ];

  return {
    metadata: {
      repoPath,
      branch,
      commits: commits.length,
      versions: versionLabel,
      shortAfter
    },
    payload: {
      text: `Release notes for ${repoName} ${versionLabel}`,
      blocks
    }
  };
}

function sendWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(webhookUrl);

    const request = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (response) => {
        let responseBody = '';
        response.on('data', (chunk) => {
          responseBody += chunk.toString();
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(responseBody);
            return;
          }
          reject(new Error(`Slack webhook failed (${response.statusCode}): ${responseBody}`));
        });
      }
    );

    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

function loadEvent(eventPath) {
  if (!eventPath) {
    throw new Error('Missing event path. Set GITHUB_EVENT_PATH or pass --event <path>.');
  }
  if (!fs.existsSync(eventPath)) {
    throw new Error(`Event payload not found: ${eventPath}`);
  }
  return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const event = loadEvent(options.eventPath);
  const built = buildSlackPayload(event);

  if (options.verbose || options.dryRun) {
    console.log(JSON.stringify(built.metadata, null, 2));
    console.log(JSON.stringify(built.payload, null, 2));
  } else {
    console.log(
      `Prepared release notes for ${built.metadata.repoPath || 'repo'} ` +
      `(${built.metadata.commits} commits, ${built.metadata.versions})`
    );
  }

  if (options.dryRun) {
    return;
  }

  if (!options.webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is required to send release notes.');
  }

  await sendWebhook(options.webhookUrl, built.payload);
  console.log(
    `Slack release notes sent for ${built.metadata.repoPath || 'repo'} ` +
    `(${built.metadata.shortAfter})`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

