#!/usr/bin/env node

/**
 * CLI argument parser for PDF generation entrypoint.
 *
 * Supports both legacy positional args and flag-based invocation:
 *   pdf-generator.js input.md output.pdf
 *   pdf-generator.js --input input.md --output output.pdf
 */

const {
    resolveStyleProfile,
    STYLE_PROFILES
} = require('./pdf-style-policy');

function isFlagToken(value) {
    return typeof value === 'string' && value.startsWith('--');
}

function readFlagValue(args, index, flagName) {
    const value = args[index + 1];
    if (!value || isFlagToken(value)) {
        return { error: `Missing value for ${flagName}` };
    }
    return { value, nextIndex: index + 1 };
}

const USAGE_LINES = [
    'Usage: pdf-generator.js <input.md> <output.pdf> [options]',
    '   or: pdf-generator.js --input <input.md> --output <output.pdf> [options]',
    '   or: pdf-generator.js --collate <pattern> <output.pdf> [options]',
    '   or: pdf-generator.js --collate --input <pattern> --output <output.pdf> [options]',
    '',
    'Options:',
    '  --input <path>       Input markdown path (or glob pattern with --collate)',
    '  --output <path>      Output PDF path',
    '  --collate            Treat input as glob pattern and collate matched docs',
    '  --render-mermaid     Render Mermaid diagrams to images',
    '  --no-mermaid         Skip Mermaid rendering',
    '  --bookmarks          Add PDF bookmarks (collation only)',
    `  --profile <name>     PDF style profile (${STYLE_PROFILES.SIMPLE}, ${STYLE_PROFILES.COVER_TOC})`,
    '  --title <text>       PDF metadata title',
    '  --org <text>         PDF metadata organization',
    '  --version <text>     PDF metadata version',
    '  --author <text>      PDF metadata author',
    '  --subtitle <text>    PDF metadata subtitle',
    '  --report-type <text> PDF metadata report type',
    '  --date <YYYY-MM-DD>  PDF metadata generation date',
    '  --verbose            Verbose output',
    '  --help               Show help'
];

function printCliUsage(log = console.log) {
    for (const line of USAGE_LINES) {
        log(line);
    }
}

function parseCliArgs(rawArgs) {
    const args = Array.isArray(rawArgs) ? rawArgs : [];
    const positionals = [];
    const metadata = {};
    let mode = 'single';
    let input;
    let output;

    const options = {
        renderMermaid: undefined,
        bookmarks: undefined,
        verbose: false,
        profile: undefined,
        metadata: undefined
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
        case '--help':
        case '-h':
            return { ok: false, help: true };
        case '--collate':
            mode = 'collate';
            break;
        case '--input': {
            const result = readFlagValue(args, i, '--input');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            input = result.value;
            i = result.nextIndex;
            break;
        }
        case '--output': {
            const result = readFlagValue(args, i, '--output');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            output = result.value;
            i = result.nextIndex;
            break;
        }
        case '--profile': {
            const result = readFlagValue(args, i, '--profile');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            options.profile = result.value;
            i = result.nextIndex;
            break;
        }
        case '--theme':
            return {
                ok: false,
                error: 'The --theme flag is no longer supported. Use --profile simple or --profile cover-toc.'
            };
        case '--title': {
            const result = readFlagValue(args, i, '--title');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.title = result.value;
            i = result.nextIndex;
            break;
        }
        case '--org': {
            const result = readFlagValue(args, i, '--org');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.org = result.value;
            i = result.nextIndex;
            break;
        }
        case '--version': {
            const result = readFlagValue(args, i, '--version');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.version = result.value;
            i = result.nextIndex;
            break;
        }
        case '--author': {
            const result = readFlagValue(args, i, '--author');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.author = result.value;
            i = result.nextIndex;
            break;
        }
        case '--subtitle': {
            const result = readFlagValue(args, i, '--subtitle');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.subtitle = result.value;
            i = result.nextIndex;
            break;
        }
        case '--report-type': {
            const result = readFlagValue(args, i, '--report-type');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.reportType = result.value;
            i = result.nextIndex;
            break;
        }
        case '--date': {
            const result = readFlagValue(args, i, '--date');
            if (result.error) {
                return { ok: false, error: result.error };
            }
            metadata.date = result.value;
            i = result.nextIndex;
            break;
        }
        case '--render-mermaid':
            options.renderMermaid = true;
            break;
        case '--no-mermaid':
            options.renderMermaid = false;
            break;
        case '--toc':
            return {
                ok: false,
                error: 'The --toc flag is no longer supported. Use --profile cover-toc (TOC on) or --profile simple (TOC off).'
            };
        case '--bookmarks':
            options.bookmarks = true;
            break;
        case '--cover':
            return {
                ok: false,
                error: 'The --cover flag is no longer supported. Use --profile cover-toc or --profile simple.'
            };
        case '--verbose':
            options.verbose = true;
            break;
        default:
            if (isFlagToken(arg)) {
                const optionName = arg.replace(/^--/, '');
                if (!optionName) {
                    return { ok: false, error: `Invalid option: ${arg}` };
                }

                if (args[i + 1] && !isFlagToken(args[i + 1])) {
                    options[optionName] = args[i + 1];
                    i += 1;
                } else {
                    options[optionName] = true;
                }
                break;
            }
            positionals.push(arg);
            break;
        }
    }

    if (!input && positionals.length > 0) {
        input = positionals.shift();
    }
    if (!output && positionals.length > 0) {
        output = positionals.shift();
    }

    if (positionals.length > 0) {
        return {
            ok: false,
            error: `Unexpected positional arguments: ${positionals.join(', ')}`
        };
    }

    if (!input || !output) {
        return {
            ok: false,
            error: 'Missing required input/output arguments'
        };
    }

    if (Object.keys(metadata).length > 0) {
        options.metadata = metadata;
    }

    try {
        options.profile = resolveStyleProfile(options.profile);
    } catch (error) {
        return {
            ok: false,
            error: error.message
        };
    }

    return {
        ok: true,
        mode,
        input,
        output,
        options
    };
}

module.exports = {
    parseCliArgs,
    printCliUsage,
    USAGE_LINES
};
