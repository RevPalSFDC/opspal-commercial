/**
 * Salesforce CLI Reference Documentation Scraper v2
 *
 * Deep scraper that navigates the full documentation tree,
 * expands all sections, and captures all command reference pages.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const SF_UNIFIED_PAGE = `${BASE_URL}/cli_reference_unified.htm`;
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

// Track visited pages to avoid duplicates
const visitedUrls = new Set();
const allPages = [];

async function main() {
    console.log('='.repeat(60));
    console.log('Salesforce CLI Reference Documentation Scraper v2');
    console.log('='.repeat(60));
    console.log('');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        // Step 1: Discover all pages from navigation
        console.log('STEP 1: Discovering all documentation pages');
        console.log('-'.repeat(60));
        await discoverAllPages(page);

        console.log(`\nTotal unique pages found: ${allPages.length}`);

        // Save page list for reference
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'page-list.json'),
            JSON.stringify(allPages, null, 2)
        );

        // Step 2: Scrape content from each page
        console.log('\n' + '='.repeat(60));
        console.log('STEP 2: Scraping content from each page');
        console.log('-'.repeat(60));

        const allContent = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < allPages.length; i++) {
            const pageInfo = allPages[i];
            const progress = `[${(i + 1).toString().padStart(3)}/${allPages.length}]`;
            process.stdout.write(`${progress} ${pageInfo.title.substring(0, 50).padEnd(50)}... `);

            try {
                const content = await scrapePage(page, pageInfo);
                if (content && content.content.length > 50) {
                    allContent.push(content);
                    console.log('✓');
                    successCount++;
                } else {
                    console.log('⚠ (empty content)');
                }
            } catch (err) {
                console.log(`✗ (${err.message.substring(0, 30)})`);
                errorCount++;
            }

            // Small delay to be respectful
            await page.waitForTimeout(300);
        }

        console.log(`\nScraping complete: ${successCount} success, ${errorCount} errors`);

        // Step 3: Compile into single document
        console.log('\n' + '='.repeat(60));
        console.log('STEP 3: Compiling documentation');
        console.log('-'.repeat(60));

        // Sort pages by hierarchy for better reading
        allContent.sort((a, b) => {
            const aDepth = (a.url.match(/\//g) || []).length;
            const bDepth = (b.url.match(/\//g) || []).length;
            if (aDepth !== bDepth) return aDepth - bDepth;
            return a.title.localeCompare(b.title);
        });

        const document = compileDocument(allContent);
        fs.writeFileSync(OUTPUT_FILE, document);

        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeKB = Math.round(stats.size / 1024);

        console.log(`\n✓ Documentation saved to: ${OUTPUT_FILE}`);
        console.log(`  File size: ${fileSizeKB} KB`);
        console.log(`  Total pages: ${allContent.length}`);
        console.log(`  Total lines: ${document.split('\n').length}`);

    } finally {
        await browser.close();
    }
}

async function discoverAllPages(page) {
    // Start with the sf unified reference page which has all commands
    const startPages = [
        { url: `${BASE_URL}/cli_reference_unified.htm`, title: 'sf Commands' },
        { url: `${BASE_URL}/cli_reference_top.htm`, title: 'Overview' },
        { url: `${BASE_URL}/cli_reference_migrate.htm`, title: 'Migration Guide' }
    ];

    for (const startPage of startPages) {
        console.log(`\nNavigating to: ${startPage.title}`);
        await discoverFromPage(page, startPage.url, 0);
    }
}

async function discoverFromPage(page, url, depth) {
    const normalizedUrl = normalizeUrl(url);

    if (visitedUrls.has(normalizedUrl)) return;
    if (depth > 5) return; // Limit recursion depth
    if (!url.includes('sfdx_cli_reference')) return;

    visitedUrls.add(normalizedUrl);

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for content
        await page.waitForTimeout(2000);

        // Try to expand all collapsed navigation items
        await expandNavigation(page);

        // Get page title
        const title = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            const title = document.querySelector('title');
            return h1?.textContent?.trim() || title?.textContent?.split('|')[0]?.trim() || 'Untitled';
        });

        // Add this page if not already present
        const exists = allPages.some(p => normalizeUrl(p.url) === normalizedUrl);
        if (!exists && title) {
            allPages.push({ title, url: normalizedUrl, depth });
            console.log(`  ${'  '.repeat(depth)}+ ${title}`);
        }

        // Find all links to documentation pages
        const links = await page.$$eval('a[href*=".htm"]', (elements, baseUrl) => {
            return elements.map(el => ({
                title: el.textContent.trim(),
                url: el.href
            })).filter(link =>
                link.url &&
                link.url.includes('sfdx_cli_reference') &&
                link.url.endsWith('.htm') &&
                !link.url.includes('#') &&
                link.title &&
                link.title.length > 1 &&
                link.title.length < 200
            );
        }, BASE_URL);

        // Recursively discover from linked pages
        for (const link of links) {
            const linkUrl = normalizeUrl(link.url);
            if (!visitedUrls.has(linkUrl)) {
                await discoverFromPage(page, linkUrl, depth + 1);
            }
        }

    } catch (err) {
        // Silently continue on errors during discovery
        console.log(`  ${'  '.repeat(depth)}⚠ Error discovering: ${err.message.substring(0, 50)}`);
    }
}

async function expandNavigation(page) {
    // Try to click all expandable navigation items
    const expandSelectors = [
        '[aria-expanded="false"]',
        '.collapsed',
        '.expand-btn',
        'button[class*="expand"]',
        '.toc-toggle',
        '[data-toggle="collapse"]'
    ];

    for (const selector of expandSelectors) {
        try {
            const buttons = await page.$$(selector);
            for (const btn of buttons) {
                try {
                    await btn.click();
                    await page.waitForTimeout(100);
                } catch (e) {
                    // Continue if click fails
                }
            }
        } catch (e) {
            // Selector not found, continue
        }
    }
}

function normalizeUrl(url) {
    try {
        const parsed = new URL(url);
        // Remove query params and anchors
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url;
    }
}

async function scrapePage(page, pageInfo) {
    await page.goto(pageInfo.url, {
        waitUntil: 'networkidle',
        timeout: 45000
    });

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Extract the main content
    const content = await page.evaluate(() => {
        // Find the main content area - try multiple selectors
        const contentSelectors = [
            '.doc-content',
            'main article',
            '.article-content',
            '[class*="content-body"]',
            '.body-content',
            'article',
            'main .content',
            '#content-inner'
        ];

        let contentEl = null;
        for (const selector of contentSelectors) {
            const el = document.querySelector(selector);
            if (el && el.innerHTML.length > 200) {
                contentEl = el;
                break;
            }
        }

        if (!contentEl) {
            // Fallback: clone body and remove navigation
            contentEl = document.body.cloneNode(true);
            const removeSelectors = ['nav', 'header', 'footer', 'script', 'style',
                '.navigation', '.sidebar', '.toc', '[class*="nav"]', '[class*="header"]',
                '[class*="footer"]', '[class*="feedback"]', '.feedback'];
            removeSelectors.forEach(sel => {
                contentEl.querySelectorAll(sel).forEach(el => el.remove());
            });
        }

        // Extract structured content
        const result = {
            html: contentEl.innerHTML,
            title: document.querySelector('h1')?.textContent?.trim() || '',
            description: document.querySelector('meta[name="description"]')?.content || ''
        };

        return result;
    });

    // Convert HTML to Markdown
    const markdown = htmlToMarkdown(content.html, pageInfo.title);

    return {
        title: content.title || pageInfo.title,
        url: pageInfo.url,
        description: content.description,
        content: markdown
    };
}

function htmlToMarkdown(html, title) {
    if (!html) return '';

    let md = html;

    // Remove script and style tags
    md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    md = md.replace(/<!--[\s\S]*?-->/g, '');

    // Remove feedback sections
    md = md.replace(/<div[^>]*class="[^"]*feedback[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // Convert headers
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
    md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
    md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

    // Convert code blocks - handle various formats
    md = md.replace(/<pre[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<pre[^>]*><code[^>]*class="[^"]*(\w+)[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```$1\n$2\n```\n');
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Convert definition lists (common in CLI docs)
    md = md.replace(/<dl[^>]*>/gi, '\n');
    md = md.replace(/<\/dl>/gi, '\n');
    md = md.replace(/<dt[^>]*>([\s\S]*?)<\/dt>/gi, '\n**$1**\n');
    md = md.replace(/<dd[^>]*>([\s\S]*?)<\/dd>/gi, '$1\n');

    // Convert lists
    md = md.replace(/<ul[^>]*>/gi, '\n');
    md = md.replace(/<\/ul>/gi, '\n');
    md = md.replace(/<ol[^>]*>/gi, '\n');
    md = md.replace(/<\/ol>/gi, '\n');
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

    // Convert links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Convert emphasis
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

    // Convert blockquotes
    md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');

    // Convert paragraphs
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

    // Convert divs with specific classes
    md = md.replace(/<div[^>]*class="[^"]*note[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '\n> **Note:** $1\n');
    md = md.replace(/<div[^>]*class="[^"]*warning[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '\n> **Warning:** $1\n');
    md = md.replace(/<div[^>]*class="[^"]*tip[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '\n> **Tip:** $1\n');

    // Convert line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

    // Convert tables
    md = md.replace(/<table[^>]*>/gi, '\n');
    md = md.replace(/<\/table>/gi, '\n');
    md = md.replace(/<thead[^>]*>/gi, '');
    md = md.replace(/<\/thead>/gi, '');
    md = md.replace(/<tbody[^>]*>/gi, '');
    md = md.replace(/<\/tbody>/gi, '');
    md = md.replace(/<tr[^>]*>/gi, '| ');
    md = md.replace(/<\/tr>/gi, '\n');
    md = md.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, ' $1 |');
    md = md.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, ' $1 |');

    // Remove remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    md = md.replace(/&nbsp;/g, ' ');
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");
    md = md.replace(/&mdash;/g, '—');
    md = md.replace(/&ndash;/g, '–');
    md = md.replace(/&hellip;/g, '...');
    md = md.replace(/&copy;/g, '©');
    md = md.replace(/&reg;/g, '®');
    md = md.replace(/&trade;/g, '™');

    // Clean up whitespace
    md = md.replace(/\n{4,}/g, '\n\n\n');
    md = md.replace(/[ \t]+\n/g, '\n');
    md = md.replace(/\n[ \t]+/g, '\n');
    md = md.replace(/^\s+|\s+$/g, '');

    // Remove empty list items
    md = md.replace(/^-\s*$/gm, '');

    return md;
}

function compileDocument(allContent) {
    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> **Generated:** ${new Date().toISOString().split('T')[0]}`,
        `> **Source:** https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/`,
        `> **Total Pages:** ${allContent.length}`,
        '',
        '---',
        '',
        '## Table of Contents',
        ''
    ];

    // Group by command prefix for better organization
    const groups = {};
    allContent.forEach((page) => {
        // Extract command group from title (e.g., "sf org" from "sf org create scratch")
        const match = page.title.match(/^(sf\s+\w+)/);
        const group = match ? match[1] : 'Other';

        if (!groups[group]) {
            groups[group] = [];
        }
        groups[group].push(page);
    });

    // Generate grouped TOC
    const sortedGroups = Object.keys(groups).sort();
    sortedGroups.forEach(group => {
        const anchor = group.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        lines.push(`### ${group}`);
        groups[group].forEach(page => {
            const pageAnchor = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
            lines.push(`- [${page.title}](#${pageAnchor})`);
        });
        lines.push('');
    });

    lines.push('---');
    lines.push('');

    // Add each page's content
    allContent.forEach((page, index) => {
        lines.push(`## ${page.title}`);
        lines.push('');
        lines.push(`> Source: ${page.url}`);
        if (page.description) {
            lines.push(`> ${page.description}`);
        }
        lines.push('');
        lines.push(page.content);
        lines.push('');
        if (index < allContent.length - 1) {
            lines.push('---');
            lines.push('');
        }
    });

    return lines.join('\n');
}

// Run the scraper
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
