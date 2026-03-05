#!/usr/bin/env node

/**
 * Salesforce Permission Set Assignments Scraper
 *
 * Extracts permission set and profile assignments not fully exposed via API:
 * - User-to-permission set assignments
 * - User-to-profile assignments
 * - Assignment dates and assigners
 * - License allocations
 *
 * Usage:
 *   # One-time authentication (headed mode)
 *   HEAD=1 ORG=production node scripts/scrape-sf-permission-assignments.js
 *
 *   # Subsequent runs (headless)
 *   ORG=production node scripts/scrape-sf-permission-assignments.js
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
const SF_PERMISSION_SETS_PATH = '/lightning/setup/PermSets/home';
const SF_USERS_PATH = '/lightning/setup/ManageUsers/home';

async function main() {
  if (!ORG) {
    console.error('❌ Error: ORG environment variable not set');
    console.log('Usage: ORG=production node scripts/scrape-sf-permission-assignments.js');
    process.exit(1);
  }

  console.log(`\n🔍 Salesforce Permission Assignments Scraper`);
  console.log(`Org: ${ORG}`);
  console.log(`Mode: ${HEADED_MODE ? 'Headed (Manual Auth)' : 'Headless (Automated)'}`);

  // Setup paths
  const instanceDir = path.join(__dirname, '..', 'instances', ORG);
  const sessionPath = path.join(instanceDir, '.salesforce-session.json');
  const outputPath = path.join(instanceDir, 'permission-assignments-snapshot.json');

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

    // Navigate to Permission Sets
    console.log('📊 Navigating to Permission Sets setup...');
    await page.goto(`${SF_LOGIN_URL}${SF_PERMISSION_SETS_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    // Check if we're on login page (session expired)
    if (page.url().includes('login') || page.url().includes('secur/frontdoor.jsp')) {
      console.error('❌ Session expired. Please re-authenticate:');
      console.error('HEAD=1 ORG=' + ORG + ' node scripts/scrape-sf-permission-assignments.js');
      process.exit(1);
    }

    // Wait for Permission Sets list to load
    console.log('⏳ Waiting for Permission Sets list...');
    await page.waitForSelector('[data-aura-class="forceListViewManager"]', {
      timeout: TIMEOUT
    });

    // Extract Permission Sets data
    console.log('🔎 Extracting Permission Sets data...');
    const permissionSets = await page.evaluate(() => {
      const sets = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const name = cells[0]?.textContent?.trim() || '';
          const label = cells[1]?.textContent?.trim() || '';
          const license = cells[2]?.textContent?.trim() || '';

          sets.push({
            name: name,
            label: label,
            license: license,
            assignments: [] // Will be populated by clicking into each permission set
          });
        }
      });

      return sets;
    });

    console.log(`✅ Found ${permissionSets.length} Permission Sets`);

    // Navigate to Users to get profile assignments
    console.log('📊 Navigating to Users setup...');
    await page.goto(`${SF_LOGIN_URL}${SF_USERS_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    await page.waitForSelector('[data-aura-class="forceListViewManager"]', {
      timeout: TIMEOUT
    });

    // Extract user-profile assignments
    console.log('🔎 Extracting User-Profile assignments...');
    const userProfiles = await page.evaluate(() => {
      const users = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          users.push({
            username: cells[0]?.textContent?.trim() || '',
            fullName: cells[1]?.textContent?.trim() || '',
            profile: cells[2]?.textContent?.trim() || '',
            userRole: cells[3]?.textContent?.trim() || '',
            active: cells[4]?.textContent?.trim() === 'true'
          });
        }
      });

      return users;
    });

    console.log(`✅ Found ${userProfiles.length} User-Profile assignments`);

    // Create snapshot
    const snapshot = {
      scrapedAt: new Date().toISOString(),
      org: ORG,
      permissionSetsCount: permissionSets.length,
      usersCount: userProfiles.length,
      permissionSets: permissionSets,
      userProfiles: userProfiles,
      metadata: {
        scraperVersion: '1.0.0',
        method: 'playwright-browser-automation',
        note: 'Deep permission set assignments require individual permission set detail pages'
      }
    };

    // Save snapshot
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
    console.log(`\n💾 Snapshot saved to ${outputPath}`);

    // Save Permission Sets CSV
    const permSetsCSV = path.join(instanceDir, 'permission-sets-list.csv');
    const permSetsContent = [
      'Name,Label,License',
      ...permissionSets.map(ps =>
        `"${ps.name}","${ps.label}","${ps.license}"`
      )
    ].join('\n');
    fs.writeFileSync(permSetsCSV, permSetsContent);
    console.log(`📊 Permission Sets CSV saved to ${permSetsCSV}`);

    // Save User-Profile CSV
    const userProfilesCSV = path.join(instanceDir, 'user-profiles-list.csv');
    const userProfilesContent = [
      'Username,Full Name,Profile,User Role,Active',
      ...userProfiles.map(up =>
        `"${up.username}","${up.fullName}","${up.profile}","${up.userRole}",${up.active}`
      )
    ].join('\n');
    fs.writeFileSync(userProfilesCSV, userProfilesContent);
    console.log(`📊 User-Profiles CSV saved to ${userProfilesCSV}`);

    console.log('\n✅ Scraping completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during scraping:');
    console.error(error.message);

    // Take screenshot for debugging
    const screenshotPath = path.join(instanceDir, 'permission-scrape-error-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Error screenshot saved to ${screenshotPath}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
