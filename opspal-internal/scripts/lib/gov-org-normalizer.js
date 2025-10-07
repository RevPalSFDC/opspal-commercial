#!/usr/bin/env node

/**
 * Government Organization Data Normalizer
 *
 * Cleans and standardizes input data for government organization classification.
 * Extracts email domains, organization types, and jurisdictions.
 *
 * @module gov-org-normalizer
 */

const fs = require('fs');
const path = require('path');

class GovOrgNormalizer {
  constructor() {
    // Load domain patterns for classification hints
    const configPath = path.join(__dirname, '../../config/gov-domain-patterns.json');
    this.domainPatterns = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /**
   * Normalize input data
   * @param {Object} input - Raw input data
   * @param {string|null} input.company - Company name
   * @param {string|null} input.email - Email address
   * @param {string|null} input.name - Person's name
   * @param {string|null} input.title - Job title
   * @returns {Object} Normalized data
   */
  normalize(input) {
    const normalized = {
      organization_name: this.normalizeCompanyName(input.company),
      organization_type: this.detectOrganizationType(input),
      jurisdiction: this.extractJurisdiction(input),
      email_domain: this.extractEmailDomain(input.email),
      title_clean: this.normalizeTitle(input.title),
      name_clean: this.normalizeName(input.name)
    };

    return normalized;
  }

  /**
   * Clean and standardize company name
   */
  normalizeCompanyName(company) {
    if (!company) return null;

    let cleaned = company.trim();

    // Remove common suffixes
    cleaned = cleaned
      .replace(/,?\s+(LLC|Inc\.?|Incorporated|Corporation|Corp\.?|Ltd\.?)$/i, '')
      .replace(/\bThe\b\s+/i, ''); // Remove leading "The"

    // Standardize spacing
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Capitalize properly (basic approach)
    cleaned = this.titleCase(cleaned);

    return cleaned;
  }

  /**
   * Detect organization type from input signals
   */
  detectOrganizationType(input) {
    const domain = this.extractEmailDomain(input.email);

    // Check domain patterns
    if (domain) {
      // Federal
      if (this.matchesPattern(domain, this.domainPatterns.patterns.federal.patterns)) {
        return 'federal';
      }

      // State
      if (this.matchesPattern(domain, this.domainPatterns.patterns.state.patterns)) {
        return 'state';
      }

      // County
      if (this.matchesPattern(domain, this.domainPatterns.patterns.county.patterns)) {
        return 'county';
      }

      // City
      if (this.matchesPattern(domain, this.domainPatterns.patterns.city.patterns)) {
        return 'city';
      }

      // University
      if (this.matchesPattern(domain, this.domainPatterns.patterns.university.patterns)) {
        return 'university';
      }

      // Hospital
      if (this.matchesPattern(domain, this.domainPatterns.patterns.hospital.patterns)) {
        return 'hospital';
      }

      // Authority
      if (this.matchesPattern(domain, this.domainPatterns.patterns.authority.patterns)) {
        return 'authority';
      }

      // Non-government
      if (this.matchesPattern(domain, this.domainPatterns.patterns.not_gov.patterns)) {
        return 'not_gov';
      }
    }

    // Check company name for hints
    if (input.company) {
      const company = input.company.toLowerCase();

      if (company.includes('county') || company.includes('sheriff')) {
        return 'county';
      }
      if (company.includes('city') || company.includes('municipal')) {
        return 'city';
      }
      if (company.includes('state') && !company.includes('university')) {
        return 'state';
      }
      if (company.includes('university') || company.includes('college')) {
        return 'university';
      }
      if (company.includes('hospital') || company.includes('medical center')) {
        return 'hospital';
      }
      if (company.includes('authority') || company.includes('commission')) {
        return 'authority';
      }
      if (company.match(/\b(llc|inc|incorporated|corp|consulting|solutions|services)\b/i)) {
        return 'not_gov';
      }
    }

    return 'unknown';
  }

  /**
   * Extract jurisdiction from input
   */
  extractJurisdiction(input) {
    const parts = [];

    // Try to extract from company name
    if (input.company) {
      // Look for state abbreviations or names
      const stateMatch = input.company.match(/\b([A-Z]{2})\b|\b(California|Texas|New York|Florida|Pennsylvania|Virginia|Kentucky|Massachusetts)\b/);
      if (stateMatch) {
        parts.push(stateMatch[0]);
      }

      // Look for county names
      const countyMatch = input.company.match(/(\w+)\s+County/i);
      if (countyMatch) {
        parts.unshift(countyMatch[0]);
      }

      // Look for city names
      const cityMatch = input.company.match(/City of (\w+)|(\w+)\s+City/i);
      if (cityMatch) {
        parts.unshift(cityMatch[1] || cityMatch[2]);
      }
    }

    // Try to extract from email domain
    const domain = this.extractEmailDomain(input.email);
    if (domain) {
      // Look for state codes in domain
      const stateMatch = domain.match(/\.([a-z]{2})\.(us|gov)$/);
      if (stateMatch) {
        parts.push(stateMatch[1].toUpperCase());
      }

      // Look for city/county names in domain
      const locationMatch = domain.match(/^([a-z]+)(county|city)\./);
      if (locationMatch) {
        parts.unshift(this.titleCase(locationMatch[1]));
      }
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Extract and clean email domain
   */
  extractEmailDomain(email) {
    if (!email) return null;

    const match = email.match(/@([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Normalize job title
   */
  normalizeTitle(title) {
    if (!title) return null;

    let cleaned = title.trim();

    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Standardize common abbreviations
    cleaned = cleaned
      .replace(/\bDA\b/gi, 'District Attorney')
      .replace(/\bADA\b/gi, 'Assistant District Attorney')
      .replace(/\bDDA\b/gi, 'Deputy District Attorney')
      .replace(/\bAG\b/gi, 'Attorney General')
      .replace(/\bPD\b/gi, 'Police Department')
      .replace(/\bSO\b/gi, "Sheriff's Office")
      .replace(/\bFD\b/gi, 'Fire Department')
      .replace(/\bEMS\b/gi, 'Emergency Medical Services')
      .replace(/\bOEM\b/gi, 'Office of Emergency Management')
      .replace(/\bDOC\b/gi, 'Department of Corrections')
      .replace(/\bDOT\b/gi, 'Department of Transportation')
      .replace(/\bDNR\b/gi, 'Department of Natural Resources');

    return cleaned;
  }

  /**
   * Normalize person name
   */
  normalizeName(name) {
    if (!name) return null;

    let cleaned = name.trim();

    // Remove titles (Dr., Mr., Mrs., etc.)
    cleaned = cleaned.replace(/^(Dr|Mr|Mrs|Ms|Miss|Rev|Prof)\.?\s+/i, '');

    // Remove suffixes (Jr., Sr., III, etc.)
    cleaned = cleaned.replace(/,?\s+(Jr|Sr|II|III|IV|V)\.?$/i, '');

    // Standardize spacing
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Check if domain matches any pattern
   */
  matchesPattern(domain, patterns) {
    if (!domain || !patterns) return false;

    for (const pattern of patterns) {
      // Convert pattern to regex if it's a string
      const regex = new RegExp(pattern, 'i');
      if (regex.test(domain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert string to title case
   */
  titleCase(str) {
    if (!str) return '';

    const exceptions = ['of', 'and', 'the', 'for', 'in', 'on', 'at', 'to', 'a', 'an'];

    return str
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        // Always capitalize first and last word
        if (index === 0 || index === str.split(' ').length - 1) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }

        // Don't capitalize exceptions
        if (exceptions.includes(word)) {
          return word;
        }

        // Capitalize all other words
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  /**
   * Batch normalize multiple inputs
   */
  normalizeBatch(inputs) {
    return inputs.map(input => ({
      input,
      normalized: this.normalize(input)
    }));
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: gov-org-normalizer.js <input.json>');
    console.log('  or pipe JSON via stdin');
    process.exit(1);
  }

  const normalizer = new GovOrgNormalizer();

  // Read from file or stdin
  const inputFile = args[0];
  let input;

  if (inputFile === '-' || !process.stdin.isTTY) {
    // Read from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      input = JSON.parse(Buffer.concat(chunks).toString());
      processInput(input);
    });
  } else {
    // Read from file
    input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    processInput(input);
  }

  function processInput(input) {
    let result;

    if (Array.isArray(input)) {
      result = normalizer.normalizeBatch(input);
    } else {
      result = normalizer.normalize(input);
    }

    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = GovOrgNormalizer;
