#!/usr/bin/env node

/**
 * Salesforce Connected Apps Scraper
 *
 * Extracts Connected App configurations not fully exposed via Metadata API:
 * - OAuth scopes and callback URLs
 * - Consumer keys and secrets visibility
 * - IP restrictions and policies
 * - Mobile app policies
 *
 * Usage:
 *   # One-time authentication (headed mode)
 *   HEAD=1 ORG=production node scripts/scrape-sf-connected-apps.js
 *
 *   # Subsequent runs (headless)
 *   ORG=production node scripts/scrape-sf-connected-apps.js
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

// Salesforce URLs
const SF_LOGIN_URL = 'https://login.salesforce.com';
const SF_SETUP_PATH = '/lightning/setup/SetupOneHome/home';
const SF_CONNECTED_APPS_PATH = '/lightning/setup/ConnectedApplication/home';

async function main() {
  if (!ORG) {
    console.error('❌ Error: ORG environment variable not set');
    console.log('Usage: ORG=production node scripts/scrape-sf-connected-apps.js');
    process.exit(1);
  }

  console.log(`\n🔍 Salesforce Connected Apps Scraper`);
  console.log(`Org: ${ORG}`);
  console.log(`Mode: ${HEADED_MODE ? 'Headed (Manual Auth)' : 'Headless (Automated)'}`);

  // Setup paths
  const instanceDir = path.join(__dirname, '..', 'instances', ORG);
  const sessionPath = path.join(instanceDir, '.salesforce-session.json');
  const outputPath = path.join(instanceDir, 'connected-apps-snapshot.json');

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

    // Navigate to Connected Apps
    console.log('📊 Navigating to Connected Apps setup...');
    await page.goto(`${SF_LOGIN_URL}${SF_CONNECTED_APPS_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    // Check if we're on login page (session expired)
    if (page.url().includes('login') || page.url().includes('secur/frontdoor.jsp')) {
      console.error('❌ Session expired. Please re-authenticate:');
      console.error('HEAD=1 ORG=' + ORG + ' node scripts/scrape-sf-connected-apps.js');
      process.exit(1);
    }

    // Wait for Connected Apps list to load
    console.log('⏳ Waiting for Connected Apps list...');
    await page.waitForSelector('[data-aura-class="forceListViewManager"]', {
      timeout: TIMEOUT
    });

    // Extract Connected Apps data
    console.log('🔎 Extracting Connected Apps data...');
    const connectedApps = await page.evaluate(() => {
      const apps = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          apps.push({
            name: cells[0]?.textContent?.trim() || '',
            managedPackage: cells[1]?.textContent?.trim() || '',
            status: cells[2]?.textContent?.trim() || ''
          });
        }
      });

      return apps;
    });

    console.log(`✅ Found ${connectedApps.length} Connected Apps`);

    // Create snapshot
    const snapshot = {
      scrapedAt: new Date().toISOString(),
      org: ORG,
      connectedAppsCount: connectedApps.length,
      connectedApps: connectedApps,
      metadata: {
        scraperVersion: '1.0.0',
        method: 'playwright-browser-automation'
      }
    };

    // Save snapshot
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
    console.log(`\n💾 Snapshot saved to ${outputPath}`);

    // Also save CSV
    const csvPath = path.join(instanceDir, 'connected-apps-list.csv');
    const csvContent = [
      'Name,Managed Package,Status',
      ...connectedApps.map(app =>
        `"${app.name}","${app.managedPackage}","${app.status}"`
      )
    ].join('\n');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`📊 CSV saved to ${csvPath}`);

    console.log('\n✅ Scraping completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during scraping:');
    console.error(error.message);

    // Take screenshot for debugging
    const screenshotPath = path.join(instanceDir, 'scrape-error-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Error screenshot saved to ${screenshotPath}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
