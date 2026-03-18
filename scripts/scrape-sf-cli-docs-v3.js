/**
 * Salesforce CLI Reference Documentation Scraper v3
 *
 * Efficient scraper that uses the built-in TOC to discover all pages
 * and batch scrapes them in parallel.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

async function main() {
    console.log('='.repeat(60));
    console.log('Salesforce CLI Reference Documentation Scraper v3');
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

    try {
        // Step 1: Get the complete TOC from the sidebar
        console.log('STEP 1: Extracting Table of Contents');
        console.log('-'.repeat(60));

        const page = await context.newPage();

        // Navigate to the main sf commands page
        const mainPage = `${BASE_URL}/cli_reference_unified.htm`;
        console.log(`Navigating to: ${mainPage}`);

        await page.goto(mainPage, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Wait for navigation to fully load
        await page.waitForTimeout(5000);

        // Take a screenshot for debugging
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'debug-screenshot.png'), fullPage: true });

        // Try to find and click all expandable TOC items
        console.log('Expanding all navigation sections...');
        await expandAllTocItems(page);

        // Extract all links from the navigation
        const allPages = await page.evaluate((baseUrl) => {
            const links = [];
            const seenUrls = new Set();

            // Get all links from the page that match our pattern
            document.querySelectorAll('a').forEach(anchor => {
                const href = anchor.href;
                const text = anchor.textContent.trim();

                if (href &&
                    href.includes('sfdx_cli_reference') &&
                    href.endsWith('.htm') &&
                    !href.includes('#') &&
                    text &&
                    text.length > 0 &&
                    text.length < 200 &&
                    !seenUrls.has(href)) {

                    seenUrls.add(href);
                    links.push({
                        title: text,
                        url: href,
                        isCommand: text.startsWith('sf ') || href.includes('cli_reference_') || href.includes('_unified')
                    });
                }
            });

            return links;
        }, BASE_URL);

        console.log(`Found ${allPages.length} unique pages`);

        // Save page list
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'page-list-v3.json'),
            JSON.stringify(allPages, null, 2)
        );

        // Step 2: Scrape each page
        console.log('\n' + '='.repeat(60));
        console.log('STEP 2: Scraping page content');
        console.log('-'.repeat(60));

        const allContent = [];
        const CONCURRENCY = 3; // Scrape 3 pages at a time

        for (let i = 0; i < allPages.length; i += CONCURRENCY) {
            const batch = allPages.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async (pageInfo, idx) => {
                    const batchPage = await context.newPage();
                    const progress = `[${(i + idx + 1).toString().padStart(3)}/${allPages.length}]`;
                    console.log(`${progress} Scraping: ${pageInfo.title.substring(0, 50)}`);

                    try {
                        const content = await scrapePage(batchPage, pageInfo);
                        await batchPage.close();
                        return content;
                    } catch (err) {
                        console.log(`  Error: ${err.message.substring(0, 50)}`);
                        await batchPage.close();
                        return null;
                    }
                })
            );

            allContent.push(...batchResults.filter(c => c && c.content.length > 50));
        }

        console.log(`\nSuccessfully scraped ${allContent.length} pages`);

        // Step 3: Compile document
        console.log('\n' + '='.repeat(60));
        console.log('STEP 3: Compiling documentation');
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

async function expandAllTocItems(page) {
    // Try multiple strategies to expand navigation
    const strategies = [
        // Strategy 1: Click aria-expanded=false buttons
        async () => {
            const buttons = await page.$$('[aria-expanded="false"]');
            for (const btn of buttons) {
                try {
                    await btn.click();
                    await page.waitForTimeout(100);
                } catch (e) { }
            }
        },
        // Strategy 2: Click chevron/caret icons
        async () => {
            const icons = await page.$$('[class*="chevron"], [class*="caret"], [class*="expand"]');
            for (const icon of icons) {
                try {
                    await icon.click();
                    await page.waitForTimeout(100);
                } catch (e) { }
            }
        },
        // Strategy 3: Click collapsed items
        async () => {
            const collapsed = await page.$$('.collapsed, .is-collapsed, [data-collapsed="true"]');
            for (const item of collapsed) {
                try {
                    await item.click();
                    await page.waitForTimeout(100);
                } catch (e) { }
            }
        }
    ];

    for (const strategy of strategies) {
        try {
            await strategy();
        } catch (e) { }
    }

    // Wait for any animations
    await page.waitForTimeout(1000);
}

async function scrapePage(page, pageInfo) {
    await page.goto(pageInfo.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    // Wait for content
    await page.waitForTimeout(1500);

    // Extract content
    const extracted = await page.evaluate(() => {
        // Function to clean text
        const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

        // Try to find main content
        const contentSelectors = [
            'main article',
            '.doc-content',
            'article',
            'main',
            '.content-body',
            '#main-content'
        ];

        let contentEl = null;
        for (const selector of contentSelectors) {
            const el = document.querySelector(selector);
            if (el && el.innerText.length > 100) {
                contentEl = el.cloneNode(true);
                break;
            }
        }

        if (!contentEl) {
            contentEl = document.body.cloneNode(true);
        }

        // Remove unwanted elements
        const removeSelectors = [
            'nav', 'header', 'footer', 'script', 'style', 'noscript',
            '.navigation', '.sidebar', '.toc', '.feedback',
            '[class*="nav"]', '[class*="header"]', '[class*="footer"]',
            '[role="navigation"]', '[role="banner"]'
        ];

        removeSelectors.forEach(sel => {
            try {
                contentEl.querySelectorAll(sel).forEach(el => el.remove());
            } catch (e) { }
        });

        // Get title
        const title = document.querySelector('h1')?.innerText ||
            document.querySelector('title')?.innerText?.split('|')[0]?.trim() ||
            'Untitled';

        return {
            title: cleanText(title),
            html: contentEl.innerHTML
        };
    });

    const markdown = htmlToMarkdown(extracted.html);

    return {
        title: extracted.title || pageInfo.title,
        url: pageInfo.url,
        content: markdown
    };
}

function htmlToMarkdown(html) {
    if (!html) return '';

    let md = html;

    // Remove unwanted elements
    md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    md = md.replace(/<!--[\s\S]*?-->/g, '');

    // Convert headers
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
    md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
    md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

    // Convert code blocks
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Convert lists
    md = md.replace(/<ul[^>]*>/gi, '\n');
    md = md.replace(/<\/ul>/gi, '\n');
    md = md.replace(/<ol[^>]*>/gi, '\n');
    md = md.replace(/<\/ol>/gi, '\n');
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

    // Convert definition lists
    md = md.replace(/<dl[^>]*>/gi, '\n');
    md = md.replace(/<\/dl>/gi, '\n');
    md = md.replace(/<dt[^>]*>([\s\S]*?)<\/dt>/gi, '\n**$1**\n');
    md = md.replace(/<dd[^>]*>([\s\S]*?)<\/dd>/gi, '$1\n');

    // Convert links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Convert emphasis
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

    // Convert paragraphs and breaks
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

    // Convert tables
    md = md.replace(/<table[^>]*>/gi, '\n');
    md = md.replace(/<\/table>/gi, '\n');
    md = md.replace(/<tr[^>]*>/gi, '| ');
    md = md.replace(/<\/tr>/gi, '\n');
    md = md.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, ' $1 |');
    md = md.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, ' $1 |');

    // Remove remaining tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode entities
    md = md.replace(/&nbsp;/g, ' ');
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");
    md = md.replace(/&mdash;/g, '—');
    md = md.replace(/&ndash;/g, '–');

    // Clean up
    md = md.replace(/\n{4,}/g, '\n\n\n');
    md = md.replace(/^\s+|\s+$/g, '');

    return md;
}

function compileDocument(allContent) {
    // Sort content by title for better organization
    allContent.sort((a, b) => {
        // Put overview pages first
        if (a.title.includes('Overview') || a.title.includes('Reference')) return -1;
        if (b.title.includes('Overview') || b.title.includes('Reference')) return 1;
        // Then sort sf commands alphabetically
        if (a.title.startsWith('sf ') && b.title.startsWith('sf ')) {
            return a.title.localeCompare(b.title);
        }
        if (a.title.startsWith('sf ')) return -1;
        if (b.title.startsWith('sf ')) return 1;
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

    // Group by command category
    const categories = {};
    allContent.forEach(page => {
        const match = page.title.match(/^sf\s+(\w+)/);
        const category = match ? `sf ${match[1]}` : 'Other';
        if (!categories[category]) categories[category] = [];
        categories[category].push(page);
    });

    // Generate TOC
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
