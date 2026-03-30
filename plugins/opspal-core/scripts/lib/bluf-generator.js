'use strict';

/**
 * BLUF Generator Facade
 *
 * Bridges report-service.js static API to the class-based
 * BLUFDataExtractor + BLUFSummaryGenerator modules.
 *
 * Calling convention (from report-service.js:602):
 *   const BLUFGenerator = require('./bluf-generator');
 *   const bluf = await BLUFGenerator.generate(content, metadata);
 *
 * @param {string} content   - Raw markdown/text content of the report
 * @param {Object} metadata  - Report metadata (title, version, org, sourcePath, etc.)
 * @returns {Promise<string>} - Formatted BLUF+4 markdown string
 */

const BLUFDataExtractor = require('./bluf-data-extractor');
const BLUFSummaryGenerator = require('./bluf-summary-generator');

async function generate(content, metadata = {}) {
  // Step 1: Extract structured BLUF data from raw content
  const extractor = new BLUFDataExtractor();
  const blufData = extractor.extractFromMarkdown(content, metadata.sourcePath || null);

  // Step 2: Merge metadata into extracted data to fill gaps
  const generatorInput = {
    headline: blufData.bottomLine || blufData.headline || metadata.title || 'Assessment Complete',
    severity: blufData.severity || 'REVIEW RECOMMENDED',
    recommendation: blufData.recommendation || null,
    roi: blufData.roi || null,
    healthScore: blufData.healthScore || null,
    keyFindings: blufData.keyFindings || [],
    nextSteps: blufData.recommendations || blufData.nextSteps || [],
    risks: blufData.risks || [],
    decisions: blufData.decisions || []
  };

  // Step 3: Generate formatted summary
  const generator = new BLUFSummaryGenerator();
  return generator.generate(generatorInput, { format: 'markdown' });
}

module.exports = { generate };
