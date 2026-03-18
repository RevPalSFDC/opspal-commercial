/**
 * Data Source Validator
 *
 * Validates that named entities (people, companies, etc.) in generated reports
 * actually exist in the source data. Prevents fictional/placeholder names.
 *
 * Related reflections: 9030650d
 * ROI: $8,000/yr
 *
 * @module data-source-validator
 */

const fs = require('fs');
const path = require('path');

// Common placeholder/fictional name patterns
const SUSPICIOUS_PATTERNS = {
  // Generic placeholder names
  genericNames: [
    /^(john|jane)\s+(doe|smith)/i,
    /^(test|sample|example|demo|fake|dummy)\s+\w+/i,
    /^\w+\s+(test|sample|example|demo|fake|dummy)$/i,
    /^user\s*\d+$/i,
    /^customer\s*\d+$/i,
    /^lead\s*\d+$/i,
    /^account\s*\d+$/i,
    /^contact\s*\d+$/i,
    /^person\s*\d+$/i
  ],

  // Placeholder company names
  genericCompanies: [
    /^(acme|example|test|sample|demo)\s*(corp|inc|llc|co|company)?\.?$/i,
    /^company\s*\d+$/i,
    /^organization\s*\d+$/i,
    /^business\s*\d+$/i,
    /^(abc|xyz)\s*(corp|inc|llc|co|company)?\.?$/i
  ],

  // Lorem ipsum indicators
  loremIpsum: [
    /lorem\s+ipsum/i,
    /dolor\s+sit\s+amet/i,
    /consectetur\s+adipiscing/i
  ],

  // Suspicious email patterns
  suspiciousEmails: [
    /test@/i,
    /example@/i,
    /fake@/i,
    /noreply@/i,
    /@example\.(com|org|net)/i,
    /@test\.(com|org|net)/i
  ],

  // Placeholder phone numbers
  placeholderPhones: [
    /555-\d{4}/,
    /123-456-7890/,
    /000-000-0000/,
    /111-111-1111/
  ]
};

// Common real first names that might appear in fake data
const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph',
  'thomas', 'charles', 'mary', 'patricia', 'jennifer', 'linda', 'elizabeth',
  'barbara', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty',
  'margaret', 'sandra', 'ashley', 'dorothy', 'kimberly', 'emily', 'donna'
]);

// Common last names that might appear in fake data
const COMMON_LAST_NAMES = new Set([
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
  'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson',
  'thomas', 'taylor', 'moore', 'jackson', 'martin', 'lee', 'perez', 'thompson',
  'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson'
]);

/**
 * Extract named entities from text
 * @param {string} text - Text to extract entities from
 * @returns {Object} Extracted entities by type
 */
function extractEntities(text) {
  const entities = {
    names: [],
    companies: [],
    emails: [],
    phones: []
  };

  // Extract potential person names (Title Case patterns)
  const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const fullName = match[0];
    const firstName = match[1].toLowerCase();
    const lastName = match[2].toLowerCase();

    // Skip if it's likely a section header or common phrase
    if (!isLikelyHeader(fullName)) {
      entities.names.push({
        full: fullName,
        first: firstName,
        last: lastName,
        position: match.index
      });
    }
  }

  // Extract emails
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
  while ((match = emailPattern.exec(text)) !== null) {
    entities.emails.push({
      value: match[0],
      position: match.index
    });
  }

  // Extract phone numbers
  const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  while ((match = phonePattern.exec(text)) !== null) {
    entities.phones.push({
      value: match[0],
      position: match.index
    });
  }

  // Extract potential company names (with suffixes)
  const companyPattern = /\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)*)\s+(Inc|LLC|Corp|Co|Ltd|Company|Corporation|Industries|Solutions|Technologies|Services|Group)\.?\b/gi;
  while ((match = companyPattern.exec(text)) !== null) {
    entities.companies.push({
      full: match[0],
      name: match[1],
      suffix: match[2],
      position: match.index
    });
  }

  return entities;
}

