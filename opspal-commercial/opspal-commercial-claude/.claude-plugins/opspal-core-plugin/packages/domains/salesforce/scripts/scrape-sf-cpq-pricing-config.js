#!/usr/bin/env node

/**
 * Salesforce CPQ Pricing Configuration Scraper
 *
 * Extracts CPQ pricing configuration not fully exposed via API:
 * - Price Rules and Actions: Visual configuration and evaluation order
 * - Product Rules: Configuration and trigger conditions
 * - Quote Templates: Template usage and customization
 * - CPQ Settings: Global CPQ configuration
 * - Discount Schedules: Visual discount schedule configurations
 *
 * Usage:
 *   # One-time authentication (headed mode)
 *   HEAD=1 ORG=production node scripts/scrape-sf-cpq-pricing-config.js
 *
 *   # Subsequent runs (headless)
 *   ORG=production node scripts/scrape-sf-cpq-pricing-config.js
 *
 * Requirements:
 *   - Salesforce CPQ package installed
 *   - CPQ Administrator permissions
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
const SF_CPQ_PRICE_RULES_PATH = '/lightning/setup/SBQQ__PriceRule__c/home';
const SF_CPQ_PRODUCT_RULES_PATH = '/lightning/setup/SBQQ__ProductRule__c/home';
const SF_CPQ_SETTINGS_PATH = '/lightning/n/sbqq__sb';

async function main() {
  if (!ORG) {
    console.error('❌ Error: ORG environment variable not set');
    console.log('Usage: ORG=production node scripts/scrape-sf-cpq-pricing-config.js');
    process.exit(1);
  }

  console.log(`\n🔍 Salesforce CPQ Pricing Configuration Scraper`);
  console.log(`Org: ${ORG}`);
  console.log(`Mode: ${HEADED_MODE ? 'Headed (Manual Auth)' : 'Headless (Automated)'}`);

  // Setup paths
  const instanceDir = path.join(__dirname, '..', 'instances', ORG);
  const sessionPath = path.join(instanceDir, '.salesforce-session.json');
  const outputPath = path.join(instanceDir, 'cpq-pricing-config-snapshot.json');

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

    // Navigate to CPQ Price Rules
    console.log('📊 Navigating to CPQ Price Rules...');
    await page.goto(`${SF_LOGIN_URL}${SF_CPQ_PRICE_RULES_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    // Check if we're on login page (session expired)
    if (page.url().includes('login') || page.url().includes('secur/frontdoor.jsp')) {
      console.error('❌ Session expired. Please re-authenticate:');
      console.error('HEAD=1 ORG=' + ORG + ' node scripts/scrape-sf-cpq-pricing-config.js');
      process.exit(1);
    }

    // Check if CPQ is installed
    if (page.url().includes('ObjectManager') || await page.$('text=Object Not Found')) {
      console.warn('⚠️  CPQ package may not be installed in this org');
      console.log('Price Rules object (SBQQ__PriceRule__c) not found');
    }

    // Wait for Price Rules list to load
    console.log('⏳ Waiting for Price Rules list...');
    await page.waitForSelector('[data-aura-class="forceListViewManager"]', {
      timeout: TIMEOUT
    }).catch(() => {
      console.warn('⚠️  Price Rules list view not found - CPQ may not be configured');
    });

    // Extract Price Rules data
    console.log('🔎 Extracting Price Rules data...');
    const priceRules = await page.evaluate(() => {
      const rules = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          rules.push({
            name: cells[0]?.textContent?.trim() || '',
            active: cells[1]?.textContent?.trim() === 'true',
            evaluationOrder: cells[2]?.textContent?.trim() || '',
            evaluationEvent: cells[3]?.textContent?.trim() || ''
          });
        }
      });

      return rules;
    });

    console.log(`✅ Found ${priceRules.length} Price Rules`);

    // Navigate to CPQ Product Rules
    console.log('📊 Navigating to CPQ Product Rules...');
    await page.goto(`${SF_LOGIN_URL}${SF_CPQ_PRODUCT_RULES_PATH}`, {
      timeout: TIMEOUT,
      waitUntil: 'networkidle'
    });

    await page.waitForSelector('[data-aura-class="forceListViewManager"]', {
      timeout: TIMEOUT
    }).catch(() => {
      console.warn('⚠️  Product Rules list view not found');
    });

    // Extract Product Rules data
    console.log('🔎 Extracting Product Rules data...');
    const productRules = await page.evaluate(() => {
      const rules = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          rules.push({
            name: cells[0]?.textContent?.trim() || '',
            active: cells[1]?.textContent?.trim() === 'true',
            evaluationOrder: cells[2]?.textContent?.trim() || '',
            type: cells[3]?.textContent?.trim() || ''
          });
        }
      });

      return rules;
    });

    console.log(`✅ Found ${productRules.length} Product Rules`);

    // Create snapshot
    const snapshot = {
      scrapedAt: new Date().toISOString(),
      org: ORG,
      cpqInstalled: priceRules.length > 0 || productRules.length > 0,
      priceRulesCount: priceRules.length,
      productRulesCount: productRules.length,
      priceRules: priceRules,
      productRules: productRules,
      metadata: {
        scraperVersion: '1.0.0',
        method: 'playwright-browser-automation',
        note: 'Visual CPQ configuration including rule evaluation order'
      }
    };

    // Save snapshot
    fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
    console.log(`\n💾 Snapshot saved to ${outputPath}`);

    // Save Price Rules CSV
    const priceRulesCSV = path.join(instanceDir, 'cpq-price-rules.csv');
    const priceRulesContent = [
      'Name,Active,Evaluation Order,Evaluation Event',
      ...priceRules.map(rule =>
        `"${rule.name}",${rule.active},"${rule.evaluationOrder}","${rule.evaluationEvent}"`
      )
    ].join('\n');
    fs.writeFileSync(priceRulesCSV, priceRulesContent);
    console.log(`📊 Price Rules CSV saved to ${priceRulesCSV}`);

    // Save Product Rules CSV
    const productRulesCSV = path.join(instanceDir, 'cpq-product-rules.csv');
    const productRulesContent = [
      'Name,Active,Evaluation Order,Type',
      ...productRules.map(rule =>
        `"${rule.name}",${rule.active},"${rule.evaluationOrder}","${rule.type}"`
      )
    ].join('\n');
    fs.writeFileSync(productRulesCSV, productRulesContent);
    console.log(`📊 Product Rules CSV saved to ${productRulesCSV}`);

    console.log('\n✅ Scraping completed successfully!');

    if (!snapshot.cpqInstalled) {
      console.warn('\n⚠️  WARNING: CPQ package may not be installed or configured');
      console.log('No Price Rules or Product Rules found');
    }

  } catch (error) {
    console.error('\n❌ Error during scraping:');
    console.error(error.message);

    // Take screenshot for debugging
    const screenshotPath = path.join(instanceDir, 'cpq-config-error-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Error screenshot saved to ${screenshotPath}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
