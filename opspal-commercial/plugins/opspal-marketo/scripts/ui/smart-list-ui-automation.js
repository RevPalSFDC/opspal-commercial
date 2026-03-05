/**
 * Smart List UI Automation (Playwright)
 *
 * Headful-safe Playwright runner for last-resort Smart List edits.
 * Requires explicit --confirm to run.
 *
 * @example
 * node smart-list-ui-automation.js --config ./smart-list-ui-config.json --confirm
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
  createCheckpointPlan,
  isDestructiveAction,
  requiresManualIntervention,
  verifyIdentity
} = require('../../../opspal-core/scripts/lib/playwright-checkpoint-helper');

const ALLOWED_ACTION_TYPES = new Set(['click', 'fill', 'select', 'waitFor', 'pause', 'press']);

function getArgValue(flag) {
  const entry = process.argv.find(arg => arg.startsWith(`${flag}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadConfig() {
  const configPath = getArgValue('--config');
  if (!configPath) {
    throw new Error('Missing --config path');
  }

  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function getCredentials(config) {
  const email = config.login?.email || process.env.MARKETO_UI_EMAIL;
  const password = config.login?.password || process.env.MARKETO_UI_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing login credentials (config.login or MARKETO_UI_EMAIL/MARKETO_UI_PASSWORD).');
  }

  return { email, password };
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function assertActionsAllowed(actions) {
  const disallowed = actions.filter(action => !ALLOWED_ACTION_TYPES.has(action.type));
  if (disallowed.length > 0) {
    const types = disallowed.map(action => action.type).join(', ');
    throw new Error(`Unsupported action type(s): ${types}. Allowed: ${Array.from(ALLOWED_ACTION_TYPES).join(', ')}`);
  }
}

function assertDestructiveApproval(actions, options = {}) {
  const destructiveActions = actions.filter(action => isDestructiveAction(action));
  if (destructiveActions.length === 0) {
    return;
  }

  const hasApproval = options.confirmDestructive || options.allowDestructive;
  if (!hasApproval) {
    throw new Error(
      `Destructive actions detected (${destructiveActions.length}) but no approval was provided. ` +
      'Pass --confirm-destructive or set allowDestructive=true in config.'
    );
  }
}

async function captureIdentityContext(page) {
  const title = await page.title();
  const url = page.url();
  const bodyText = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    return String(text || '').slice(0, 5000);
  });

  return { title, url, snapshotText: bodyText };
}

async function run() {
  const config = loadConfig();
  const confirmed = hasFlag('--confirm');
  const confirmDestructive = hasFlag('--confirm-destructive');
  const dryRun = hasFlag('--dry-run');

  if (!confirmed) {
    throw new Error('Refusing to run without --confirm (safety guard).');
  }

  if (!config.campaignUrl) {
    throw new Error('Missing campaignUrl in config.');
  }

  if (!Array.isArray(config.actions) || config.actions.length === 0) {
    throw new Error('Config must include at least one action.');
  }

  assertActionsAllowed(config.actions);
  assertDestructiveApproval(config.actions, {
    confirmDestructive,
    allowDestructive: Boolean(config.allowDestructive)
  });

  const outputDir = config.outputDir || path.join('tmp', 'marketo-ui-automation');
  await ensureDir(outputDir);

  const evidenceBundle = {
    startedAt: new Date().toISOString(),
    campaignUrl: config.campaignUrl,
    outputDir,
    dryRun,
    steps: [],
    checkpoints: createCheckpointPlan(config.actions),
    status: 'running'
  };

  const { email, password } = getCredentials(config);
  const headless = Boolean(config.headless);
  const slowMo = config.slowMoMs || 0;
  const navigationTimeout = config.timeouts?.navigationMs || 60000;
  const selectorTimeout = config.timeouts?.selectorMs || 20000;

  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.setDefaultTimeout(selectorTimeout);

  try {
    await page.goto(config.login?.url || config.baseUrl, { timeout: navigationTimeout });

    const selectors = config.login?.selectors || {
      email: 'input[type="email"]',
      password: 'input[type="password"]',
      submit: 'button[type="submit"]'
    };

    await page.fill(selectors.email, email);
    await page.fill(selectors.password, password);
    await page.click(selectors.submit);

    if (config.login?.mfaPause) {
      await page.waitForTimeout(config.login?.mfaWaitMs || 30000);
    }

    const postLoginContext = await captureIdentityContext(page);
    if (requiresManualIntervention(postLoginContext)) {
      throw new Error('Manual intervention required (login/CAPTCHA/MFA challenge detected).');
    }

    await page.goto(config.campaignUrl, { timeout: navigationTimeout });

    const identityContext = await captureIdentityContext(page);
    if (config.expectedIdentity) {
      const identityResult = verifyIdentity(
        { account: config.expectedIdentity },
        {
          account: `${identityContext.title} ${identityContext.url}`,
          snapshotText: identityContext.snapshotText
        }
      );

      if (!identityResult.passed) {
        throw new Error(`Target identity verification failed. ${identityResult.reason}`);
      }

      evidenceBundle.identityVerification = {
        expected: config.expectedIdentity,
        observedTitle: identityContext.title,
        observedUrl: identityContext.url,
        passed: identityResult.passed
      };
    }

    if (dryRun) {
      evidenceBundle.status = 'dry_run';
      evidenceBundle.completedAt = new Date().toISOString();
      const evidencePath = path.join(outputDir, 'smart-list-ui-evidence.json');
      fs.writeFileSync(evidencePath, JSON.stringify(evidenceBundle, null, 2));
      console.log('[DRY RUN] Actions validated but not executed.');
      return;
    }

    for (let idx = 0; idx < config.actions.length; idx += 1) {
      const action = config.actions[idx];
      const stepNumber = idx + 1;

      const stepEvidence = {
        step: stepNumber,
        action,
        startedAt: new Date().toISOString(),
        destructive: isDestructiveAction(action)
      };

      if (config.captureStepScreenshots) {
        const prePath = path.join(outputDir, `step-${stepNumber}-pre.png`);
        await page.screenshot({ path: prePath, fullPage: true });
        stepEvidence.preScreenshot = prePath;
      }

      switch (action.type) {
        case 'click':
          await page.click(action.selector);
          break;
        case 'fill':
          await page.fill(action.selector, action.value || '');
          break;
        case 'select':
          await page.selectOption(action.selector, action.value);
          break;
        case 'waitFor':
          await page.waitForSelector(action.selector);
          break;
        case 'pause':
          await page.waitForTimeout(action.ms || 1000);
          break;
        case 'press':
          await page.press(action.selector, action.key || 'Enter');
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      if (action.verifyText) {
        await page.getByText(action.verifyText).first().waitFor({ timeout: action.verifyTimeoutMs || 10000 });
        stepEvidence.verifyText = action.verifyText;
      }

      if (config.captureStepScreenshots) {
        const postPath = path.join(outputDir, `step-${stepNumber}-post.png`);
        await page.screenshot({ path: postPath, fullPage: true });
        stepEvidence.postScreenshot = postPath;
      }

      stepEvidence.completedAt = new Date().toISOString();
      evidenceBundle.steps.push(stepEvidence);
    }

    if (config.captureScreenshot) {
      const shotPath = path.join(outputDir, 'smart-list-ui-final.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      evidenceBundle.finalScreenshot = shotPath;
    }

    evidenceBundle.status = 'success';
    evidenceBundle.completedAt = new Date().toISOString();
    const evidencePath = path.join(outputDir, 'smart-list-ui-evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidenceBundle, null, 2));
  } catch (error) {
    evidenceBundle.status = 'failed';
    evidenceBundle.error = {
      message: error.message,
      stack: error.stack
    };
    evidenceBundle.completedAt = new Date().toISOString();

    try {
      const errorShotPath = path.join(outputDir, 'smart-list-ui-error.png');
      await page.screenshot({ path: errorShotPath, fullPage: true });
      evidenceBundle.errorScreenshot = errorShotPath;
    } catch {
      // Ignore screenshot errors during failure handling.
    }

    const evidencePath = path.join(outputDir, 'smart-list-ui-evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidenceBundle, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(`UI automation failed: ${err.message}`);
  process.exit(1);
});