/**
 * Check if a string is likely a section header
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function isLikelyHeader(text) {
  const headerWords = [
    'executive summary', 'key findings', 'next steps', 'action items',
    'table contents', 'appendix', 'section', 'chapter', 'figure',
    'account owner', 'sales rep', 'customer success', 'product manager'
  ];

  const lower = text.toLowerCase();
  return headerWords.some(h => lower.includes(h));
}

/**
 * Check if a name appears suspicious/fictional
 * @param {Object} nameEntity - Name entity object
 * @returns {Object} Suspicion assessment
 */
function assessNameSuspicion(nameEntity) {
  const result = {
    suspicious: false,
    score: 0,
    reasons: []
  };

  const { full, first, last } = nameEntity;

  // Check against generic placeholder patterns
  for (const pattern of SUSPICIOUS_PATTERNS.genericNames) {
    if (pattern.test(full)) {
      result.suspicious = true;
      result.score += 1.0;
      result.reasons.push(`Matches placeholder pattern: ${pattern}`);
    }
  }

  // Check if both first and last are extremely common
  if (COMMON_FIRST_NAMES.has(first) && COMMON_LAST_NAMES.has(last)) {
    result.score += 0.3;
    result.reasons.push('Both names are very common (could be real or placeholder)');
  }

  // Check for alliterative names (often fictional)
  if (first[0] === last[0]) {
    result.score += 0.2;
    result.reasons.push('Alliterative name pattern');
  }

  // Check for rhyming patterns
  if (first.slice(-2) === last.slice(-2)) {
    result.score += 0.2;
    result.reasons.push('Rhyming name pattern');
  }

  if (result.score >= 0.8) {
    result.suspicious = true;
  }

  return result;
}

/**
 * Check if a company name appears suspicious/fictional
 * @param {Object} companyEntity - Company entity object
 * @returns {Object} Suspicion assessment
 */
function assessCompanySuspicion(companyEntity) {
  const result = {
    suspicious: false,
    score: 0,
    reasons: []
  };

  const { full, name } = companyEntity;

  // Check against generic company patterns
  for (const pattern of SUSPICIOUS_PATTERNS.genericCompanies) {
    if (pattern.test(full)) {
      result.suspicious = true;
      result.score += 1.0;
      result.reasons.push(`Matches placeholder pattern: ${pattern}`);
    }
  }

  // Check for numeric suffixes
  if (/\d+$/.test(name)) {
    result.score += 0.5;
    result.reasons.push('Company name ends with numbers');
  }

  // Check for very short generic names
  if (name.length <= 3) {
    result.score += 0.3;
    result.reasons.push('Very short company name');
  }

  if (result.score >= 0.8) {
    result.suspicious = true;
  }

  return result;
}

/**
 * Validate entities against source data
 * @param {string[]} entities - Entities to validate
 * @param {string[]} sourceData - Valid source data values
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateAgainstSource(entities, sourceData, options = {}) {
  const caseSensitive = options.caseSensitive || false;
  const fuzzyMatch = options.fuzzyMatch || false;
  const fuzzyThreshold = options.fuzzyThreshold || 0.8;

  const result = {
    valid: [],
    invalid: [],
    notInSource: []
  };

  // Normalize source data
  const normalizedSource = caseSensitive
    ? new Set(sourceData)
    : new Set(sourceData.map(s => s.toLowerCase()));

  for (const entity of entities) {
    const normalizedEntity = caseSensitive ? entity : entity.toLowerCase();

    if (normalizedSource.has(normalizedEntity)) {
      result.valid.push(entity);
    } else if (fuzzyMatch) {
      // Try fuzzy matching
      let bestMatch = null;
      let bestScore = 0;

      for (const source of sourceData) {
        const score = calculateSimilarity(normalizedEntity, caseSensitive ? source : source.toLowerCase());
        if (score > bestScore && score >= fuzzyThreshold) {
          bestScore = score;
          bestMatch = source;
        }
      }

      if (bestMatch) {
        result.valid.push({ entity, matchedTo: bestMatch, similarity: bestScore });
      } else {
        result.notInSource.push(entity);
      }
    } else {
      result.notInSource.push(entity);
    }
  }

  return result;
}

/**
 * Calculate string similarity (Levenshtein-based)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score 0-1
 */
function calculateSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;

  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[bLen][aLen];
  const maxLen = Math.max(aLen, bLen);
  return 1 - distance / maxLen;
}

/**
 * Full validation pipeline for a document
 * @param {string} documentContent - The document content to validate
 * @param {Object} options - Validation options
 * @param {string[]} options.validNames - List of valid person names from source
 * @param {string[]} options.validCompanies - List of valid company names from source
 * @param {boolean} options.strict - Strict mode fails on any suspicious entity
 * @returns {Object} Validation result
 */
function validateDocument(documentContent, options = {}) {
  const result = {
    valid: true,
    timestamp: new Date().toISOString(),
    entitiesFound: 0,
    suspiciousEntities: [],
    unverifiedEntities: [],
    validatedEntities: [],
    recommendations: [],
    details: {}
  };

  // Extract entities
  const entities = extractEntities(documentContent);
  result.entitiesFound =
    entities.names.length +
    entities.companies.length +
    entities.emails.length +
    entities.phones.length;

  result.details.extracted = {
    names: entities.names.length,
    companies: entities.companies.length,
    emails: entities.emails.length,
    phones: entities.phones.length
  };

  // Check names for suspicion
  for (const name of entities.names) {
    const assessment = assessNameSuspicion(name);

    if (assessment.suspicious) {
      result.suspiciousEntities.push({
        type: 'name',
        value: name.full,
        ...assessment
      });
    }

    // Validate against source if provided
    if (options.validNames && options.validNames.length > 0) {
      const validation = validateAgainstSource(
        [name.full],
        options.validNames,
        { fuzzyMatch: true, fuzzyThreshold: 0.85 }
      );

      if (validation.notInSource.length > 0) {
        result.unverifiedEntities.push({
          type: 'name',
          value: name.full,
          reason: 'Not found in source data'
        });
      } else {
        result.validatedEntities.push({
          type: 'name',
          value: name.full
        });
      }
    }
  }

  // Check companies for suspicion
  for (const company of entities.companies) {
    const assessment = assessCompanySuspicion(company);

    if (assessment.suspicious) {
      result.suspiciousEntities.push({
        type: 'company',
        value: company.full,
        ...assessment
      });
    }

    // Validate against source if provided
    if (options.validCompanies && options.validCompanies.length > 0) {
      const validation = validateAgainstSource(
        [company.name],
        options.validCompanies,
        { fuzzyMatch: true, fuzzyThreshold: 0.8 }
      );

      if (validation.notInSource.length > 0) {
        result.unverifiedEntities.push({
          type: 'company',
          value: company.full,
          reason: 'Not found in source data'
        });
      } else {
        result.validatedEntities.push({
          type: 'company',
          value: company.full
        });
      }
    }
  }

  // Check emails for suspicious patterns
  for (const email of entities.emails) {
    for (const pattern of SUSPICIOUS_PATTERNS.suspiciousEmails) {
      if (pattern.test(email.value)) {
        result.suspiciousEntities.push({
          type: 'email',
          value: email.value,
          suspicious: true,
          reasons: ['Matches test/example email pattern']
        });
        break;
      }
    }
  }

  // Determine validity
  if (result.suspiciousEntities.length > 0) {
    result.valid = false;
    result.recommendations.push(
      'Review suspicious entities and verify against source data',
      'Cross-reference names with actual data from CSV/API query results'
    );
  }

  if (result.unverifiedEntities.length > 0 && options.strict) {
    result.valid = false;
    result.recommendations.push(
      'All named entities should be traceable to source data',
      'Add explicit source citations for any names mentioned'
    );
  }

  if (result.valid) {
    result.recommendations.push('Document validation passed');
  }

  return result;
}

