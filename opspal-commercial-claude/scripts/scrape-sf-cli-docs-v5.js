/**
 * Salesforce CLI Reference Documentation Scraper v5
 *
 * Handles Salesforce's LWR (Lightning Web Runtime) framework by:
 * 1. Waiting for specific content selectors
 * 2. Intercepting XHR/fetch responses for content data
 * 3. Using longer timeouts for client-side rendering
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

// Load discovered pages from previous run or use embedded list
let discoveredPages = [];

async function main() {
    console.log('='.repeat(60));
    console.log('Salesforce CLI Reference Documentation Scraper v5');
    console.log('='.repeat(60));
    console.log('');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load discovered pages from v4 run
    const discoveredFile = path.join(OUTPUT_DIR, 'discovered-pages.json');
    if (fs.existsSync(discoveredFile)) {
        discoveredPages = JSON.parse(fs.readFileSync(discoveredFile, 'utf8'));
        console.log(`Loaded ${discoveredPages.length} pages from previous discovery\n`);
    } else {
        console.log('No discovered pages found. Using built-in page list.\n');
        discoveredPages = getBuiltInPageList();
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    try {
        console.log('SCRAPING CONTENT');
        console.log('-'.repeat(60));

        const allContent = [];
        const page = await context.newPage();

        // Set up response interception to capture content data
        const capturedContent = new Map();
        page.on('response', async (response) => {
            const url = response.url();
            // Capture JSON responses that might contain page content
            if (url.includes('get_document') || url.includes('aura') || url.includes('.json')) {
                try {
                    const contentType = response.headers()['content-type'] || '';
                    if (contentType.includes('json') || contentType.includes('text')) {
                        const body = await response.text();
                        if (body.length > 500) {
                            capturedContent.set(url, body);
                        }
                    }
                } catch (e) { }
            }
        });

        for (let i = 0; i < discoveredPages.length; i++) {
            const pageInfo = discoveredPages[i];
            const progress = `[${(i + 1).toString().padStart(3)}/${discoveredPages.length}]`;
            process.stdout.write(`${progress} ${pageInfo.title.substring(0, 45).padEnd(45)} `);

            try {
                capturedContent.clear();
                const content = await scrapePageWithRetry(page, pageInfo, capturedContent);

                if (content && content.content.length > 200) {
                    allContent.push(content);
                    console.log(`✓ (${content.content.length} chars)`);
                } else {
                    console.log('⚠ (minimal)');
                }
            } catch (err) {
                console.log(`✗ ${err.message.substring(0, 30)}`);
            }

            // Rate limiting
            await page.waitForTimeout(800);
        }

        console.log(`\nSuccessfully scraped ${allContent.length} pages with content`);

        // Compile document
        console.log('\n' + '='.repeat(60));
        console.log('COMPILING DOCUMENTATION');
        console.log('-'.repeat(60));

        const document = compileDocument(allContent);
        fs.writeFileSync(OUTPUT_FILE, document);

        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`\n✓ Complete!`);
        console.log(`  File: ${OUTPUT_FILE}`);
        console.log(`  Size: ${Math.round(stats.size / 1024)} KB`);
        console.log(`  Pages: ${allContent.length}`);

    } finally {
        await browser.close();
    }
}

async function scrapePageWithRetry(page, pageInfo, capturedContent, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await scrapeSinglePage(page, pageInfo, capturedContent);
        } catch (err) {
            if (attempt === retries) throw err;
            await page.waitForTimeout(2000);
        }
    }
}

async function scrapeSinglePage(page, pageInfo, capturedContent) {
    // Navigate to page
    await page.goto(pageInfo.url, {
        waitUntil: 'load',
        timeout: 45000
    });

    // Wait for the page to stabilize
    await page.waitForTimeout(5000);

    // Try to wait for specific content selectors
    const contentSelectors = [
        'doc-xml-content',
        'xml-content-component',
        '.doc-content',
        'article',
        'main',
        '[class*="content"]',
        '[class*="article"]'
    ];

    let foundSelector = null;
    for (const selector of contentSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            foundSelector = selector;
            break;
        } catch (e) { }
    }

    // Try multiple extraction methods
    let content = await extractContentMethod1(page);

    if (!content || content.length < 200) {
        content = await extractContentMethod2(page);
    }

    if (!content || content.length < 200) {
        content = await extractContentMethod3(page, capturedContent);
    }

    if (!content || content.length < 200) {
        // Try getting raw text content
        content = await page.evaluate(() => {
            const body = document.body.innerText || document.body.textContent || '';
            // Filter out navigation and header text
            const lines = body.split('\n').filter(line => {
                const trimmed = line.trim();
                return trimmed.length > 10 &&
                    !trimmed.includes('Cookie') &&
                    !trimmed.includes('Privacy') &&
                    !trimmed.includes('Sign In') &&
                    !trimmed.includes('Search');
            });
            return lines.join('\n');
        });
    }

    const title = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const title = document.querySelector('title');
        return h1?.innerText?.trim() || title?.innerText?.split('|')[0]?.trim() || 'Untitled';
    });

    return {
        title: title || pageInfo.title,
        url: pageInfo.url,
        content: cleanContent(content || '')
    };
}

async function extractContentMethod1(page) {
    // Method 1: Query shadow DOM content
    return await page.evaluate(() => {
        const extractFromShadowRoots = (root, depth = 0) => {
            if (depth > 10) return '';
            let text = '';

            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_ELEMENT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                // Check shadow root
                if (node.shadowRoot) {
                    text += extractFromShadowRoots(node.shadowRoot, depth + 1);
                }

                // Extract text from content elements
                const tagName = node.tagName?.toLowerCase();
                if (['p', 'h1', 'h2', 'h3', 'h4', 'li', 'code', 'pre', 'td', 'th', 'dt', 'dd'].includes(tagName)) {
                    const nodeText = node.innerText || node.textContent || '';
                    if (nodeText.trim().length > 0) {
                        text += nodeText + '\n';
                    }
                }
            }

            return text;
        };

        return extractFromShadowRoots(document.body);
    });
}

async function extractContentMethod2(page) {
    // Method 2: Get all visible text content with structure
    return await page.evaluate(() => {
        const content = [];

        // Get all headings
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            const level = parseInt(h.tagName[1]);
            const text = h.innerText?.trim();
            if (text && text.length > 0) {
                content.push({ type: 'heading', level, text });
            }
        });

        // Get paragraphs
        document.querySelectorAll('p').forEach(p => {
            const text = p.innerText?.trim();
            if (text && text.length > 10) {
                content.push({ type: 'paragraph', text });
            }
        });

        // Get code blocks
        document.querySelectorAll('pre, code').forEach(code => {
            const text = code.innerText?.trim();
            if (text && text.length > 10) {
                content.push({ type: 'code', text });
            }
        });

        // Get list items
        document.querySelectorAll('li').forEach(li => {
            const text = li.innerText?.trim();
            if (text && text.length > 5) {
                content.push({ type: 'list', text });
            }
        });

        // Get table rows
        document.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td, th'))
                .map(c => c.innerText?.trim())
                .filter(t => t && t.length > 0);
            if (cells.length > 0) {
                content.push({ type: 'table-row', cells });
            }
        });

        // Convert to markdown-ish text
        return content.map(item => {
            switch (item.type) {
                case 'heading':
                    return '#'.repeat(item.level) + ' ' + item.text;
                case 'paragraph':
                    return item.text;
                case 'code':
                    return '```\n' + item.text + '\n```';
                case 'list':
                    return '- ' + item.text;
                case 'table-row':
                    return '| ' + item.cells.join(' | ') + ' |';
                default:
                    return item.text || '';
            }
        }).join('\n\n');
    });
}

async function extractContentMethod3(page, capturedContent) {
    // Method 3: Parse captured JSON responses
    for (const [url, body] of capturedContent) {
        try {
            // Try to parse as JSON and extract content
            if (body.includes('"content"') || body.includes('"body"') || body.includes('"text"')) {
                const data = JSON.parse(body);
                const text = extractTextFromJson(data);
                if (text && text.length > 200) {
                    return text;
                }
            }
        } catch (e) { }

        // Try as HTML
        if (body.includes('<p>') || body.includes('<h1>') || body.includes('<code>')) {
            return htmlToText(body);
        }
    }
    return '';
}

function extractTextFromJson(obj, depth = 0) {
    if (depth > 10) return '';

    if (typeof obj === 'string') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => extractTextFromJson(item, depth + 1)).join('\n');
    }

    if (typeof obj === 'object' && obj !== null) {
        const contentKeys = ['content', 'body', 'text', 'description', 'value', 'html'];
        for (const key of contentKeys) {
            if (obj[key]) {
                return extractTextFromJson(obj[key], depth + 1);
            }
        }
        return Object.values(obj).map(v => extractTextFromJson(v, depth + 1)).join('\n');
    }

    return '';
}

function htmlToText(html) {
    let text = html;

    // Remove script/style
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Convert headers
    text = text.replace(/<h(\d)[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, t) => '\n' + '#'.repeat(n) + ' ' + t + '\n');

    // Convert code
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Convert lists
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

    // Convert paragraphs
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');

    return text;
}

function cleanContent(content) {
    if (!content) return '';

    // Remove common noise patterns
    const noisePatterns = [
        /DID THIS ARTICLE SOLVE YOUR ISSUE.*/gi,
        /Let us know so we can improve.*/gi,
        /Share your feedback/gi,
        /Cookie\s*Preferences/gi,
        /Privacy\s*Policy/gi,
        /Sign\s*In/gi,
        /Search\s*Documentation/gi,
        /Skip\s*to\s*content/gi,
        /Table\s*of\s*Contents/gi,
        /On\s*this\s*page/gi
    ];

    let cleaned = content;
    for (const pattern of noisePatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // Clean up whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    cleaned = cleaned.trim();

    return cleaned;
}

