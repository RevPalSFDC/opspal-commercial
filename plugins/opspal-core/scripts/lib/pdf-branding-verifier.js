#!/usr/bin/env node

/**
 * PDF Branding Verifier
 *
 * Verifies that PDF styling consistently applies RevPal brand colors,
 * typography, and CSS variables. Prevents styling inconsistencies by
 * validating CSS content before PDF generation.
 *
 * @module pdf-branding-verifier
 * @version 1.0.0
 * @created 2026-01-26
 * @reflection 85e4af9e - beta-corp P2 tool-contract issue
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * RevPal Brand Colors
 * @constant
 */
const BRAND_COLORS = {
  grape: '#5F3B8C',
  apricot: '#E99560',
  indigo: '#3E4A61',
  sand: '#EAE4DC',
  green: '#6FBF73'
};

/**
 * Required CSS Variables for branding
 * @constant
 */
const REQUIRED_CSS_VARIABLES = [
  '--brand-grape',
  '--brand-apricot',
  '--brand-indigo',
  '--brand-sand',
  '--brand-green'
];

/**
 * Required typography settings
 * @constant
 */
const REQUIRED_TYPOGRAPHY = {
  headingFont: 'Montserrat',
  bodyFont: 'Figtree'
};

const DISALLOWED_GRADIENT_PATTERN = /\b(?:linear|radial|conic)-gradient\s*\(/gi;

/**
 * Verify that CSS content contains RevPal brand colors
 *
 * @param {string} cssContent - CSS content to verify
 * @returns {Object} Verification result with found colors
 *
 * @example
 * const result = verifyBrandColors(cssContent);
 * if (!result.complete) {
 *   console.warn('Missing colors:', result.missing);
 * }
 */
function verifyBrandColors(cssContent) {
  const normalizedCSS = cssContent.toLowerCase();
  const found = {};
  const missing = [];

  for (const [name, hex] of Object.entries(BRAND_COLORS)) {
    const hexLower = hex.toLowerCase();
    const isPresent = normalizedCSS.includes(hexLower);
    found[name] = isPresent;
    if (!isPresent) {
      missing.push({ name, hex });
    }
  }

  return {
    complete: missing.length === 0,
    found,
    missing,
    presentCount: Object.values(found).filter(Boolean).length,
    totalCount: Object.keys(BRAND_COLORS).length
  };
}

/**
 * Verify that CSS content contains required CSS variables
 *
 * @param {string} cssContent - CSS content to verify
 * @returns {Object} Verification result with found variables
 */
function verifyCSSVariables(cssContent) {
  const found = {};
  const missing = [];

  for (const variable of REQUIRED_CSS_VARIABLES) {
    const isPresent = cssContent.includes(variable);
    found[variable] = isPresent;
    if (!isPresent) {
      missing.push(variable);
    }
  }

  return {
    complete: missing.length === 0,
    found,
    missing,
    presentCount: Object.values(found).filter(Boolean).length,
    totalCount: REQUIRED_CSS_VARIABLES.length
  };
}

/**
 * Verify that CSS content includes required typography
 *
 * @param {string} cssContent - CSS content to verify
 * @returns {Object} Verification result with font status
 */
function verifyTypography(cssContent) {
  const headingFontPresent = cssContent.includes(REQUIRED_TYPOGRAPHY.headingFont);
  const bodyFontPresent = cssContent.includes(REQUIRED_TYPOGRAPHY.bodyFont);
  const missing = [];

  if (!headingFontPresent) {
    missing.push({ type: 'heading', font: REQUIRED_TYPOGRAPHY.headingFont });
  }
  if (!bodyFontPresent) {
    missing.push({ type: 'body', font: REQUIRED_TYPOGRAPHY.bodyFont });
  }

  return {
    complete: missing.length === 0,
    headingFont: headingFontPresent,
    bodyFont: bodyFontPresent,
    missing
  };
}

/**
 * Verify that CSS content does not contain disallowed gradients
 *
 * @param {string} cssContent - CSS content to verify
 * @returns {Object} Verification result with gradient status
 */
function verifyNoDisallowedGradients(cssContent) {
  const matches = cssContent.match(DISALLOWED_GRADIENT_PATTERN) || [];

  return {
    complete: matches.length === 0,
    count: matches.length
  };
}

/**
 * Verify CSS file for brand compliance
 *
 * @param {string} cssPath - Path to CSS file
 * @returns {Promise<Object>} Complete verification result
 */
async function verifyCSSFile(cssPath) {
  let cssContent;
  try {
    cssContent = await fs.readFile(cssPath, 'utf8');
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read CSS file: ${error.message}`,
      path: cssPath
    };
  }

  return verifyBranding(cssContent, cssPath);
}

/**
 * Comprehensive branding verification
 *
 * @param {string} cssContent - CSS content to verify
 * @param {string} [source] - Source path for reporting
 * @returns {Object} Complete verification result
 */
function verifyBranding(cssContent, source = 'inline') {
  const colors = verifyBrandColors(cssContent);
  const variables = verifyCSSVariables(cssContent);
  const typography = verifyTypography(cssContent);
  const gradients = verifyNoDisallowedGradients(cssContent);

  const issues = [];

  if (!colors.complete) {
    issues.push({
      type: 'colors',
      severity: 'warning',
      message: `Missing brand colors: ${colors.missing.map(c => c.name).join(', ')}`,
      details: colors.missing
    });
  }

  if (!variables.complete) {
    issues.push({
      type: 'variables',
      severity: 'warning',
      message: `Missing CSS variables: ${variables.missing.join(', ')}`,
      details: variables.missing
    });
  }

  if (!typography.complete) {
    issues.push({
      type: 'typography',
      severity: 'info',
      message: `Missing typography: ${typography.missing.map(t => t.font).join(', ')}`,
      details: typography.missing
    });
  }

  if (!gradients.complete) {
    issues.push({
      type: 'gradients',
      severity: 'error',
      message: `Disallowed gradient usage detected (${gradients.count} occurrence(s)). Use solid brand colors from the brand gallery.`,
      details: { count: gradients.count }
    });
  }

  const valid = issues.filter(i => i.severity === 'error').length === 0;
  const complete = issues.length === 0;

  return {
    valid,
    complete,
    source,
    colors,
    variables,
    typography,
    gradients,
    issues,
    score: calculateBrandingScore(colors, variables, typography),
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate branding compliance score (0-100)
 * @private
 */
function calculateBrandingScore(colors, variables, typography) {
  const colorScore = (colors.presentCount / colors.totalCount) * 40;
  const variableScore = (variables.presentCount / variables.totalCount) * 40;
  const typographyScore = (typography.headingFont ? 10 : 0) + (typography.bodyFont ? 10 : 0);

  return Math.round(colorScore + variableScore + typographyScore);
}

/**
 * Generate CSS snippet to fix missing branding
 *
 * @param {Object} verificationResult - Result from verifyBranding
 * @returns {string} CSS snippet to add
 */
function generateFixSnippet(verificationResult) {
  const lines = [];

  if (!verificationResult.variables.complete) {
    lines.push(':root {');
    for (const variable of verificationResult.variables.missing) {
      const colorName = variable.replace('--brand-', '');
      const colorValue = BRAND_COLORS[colorName];
      if (colorValue) {
        lines.push(`  ${variable}: ${colorValue};`);
      }
    }
    lines.push('}');
    lines.push('');
  }

  if (!verificationResult.typography.complete) {
    if (!verificationResult.typography.headingFont) {
      lines.push(`/* Add to @import: https://fonts.googleapis.com/css2?family=${REQUIRED_TYPOGRAPHY.headingFont}:wght@400;500;600;700&display=swap */`);
      lines.push(`h1, h2, h3, h4, h5, h6 { font-family: '${REQUIRED_TYPOGRAPHY.headingFont}', sans-serif; }`);
    }
    if (!verificationResult.typography.bodyFont) {
      lines.push(`/* Add to @import: https://fonts.googleapis.com/css2?family=${REQUIRED_TYPOGRAPHY.bodyFont}:wght@400;500;600&display=swap */`);
      lines.push(`body { font-family: '${REQUIRED_TYPOGRAPHY.bodyFont}', sans-serif; }`);
    }
  }

  return lines.join('\n');
}

/**
 * Log verification results with formatting
 *
 * @param {Object} result - Verification result
 * @param {Object} [options] - Logging options
 * @param {boolean} [options.verbose] - Show detailed output
 */
function logVerification(result, options = {}) {
  const { verbose = false } = options;

  if (result.complete) {
    console.log('✅ Brand verification passed');
    console.log(`   Score: ${result.score}/100`);
    return;
  }

  console.log(`⚠️ Brand verification incomplete (Score: ${result.score}/100)`);

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '❌' :
        issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} ${issue.message}`);
    }
  }

  if (verbose) {
    console.log('\nDetailed Status:');
    console.log(`  Colors: ${result.colors.presentCount}/${result.colors.totalCount}`);
    console.log(`  Variables: ${result.variables.presentCount}/${result.variables.totalCount}`);
    console.log(`  Typography: ${result.typography.headingFont ? '✓' : '✗'} heading, ${result.typography.bodyFont ? '✓' : '✗'} body`);

    const fix = generateFixSnippet(result);
    if (fix) {
      console.log('\nSuggested CSS to add:');
      console.log('─'.repeat(40));
      console.log(fix);
      console.log('─'.repeat(40));
    }
  }
}

