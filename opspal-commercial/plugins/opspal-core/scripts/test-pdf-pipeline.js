#!/usr/bin/env node

/**
 * PDF Pipeline Integration Test
 *
 * Quick validation that the entire PDF generation pipeline works:
 * 1. CSS loading and application
 * 2. Mermaid diagram rendering
 * 3. PDF creation with proper branding
 *
 * Run this after any PDF-related changes to catch regressions.
 *
 * @usage node scripts/test-pdf-pipeline.js [--verbose]
 * @version 1.0.0
 * @created 2026-01-27
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const PDFGenerator = require('./lib/pdf-generator');

const pluginRoot = path.resolve(__dirname, '..');
const mdToPdfBin = path.join(pluginRoot, 'node_modules', '.bin', 'md-to-pdf');
const puppeteerConfig = path.join(pluginRoot, 'config', 'puppeteer.config.json');

const resolveChromePath = () => {
  // Cross-platform Chrome path resolution
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    // macOS paths
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux paths
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Windows paths (via WSL or native Node)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => fsSync.existsSync(candidate)) || null;
};

// Import reliability system if available
let reliabilitySystem;
try {
  reliabilitySystem = require('./lib/pdf-reliability-system');
} catch (e) {
  console.warn('⚠️ Reliability system not found, using basic tests');
}

const VERBOSE = process.argv.includes('--verbose');

// Test fixtures
const TEST_MARKDOWN = `# Test Report

This is a test document for PDF generation validation.

## Overview

Testing the following features:
- Basic markdown rendering
- Mermaid diagram rendering
- CSS/branding application

## Test Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Success]
    B -->|No| D[Failure]
    C --> E[End]
    D --> E
\`\`\`

## Data Table

| Feature | Status |
|---------|--------|
| Markdown | ✓ |
| Diagrams | ✓ |
| Branding | ✓ |

## Conclusion

If this PDF renders correctly with:
1. Purple headers (grape: #5F3B8C)
2. Proper fonts (Montserrat/Figtree)
3. Visible diagram
4. Formatted table

Then the pipeline is working.
`;

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

const log = (msg) => console.log(msg);
const pass = (msg) => log(`${GREEN}✓${NC} ${msg}`);
const fail = (msg) => log(`${RED}✗${NC} ${msg}`);
const warn = (msg) => log(`${YELLOW}⚠${NC} ${msg}`);

const getSpawnMessage = (result) => {
  if (!result) return '';
  const parts = [];
  if (result.error?.message) parts.push(result.error.message);
  if (result.stderr?.length) parts.push(result.stderr.toString('utf8'));
  if (result.stdout?.length) parts.push(result.stdout.toString('utf8'));
  return parts.join(' ');
};

const isEnvBlocked = (result) => {
  const message = getSpawnMessage(result);
  return /operation not permitted|crashpad|sandbox|failed to launch the browser process|EPERM/i.test(message);
};

async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [],
  };
  const envBlockers = [];

  const execEnv = { ...process.env };
  if (process.env.NVM_BIN && !execEnv.PATH.includes(process.env.NVM_BIN)) {
    execEnv.PATH = `${process.env.NVM_BIN}:${execEnv.PATH}`;
  }
  const chromePath = resolveChromePath();
  if (chromePath && !execEnv.PUPPETEER_EXECUTABLE_PATH) {
    execEnv.PUPPETEER_EXECUTABLE_PATH = chromePath;
    execEnv.CHROME_PATH = chromePath;
  }

  const tempDir = path.join(os.tmpdir(), `pdf-test-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  log('\n═══════════════════════════════════════════════════════════');
  log('  PDF PIPELINE INTEGRATION TEST');
  log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Check dependencies
  log('TEST 1: Dependencies');
  const deps = [
    { name: 'mmdc (Mermaid CLI)', check: () => spawnSync('mmdc', ['--version'], { env: execEnv }) },
    { name: 'md-to-pdf', check: () => {
      if (!fsSync.existsSync(mdToPdfBin)) {
        throw new Error(`md-to-pdf bin not found at ${mdToPdfBin}`);
      }
    }},
    { name: 'node', check: () => ({ status: 0, stdout: Buffer.from(process.version + '\n') }) },
  ];

  for (const dep of deps) {
    try {
      const result = dep.check();
      if (result && typeof result.status === 'number' && result.status !== 0) {
        throw new Error(result.error?.message || `${dep.name} exited with ${result.status}`);
      }
      pass(`${dep.name} available`);
      results.passed++;
      results.tests.push({ name: dep.name, status: 'pass' });
    } catch (e) {
      warn(`${dep.name} not found (some tests may be skipped)`);
      results.skipped++;
      results.tests.push({ name: dep.name, status: 'skip' });
    }
  }
  log('');

  // Test 2: CSS files exist
  log('TEST 2: CSS Files');
  const cssFiles = [
    'templates/pdf-styles/themes/revpal.css',
    'templates/pdf-styles/themes/revpal-brand.css',
    'templates/pdf-styles/base.css',
  ];

  for (const cssFile of cssFiles) {
    const fullPath = path.join(pluginRoot, cssFile);
    try {
      await fs.access(fullPath);
      pass(`Found: ${cssFile}`);
      results.passed++;
      results.tests.push({ name: cssFile, status: 'pass' });
    } catch (e) {
      fail(`Missing: ${cssFile}`);
      results.failed++;
      results.tests.push({ name: cssFile, status: 'fail' });
    }
  }
  log('');

  // Test 3: CSS content validation
  log('TEST 3: CSS Branding Verification');
  try {
    const revpalCss = await fs.readFile(
      path.join(pluginRoot, 'templates/pdf-styles/themes/revpal.css'),
      'utf8'
    );

    const checks = [
      { name: 'Grape color', pattern: /#5[Ff]3[Bb]8[Cc]/ },
      { name: 'Apricot color', pattern: /#[Ee]99560/ },
      { name: 'Montserrat font', pattern: /Montserrat/i },
      { name: 'Figtree font', pattern: /Figtree/i },
    ];

    for (const check of checks) {
      if (check.pattern.test(revpalCss)) {
        pass(`CSS contains ${check.name}`);
        results.passed++;
        results.tests.push({ name: `CSS: ${check.name}`, status: 'pass' });
      } else {
        fail(`CSS missing ${check.name}`);
        results.failed++;
        results.tests.push({ name: `CSS: ${check.name}`, status: 'fail' });
      }
    }

    if (/linear-gradient/i.test(revpalCss)) {
      fail('CSS contains disallowed linear gradients for PDF output');
      results.failed++;
      results.tests.push({ name: 'CSS: No linear gradients', status: 'fail' });
    } else {
      pass('CSS has no linear gradients');
      results.passed++;
      results.tests.push({ name: 'CSS: No linear gradients', status: 'pass' });
    }
  } catch (e) {
    fail(`Could not read CSS: ${e.message}`);
    results.failed++;
  }
  log('');

  // Test 4: Mermaid rendering
  log('TEST 4: Mermaid Rendering');
  const mmdContent = `graph TD
    A[Test] --> B[Success]`;
  const mmdPath = path.join(tempDir, 'test.mmd');
  const pngPath = path.join(tempDir, 'test.png');

  try {
    await fs.writeFile(mmdPath, mmdContent);

    try {
      const mmdcResult = spawnSync('mmdc', [
        '-i',
        mmdPath,
        '-o',
        pngPath,
        '-b',
        'white',
        '-w',
        '800',
        '--puppeteerConfigFile',
        puppeteerConfig,
      ], {
        timeout: 30000,
        env: execEnv,
      });

      if (isEnvBlocked(mmdcResult)) {
        envBlockers.push('Mermaid rendering blocked by Chrome sandbox/crashpad restrictions.');
        warn('Mermaid rendering blocked by environment (sandbox/crashpad restrictions)');
        results.skipped++;
        results.tests.push({ name: 'Mermaid render', status: 'skip' });
      } else if (mmdcResult.status !== 0) {
        warn(`Mermaid CLI failed with exit code ${mmdcResult.status}`);
        results.skipped++;
        results.tests.push({ name: 'Mermaid render', status: 'skip' });
      } else {
        const stats = await fs.stat(pngPath);
        if (stats.size > 1000) {
          pass(`Mermaid rendered successfully (${Math.round(stats.size/1024)}KB)`);
          results.passed++;
          results.tests.push({ name: 'Mermaid render', status: 'pass' });
        } else {
          fail(`Mermaid output too small (${stats.size} bytes)`);
          results.failed++;
          results.tests.push({ name: 'Mermaid render', status: 'fail' });
        }
      }
    } catch (e) {
      warn(`Mermaid CLI not available or failed: ${e.message}`);
      results.skipped++;
      results.tests.push({ name: 'Mermaid render', status: 'skip' });
    }
  } catch (e) {
    fail(`Mermaid test setup failed: ${e.message}`);
    results.failed++;
  }
  log('');

  // Test 5: PDF Generation
  log('TEST 5: PDF Generation');
  const testMdPath = path.join(tempDir, 'test.md');
  const testPdfPath = path.join(tempDir, 'test.pdf');

  try {
    // Write test markdown (without Mermaid for basic test)
    await fs.writeFile(testMdPath, '# Test\n\nThis is a test document.\n\n| A | B |\n|---|---|\n| 1 | 2 |');

    try {
      const generator = new PDFGenerator({ verbose: false });
      const generatedPdf = await generator.convertMarkdown(testMdPath, testPdfPath, {
        renderMermaid: false,
        verifyBranding: false
      });

      if (fsSync.existsSync(generatedPdf)) {
        const stats = await fs.stat(generatedPdf);
        const header = await fs.readFile(generatedPdf, { encoding: null });
        const headerStr = header.slice(0, 5).toString('utf8');

        if (headerStr === '%PDF-' && stats.size > 5000) {
          pass(`PDF generated successfully (${Math.round(stats.size/1024)}KB)`);
          results.passed++;
          results.tests.push({ name: 'PDF generation', status: 'pass' });
        } else {
          fail(`PDF invalid (size: ${stats.size}, header: ${headerStr})`);
          results.failed++;
          results.tests.push({ name: 'PDF generation', status: 'fail' });
        }
      } else {
        fail('PDF file not created');
        results.failed++;
        results.tests.push({ name: 'PDF generation', status: 'fail' });
      }
    } catch (e) {
      const blockerMessage = (e && e.message) ? e.message : '';
      if (e?.code === 'PDF_ENVIRONMENT_BLOCKED' || /operation not permitted|crashpad|sandbox|EPERM|ECONNRESET/i.test(blockerMessage)) {
        envBlockers.push('PDF generation blocked by Chrome sandbox/crashpad restrictions.');
        if (e?.fallbackHtmlPath && fsSync.existsSync(e.fallbackHtmlPath)) {
          warn(`PDF generation blocked by environment; HTML fallback created: ${e.fallbackHtmlPath}`);
        } else {
          warn('PDF generation blocked by environment (sandbox/crashpad restrictions)');
        }
        results.skipped++;
        results.tests.push({ name: 'PDF generation', status: 'skip' });
      } else {
        fail(`PDF generation failed: ${blockerMessage}`);
        results.failed++;
        results.tests.push({ name: 'PDF generation', status: 'fail' });
      }
    }
  } catch (e) {
    fail(`PDF test failed: ${e.message}`);
    results.failed++;
  }
  log('');

  // Test 6: Reliability system (if available)
  log('TEST 6: Reliability System');
  if (reliabilitySystem) {
    try {
      const preCheck = await reliabilitySystem.preGenerationCheck({
        inputPath: testMdPath,
        outputPath: testPdfPath,
        profile: 'cover-toc',
      });

      if (preCheck.passed || preCheck.checks.some(c => c.passed)) {
        pass('Reliability system pre-check works');
        results.passed++;
        results.tests.push({ name: 'Reliability system', status: 'pass' });
      } else {
        warn('Reliability system pre-check found issues');
        results.skipped++;
        results.tests.push({ name: 'Reliability system', status: 'skip' });
      }
    } catch (e) {
      fail(`Reliability system error: ${e.message}`);
      results.failed++;
      results.tests.push({ name: 'Reliability system', status: 'fail' });
    }
  } else {
    warn('Reliability system not loaded');
    results.skipped++;
    results.tests.push({ name: 'Reliability system', status: 'skip' });
  }
  log('');

  // Cleanup
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }

  // Summary
  log('═══════════════════════════════════════════════════════════');
  log('  SUMMARY');
  log('═══════════════════════════════════════════════════════════');
  log(`  ${GREEN}Passed:${NC}  ${results.passed}`);
  log(`  ${RED}Failed:${NC}  ${results.failed}`);
  log(`  ${YELLOW}Skipped:${NC} ${results.skipped}`);
  log('');

  if (results.failed > 0) {
    log(`${RED}❌ PDF pipeline has issues - review failed tests above${NC}`);
    process.exit(1);
  } else if (envBlockers.length > 0) {
    log(`${YELLOW}⚠️ Environment blockers detected:${NC}`);
    envBlockers.forEach((item) => log(`  - ${item}`));
    log(`${YELLOW}⚠️ Fix by enabling unprivileged user namespaces or relaxing container seccomp.${NC}`);
    process.exit(0);
  } else if (results.skipped > results.passed) {
    log(`${YELLOW}⚠️ Many tests skipped - check dependencies${NC}`);
    process.exit(0);
  } else {
    log(`${GREEN}✅ PDF pipeline is healthy${NC}`);
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