function getBuiltInPageList() {
    // Comprehensive list of sf CLI commands
    const commands = [
        // Overview and meta pages
        { title: 'Salesforce CLI Command Reference', url: `${BASE_URL}/cli_reference_top.htm` },
        { title: 'sf Commands', url: `${BASE_URL}/cli_reference_unified.htm` },
        { title: 'Release Notes', url: `${BASE_URL}/cli_reference_release_notes.htm` },
        { title: 'CLI Deprecation Policy', url: `${BASE_URL}/sfdx_dev_cli_deprecation.htm` },
        { title: 'Discover Salesforce Plugins', url: `${BASE_URL}/sfdx_setup_other_plugins.htm` },

        // Migration guides
        { title: 'Migration Guide', url: `${BASE_URL}/cli_reference_migrate.htm` },
        { title: 'Source/MDAPI Migration', url: `${BASE_URL}/cli_reference_mig_deploy_retrieve.htm` },
        { title: 'Org Commands Migration', url: `${BASE_URL}/cli_reference_mig_org.htm` },
        { title: 'Bulk Data Migration', url: `${BASE_URL}/cli_reference_mig_bulk_data.htm` },
        { title: 'Config Migration', url: `${BASE_URL}/cli_reference_mig_env_config.htm` },
        { title: 'sfdx to sf Mapping', url: `${BASE_URL}/cli_reference_old_new_command_mapping.htm` },
        { title: 'sf to sfdx Mapping', url: `${BASE_URL}/cli_reference_new_old_command_mapping.htm` }
    ];

    // Add command groups
    const groups = [
        'alias', 'analytics', 'apex', 'api', 'cmdt', 'code-analyzer',
        'community', 'config', 'data', 'dev', 'doctor', 'flow', 'force',
        'info', 'lightning', 'logic', 'org', 'package', 'package1',
        'plugins', 'project', 'schema', 'sobject', 'static-resource', 'visualforce'
    ];

    groups.forEach(group => {
        commands.push({
            title: `${group} Commands`,
            url: `${BASE_URL}/cli_reference_${group.replace(/-/g, '_')}_commands_unified.htm`
        });
    });

    return commands;
}

