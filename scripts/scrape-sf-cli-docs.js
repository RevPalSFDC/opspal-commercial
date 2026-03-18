/**
 * Salesforce CLI Reference Documentation Scraper
 *
 * Uses Playwright to scrape all pages from the SF CLI reference documentation
 * and compile them into a comprehensive markdown document.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const START_PAGE = `${BASE_URL}/cli_reference_migrate.htm`;
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

// Track visited pages to avoid duplicates
const visitedPages = new Set();
const allPages = [];

async function main() {
    console.log('Starting Salesforce CLI Reference Documentation Scraper...\n');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        // Step 1: Discover all pages from navigation
        console.log('Step 1: Discovering all documentation pages...');
        await discoverPages(page);
        console.log(`Found ${allPages.length} pages to scrape\n`);

        // Save page list for reference
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'page-list.json'),
            JSON.stringify(allPages, null, 2)
        );

        // Step 2: Scrape content from each page
        console.log('Step 2: Scraping content from each page...');
        const allContent = [];

        for (let i = 0; i < allPages.length; i++) {
            const pageInfo = allPages[i];
            console.log(`  [${i + 1}/${allPages.length}] ${pageInfo.title}`);

            try {
                const content = await scrapePage(page, pageInfo);
                if (content) {
                    allContent.push(content);
                }
            } catch (err) {
                console.error(`    Error scraping ${pageInfo.url}: ${err.message}`);
            }

            // Small delay to be respectful
            await page.waitForTimeout(500);
        }

        // Step 3: Compile into single document
        console.log('\nStep 3: Compiling documentation...');
        const document = compileDocument(allContent);
        fs.writeFileSync(OUTPUT_FILE, document);

        console.log(`\nComplete! Documentation saved to: ${OUTPUT_FILE}`);
        console.log(`Total pages scraped: ${allContent.length}`);

    } finally {
        await browser.close();
    }
}

async function discoverPages(page) {
    console.log(`  Navigating to ${START_PAGE}...`);

    await page.goto(START_PAGE, {
        waitUntil: 'networkidle',
        timeout: 60000
    });

    // Wait for navigation to load
    await page.waitForTimeout(3000);

    // Try multiple selectors for the navigation sidebar
    const navSelectors = [
        '.toc-container a',
        '.doc-toc a',
        'nav a[href*="cli_reference"]',
        '[class*="navigation"] a[href*=".htm"]',
        '.sidebar a[href*=".htm"]',
        'aside a[href*=".htm"]',
        'a[href*="sfdx_cli_reference"]'
    ];

    let links = [];

    for (const selector of navSelectors) {
        try {
            const foundLinks = await page.$$eval(selector, (elements) => {
                return elements.map(el => ({
                    title: el.textContent.trim(),
                    url: el.href
                })).filter(link =>
                    link.url &&
                    link.url.includes('sfdx_cli_reference') &&
                    link.url.endsWith('.htm') &&
                    link.title
                );
            });

            if (foundLinks.length > 0) {
                console.log(`  Found ${foundLinks.length} links using selector: ${selector}`);
                links = [...links, ...foundLinks];
            }
        } catch (e) {
            // Selector didn't match, continue
        }
    }

    // Also try to get links from the page's table of contents
    try {
        const tocLinks = await page.$$eval('a[href*=".htm"]', (elements) => {
            return elements.map(el => ({
                title: el.textContent.trim(),
                url: el.href
            })).filter(link =>
                link.url &&
                link.url.includes('sfdx_cli_reference') &&
                link.url.endsWith('.htm') &&
                link.title &&
                !link.url.includes('#')
            );
        });
        links = [...links, ...tocLinks];
        console.log(`  Found ${tocLinks.length} additional links from page content`);
    } catch (e) {
        // Continue
    }

    // Deduplicate by URL
    const seen = new Set();
    for (const link of links) {
        const normalizedUrl = normalizeUrl(link.url);
        if (!seen.has(normalizedUrl) && link.title) {
            seen.add(normalizedUrl);
            allPages.push({
                title: link.title,
                url: normalizedUrl
            });
        }
    }

    // If we didn't find many pages, try to crawl recursively
    if (allPages.length < 10) {
        console.log('  Few pages found via navigation, attempting recursive discovery...');
        await crawlForLinks(page, START_PAGE, 3);
    }
}

async function crawlForLinks(page, startUrl, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return;

    const normalizedStart = normalizeUrl(startUrl);
    if (visitedPages.has(normalizedStart)) return;
    visitedPages.add(normalizedStart);

    try {
        await page.goto(startUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(1500);

        const links = await page.$$eval('a[href*=".htm"]', (elements) => {
            return elements.map(el => ({
                title: el.textContent.trim(),
                url: el.href
            })).filter(link =>
                link.url &&
                link.url.includes('sfdx_cli_reference') &&
                link.url.endsWith('.htm') &&
                link.title &&
                !link.url.includes('#')
            );
        });

        for (const link of links) {
            const normalizedUrl = normalizeUrl(link.url);
            if (!visitedPages.has(normalizedUrl)) {
                const exists = allPages.some(p => normalizeUrl(p.url) === normalizedUrl);
                if (!exists && link.title) {
                    allPages.push({
                        title: link.title,
                        url: normalizedUrl
                    });
                }

                // Recursively crawl
                await crawlForLinks(page, normalizedUrl, maxDepth, currentDepth + 1);
            }
        }
    } catch (e) {
        console.error(`    Error crawling ${startUrl}: ${e.message}`);
    }
}

function normalizeUrl(url) {
    // Remove query params and anchors, normalize the URL
    try {
        const parsed = new URL(url);
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

    // Try multiple content selectors
    const contentSelectors = [
        '.doc-content',
        'main article',
        '.article-content',
        '[class*="content-body"]',
        '.body-content',
        'article',
        'main',
        '.content'
    ];

    let contentHtml = null;
    let usedSelector = null;

    for (const selector of contentSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                contentHtml = await element.innerHTML();
                if (contentHtml && contentHtml.length > 100) {
                    usedSelector = selector;
                    break;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    if (!contentHtml) {
        // Fallback: get body content
        contentHtml = await page.evaluate(() => {
            const body = document.body;
            // Remove navigation, header, footer
            const clone = body.cloneNode(true);
            clone.querySelectorAll('nav, header, footer, script, style, .navigation, .sidebar').forEach(el => el.remove());
            return clone.innerHTML;
        });
    }

    // Convert HTML to Markdown
    const markdown = htmlToMarkdown(contentHtml, pageInfo.title);

    return {
        title: pageInfo.title,
        url: pageInfo.url,
        content: markdown
    };
}

function htmlToMarkdown(html, title) {
    if (!html) return '';

    let md = html;

    // Remove script and style tags
    md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

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

    // Convert links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Convert emphasis
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

    // Convert paragraphs
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

    // Convert line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Convert tables (basic)
    md = md.replace(/<table[^>]*>/gi, '\n');
    md = md.replace(/<\/table>/gi, '\n');
    md = md.replace(/<tr[^>]*>/gi, '| ');
    md = md.replace(/<\/tr>/gi, ' |\n');
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

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, '\n\n');
    md = md.trim();

    return md;
}

function compileDocument(allContent) {
    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> Generated on ${new Date().toISOString().split('T')[0]}`,
        `> Source: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/`,
        '',
        '---',
        '',
        '## Table of Contents',
        ''
    ];

    // Generate TOC
    allContent.forEach((page, index) => {
        const anchor = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        lines.push(`${index + 1}. [${page.title}](#${anchor})`);
    });

    lines.push('');
    lines.push('---');
    lines.push('');

    // Add each page's content
    allContent.forEach((page, index) => {
        lines.push(`## ${page.title}`);
        lines.push('');
        lines.push(`> Source: ${page.url}`);
        lines.push('');
        lines.push(page.content);
        lines.push('');
        lines.push('---');
        lines.push('');
    });

    return lines.join('\n');
}

// Run the scraper
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
