#!/usr/bin/env node

/**
 * Government Organization Batch Classifier
 *
 * Orchestrates the complete classification pipeline:
 * 1. Normalize input data
 * 2. Match to buckets
 * 3. Validate evidence (when provided)
 * 4. Output structured JSON
 *
 * Supports batch processing, progress tracking, and resume capability.
 *
 * @module gov-org-batch-classifier
 */

const fs = require('fs');
const path = require('path');
const GovOrgNormalizer = require('./gov-org-normalizer');
const GovOrgBucketMatcher = require('./gov-org-bucket-matcher');
const GovOrgEvidenceValidator = require('./gov-org-evidence-validator');

class GovOrgBatchClassifier {
  constructor(options = {}) {
    this.normalizer = new GovOrgNormalizer();
    this.matcher = new GovOrgBucketMatcher();
    this.evidenceValidator = new GovOrgEvidenceValidator(options.validatorOptions);

    this.batchSize = options.batchSize || 50;
    this.delay = options.delay || 1000; // 1 second delay between batches
    this.outputDir = options.outputDir || './output';
    this.resumeFile = options.resumeFile || null;
    this.validateEvidence = options.validateEvidence || false;

    this.stats = {
      total: 0,
      processed: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      errors: 0
    };
  }

  /**
   * Classify a single contact
   * @param {Object} input - Contact data
   * @returns {Promise<Object>} Classification result
   */
  async classifySingle(input) {
    try {
      // Step 1: Normalize
      const normalized = this.normalizer.normalize(input);

      // Step 2: Match to bucket
      const classification = this.matcher.match(normalized, input);

      // Step 3: Validate evidence (if provided and validation enabled)
      let evidenceValidation = null;
      if (this.validateEvidence && classification.evidence && classification.evidence.length > 0) {
        evidenceValidation = await this.evidenceValidator.validateEvidenceList(classification.evidence);
      }

      // Build final result
      const result = {
        input,
        normalized,
        classification: {
          bucket: classification.bucket,
          confidence: classification.confidence,
          rationale: classification.rationale,
          notes: classification.notes
        }
      };

      // Add evidence validation if performed
      if (evidenceValidation) {
        result.evidenceValidation = {
          valid: evidenceValidation.valid,
          avgCredibility: evidenceValidation.avgCredibility,
          recommendations: evidenceValidation.recommendations
        };
      }

      // Update stats
      if (classification.confidence >= 0.8) {
        this.stats.highConfidence++;
      } else if (classification.confidence >= 0.5) {
        this.stats.mediumConfidence++;
      } else {
        this.stats.lowConfidence++;
      }

      this.stats.processed++;

      return result;
    } catch (error) {
      this.stats.errors++;
      return {
        input,
        error: error.message,
        classification: {
          bucket: 'Error',
          confidence: 0,
          rationale: `Classification failed: ${error.message}`,
          notes: 'Manual review required'
        }
      };
    }
  }

