/**
 * Salesforce CLI Reference Documentation Scraper - Final Version
 *
 * Deduplicates URLs and focuses on extracting visible text content
 * from unique base pages efficiently.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference';
const OUTPUT_DIR = path.join(__dirname, '../docs/sf-cli-reference');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'SALESFORCE_CLI_REFERENCE.md');

async function main() {
    console.log('Salesforce CLI Reference Scraper - Final Version\n');

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load and deduplicate pages
    const discoveredFile = path.join(OUTPUT_DIR, 'discovered-pages.json');
    let pages = [];

    if (fs.existsSync(discoveredFile)) {
        const raw = JSON.parse(fs.readFileSync(discoveredFile, 'utf8'));
        // Deduplicate by base URL (remove anchors)
        const seen = new Map();
        raw.forEach(p => {
            const baseUrl = p.url.split('#')[0];
            if (!seen.has(baseUrl)) {
                seen.set(baseUrl, { title: p.title, url: baseUrl, commands: [p.title] });
            } else {
                seen.get(baseUrl).commands.push(p.title);
            }
        });
        pages = Array.from(seen.values());
        console.log(`Loaded ${raw.length} pages, deduplicated to ${pages.length} unique URLs\n`);
    } else {
        console.log('Using built-in page list\n');
        pages = getBuiltInPages();
    }

    // Save deduplicated list
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'unique-pages.json'),
        JSON.stringify(pages, null, 2)
    );

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();
    const allContent = [];

    console.log('Scraping pages...\n');

    for (let i = 0; i < pages.length; i++) {
        const pageInfo = pages[i];
        process.stdout.write(`[${(i + 1).toString().padStart(2)}/${pages.length}] ${pageInfo.title.substring(0, 50).padEnd(50)} `);

        try {
            const content = await scrapePage(page, pageInfo.url);
            if (content.length > 300) {
                allContent.push({
                    title: pageInfo.title,
                    commands: pageInfo.commands,
                    url: pageInfo.url,
                    content
                });
                console.log(`✓ (${content.length} chars)`);
            } else {
                console.log('⚠');
            }
        } catch (err) {
            console.log(`✗ ${err.message.substring(0, 25)}`);
        }

        await page.waitForTimeout(1000);
    }

    await browser.close();

    console.log(`\nScraped ${allContent.length} pages with content`);

    // Compile document
    const doc = compileDoc(allContent);
    fs.writeFileSync(OUTPUT_FILE, doc);

    console.log(`\nSaved to: ${OUTPUT_FILE}`);
    console.log(`File size: ${Math.round(fs.statSync(OUTPUT_FILE).size / 1024)} KB`);
}

async function scrapePage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000); // Wait for JS to render

    // Scroll to trigger lazy loading
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 3);
    });
    await page.waitForTimeout(1000);

    // Extract all visible text
    const text = await page.evaluate(() => {
        // Remove unwanted elements
        const remove = ['nav', 'header', 'footer', 'script', 'style', 'noscript', '[class*="nav"]', '[class*="footer"]', '[class*="header"]', '[class*="cookie"]'];
        const body = document.body.cloneNode(true);
        remove.forEach(sel => {
            try { body.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) { }
        });

        // Get structured content
        const parts = [];

        // Get main heading
        const h1 = document.querySelector('h1');
        if (h1) parts.push('# ' + h1.innerText.trim());

        // Get all content sections
        body.querySelectorAll('h2, h3, h4, p, pre, ul, ol, dl, table').forEach(el => {
            const tag = el.tagName.toLowerCase();
            const text = el.innerText?.trim();
            if (!text || text.length < 3) return;

            switch (tag) {
                case 'h2': parts.push('\n## ' + text); break;
                case 'h3': parts.push('\n### ' + text); break;
                case 'h4': parts.push('\n#### ' + text); break;
                case 'p': parts.push(text); break;
                case 'pre': parts.push('\n```\n' + text + '\n```'); break;
                case 'ul':
                case 'ol':
                    el.querySelectorAll('li').forEach(li => {
                        const liText = li.innerText?.trim();
                        if (liText) parts.push('- ' + liText);
                    });
                    break;
                case 'dl':
                    el.querySelectorAll('dt').forEach(dt => {
                        const dtText = dt.innerText?.trim();
                        if (dtText) parts.push('\n**' + dtText + '**');
                    });
                    el.querySelectorAll('dd').forEach(dd => {
                        const ddText = dd.innerText?.trim();
                        if (ddText) parts.push(ddText);
                    });
                    break;
                case 'table':
                    const rows = [];
                    el.querySelectorAll('tr').forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll('td, th'))
                            .map(c => c.innerText?.trim() || '')
                            .filter(t => t.length > 0);
                        if (cells.length) rows.push('| ' + cells.join(' | ') + ' |');
                    });
                    if (rows.length) parts.push('\n' + rows.join('\n'));
                    break;
            }
        });

        return parts.join('\n\n').trim();
    });

    // Clean the text
    let cleaned = text
        .replace(/DID THIS ARTICLE SOLVE YOUR ISSUE[\s\S]*?Share your feedback/gi, '')
        .replace(/Let us know so we can improve[^\n]*/gi, '')
        .replace(/Cookie\s*Preferences/gi, '')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();

    return cleaned;
}

