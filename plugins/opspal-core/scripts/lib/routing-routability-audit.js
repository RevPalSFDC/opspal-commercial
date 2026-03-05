#!/usr/bin/env node

/**
 * Routing Routability Audit
 *
 * Validates that every indexed agent is actually discoverable by TaskRouter
 * using a synthetic prompt derived from that agent's trigger keywords and
 * description.
 *
 * Default pass criteria:
 * - no-match agents == 0
 * - top-3 coverage >= 100%
 * - top-1 coverage >= 95%
 *
 * Usage:
 *   node routing-routability-audit.js
 *   node routing-routability-audit.js --json
 *   node routing-routability-audit.js --max-no-match 0 --min-top3 100 --min-top1 95
 */

const { TaskRouter } = require('./task-router');

function toNumber(value, fallback) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
    const args = {
        json: false,
        maxNoMatch: 0,
        minTop3: 100,
        minTop1: 95,
        limitFailures: 30
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--json') {
            args.json = true;
            continue;
        }
        if (arg === '--max-no-match') {
            args.maxNoMatch = toNumber(argv[i + 1], args.maxNoMatch);
            i++;
            continue;
        }
        if (arg === '--min-top3') {
            args.minTop3 = toNumber(argv[i + 1], args.minTop3);
            i++;
            continue;
        }
        if (arg === '--min-top1') {
            args.minTop1 = toNumber(argv[i + 1], args.minTop1);
            i++;
            continue;
        }
        if (arg === '--limit-failures') {
            args.limitFailures = Math.max(1, Math.floor(toNumber(argv[i + 1], args.limitFailures)));
            i++;
            continue;
        }
    }

    return args;
}

function tokenCount(keyword) {
    return String(keyword || '')
        .replace(/[.*+?^${}()|[\]\\]/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .length;
}

function normalizeKeyword(keyword) {
    return String(keyword || '').trim().toLowerCase();
}

function buildPrompt(agentName, metadata) {
    const keywords = Array.isArray(metadata.triggerKeywords) ? metadata.triggerKeywords : [];
    const sortedKeywords = [...keywords]
        .map(normalizeKeyword)
        .filter(Boolean)
        .sort((a, b) => tokenCount(b) - tokenCount(a) || b.length - a.length);

    const highSignal = sortedKeywords.slice(0, 5);
    const description = typeof metadata.description === 'string'
        ? metadata.description.split(/[.!?\n]/)[0].trim()
        : '';

    const shortName = agentName.includes(':') ? agentName.split(':').pop() : agentName;
    const namePhrase = shortName.replace(/[-_]+/g, ' ').trim();

    const parts = [];
    if (highSignal.length > 0) {
        parts.push(highSignal.join(' '));
    }
    if (description) {
        parts.push(description);
    }
    if (namePhrase) {
        parts.push(namePhrase);
    }
    parts.push('investigate and propose an execution plan');

    return parts.join('. ');
}

function toPct(value, total) {
    if (!total) return 0;
    return Number(((value / total) * 100).toFixed(1));
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const router = new TaskRouter();
    const agentMap = router.agentIndex?.agentsByFull || router.agentIndex?.agents || {};
    const entries = Object.entries(agentMap);

    const failures = [];
    let top1 = 0;
    let top3 = 0;
    let noMatch = 0;
    let lowConfidenceMatches = 0;

    for (const [agentName, metadata] of entries) {
        const prompt = buildPrompt(agentName, metadata || {});
        const recommendation = router.analyze(prompt);
        const matches = router.findMatchingAgents(prompt.toLowerCase());
        const topCandidates = matches.slice(0, 3).map(match => match.agent);
        const targetMatch = matches.find(match => match.agent === agentName);

        if (matches.length === 0) {
            noMatch++;
            failures.push({
                type: 'no_match',
                agent: agentName,
                prompt
            });
            continue;
        }

        if (targetMatch && targetMatch.confidence < 0.5) {
            lowConfidenceMatches++;
        }

        if (recommendation.agent === agentName) {
            top1++;
            top3++;
            continue;
        }

        if (topCandidates.includes(agentName)) {
            top3++;
            continue;
        }

        failures.push({
            type: targetMatch ? 'outside_top3' : 'missing_from_matches',
            agent: agentName,
            prompt,
            recommended: recommendation.agent,
            topCandidates,
            targetConfidence: targetMatch ? Number(targetMatch.confidence.toFixed(3)) : null
        });
    }

    const total = entries.length;
    const summary = {
        totalAgents: total,
        top1,
        top3,
        noMatch,
        lowConfidenceMatches,
        top1Coverage: toPct(top1, total),
        top3Coverage: toPct(top3, total)
    };

    const failedChecks = [];
    if (summary.noMatch > args.maxNoMatch) {
        failedChecks.push(`noMatch=${summary.noMatch} exceeds maxNoMatch=${args.maxNoMatch}`);
    }
    if (summary.top3Coverage < args.minTop3) {
        failedChecks.push(`top3Coverage=${summary.top3Coverage}% below minTop3=${args.minTop3}%`);
    }
    if (summary.top1Coverage < args.minTop1) {
        failedChecks.push(`top1Coverage=${summary.top1Coverage}% below minTop1=${args.minTop1}%`);
    }

    const report = {
        pass: failedChecks.length === 0,
        summary,
        failedChecks,
        warningChecks: [],
        failures: failures.slice(0, args.limitFailures)
    };

    if (args.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log('Routing Routability Audit');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Agents:             ${summary.totalAgents}`);
        console.log(`Top-1 coverage:     ${summary.top1Coverage}% (${summary.top1}/${summary.totalAgents})`);
        console.log(`Top-3 coverage:     ${summary.top3Coverage}% (${summary.top3}/${summary.totalAgents})`);
        console.log(`No-match agents:    ${summary.noMatch}`);
        console.log(`Low-conf matches:   ${summary.lowConfidenceMatches}`);

        if (failedChecks.length > 0) {
            console.log('\nFailures:');
            for (const failure of failedChecks) {
                console.log(`- ${failure}`);
            }
        }

        if (report.failures.length > 0) {
            console.log('\nSample failing agents:');
            for (const failure of report.failures) {
                const details = failure.recommended
                    ? ` recommended=${failure.recommended}`
                    : '';
                console.log(`- [${failure.type}] ${failure.agent}${details}`);
            }
        }
    }

    process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
    main();
}

module.exports = { buildPrompt, parseArgs };
