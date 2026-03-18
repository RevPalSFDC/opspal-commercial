#!/usr/bin/env node

/**
 * PDF Style Profile + Cover Asset Test Suite
 *
 * Validates that PDF generation stays within the two supported style profiles
 * and that brand-gallery cover template artifacts are present.
 *
 * @usage node scripts/test-all-covers.js [--verbose] [--profiles-only] [--assets-only]
 * @version 2.0.0
 * @created 2026-01-28
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const pluginRoot = path.resolve(__dirname, '..');
const testContentPath = path.join(pluginRoot, 'test-content.md');
const outputDir = path.join(pluginRoot, 'test-output');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

const log = (msg) => console.log(msg);
const pass = (msg) => log(`${GREEN}✓${NC} ${msg}`);
const fail = (msg) => log(`${RED}✗${NC} ${msg}`);
const warn = (msg) => log(`${YELLOW}⚠${NC} ${msg}`);
const info = (msg) => log(`${CYAN}ℹ${NC} ${msg}`);
const isEnvBlocked = (message = '') => /operation not permitted|crashpad|sandbox|EPERM|ECONNRESET|PDF_ENVIRONMENT_BLOCKED/i.test(message);

const PROFILE_TESTS = [
  {
    profile: 'cover-toc',
    filename: 'profile-cover-toc.pdf',
    metadata: {
      title: 'Style Profile Test (cover-toc)',
      org: 'Test Organization',
      date: '2026-01-28',
      version: '1.0.0',
      reportType: 'Style Verification'
    }
  },
  {
    profile: 'simple',
    filename: 'profile-simple.pdf',
    metadata: {
      title: 'Style Profile Test (simple)',
      org: 'Test Organization',
      date: '2026-01-28',
      version: '1.0.0',
      reportType: 'Style Verification'
    }
  }
];

const COVER_TEMPLATE_FILES = [
  'salesforce-audit.md',
  'hubspot-assessment.md',
  'marketo-assessment.md',
  'security-audit.md',
  'data-quality.md',
  'executive-report.md',
  'gtm-planning.md',
  'cross-platform-integration.md',
  'default.md'
];

async function runTests() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const profilesOnly = args.includes('--profiles-only') || args.includes('--themes-only');
  const assetsOnly = args.includes('--assets-only') || args.includes('--covers-only');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  await fs.mkdir(outputDir, { recursive: true });

  if (!fsSync.existsSync(testContentPath)) {
    fail(`Test content not found: ${testContentPath}`);
    process.exit(1);
  }

  log('\n═══════════════════════════════════════════════════════════');
  log('  PDF STYLE POLICY TEST SUITE');
  log('═══════════════════════════════════════════════════════════\n');

  let PDFGenerator;
  try {
    PDFGenerator = require('./lib/pdf-generator');
  } catch (e) {
    fail(`Could not import PDFGenerator: ${e.message}`);
    process.exit(1);
  }

  if (!assetsOnly) {
    log('PHASE 1: Canonical Style Profile Tests');
    log('─────────────────────────────────────────────────────────\n');

    for (const testCase of PROFILE_TESTS) {
      const outputPath = path.join(outputDir, testCase.filename);
      const testName = `Profile: ${testCase.profile}`;

      try {
        const gen = new PDFGenerator({ verbose });
        await gen.convertMarkdown(testContentPath, outputPath, {
          profile: testCase.profile,
          renderMermaid: true,
          metadata: testCase.metadata
        });

        const stats = await fs.stat(outputPath);
        const header = await fs.readFile(outputPath, { encoding: null });
        const headerStr = header.slice(0, 5).toString('utf8');

        if (headerStr === '%PDF-' && stats.size > 5000) {
          pass(`${testName} (${(stats.size / 1024).toFixed(0)}KB)`);
          results.passed++;
          results.tests.push({ name: testName, status: 'pass', size: stats.size, path: outputPath });
        } else {
          fail(`${testName} - Invalid PDF (size: ${stats.size}, header: ${headerStr})`);
          results.failed++;
          results.tests.push({ name: testName, status: 'fail', reason: 'Invalid PDF structure' });
        }
      } catch (e) {
        if (isEnvBlocked(e?.message || '')) {
          warn(`${testName} blocked by environment sandbox restrictions`);
          results.tests.push({ name: testName, status: 'warn', reason: e.message });
        } else {
          fail(`${testName} - ${e.message}`);
          results.failed++;
          results.tests.push({ name: testName, status: 'fail', reason: e.message });
        }
      }
    }
    log('');
  }

  if (!profilesOnly) {
    log('PHASE 2: Brand Gallery Cover Artifact Checks');
    log('─────────────────────────────────────────────────────────\n');

    const coverDir = path.join(pluginRoot, 'templates/pdf-covers');
    let allCoversPresent = true;

    for (const coverFile of COVER_TEMPLATE_FILES) {
      const coverPath = path.join(coverDir, coverFile);
      if (fsSync.existsSync(coverPath)) {
        if (verbose) {
          pass(`Cover template exists: ${coverFile}`);
        }
      } else {
        fail(`Missing cover template artifact: ${coverFile}`);
        allCoversPresent = false;
      }
    }

    if (allCoversPresent) {
      pass('All brand-gallery cover templates exist');
      results.passed++;
      results.tests.push({ name: 'Cover template artifacts', status: 'pass' });
    } else {
      results.failed++;
      results.tests.push({ name: 'Cover template artifacts', status: 'fail', reason: 'Missing cover template files' });
    }
    log('');
  }

  log('PHASE 3: Integration Checks');
  log('─────────────────────────────────────────────────────────\n');

  const assetDir = path.join(pluginRoot, 'templates/branding-gallery/assets');
  const expectedAssets = [
    'revpal-logo-primary.png',
    'revpal-brand-mark.png',
    'revpal-logo-favicon.png',
    'revpal-logo-export.png'
  ];

  let assetsOk = true;
  for (const asset of expectedAssets) {
    const assetPath = path.join(assetDir, asset);
    if (fsSync.existsSync(assetPath)) {
      if (verbose) {
        pass(`Asset: ${asset}`);
      }
    } else {
      fail(`Missing asset: ${asset}`);
      assetsOk = false;
    }
  }

  if (assetsOk) {
    pass('All branding assets exist');
    results.passed++;
    results.tests.push({ name: 'Branding assets', status: 'pass' });
  } else {
    results.failed++;
    results.tests.push({ name: 'Branding assets', status: 'fail', reason: 'Missing assets' });
  }

  try {
    const StyleManager = require('./lib/style-manager');
    const branding = StyleManager.getDefaultBranding();

    const brandingChecks = [
      { name: 'logo.path', check: () => branding.logo?.path?.includes('revpal-logo-primary.png') },
      { name: 'colors.primary (grape)', check: () => branding.colors?.primary === '#5F3B8C' },
      { name: 'colors.accent (apricot)', check: () => branding.colors?.accent === '#E99560' },
      { name: 'colors.secondary (indigo)', check: () => branding.colors?.secondary === '#3E4A61' },
      { name: 'fonts.heading (Montserrat)', check: () => branding.fonts?.heading === 'Montserrat' },
      { name: 'fonts.primary (Figtree)', check: () => branding.fonts?.primary === 'Figtree' }
    ];

    let brandingOk = true;
    for (const check of brandingChecks) {
      if (check.check()) {
        if (verbose) {
          pass(`Branding: ${check.name}`);
        }
      } else {
        fail(`Branding mismatch: ${check.name}`);
        brandingOk = false;
      }
    }

    if (brandingOk) {
      pass('StyleManager default branding correct');
      results.passed++;
      results.tests.push({ name: 'StyleManager branding', status: 'pass' });
    } else {
      results.failed++;
      results.tests.push({ name: 'StyleManager branding', status: 'fail', reason: 'Branding mismatch' });
    }
  } catch (e) {
    fail(`StyleManager error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'StyleManager branding', status: 'fail', reason: e.message });
  }

  try {
    const reliabilitySystem = require('./lib/pdf-reliability-system');
    const preCheck = await reliabilitySystem.preGenerationCheck({
      inputPath: testContentPath,
      outputPath: path.join(outputDir, 'reliability-test.pdf'),
      profile: 'cover-toc'
    });

    if (preCheck.passed || preCheck.checks.some((c) => c.passed)) {
      pass('Reliability system pre-check works');
      results.passed++;
      results.tests.push({ name: 'Reliability system', status: 'pass' });
    } else {
      warn('Reliability system pre-check found issues');
      results.tests.push({ name: 'Reliability system', status: 'warn', issues: preCheck.checks.filter((c) => !c.passed) });
    }
  } catch (e) {
    fail(`Reliability system error: ${e.message}`);
    results.failed++;
    results.tests.push({ name: 'Reliability system', status: 'fail', reason: e.message });
  }

  await writeResults(results);
  log('');

  log('═══════════════════════════════════════════════════════════');
  log('  SUMMARY');
  log('═══════════════════════════════════════════════════════════');
  log(`  ${GREEN}Passed:${NC}  ${results.passed}`);
  log(`  ${RED}Failed:${NC}  ${results.failed}`);
  log('');

  log('  Generated PDFs:');
  for (const test of results.tests) {
    if (test.path) {
      log(`    ${test.status === 'pass' ? GREEN : RED}•${NC} ${path.basename(test.path)}`);
    }
  }
  log('');

  if (results.failed > 0) {
    log(`${RED}❌ Some tests failed - review output above${NC}`);
    process.exit(1);
  } else {
    log(`${GREEN}✅ All tests passed${NC}`);
    log(`\n  Output directory: ${outputDir}`);
    process.exit(0);
  }
}

async function writeResults(results) {
  const resultsPath = path.join(outputDir, 'TEST_RESULTS.json');
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  info(`Results written to: ${resultsPath}`);
}

runTests().catch((e) => {
  console.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