function compileDocument(allContent) {
    // Sort content
    allContent.sort((a, b) => {
        if (a.title.includes('Reference') || a.title.includes('Overview')) return -1;
        if (b.title.includes('Reference') || b.title.includes('Overview')) return 1;
        if (a.title.startsWith('sf ') && b.title.startsWith('sf ')) {
            return a.title.localeCompare(b.title);
        }
        return a.title.localeCompare(b.title);
    });

    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> **Generated:** ${new Date().toISOString()}`,
        `> **Source:** https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/`,
        `> **Total Pages:** ${allContent.length}`,
        '',
        '---',
        '',
        '## Table of Contents',
        ''
    ];

    // Group by category
    const categories = {};
    allContent.forEach(page => {
        const match = page.title.match(/^(sf\s+\w+|[\w-]+\s+Commands?)/i);
        const category = match ? match[1] : 'General';
        if (!categories[category]) categories[category] = [];
        categories[category].push(page);
    });

    Object.keys(categories).sort().forEach(cat => {
        lines.push(`### ${cat}`);
        categories[cat].forEach(page => {
            const anchor = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 60);
            lines.push(`- [${page.title}](#${anchor})`);
        });
        lines.push('');
    });

    lines.push('---');
    lines.push('');

    // Add content
    allContent.forEach((page, idx) => {
        lines.push(`## ${page.title}`);
        lines.push('');
        lines.push(`> Source: ${page.url}`);
        lines.push('');
        lines.push(page.content);
        lines.push('');
        if (idx < allContent.length - 1) {
            lines.push('---');
            lines.push('');
        }
    });

    return lines.join('\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
