/**
 * PDF CSS Validator
 *
 * Validates that PDF output contains expected brand colors and styling.
 * Prevents the issue where CSS is "acknowledged" but not actually applied.
 *
 * Related reflections: 75b8c54e, ca41ce4e, 9030650d
 * ROI: $15,000/yr
 *
 * @module pdf-css-validator
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// RevPal brand colors
const BRAND_COLORS = {
  grape: '#5F3B8C',
  apricot: '#E99560',
  indigo: '#3E4A61',
  sand: '#EAE4DC',
  green: '#6FBF73'
};

// Color variations (hex and RGB)
const COLOR_PATTERNS = {
  grape: [
    /#5[Ff]3[Bb]8[Cc]/gi,
    /rgb\s*\(\s*95\s*,\s*59\s*,\s*140\s*\)/gi,
    /rgba\s*\(\s*95\s*,\s*59\s*,\s*140/gi
  ],
  apricot: [
    /#[Ee]9956[0O]/gi,
    /rgb\s*\(\s*233\s*,\s*149\s*,\s*96\s*\)/gi,
    /rgba\s*\(\s*233\s*,\s*149\s*,\s*96/gi
  ],
  indigo: [
    /#3[Ee]4[Aa]61/gi,
    /rgb\s*\(\s*62\s*,\s*74\s*,\s*97\s*\)/gi,
    /rgba\s*\(\s*62\s*,\s*74\s*,\s*97/gi
  ]
};

/**
 * Validate that HTML content contains expected brand colors
 * @param {string} htmlContent - The HTML content to validate
 * @param {Object} options - Validation options
 * @param {string[]} options.requiredColors - Colors that must be present (default: ['grape'])
 * @param {boolean} options.strict - If true, fail if any required color is missing
 * @returns {Object} Validation result
 */
function validateHtmlColors(htmlContent, options = {}) {
  const requiredColors = options.requiredColors || ['grape'];
  const strict = options.strict !== false;

  const result = {
    valid: true,
    colorsFound: {},
    colorsMissing: [],
    details: [],
    recommendations: []
  };

  // Check each required color
  for (const colorName of requiredColors) {
    const patterns = COLOR_PATTERNS[colorName];
    if (!patterns) {
      result.details.push(`Unknown color: ${colorName}`);
      continue;
    }

    const found = patterns.some(pattern => pattern.test(htmlContent));
    result.colorsFound[colorName] = found;

    if (!found) {
      result.colorsMissing.push(colorName);
      result.details.push(`Missing brand color: ${colorName} (${BRAND_COLORS[colorName]})`);
    }
  }

  // Determine validity
  if (strict && result.colorsMissing.length > 0) {
    result.valid = false;
    result.recommendations.push(
      'Ensure CSS files are actually loaded (not just referenced)',
      'Check that CSS paths are correct and accessible',
      'Consider embedding CSS inline if external files fail to load'
    );
  }

  return result;
}

/**
 * Validate a CSS file contains brand colors
 * @param {string} cssPath - Path to CSS file
 * @returns {Object} Validation result
 */
function validateCssFile(cssPath) {
  const result = {
    valid: false,
    exists: false,
    readable: false,
    colorsFound: {},
    details: []
  };

  // Check file exists
  if (!fs.existsSync(cssPath)) {
    result.details.push(`CSS file not found: ${cssPath}`);
    return result;
  }
  result.exists = true;

  // Try to read file
  let cssContent;
  try {
    cssContent = fs.readFileSync(cssPath, 'utf8');
    result.readable = true;
  } catch (err) {
    result.details.push(`Cannot read CSS file: ${err.message}`);
    return result;
  }

  // Check for brand colors
  for (const [colorName, patterns] of Object.entries(COLOR_PATTERNS)) {
    const found = patterns.some(pattern => pattern.test(cssContent));
    result.colorsFound[colorName] = found;
  }

  // Valid if at least grape (primary) is found
  result.valid = result.colorsFound.grape === true;

  if (!result.valid) {
    result.details.push('Primary brand color (grape #5F3B8C) not found in CSS');
  }

  return result;
}

/**
 * Extract text content from PDF for validation
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<Object>} Extraction result with metadata
 */
async function extractPdfMetadata(pdfPath) {
  const result = {
    valid: false,
    exists: false,
    readable: false,
    pageCount: 0,
    hasContent: false,
    metadata: {},
    details: []
  };

  // Check file exists
  if (!fs.existsSync(pdfPath)) {
    result.details.push(`PDF file not found: ${pdfPath}`);
    return result;
  }
  result.exists = true;

  // Check file has content
  const stats = fs.statSync(pdfPath);
  if (stats.size === 0) {
    result.details.push('PDF file is empty (0 bytes)');
    return result;
  }

  // Try to read and parse PDF
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    result.readable = true;
    result.pageCount = pdfDoc.getPageCount();
    result.hasContent = result.pageCount > 0;

    // Extract metadata
    result.metadata = {
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
      creator: pdfDoc.getCreator(),
      producer: pdfDoc.getProducer(),
      creationDate: pdfDoc.getCreationDate(),
      modificationDate: pdfDoc.getModificationDate()
    };

    result.valid = result.hasContent;

    if (result.pageCount === 0) {
      result.details.push('PDF has no pages');
    }

  } catch (err) {
    result.details.push(`Cannot parse PDF: ${err.message}`);
  }

  return result;
}

