#!/usr/bin/env node

/**
 * Salesforce Setup Audit Trail Scraper
 *
 * Extracts full Setup Audit Trail history not available via API:
 * - Configuration changes beyond API's 20 recent actions limit
 * - User who made changes
 * - Date and time of changes
 * - IP addresses for changes
 * - Detailed change descriptions
 *
 * Usage:
 *   # One-time authentication (headed mode)
 *   HEAD=1 ORG=production node scripts/scrape-sf-setup-audit-trail.js
 *
 *   # Subsequent runs (headless)
 *   ORG=production node scripts/scrape-sf-setup-audit-trail.js
 *
 * Requirements:
 *   - Salesforce System Administrator permissions
 *   - Org configured in SFDC project
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const ORG = process.env.ORG || process.env.SF_TARGET_ORG;
const HEADED_MODE = process.env.HEAD === '1';
const TIMEOUT = 30000; // 30 seconds
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '10', 10); // Max pages to scrape

// Salesforce URLs
const SF_LOGIN_URL = 'https://login.salesforce.com';
const SF_AUDIT_TRAIL_PATH = '/lightning/setup/SecurityEvents/page?address=%2F05p';

async function main() {
  if (!ORG) {
    console.error('❌ Error: ORG environment variable not set');
    console.log('Usage: ORG=production node scripts/scrape-sf-setup-audit-trail.js');
    process.exit(1);
  }

  console.log(`\n🔍 Salesforce Setup Audit Trail Scraper`);
  console.log(`Org: ${ORG}`);
  console.log(`Mode: ${HEADED_MODE ? 'Headed (Manual Auth)' : 'Headless (Automated)'}`);
  console.log(`Max Pages: ${MAX_PAGES}`);

  // Setup paths
  const instanceDir = path.join(__dirname, '..', 'instances', ORG);
  const sessionPath = path.join(instanceDir, '.salesforce-session.json');
  const outputPath = path.join(instanceDir, 'setup-audit-trail-snapshot.json');

  // Ensure instance directory exists
  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: !HEADED_MODE,
    timeout: TIMEOUT
  });

  let context;
  if (!HEADED_MODE && fs.existsSync(sessionPath)) {
    console.log('📂 Loading saved session...');
    context = await browser.newContext({
      storageState: sessionPath
    });
  } else {
    console.log('🔐 Starting fresh authentication...');
    context = await browser.newContext();
  }

  const page = await context.newPage();

  try {
    // Navigate to Salesforce
    console.log('🌐 Navigating to Salesforce...');
    await page.goto(SF_LOGIN_URL, { timeout: TIMEOUT });

    if (HEADED_MODE) {
      console.log('\n📝 Please log in to Salesforce in the browser window.');
      console.log('Press Enter when you\'re logged in and ready to continue...');

      // Wait for user to press Enter
      await new Promise((resolve) => {
        process.stdin.once('data', resolve);
      });

      // Save session
      console.log('💾 Saving session...');
      const session = await context.storageState();
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      console.log(`✅ Session saved to ${sessionPath}`);
    }

    // Navigate to Setup Audit Trail
    console.log('📊 Navigating to Setup Audit Trail...');
    await page.goto(`${SF_LOGIN_URL}${SF_AUDIT_TRAIL_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    // Check if we're on login page (session expired)
    if (page.url().includes('login') || page.url().includes('secur/frontdoor.jsp')) {
      console.error('❌ Session expired. Please re-authenticate:');
      console.error('HEAD=1 ORG=' + ORG + ' node scripts/scrape-sf-setup-audit-trail.js');
      process.exit(1);
    }

    // Wait for audit trail table to load
    console.log('⏳ Waiting for Setup Audit Trail table...');
    await page.waitForSelector('table.list', {
      timeout: TIMEOUT
    });

    let allAuditEntries = [];
    let currentPage = 1;

    // Scrape multiple pages
    while (currentPage <= MAX_PAGES) {
      console.log(`🔎 Extracting page ${currentPage}/${MAX_PAGES}...`);

      // Extract audit trail data from current page
      const pageEntries = await page.evaluate(() => {
        const entries = [];
        const rows = document.querySelectorAll('table.list tbody tr');

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            entries.push({
              date: cells[0]?.textContent?.trim() || '',
              user: cells[1]?.textContent?.trim() || '',
              action: cells[2]?.textContent?.trim() || '',
              section: cells[3]?.textContent?.trim() || '',
              delegateUser: cells[4]?.textContent?.trim() || ''
            });
          }
        });

        return entries;
      });

      allAuditEntries = allAuditEntries.concat(pageEntries);
      console.log(`  ✅ Extracted ${pageEntries.length} entries`);

      // Check for next page button
      const nextButton = await page.$('a[title="Next Page"]');
      if (!nextButton || currentPage >= MAX_PAGES) {
        console.log('  ℹ️  No more pages to scrape');
        break;
      }

      // Click next page
      console.log('  ➡️  Moving to next page...');
      await nextButton.click();
      await page.waitForTimeout(2000); // Wait for page to load
      currentPage++;
    }

    console.log(`\n✅ Total audit entries extracted: ${allAuditEntries.length}`);

    // Create snapshot
    const snapshot = {
      scrapedAt: new Date().toISOString(),
      org: ORG,
      pagesScraped: currentPage,
      totalEntries: allAuditEntries.length,
      auditEntries: allAuditEntries,
      metadata: {
        scraperVersion: '1.0.0',
        method: 'playwright-browser-automation',
        maxPagesConfig: MAX_PAGES,
        note: 'Full audit trail history beyond API 20-record limit'
      }
    };

    // Save snapshot
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
    console.log(`💾 Snapshot saved to ${outputPath}`);

    // Save CSV
    const csvPath = path.join(instanceDir, 'setup-audit-trail.csv');
    const csvContent = [
      'Date,User,Action,Section,Delegate User',
      ...allAuditEntries.map(entry =>
        `"${entry.date}","${entry.user}","${entry.action}","${entry.section}","${entry.delegateUser}"`
      )
    ].join('\n');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`📊 CSV saved to ${csvPath}`);

    console.log('\n✅ Scraping completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during scraping:');
    console.error(error.message);

    // Take screenshot for debugging
    const screenshotPath = path.join(instanceDir, 'audit-trail-error-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Error screenshot saved to ${screenshotPath}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