  /**
   * Classify batch of contacts
   * @param {Array} inputs - Array of contact data
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Array of classification results
   */
  async classifyBatch(inputs, options = {}) {
    this.stats.total = inputs.length;
    const results = [];

    // Load resume state if exists
    let startIndex = 0;
    if (this.resumeFile && fs.existsSync(this.resumeFile)) {
      const resumeState = JSON.parse(fs.readFileSync(this.resumeFile, 'utf8'));
      startIndex = resumeState.lastProcessedIndex + 1;
      console.log(`Resuming from index ${startIndex}`);
    }

    // Process in batches
    for (let i = startIndex; i < inputs.length; i += this.batchSize) {
      const batch = inputs.slice(i, Math.min(i + this.batchSize, inputs.length));
      console.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(inputs.length / this.batchSize)} (${batch.length} contacts)`);

      // Process batch
      const batchResults = await Promise.all(
        batch.map(input => this.classifySingle(input))
      );

      results.push(...batchResults);

      // Save progress
      if (this.resumeFile) {
        this.saveProgress(i + batch.length - 1, results);
      }

      // Delay between batches (respect rate limits)
      if (i + this.batchSize < inputs.length) {
        await this.sleep(this.delay);
      }

      // Print progress
      const progress = Math.round((this.stats.processed / this.stats.total) * 100);
      console.log(`Progress: ${this.stats.processed}/${this.stats.total} (${progress}%) - H:${this.stats.highConfidence} M:${this.stats.mediumConfidence} L:${this.stats.lowConfidence} E:${this.stats.errors}`);
    }

    return results;
  }

  /**
   * Save progress to resume file
   */
  saveProgress(lastIndex, results) {
    const state = {
      lastProcessedIndex: lastIndex,
      timestamp: new Date().toISOString(),
      stats: this.stats
    };

    fs.writeFileSync(this.resumeFile, JSON.stringify(state, null, 2));
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Export results to file
   * @param {Array} results - Classification results
   * @param {string} format - Output format (json, csv, summary)
   */
  exportResults(results, format = 'json') {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let outputPath;

    switch (format) {
      case 'json':
        outputPath = path.join(this.outputDir, `classifications-${timestamp}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        break;

      case 'csv':
        outputPath = path.join(this.outputDir, `classifications-${timestamp}.csv`);
        this.exportToCsv(results, outputPath);
        break;

      case 'summary':
        outputPath = path.join(this.outputDir, `summary-${timestamp}.txt`);
        this.exportSummary(results, outputPath);
        break;

      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`Results exported to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Export to CSV
   */
  exportToCsv(results, outputPath) {
    const headers = [
      'Name',
      'Email',
      'Company',
      'Title',
      'Bucket',
      'Confidence',
      'Organization Type',
      'Jurisdiction',
      'Rationale'
    ];

    const rows = results.map(r => [
      r.input.name || '',
      r.input.email || '',
      r.input.company || '',
      r.input.title || '',
      r.classification.bucket,
      r.classification.confidence,
      r.normalized.organization_type || '',
      r.normalized.jurisdiction || '',
      `"${r.classification.rationale.replace(/"/g, '""')}"`
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    fs.writeFileSync(outputPath, csv);
  }

  /**
   * Export summary report
   */
  exportSummary(results, outputPath) {
    const summary = [];

    summary.push('=== Government Organization Classification Summary ===\n');
    summary.push(`Total Processed: ${this.stats.total}`);
    summary.push(`Successful: ${this.stats.processed - this.stats.errors}`);
    summary.push(`Errors: ${this.stats.errors}\n`);

    summary.push('=== Confidence Distribution ===');
    summary.push(`High (≥0.8):   ${this.stats.highConfidence} (${Math.round((this.stats.highConfidence / this.stats.total) * 100)}%)`);
    summary.push(`Medium (0.5-0.79): ${this.stats.mediumConfidence} (${Math.round((this.stats.mediumConfidence / this.stats.total) * 100)}%)`);
    summary.push(`Low (<0.5):    ${this.stats.lowConfidence} (${Math.round((this.stats.lowConfidence / this.stats.total) * 100)}%)\n`);

    // Bucket distribution
    const bucketCounts = {};
    results.forEach(r => {
      const bucket = r.classification.bucket;
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    });

    summary.push('=== Bucket Distribution ===');
    Object.entries(bucketCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([bucket, count]) => {
        const pct = Math.round((count / this.stats.total) * 100);
        summary.push(`${bucket}: ${count} (${pct}%)`);
      });

    summary.push('\n=== Low Confidence Cases (Manual Review Recommended) ===');
    const lowConfidenceCases = results.filter(r => r.classification.confidence < 0.5);
    lowConfidenceCases.slice(0, 10).forEach(r => {
      summary.push(`\nName: ${r.input.name || 'N/A'}`);
      summary.push(`Company: ${r.input.company || 'N/A'}`);
      summary.push(`Bucket: ${r.classification.bucket} (${r.classification.confidence.toFixed(2)})`);
      summary.push(`Reason: ${r.classification.notes || r.classification.rationale}`);
    });

    if (lowConfidenceCases.length > 10) {
      summary.push(`\n... and ${lowConfidenceCases.length - 10} more low confidence cases`);
    }

    fs.writeFileSync(outputPath, summary.join('\n'));
  }

  /**
   * Generate statistics report
   */
  getStats() {
    return {
      ...this.stats,
      successRate: Math.round(((this.stats.processed - this.stats.errors) / this.stats.total) * 100),
      highConfidencePct: Math.round((this.stats.highConfidence / this.stats.total) * 100),
      mediumConfidencePct: Math.round((this.stats.mediumConfidence / this.stats.total) * 100),
      lowConfidencePct: Math.round((this.stats.lowConfidence / this.stats.total) * 100)
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  function printUsage() {
    console.log('Usage: gov-org-batch-classifier.js [options] <input.json>');
    console.log('\nOptions:');
    console.log('  --batch-size <n>       Process N contacts per batch (default: 50)');
    console.log('  --delay <ms>           Delay between batches in ms (default: 1000)');
    console.log('  --output-dir <dir>     Output directory (default: ./output)');
    console.log('  --format <fmt>         Output format: json, csv, summary (default: json)');
    console.log('  --resume <file>        Resume from checkpoint file');
    console.log('  --validate-evidence    Validate evidence URLs (slower)');
    console.log('\nInput format: JSON array of contact objects');
    console.log('  [{ "company": "...", "email": "...", "name": "...", "title": "..." }]');
    process.exit(1);
  }

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  // Parse options
  const options = {
    batchSize: 50,
    delay: 1000,
    outputDir: './output',
    format: 'json',
    resumeFile: null,
    validateEvidence: false
  };

  let inputFile;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch-size') {
      options.batchSize = parseInt(args[++i]);
    } else if (args[i] === '--delay') {
      options.delay = parseInt(args[++i]);
    } else if (args[i] === '--output-dir') {
      options.outputDir = args[++i];
    } else if (args[i] === '--format') {
      options.format = args[++i];
    } else if (args[i] === '--resume') {
      options.resumeFile = args[++i];
    } else if (args[i] === '--validate-evidence') {
      options.validateEvidence = true;
    } else if (!args[i].startsWith('--')) {
      inputFile = args[i];
    }
  }

  if (!inputFile) {
    console.error('Error: Input file required');
    printUsage();
  }

  // Read input
  const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  if (!Array.isArray(input)) {
    console.error('Error: Input must be a JSON array of contact objects');
    process.exit(1);
  }

  // Run classification
  const classifier = new GovOrgBatchClassifier(options);

  console.log(`Starting classification of ${input.length} contacts...`);
  console.log(`Batch size: ${options.batchSize}, Delay: ${options.delay}ms`);

  classifier.classifyBatch(input, options)
    .then(results => {
      console.log('\nClassification complete!');

      // Export results
      classifier.exportResults(results, options.format);

      // Print stats
      const stats = classifier.getStats();
      console.log('\n=== Statistics ===');
      console.log(`Total: ${stats.total}`);
      console.log(`Success rate: ${stats.successRate}%`);
      console.log(`High confidence: ${stats.highConfidence} (${stats.highConfidencePct}%)`);
      console.log(`Medium confidence: ${stats.mediumConfidence} (${stats.mediumConfidencePct}%)`);
      console.log(`Low confidence: ${stats.lowConfidence} (${stats.lowConfidencePct}%)`);
      console.log(`Errors: ${stats.errors}`);
    })
    .catch(error => {
      console.error('Classification failed:', error);
      process.exit(1);
    });
}

module.exports = GovOrgBatchClassifier;
