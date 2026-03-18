#!/usr/bin/env node
/**
 * Email Pattern Validator
 *
 * Solves SOQL LIKE limitations by:
 * 1. Exporting emails to local JSON
 * 2. Using JavaScript regex for complex pattern matching
 * 3. Generating targeted SOQL queries for discovered issues
 * 4. Validating corrections against duplicates
 *
 * Use Case: Detect emails like "user@domain.coma" or "user@domain.comgdfsgds"
 * where TLD is followed by garbage characters that SOQL LIKE cannot match.
 *
 * Usage:
 *   node scripts/lib/email-pattern-validator.js <org-alias> [--export-only] [--pattern <regex>]
 *
 * Examples:
 *   # Full validation workflow
 *   node scripts/lib/email-pattern-validator.js delta-production
 *
 *   # Export emails only (for custom analysis)
 *   node scripts/lib/email-pattern-validator.js delta-production --export-only
 *
 *   # Use custom pattern
 *   node scripts/lib/email-pattern-validator.js delta-production --pattern "\.com[a-z]+"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class EmailPatternValidator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.exportOnly = options.exportOnly || false;
    this.customPattern = options.customPattern || null;
    this.outputDir = options.outputDir || '/tmp';

    // Known email patterns that indicate issues
    this.patterns = {
      tld_plus_garbage: {
        name: 'TLD + Garbage Characters',
        regex: /\.com[a-zA-Z0-9]{1,20}$/,
        description: 'Valid TLD followed by extra characters (e.g., .coma, .comgdfsgds)',
        correction: email => email.replace(/\.com[a-zA-Z0-9]+$/, '.com')
      },
      tld_typos: {
        name: 'Common TLD Typos',
        regex: /\.(vom|cim|ocm|coom|co,)$/,
        description: 'Single-character variations of common TLDs',
        correction: email => email.replace(/\.(vom|cim|ocm|coom|co,)$/, '.com')
      },
      provider_typos: {
        name: 'Email Provider Typos',
        regex: /@(gmai|gmial|gmaul|gnail|outlok|outllook|hotnail|hotmial|yahooo|yaho)\.com$/,
        description: 'Common typos in major email providers',
        correction: email => {
          return email
            .replace(/@gmai\.com$/, '@gmail.com')
            .replace(/@gmial\.com$/, '@gmail.com')
            .replace(/@gmaul\.com$/, '@gmail.com')
            .replace(/@gnail\.com$/, '@gmail.com')
            .replace(/@outlok\.com$/, '@outlook.com')
            .replace(/@outllook\.com$/, '@outlook.com')
            .replace(/@hotnail\.com$/, '@hotmail.com')
            .replace(/@hotmial\.com$/, '@hotmail.com')
            .replace(/@yahooo\.com$/, '@yahoo.com')
            .replace(/@yaho\.com$/, '@yahoo.com');
        }
      },
      format_errors: {
        name: 'Format Errors',
        regex: /(\.\.|\.@|@\.|\s)/,
        description: 'Structural issues: consecutive dots, trailing dots, spaces',
        correction: email => {
          return email
            .replace(/\.\./g, '.')
            .replace(/\.@/, '@')
            .replace(/@\./, '@')
            .replace(/\s/g, '');
        }
      }
    };
  }

  /**
   * Export all contact emails from Salesforce to local JSON
   */
  exportEmails() {
    console.log(`\n📤 Exporting emails from ${this.orgAlias}...`);

    const query = "SELECT Id, FirstName, LastName, Email, Account.Name FROM Contact WHERE Email != NULL";
    const outputFile = path.join(this.outputDir, `${this.orgAlias}-emails-export.json`);

    try {
      console.log('   Running SOQL query...');
      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      const contacts = parsed.result?.records || [];

      console.log(`   ✅ Exported ${contacts.length} contacts with emails`);

      fs.writeFileSync(outputFile, JSON.stringify(contacts, null, 2));
      console.log(`   📁 Saved to: ${outputFile}`);

      return { contacts, outputFile };
    } catch (error) {
      console.error('   ❌ Export failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze exported emails using regex patterns
   */
  analyzePatterns(contacts) {
    console.log('\n🔍 Analyzing email patterns...');

    const issues = [];
    const patterns = this.customPattern
      ? { custom: { name: 'Custom Pattern', regex: new RegExp(this.customPattern), description: 'User-provided pattern' } }
      : this.patterns;

    contacts.forEach(contact => {
      const email = contact.Email;
      if (!email) return;

      Object.entries(patterns).forEach(([key, pattern]) => {
        if (pattern.regex.test(email)) {
          const correctedEmail = pattern.correction ? pattern.correction(email) : email;

          issues.push({
            contactId: contact.Id,
            name: `${contact.FirstName || ''} ${contact.LastName || ''}`.trim(),
            account: contact.Account?.Name || 'No Account',
            originalEmail: email,
            correctedEmail,
            pattern: pattern.name,
            patternKey: key,
            description: pattern.description
          });
        }
      });
    });

    // Deduplicate issues (same contact may match multiple patterns)
    const uniqueIssues = issues.reduce((acc, issue) => {
      const existing = acc.find(i => i.contactId === issue.contactId);
      if (!existing) {
        acc.push(issue);
      } else if (issue.patternKey === 'tld_plus_garbage') {
        // Prefer TLD+garbage detection over other patterns
        acc[acc.indexOf(existing)] = issue;
      }
      return acc;
    }, []);

    console.log(`   ✅ Found ${uniqueIssues.length} emails with pattern issues`);

    return uniqueIssues;
  }

  /**
   * Check if corrected emails would create duplicates
   */
  async checkDuplicates(issues) {
    console.log('\n🔄 Checking for duplicate conflicts...');

    const correctedEmails = [...new Set(issues.map(i => i.correctedEmail))];
    const chunks = [];
    const chunkSize = 20; // SOQL IN clause limit

    for (let i = 0; i < correctedEmails.length; i += chunkSize) {
      chunks.push(correctedEmails.slice(i, i + chunkSize));
    }

    const existingContacts = [];

    for (const chunk of chunks) {
      const emailList = chunk.map(e => `'${e}'`).join(',');
      const query = `SELECT Id, Email, FirstName, LastName FROM Contact WHERE Email IN (${emailList})`;

      try {
        const result = execSync(
          `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
          { encoding: 'utf-8' }
        );

        const parsed = JSON.parse(result);
        existingContacts.push(...(parsed.result?.records || []));
      } catch (error) {
        console.warn(`   ⚠️ Chunk query failed: ${error.message}`);
      }
    }

    // Mark issues that would create duplicates
    issues.forEach(issue => {
      const duplicate = existingContacts.find(
        c => c.Email === issue.correctedEmail && c.Id !== issue.contactId
      );

      if (duplicate) {
        issue.duplicateDetected = true;
        issue.duplicateContactId = duplicate.Id;
        issue.duplicateName = `${duplicate.FirstName || ''} ${duplicate.LastName || ''}`.trim();
        issue.recommendedAction = 'MERGE_REQUIRED';
      } else {
        issue.duplicateDetected = false;
        issue.recommendedAction = 'DIRECT_UPDATE';
      }
    });

    const duplicateCount = issues.filter(i => i.duplicateDetected).length;
    console.log(`   ✅ Duplicate check complete: ${duplicateCount} would create duplicates`);

    return issues;
  }

  /**
   * Generate SOQL queries for discovered issues
   */
  generateSOQLQueries(issues) {
    console.log('\n📝 Generating targeted SOQL queries...');

    const queries = [];
    const issuesByPattern = issues.reduce((acc, issue) => {
      if (!acc[issue.patternKey]) acc[issue.patternKey] = [];
      acc[issue.patternKey].push(issue);
      return acc;
    }, {});

    Object.entries(issuesByPattern).forEach(([patternKey, patternIssues]) => {
      const pattern = this.patterns[patternKey];
      if (!pattern) return;

      // Generate LIKE patterns for SOQL
      const likePatterns = this.generateLikePatterns(patternKey, patternIssues);

      likePatterns.forEach(likePattern => {
        queries.push({
          pattern: pattern.name,
          query: `SELECT Id, FirstName, LastName, Email FROM Contact WHERE Email LIKE '${likePattern}'`,
          expectedCount: patternIssues.filter(i => new RegExp(likePattern.replace('%', '.*')).test(i.originalEmail)).length
        });
      });
    });

    console.log(`   ✅ Generated ${queries.length} SOQL queries`);
    return queries;
  }

  /**
   * Generate LIKE patterns from regex matches
   */
  generateLikePatterns(patternKey, issues) {
    const patterns = [];

    switch (patternKey) {
      case 'tld_plus_garbage':
        // Extract unique garbage suffixes
        const suffixes = new Set();
        issues.forEach(issue => {
          const match = issue.originalEmail.match(/\.com([a-zA-Z0-9]+)$/);
          if (match) suffixes.add(match[1]);
        });
        suffixes.forEach(suffix => patterns.push(`%.com${suffix}`));
        break;

      case 'tld_typos':
        patterns.push('%.vom', '%.cim', '%.ocm', '%.coom', '%.co,');
        break;

      case 'provider_typos':
        patterns.push('%@gmai.com', '%@gmial.com', '%@outlok.com', '%@hotnail.com', '%@yahooo.com');
        break;

      case 'format_errors':
        patterns.push('%..%', '%.@%', '%@.%', '% %');
        break;
    }

    return patterns;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(issues) {
    console.log('\n📊 Generating validation report...');

    const reportFile = path.join(this.outputDir, `${this.orgAlias}-email-validation-report.json`);

    const report = {
      org: this.orgAlias,
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: issues.length,
        directUpdates: issues.filter(i => i.recommendedAction === 'DIRECT_UPDATE').length,
        mergeRequired: issues.filter(i => i.recommendedAction === 'MERGE_REQUIRED').length,
        byPattern: {}
      },
      issues: issues,
      soqlQueries: this.generateSOQLQueries(issues)
    };

    // Group by pattern for summary
    issues.forEach(issue => {
      const pattern = issue.pattern;
      if (!report.summary.byPattern[pattern]) {
        report.summary.byPattern[pattern] = 0;
      }
      report.summary.byPattern[pattern]++;
    });

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('VALIDATION REPORT SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Issues Found: ${report.summary.totalIssues}`);
    console.log(`Direct Updates Possible: ${report.summary.directUpdates}`);
    console.log(`Merge Required: ${report.summary.mergeRequired}`);
    console.log('\nBy Pattern:');
    Object.entries(report.summary.byPattern).forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}`);
    });
    console.log('\n' + '='.repeat(80));
    console.log(`📁 Full report saved to: ${reportFile}`);

    return report;
  }

  /**
   * Main execution workflow
   */
  async run() {
    console.log('\n🚀 Email Pattern Validator');
    console.log(`Organization: ${this.orgAlias}`);
    console.log(`Mode: ${this.exportOnly ? 'Export Only' : 'Full Validation'}`);

    try {
      // Step 1: Export emails
      const { contacts } = this.exportEmails();

      if (this.exportOnly) {
        console.log('\n✅ Export complete (--export-only flag set)');
        return;
      }

      // Step 2: Analyze patterns
      const issues = this.analyzePatterns(contacts);

      if (issues.length === 0) {
        console.log('\n✅ No email pattern issues found!');
        return;
      }

      // Step 3: Check for duplicates
      await this.checkDuplicates(issues);

      // Step 4: Generate report
      const report = this.generateReport(issues);

      console.log('\n✅ Validation complete!');
      console.log('\nNext Steps:');
      console.log('  1. Review report for issues requiring merge vs direct update');
      console.log('  2. Use duplicate-aware-update.js for corrections');
      console.log('  3. For merges, use sfdc-merge-orchestrator agent');

      return report;

    } catch (error) {
      console.error('\n❌ Validation failed:', error.message);
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node email-pattern-validator.js <org-alias> [options]

Options:
  --export-only           Only export emails, skip analysis
  --pattern <regex>       Use custom regex pattern instead of built-in patterns
  --output-dir <path>     Output directory (default: /tmp)
  --help                  Show this help message

Examples:
  # Full validation
  node email-pattern-validator.js delta-production

  # Export only
  node email-pattern-validator.js delta-production --export-only

  # Custom pattern
  node email-pattern-validator.js delta-production --pattern "\\.com[a-z]+"
    `);
    process.exit(0);
  }

  const orgAlias = args[0];
  const options = {
    exportOnly: args.includes('--export-only'),
    customPattern: args.includes('--pattern') ? args[args.indexOf('--pattern') + 1] : null,
    outputDir: args.includes('--output-dir') ? args[args.indexOf('--output-dir') + 1] : '/tmp'
  };

  const validator = new EmailPatternValidator(orgAlias, options);
  validator.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = EmailPatternValidator;