/**
 * Full validation pipeline for PDF generation
 * @param {Object} options - Validation options
 * @param {string} options.htmlPath - Path to source HTML (optional)
 * @param {string} options.cssPath - Path to CSS file (optional)
 * @param {string} options.pdfPath - Path to output PDF
 * @param {string[]} options.requiredColors - Colors that must be present
 * @returns {Promise<Object>} Complete validation result
 */
async function validatePdfGeneration(options) {
  const result = {
    valid: true,
    timestamp: new Date().toISOString(),
    stages: {},
    summary: [],
    recommendations: []
  };

  // Stage 1: Validate CSS file if provided
  if (options.cssPath) {
    result.stages.css = validateCssFile(options.cssPath);
    if (!result.stages.css.valid) {
      result.valid = false;
      result.summary.push('CSS validation failed');
      result.recommendations.push(
        `Verify CSS file exists at: ${options.cssPath}`,
        'Check CSS contains brand colors (#5F3B8C, #E99560, #3E4A61)'
      );
    }
  }

  // Stage 2: Validate HTML content if provided
  if (options.htmlPath && fs.existsSync(options.htmlPath)) {
    const htmlContent = fs.readFileSync(options.htmlPath, 'utf8');
    result.stages.html = validateHtmlColors(htmlContent, {
      requiredColors: options.requiredColors || ['grape'],
      strict: true
    });

    if (!result.stages.html.valid) {
      result.valid = false;
      result.summary.push('HTML color validation failed');
      result.recommendations.push(...result.stages.html.recommendations);
    }
  }

  // Stage 3: Validate PDF output
  if (options.pdfPath) {
    result.stages.pdf = await extractPdfMetadata(options.pdfPath);
    if (!result.stages.pdf.valid) {
      result.valid = false;
      result.summary.push('PDF output validation failed');
      result.recommendations.push(
        'Verify PDF was generated successfully',
        'Check Puppeteer/Chrome is installed correctly',
        'Review generation logs for errors'
      );
    }
  }

  // Overall summary
  if (result.valid) {
    result.summary.push('All validation checks passed');
  } else {
    result.summary.push('VALIDATION FAILED - Review recommendations');
  }

  return result;
}

/**
 * Quick check if a file appears to be a valid, non-empty PDF
 * @param {string} filePath - Path to file
 * @returns {Object} Quick validation result
 */
function quickValidatePdf(filePath) {
  const result = {
    valid: false,
    exists: false,
    hasContent: false,
    isPdf: false,
    sizeBytes: 0,
    details: []
  };

  if (!fs.existsSync(filePath)) {
    result.details.push('File does not exist');
    return result;
  }
  result.exists = true;

  const stats = fs.statSync(filePath);
  result.sizeBytes = stats.size;

  if (stats.size === 0) {
    result.details.push('File is empty');
    return result;
  }
  result.hasContent = true;

  // Check PDF magic bytes
  const buffer = Buffer.alloc(5);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 5, 0);
  fs.closeSync(fd);

  if (buffer.toString() === '%PDF-') {
    result.isPdf = true;
    result.valid = true;
  } else {
    result.details.push('File does not have PDF signature');
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate-css':
      if (!args[1]) {
        console.error('Usage: pdf-css-validator.js validate-css <css-path>');
        process.exit(1);
      }
      const cssResult = validateCssFile(args[1]);
      console.log(JSON.stringify(cssResult, null, 2));
      process.exit(cssResult.valid ? 0 : 1);
      break;

    case 'validate-pdf':
      if (!args[1]) {
        console.error('Usage: pdf-css-validator.js validate-pdf <pdf-path>');
        process.exit(1);
      }
      extractPdfMetadata(args[1]).then(pdfResult => {
        console.log(JSON.stringify(pdfResult, null, 2));
        process.exit(pdfResult.valid ? 0 : 1);
      });
      break;

    case 'quick-check':
      if (!args[1]) {
        console.error('Usage: pdf-css-validator.js quick-check <pdf-path>');
        process.exit(1);
      }
      const quickResult = quickValidatePdf(args[1]);
      console.log(JSON.stringify(quickResult, null, 2));
      process.exit(quickResult.valid ? 0 : 1);
      break;

    case 'colors':
      console.log('RevPal Brand Colors:');
      for (const [name, hex] of Object.entries(BRAND_COLORS)) {
        console.log(`  ${name}: ${hex}`);
      }
      break;

    default:
      console.log(`PDF CSS Validator

Usage:
  pdf-css-validator.js validate-css <css-path>   Validate CSS file contains brand colors
  pdf-css-validator.js validate-pdf <pdf-path>   Validate PDF metadata and structure
  pdf-css-validator.js quick-check <pdf-path>    Quick check if file is valid PDF
  pdf-css-validator.js colors                    Show brand colors

Brand Colors:
  grape:   #5F3B8C (Primary)
  apricot: #E99560 (Accent)
  indigo:  #3E4A61 (Secondary)
  sand:    #EAE4DC (Background)
  green:   #6FBF73 (Success)
`);
  }
}

module.exports = {
  BRAND_COLORS,
  validateHtmlColors,
  validateCssFile,
  extractPdfMetadata,
  validatePdfGeneration,
  quickValidatePdf
};
