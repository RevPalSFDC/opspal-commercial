/**
 * Generate Comprehensive Salesforce CLI Documentation
 *
 * Uses `sf commands --json` to get all command details and generates
 * comprehensive markdown documentation.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

async function main() {
    console.log('Generating Comprehensive Salesforce CLI Documentation\n');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Get CLI version
    let version = '';
    try {
        version = execSync('sf --version', { encoding: 'utf8' }).trim();
        console.log(`CLI Version: ${version}\n`);
    } catch (e) {
        console.log('Could not get CLI version');
    }

    // Get all commands as JSON
    console.log('Fetching all commands...');
    let commands = [];
    try {
        const output = execSync('sf commands --json', {
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
            timeout: 60000
        });
        commands = JSON.parse(output);
        console.log(`Found ${commands.length} commands\n`);
    } catch (e) {
        console.error('Error fetching commands:', e.message);
        process.exit(1);
    }

    // Save raw commands for reference
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'sf-commands-raw.json'),
        JSON.stringify(commands, null, 2)
    );

    // Group commands by topic
    const grouped = {};
    commands.forEach(cmd => {
        const id = cmd.id || '';
        const parts = id.split(':');
        const topic = parts[0] || 'other';

        if (!grouped[topic]) {
            grouped[topic] = [];
        }
        grouped[topic].push(cmd);
    });

    // Sort topics and commands
    const sortedTopics = Object.keys(grouped).sort();
    sortedTopics.forEach(topic => {
        grouped[topic].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    });

    console.log(`Topics: ${sortedTopics.join(', ')}\n`);

    // Generate documentation
    console.log('Generating documentation...');
    const doc = generateDocument(version, grouped, sortedTopics, commands.length);

    fs.writeFileSync(OUTPUT_FILE, doc);

    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`\nSaved to: ${OUTPUT_FILE}`);
    console.log(`File size: ${Math.round(stats.size / 1024)} KB`);
    console.log(`Total commands: ${commands.length}`);
}

function generateDocument(version, grouped, sortedTopics, totalCommands) {
    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> **Generated:** ${new Date().toISOString()}`,
        `> **CLI Version:** ${version}`,
        `> **Total Commands:** ${totalCommands}`,
        `> **Command Topics:** ${sortedTopics.length}`,
        '',
        '---',
        '',
        '## Table of Contents',
        ''
    ];

    // Generate TOC
    sortedTopics.forEach(topic => {
        const count = grouped[topic].length;
        lines.push(`- [${topic}](#${topic}) (${count} commands)`);
    });

    lines.push('', '---', '');

    // Generate content for each topic
    sortedTopics.forEach(topic => {
        lines.push(`## ${topic}`);
        lines.push('');
        lines.push(`*${grouped[topic].length} commands in this topic*`);
        lines.push('');

        grouped[topic].forEach(cmd => {
            const cmdDoc = formatCommand(cmd);
            lines.push(cmdDoc);
            lines.push('');
        });

        lines.push('---', '');
    });

    return lines.join('\n');
}

function formatCommand(cmd) {
    const lines = [];
    const id = cmd.id || 'unknown';

    // Command header
    lines.push(`### ${id.replace(/:/g, ' ')}`);
    lines.push('');

    // Summary
    if (cmd.summary) {
        lines.push(`**${cmd.summary}**`);
        lines.push('');
    }

    // Description
    if (cmd.description) {
        lines.push(cmd.description);
        lines.push('');
    }

    // Usage
    lines.push('#### Usage');
    lines.push('');
    lines.push('```bash');
    lines.push(`sf ${id.replace(/:/g, ' ')} [FLAGS]`);
    lines.push('```');
    lines.push('');

    // Flags
    if (cmd.flags && Object.keys(cmd.flags).length > 0) {
        lines.push('#### Flags');
        lines.push('');
        lines.push('| Flag | Type | Description |');
        lines.push('|------|------|-------------|');

        Object.entries(cmd.flags).forEach(([name, flag]) => {
            const char = flag.char ? `-${flag.char}, ` : '';
            const flagName = `${char}--${name}`;
            const type = flag.type === 'boolean' ? 'boolean' : flag.type === 'option' ? 'string' : flag.type;
            const desc = (flag.summary || flag.description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
            const required = flag.required ? ' (required)' : '';
            lines.push(`| \`${flagName}\` | ${type}${required} | ${desc.substring(0, 100)}${desc.length > 100 ? '...' : ''} |`);
        });
        lines.push('');
    }

    // Arguments
    if (cmd.args && Object.keys(cmd.args).length > 0) {
        lines.push('#### Arguments');
        lines.push('');
        lines.push('| Argument | Description |');
        lines.push('|----------|-------------|');

        Object.entries(cmd.args).forEach(([name, arg]) => {
            const desc = (arg.description || arg.summary || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
            const required = arg.required ? ' (required)' : '';
            lines.push(`| \`${name}\` | ${desc}${required} |`);
        });
        lines.push('');
    }

    // Examples
    if (cmd.examples && cmd.examples.length > 0) {
        lines.push('#### Examples');
        lines.push('');
        cmd.examples.forEach(example => {
            // Handle non-string examples
            if (typeof example !== 'string') {
                example = JSON.stringify(example);
            }
            // Clean up example text
            let exampleText = example
                .replace(/<%= config\.bin %>/g, 'sf')
                .replace(/<%= command\.id %>/g, id.replace(/:/g, ' '))
                .trim();

            // Split description and command
            const exampleLines = exampleText.split('\n');
            if (exampleLines.length > 1) {
                lines.push(exampleLines[0]); // Description
                lines.push('');
                lines.push('```bash');
                lines.push(exampleLines.slice(1).join('\n').trim());
                lines.push('```');
            } else {
                lines.push('```bash');
                lines.push(exampleText);
                lines.push('```');
            }
            lines.push('');
        });
    }

    // Aliases
    if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push('#### Aliases');
        lines.push('');
        lines.push(cmd.aliases.map(a => `\`${a}\``).join(', '));
        lines.push('');
    }

    // Plugin info
    if (cmd.pluginName) {
        lines.push(`> *Plugin: ${cmd.pluginName}*`);
        lines.push('');
    }

    return lines.join('\n');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