function getBuiltInPages() {
    return [
        { title: 'Salesforce CLI Command Reference', url: `${BASE_URL}/cli_reference_top.htm`, commands: ['Overview'] },
        { title: 'sf Commands', url: `${BASE_URL}/cli_reference_unified.htm`, commands: ['sf'] },
        { title: 'Release Notes', url: `${BASE_URL}/cli_reference_release_notes.htm`, commands: ['Release Notes'] },
        { title: 'CLI Deprecation Policy', url: `${BASE_URL}/sfdx_dev_cli_deprecation.htm`, commands: ['Deprecation'] },
        { title: 'Migration Guide', url: `${BASE_URL}/cli_reference_migrate.htm`, commands: ['Migration'] },
        { title: 'sfdx to sf Mapping', url: `${BASE_URL}/cli_reference_old_new_command_mapping.htm`, commands: ['Mapping'] },
        { title: 'agent Commands', url: `${BASE_URL}/cli_reference_agent_commands_unified.htm`, commands: ['agent'] },
        { title: 'alias Commands', url: `${BASE_URL}/cli_reference_alias_commands_unified.htm`, commands: ['alias'] },
        { title: 'apex Commands', url: `${BASE_URL}/cli_reference_apex_commands_unified.htm`, commands: ['apex'] },
        { title: 'config Commands', url: `${BASE_URL}/cli_reference_config_commands_unified.htm`, commands: ['config'] },
        { title: 'data Commands', url: `${BASE_URL}/cli_reference_data_commands_unified.htm`, commands: ['data'] },
        { title: 'org Commands', url: `${BASE_URL}/cli_reference_org_commands_unified.htm`, commands: ['org'] },
        { title: 'package Commands', url: `${BASE_URL}/cli_reference_package_commands_unified.htm`, commands: ['package'] },
        { title: 'project Commands', url: `${BASE_URL}/cli_reference_project_commands_unified.htm`, commands: ['project'] },
        { title: 'schema Commands', url: `${BASE_URL}/cli_reference_schema_commands_unified.htm`, commands: ['schema'] },
        { title: 'sobject Commands', url: `${BASE_URL}/cli_reference_sobject_commands_unified.htm`, commands: ['sobject'] },
        { title: 'lightning Commands', url: `${BASE_URL}/cli_reference_lightning_commands_unified.htm`, commands: ['lightning'] },
        { title: 'flow Commands', url: `${BASE_URL}/cli_reference_flow_commands_unified.htm`, commands: ['flow'] },
        { title: 'community Commands', url: `${BASE_URL}/cli_reference_community_commands_unified.htm`, commands: ['community'] },
        { title: 'plugins Commands', url: `${BASE_URL}/cli_reference_plugins_commands_unified.htm`, commands: ['plugins'] },
        { title: 'force Commands', url: `${BASE_URL}/cli_reference_force_commands_unified.htm`, commands: ['force'] }
    ];
}

function compileDoc(allContent) {
    const lines = [
        '# Salesforce CLI Reference Documentation',
        '',
        `> **Generated:** ${new Date().toISOString()}`,
        `> **Source:** https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/`,
        `> **Total Sections:** ${allContent.length}`,
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
        lines.push(`> Source: ${item.url}`);
        if (item.commands && item.commands.length > 1) {
            lines.push(`> Commands: ${item.commands.join(', ')}`);
        }
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