/**
 * Create a verification hook for use in PDF generation
 *
 * @param {Object} [options] - Hook options
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {boolean} [options.strict] - Throw on incomplete branding
 * @returns {Function} Hook function
 */
function createVerificationHook(options = {}) {
  const { verbose = false, strict = false } = options;

  return async function verifyBrandingHook(cssContent, context = {}) {
    const result = verifyBranding(cssContent, context.source || 'hook');

    if (verbose) {
      logVerification(result, { verbose: true });
    } else if (!result.complete) {
      const missingColors = result.colors.missing.map(c => c.name);
      if (missingColors.length > 0) {
        console.warn(`⚠️ Brand colors missing: ${missingColors.join(', ')}`);
      }
    }

    if (strict && !result.complete) {
      throw new Error(`Brand verification failed: ${result.issues.map(i => i.message).join('; ')}`);
    }

    return result;
  };
}

// Export all functions
module.exports = {
  // Core verification
  verifyBrandColors,
  verifyCSSVariables,
  verifyTypography,
  verifyNoDisallowedGradients,
  verifyBranding,
  verifyCSSFile,

  // Utilities
  generateFixSnippet,
  logVerification,
  createVerificationHook,

  // Constants
  BRAND_COLORS,
  REQUIRED_CSS_VARIABLES,
  REQUIRED_TYPOGRAPHY
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node pdf-branding-verifier.js <css-file> [--verbose] [--fix]');
    console.log('');
    console.log('Options:');
    console.log('  --verbose    Show detailed output and fix suggestions');
    console.log('  --fix        Output CSS snippet to fix issues');
    console.log('  --json       Output results as JSON');
    console.log('');
    console.log('Examples:');
    console.log('  node pdf-branding-verifier.js ./styles.css');
    console.log('  node pdf-branding-verifier.js ./styles.css --verbose --fix');
    process.exit(1);
  }

  const cssPath = args[0];
  const verbose = args.includes('--verbose');
  const showFix = args.includes('--fix');
  const jsonOutput = args.includes('--json');

  (async () => {
    try {
      const result = await verifyCSSFile(cssPath);

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Verifying: ${cssPath}`);
        console.log('');
        logVerification(result, { verbose });

        if (showFix && !result.complete) {
          const fix = generateFixSnippet(result);
          if (fix) {
            console.log('\n=== CSS Fix Snippet ===');
            console.log(fix);
          }
        }
      }

      process.exit(result.complete ? 0 : 1);

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
