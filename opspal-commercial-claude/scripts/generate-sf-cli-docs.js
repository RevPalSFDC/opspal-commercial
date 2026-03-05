/**
 * Generate Salesforce CLI Documentation from CLI Help
 *
 * Uses the actual `sf` CLI to generate comprehensive documentation
 * by querying help for each command and subcommand.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

// Command groups to document
const COMMAND_GROUPS = [
    'agent', 'alias', 'analytics', 'apex', 'api', 'cmdt',
    'code-analyzer', 'community', 'config', 'data', 'deploy',
    'dev', 'doctor', 'env', 'flow', 'force', 'generate',
    'info', 'lightning', 'logic', 'org', 'package', 'package1',
    'plugins', 'project', 'retrieve', 'run', 'schema', 'sobject',
    'static-resource', 'version', 'visualforce', 'whoami'
];

async function main() {
    console.log('Generating Salesforce CLI Documentation from CLI Help\n');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const content = [];

    // Get SF CLI version
    try {
        const version = execCmd('sf --version');
        console.log(`SF CLI Version: ${version.trim()}\n`);
        content.push({
            title: 'Version Information',
            content: '```\n' + version + '```'
        });
    } catch (e) {
        console.log('Could not get version\n');
    }

    // Get main sf help
    console.log('Getting main sf help...');
    try {
        const mainHelp = execCmd('sf --help');
        content.push({
            title: 'sf',
            content: '```\n' + mainHelp + '\n```'
        });
    } catch (e) {
        console.log('  Error: ' + e.message);
    }

    // Get help for each command group
    for (const group of COMMAND_GROUPS) {
        console.log(`Getting help for: ${group}`);

        try {
            const groupHelp = execCmd(`sf ${group} --help`);
            if (groupHelp && !groupHelp.includes('Command not found')) {
                content.push({
                    title: `sf ${group}`,
                    content: '```\n' + groupHelp + '\n```'
                });

                // Get subcommands
                const subcommands = extractSubcommands(groupHelp, group);
                for (const subcmd of subcommands) {
                    console.log(`  Getting help for: ${group} ${subcmd}`);
                    try {
                        const subcmdHelp = execCmd(`sf ${group} ${subcmd} --help`);
                        if (subcmdHelp && !subcmdHelp.includes('Command not found')) {
                            content.push({
                                title: `sf ${group} ${subcmd}`,
                                content: '```\n' + subcmdHelp + '\n```'
                            });
                        }
                    } catch (e) {
                        // Subcommand may not exist
                    }
                }
            }
        } catch (e) {
            console.log(`  Skipped: ${e.message.substring(0, 50)}`);
        }
    }

    console.log(`\nCollected documentation for ${content.length} commands`);

    // Compile document
    const doc = compileDocument(content);
    fs.writeFileSync(OUTPUT_FILE, doc);

    console.log(`\nSaved to: ${OUTPUT_FILE}`);
    console.log(`File size: ${Math.round(fs.statSync(OUTPUT_FILE).size / 1024)} KB`);
}

function execCmd(cmd) {
    try {
        return execSync(cmd, {
            encoding: 'utf8',
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024
        });
    } catch (e) {
        if (e.stdout) return e.stdout;
        throw e;
    }
}

function extractSubcommands(helpText, group) {
    const subcommands = [];

    // Look for COMMANDS section
    const lines = helpText.split('\n');
    let inCommandSection = false;

    for (const line of lines) {
        if (line.match(/^COMMANDS?$/i) || line.includes('COMMANDS')) {
            inCommandSection = true;
            continue;
        }

        if (inCommandSection) {
            // End of commands section
            if (line.match(/^[A-Z]+$/) && !line.includes('COMMANDS')) {
                break;
            }

            // Extract command name (usually first word after indent)
            const match = line.match(/^\s+(\w[\w-]*)/);
            if (match && !match[1].startsWith('-')) {
                // Skip group name itself
                if (match[1] !== group) {
                    subcommands.push(match[1]);
                }
            }
        }
    }

    // Also try to extract from "sf {group} COMMAND" patterns
    const cmdPattern = new RegExp(`sf\\s+${group}\\s+(\\w[\\w-]+)`, 'g');
    let cmdMatch;
    while ((cmdMatch = cmdPattern.exec(helpText)) !== null) {
        if (!subcommands.includes(cmdMatch[1])) {
            subcommands.push(cmdMatch[1]);
        }
    }

    return [...new Set(subcommands)]; // Deduplicate
}

function compileDocument(allContent) {
    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> **Generated:** ${new Date().toISOString()}`,
        `> **Source:** sf CLI --help commands`,
        `> **Total Commands:** ${allContent.length}`,
        '',
        '---',
        '',
        '## Table of Contents',
        ''
    ];

    allContent.forEach((item, idx) => {
        const anchor = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        lines.push(`${idx + 1}. [${item.title}](#${anchor})`);
    });

    lines.push('', '---', '');

    allContent.forEach((item, idx) => {
        lines.push(`## ${item.title}`);
        lines.push('');
        lines.push(item.content);
        lines.push('');
        if (idx < allContent.length - 1) {
            lines.push('---', '');
        }
    });

    return lines.join('\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
