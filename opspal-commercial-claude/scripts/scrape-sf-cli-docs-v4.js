/**
 * Salesforce CLI Reference Documentation Scraper v4
 *
 * Uses explicit waits and scrolling to handle the dynamic Salesforce documentation site.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

async function main() {
    console.log('='.repeat(60));
    console.log('Salesforce CLI Reference Documentation Scraper v4');
    console.log('='.repeat(60));
    console.log('');

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        javaScriptEnabled: true
    });

    const page = await context.newPage();

    try {
        // Step 1: Get all pages by navigating to the unified commands page
        console.log('STEP 1: Discovering all documentation pages');
        console.log('-'.repeat(60));

        const startUrls = [
            `${BASE_URL}/cli_reference_unified.htm`,
            `${BASE_URL}/cli_reference_top.htm`
        ];

        const allPages = new Map();

        for (const url of startUrls) {
            console.log(`\nNavigating to: ${url}`);
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });

            // Wait for the page to fully render
            console.log('Waiting for content to load...');
            await page.waitForTimeout(8000);

            // Scroll to trigger lazy loading
            await autoScroll(page);

            // Debug: check what's on the page
            const pageTitle = await page.title();
            console.log(`Page title: ${pageTitle}`);

            // Get page HTML for debugging
            const htmlLength = await page.evaluate(() => document.body.innerHTML.length);
            console.log(`Page HTML length: ${htmlLength}`);

            // Take screenshot
            await page.screenshot({
                path: path.join(OUTPUT_DIR, `debug-${path.basename(url, '.htm')}.png`),
                fullPage: true
            });

            // Try multiple methods to find links
            const foundLinks = await page.evaluate(() => {
                const results = [];
                const seen = new Set();

                // Method 1: All anchor tags
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href;
                    const text = (a.textContent || a.innerText || '').trim();
                    if (href && href.includes('sfdx_cli_reference') && href.endsWith('.htm') && text && !seen.has(href)) {
                        seen.add(href);
                        results.push({ title: text, url: href, method: 'anchor' });
                    }
                });

                // Method 2: Elements with onclick/href attributes
                document.querySelectorAll('[onclick*="sfdx_cli_reference"], [data-href*="sfdx_cli_reference"]').forEach(el => {
                    const href = el.getAttribute('onclick') || el.getAttribute('data-href') || '';
                    const text = (el.textContent || el.innerText || '').trim();
                    const match = href.match(/(sfdx_cli_reference[^'"]+\.htm)/);
                    if (match && text && !seen.has(match[1])) {
                        seen.add(match[1]);
                        results.push({ title: text, url: match[1], method: 'attribute' });
                    }
                });

                return results;
            });

            console.log(`Found ${foundLinks.length} links on this page`);
            foundLinks.forEach(link => allPages.set(link.url, link));
        }

        // If we still don't have enough pages, try scraping the TOC API directly
        if (allPages.size < 10) {
            console.log('\nAttempting to discover pages from sitemap/TOC...');
            const additionalPages = await discoverFromSiteMap(page);
            additionalPages.forEach(link => allPages.set(link.url, link));
        }

        // Convert to array
        const pageList = Array.from(allPages.values());
        console.log(`\nTotal unique pages discovered: ${pageList.length}`);

        // Save page list
        fs.writeFileSync(
            path.join(OUTPUT_DIR, 'discovered-pages.json'),
            JSON.stringify(pageList, null, 2)
        );

        if (pageList.length === 0) {
            console.log('\nNo pages found. Creating manual page list based on known structure...');
            const manualPages = await createManualPageList();
            pageList.push(...manualPages);
        }

        // Step 2: Scrape each page
        console.log('\n' + '='.repeat(60));
        console.log('STEP 2: Scraping page content');
        console.log('-'.repeat(60));

        const allContent = [];

        for (let i = 0; i < pageList.length; i++) {
            const pageInfo = pageList[i];
            const progress = `[${(i + 1).toString().padStart(3)}/${pageList.length}]`;
            process.stdout.write(`${progress} ${pageInfo.title.substring(0, 45).padEnd(45)} `);

            try {
                const content = await scrapePage(page, pageInfo);
                if (content && content.content.length > 100) {
                    allContent.push(content);
                    console.log('✓');
                } else {
                    console.log('⚠ (minimal content)');
                }
            } catch (err) {
                console.log(`✗ ${err.message.substring(0, 30)}`);
            }

            await page.waitForTimeout(500);
        }

        console.log(`\nSuccessfully scraped ${allContent.length} pages with content`);

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

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 500;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight || totalHeight > 10000) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    resolve();
                }
            }, 100);
        });
    });
}

async function discoverFromSiteMap(page) {
    const pages = [];

    // Try to fetch the TOC data directly
    try {
        // Salesforce docs often have a JSON-based TOC
        const tocUrl = 'https://developer.salesforce.com/docs/get_document/atlas.en-us.sfdx_cli_reference.meta';
        await page.goto(tocUrl, { timeout: 30000 });
        const content = await page.content();

        // Check if we got JSON
        if (content.includes('{') && content.includes('toc')) {
            const jsonMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[1]);
                // Extract pages from TOC structure
                if (data.toc) {
                    extractPagesFromToc(data.toc, pages);
                }
            }
        }
    } catch (e) {
        console.log(`  TOC fetch failed: ${e.message.substring(0, 50)}`);
    }

    return pages;
}

function extractPagesFromToc(tocNode, pages, baseUrl = BASE_URL) {
    if (Array.isArray(tocNode)) {
        tocNode.forEach(item => extractPagesFromToc(item, pages, baseUrl));
    } else if (tocNode && typeof tocNode === 'object') {
        if (tocNode.a_attr && tocNode.a_attr.href) {
            pages.push({
                title: tocNode.text || 'Untitled',
                url: tocNode.a_attr.href.startsWith('http') ? tocNode.a_attr.href : `${baseUrl}/${tocNode.a_attr.href}`
            });
        }
        if (tocNode.children) {
            extractPagesFromToc(tocNode.children, pages, baseUrl);
        }
    }
}

async function createManualPageList() {
    // Based on known Salesforce CLI structure, create a list of likely pages
    const commands = [
        // Top-level pages
        { title: 'CLI Reference Overview', url: `${BASE_URL}/cli_reference_top.htm` },
        { title: 'sf Commands', url: `${BASE_URL}/cli_reference_unified.htm` },
        { title: 'Migration Guide', url: `${BASE_URL}/cli_reference_migrate.htm` },
        { title: 'Release Notes', url: `${BASE_URL}/cli_reference_release_notes.htm` },
        { title: 'Deprecation Policy', url: `${BASE_URL}/sfdx_dev_cli_deprecation.htm` },

        // Major sf command groups (based on typical CLI structure)
        { title: 'sf alias', url: `${BASE_URL}/cli_reference_alias_commands_unified.htm` },
        { title: 'sf apex', url: `${BASE_URL}/cli_reference_apex_commands_unified.htm` },
        { title: 'sf auth', url: `${BASE_URL}/cli_reference_auth_commands_unified.htm` },
        { title: 'sf config', url: `${BASE_URL}/cli_reference_config_commands_unified.htm` },
        { title: 'sf data', url: `${BASE_URL}/cli_reference_data_commands_unified.htm` },
        { title: 'sf deploy', url: `${BASE_URL}/cli_reference_deploy_commands_unified.htm` },
        { title: 'sf env', url: `${BASE_URL}/cli_reference_env_commands_unified.htm` },
        { title: 'sf force', url: `${BASE_URL}/cli_reference_force_commands_unified.htm` },
        { title: 'sf org', url: `${BASE_URL}/cli_reference_org_commands_unified.htm` },
        { title: 'sf package', url: `${BASE_URL}/cli_reference_package_commands_unified.htm` },
        { title: 'sf plugins', url: `${BASE_URL}/cli_reference_plugins_commands_unified.htm` },
        { title: 'sf project', url: `${BASE_URL}/cli_reference_project_commands_unified.htm` },
        { title: 'sf retrieve', url: `${BASE_URL}/cli_reference_retrieve_commands_unified.htm` },
        { title: 'sf schema', url: `${BASE_URL}/cli_reference_schema_commands_unified.htm` },
        { title: 'sf sobject', url: `${BASE_URL}/cli_reference_sobject_commands_unified.htm` },
        { title: 'sf static-resource', url: `${BASE_URL}/cli_reference_staticresource_commands_unified.htm` },
        { title: 'sf update', url: `${BASE_URL}/cli_reference_update_commands_unified.htm` },
        { title: 'sf version', url: `${BASE_URL}/cli_reference_version_commands_unified.htm` },
        { title: 'sf which', url: `${BASE_URL}/cli_reference_which_commands_unified.htm` },

        // Migration related
        { title: 'Source/MDAPI Migration', url: `${BASE_URL}/cli_reference_mig_deploy_retrieve.htm` },
        { title: 'Org Commands Migration', url: `${BASE_URL}/cli_reference_mig_org.htm` },
        { title: 'Bulk Data Migration', url: `${BASE_URL}/cli_reference_mig_bulk_data.htm` },
        { title: 'Environment Config Migration', url: `${BASE_URL}/cli_reference_mig_env_config.htm` },
        { title: 'sfdx to sf Mapping', url: `${BASE_URL}/cli_reference_old_new_command_mapping.htm` },
        { title: 'sf to sfdx Mapping', url: `${BASE_URL}/cli_reference_new_old_command_mapping.htm` }
    ];

    return commands;
}

async function scrapePage(page, pageInfo) {
    await page.goto(pageInfo.url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
    });

    // Wait for dynamic content
    await page.waitForTimeout(3000);

    // Scroll to load lazy content
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(500);

    // Extract content
    const extracted = await page.evaluate(() => {
        // Clone body and clean it
        const body = document.body.cloneNode(true);

        // Remove navigation, headers, footers, sidebars
        const removeSelectors = [
            'nav', 'header', 'footer', 'aside',
            '.navigation', '.sidebar', '.toc', '.feedback',
            '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
            'script', 'style', 'noscript', 'iframe',
            '[class*="cookie"]', '[class*="banner"]', '[class*="popup"]'
        ];

        removeSelectors.forEach(sel => {
            try {
                body.querySelectorAll(sel).forEach(el => el.remove());
            } catch (e) { }
        });

        // Get the main content
        const mainContent = body.querySelector('main, article, .doc-content, .content') || body;

        // Extract title
        const title = document.querySelector('h1')?.innerText ||
            document.querySelector('title')?.innerText?.split('|')[0]?.trim() ||
            '';

        // Get all text content with structure preserved
        const html = mainContent.innerHTML;

        return { title: title.trim(), html };
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

    // Remove scripts, styles, comments
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

    // Convert code
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Convert lists
    md = md.replace(/<[ou]l[^>]*>/gi, '\n');
    md = md.replace(/<\/[ou]l>/gi, '\n');
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

    // Convert tables (basic)
    md = md.replace(/<table[^>]*>/gi, '\n');
    md = md.replace(/<\/table>/gi, '\n');
    md = md.replace(/<thead[^>]*>[\s\S]*?<\/thead>/gi, '');
    md = md.replace(/<tbody[^>]*>/gi, '');
    md = md.replace(/<\/tbody>/gi, '');
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
    md = md.replace(/&hellip;/g, '...');

    // Clean up whitespace
    md = md.replace(/\n{4,}/g, '\n\n\n');
    md = md.replace(/[ \t]+$/gm, '');
    md = md.replace(/^\s+|\s+$/g, '');

    return md;
}

function compileDocument(allContent) {
    // Sort content
    allContent.sort((a, b) => {
        // Overview first
        if (a.title.includes('Overview') || a.title.includes('Reference')) return -1;
        if (b.title.includes('Overview') || b.title.includes('Reference')) return 1;
        // sf commands alphabetically
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

    // Generate TOC
    allContent.forEach((page, idx) => {
        const anchor = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 60);
        lines.push(`${idx + 1}. [${page.title}](#${anchor})`);
    });

    lines.push('');
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