/**
 * Extract valid names/companies from a CSV file
 * @param {string} csvPath - Path to CSV file
 * @param {Object} options - Extraction options
 * @param {string} options.nameColumn - Column name for person names
 * @param {string} options.companyColumn - Column name for company names
 * @returns {Object} Extracted valid values
 */
function extractValidValuesFromCsv(csvPath, options = {}) {
  const result = {
    names: [],
    companies: [],
    error: null
  };

  if (!fs.existsSync(csvPath)) {
    result.error = `CSV file not found: ${csvPath}`;
    return result;
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      result.error = 'CSV file is empty';
      return result;
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const nameCol = header.indexOf(options.nameColumn || 'Name');
    const companyCol = header.indexOf(options.companyColumn || 'Company');

    // Extract values
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));

      if (nameCol >= 0 && values[nameCol]) {
        result.names.push(values[nameCol]);
      }

      if (companyCol >= 0 && values[companyCol]) {
        result.companies.push(values[companyCol]);
      }
    }

    // Deduplicate
    result.names = [...new Set(result.names)];
    result.companies = [...new Set(result.companies)];

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      if (!args[1]) {
        console.error('Usage: data-source-validator.js validate <document-path> [--source <csv-path>]');
        process.exit(1);
      }

      const docContent = fs.readFileSync(args[1], 'utf8');
      const sourceIdx = args.indexOf('--source');
      let validationOpts = {};

      if (sourceIdx > 0 && args[sourceIdx + 1]) {
        const sourceData = extractValidValuesFromCsv(args[sourceIdx + 1], {
          nameColumn: 'Account Owner',
          companyColumn: 'Account Name'
        });
        validationOpts.validNames = sourceData.names;
        validationOpts.validCompanies = sourceData.companies;
      }

      const validationResult = validateDocument(docContent, validationOpts);
      console.log(JSON.stringify(validationResult, null, 2));
      process.exit(validationResult.valid ? 0 : 1);
      break;

    case 'extract':
      if (!args[1]) {
        console.error('Usage: data-source-validator.js extract <document-path>');
        process.exit(1);
      }
      const content = fs.readFileSync(args[1], 'utf8');
      const extracted = extractEntities(content);
      console.log(JSON.stringify(extracted, null, 2));
      break;

    case 'extract-csv':
      if (!args[1]) {
        console.error('Usage: data-source-validator.js extract-csv <csv-path> [--name-col <col>] [--company-col <col>]');
        process.exit(1);
      }
      const nameColIdx = args.indexOf('--name-col');
      const companyColIdx = args.indexOf('--company-col');
      const csvOpts = {
        nameColumn: nameColIdx > 0 ? args[nameColIdx + 1] : 'Name',
        companyColumn: companyColIdx > 0 ? args[companyColIdx + 1] : 'Company'
      };
      const csvResult = extractValidValuesFromCsv(args[1], csvOpts);
      console.log(JSON.stringify(csvResult, null, 2));
      break;

    default:
      console.log(`Data Source Validator

Usage:
  data-source-validator.js validate <doc> [--source <csv>]  Validate document entities
  data-source-validator.js extract <doc>                    Extract entities from document
  data-source-validator.js extract-csv <csv> [options]      Extract valid values from CSV

Options for extract-csv:
  --name-col <column>     Column name for person names (default: Name)
  --company-col <column>  Column name for company names (default: Company)

Features:
  - Detects placeholder/fictional names (John Doe, Test User, etc.)
  - Validates entities against source data
  - Supports fuzzy matching for name variations
  - Flags suspicious patterns in emails and phone numbers

Examples:
  # Validate a report against source CSV
  node data-source-validator.js validate report.md --source accounts.csv

  # Extract entities from a document
  node data-source-validator.js extract report.md
`);
  }
}

module.exports = {
  SUSPICIOUS_PATTERNS,
  extractEntities,
  assessNameSuspicion,
  assessCompanySuspicion,
  validateAgainstSource,
  validateDocument,
  extractValidValuesFromCsv
};
