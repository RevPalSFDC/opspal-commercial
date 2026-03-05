#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { RobustCSVParser } = require('./csv-schema-validator');

const US_STATES = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL',
  'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
  'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
  'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
  'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
  'District of Columbia': 'DC'
};

const CANADA_PROVINCES = {
  'Ontario': 'ON', 'Quebec': 'QC', 'British Columbia': 'BC',
  'Alberta': 'AB', 'Saskatchewan': 'SK', 'Manitoba': 'MB',
  'Nova Scotia': 'NS', 'New Brunswick': 'NB',
  'Prince Edward Island': 'PE', 'Newfoundland and Labrador': 'NL'
};

const COUNTRY_CODE_TO_NAME = {
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  GB: 'United Kingdom',
  IE: 'Ireland',
  AU: 'Australia',
  NZ: 'New Zealand',
  FR: 'France',
  DE: 'Germany',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark'
};

const COUNTRY_CODE_ALIASES = {
  UK: 'GB'
};

const COUNTRY_NAME_TO_CODE = {
  UNITEDSTATES: 'US',
  UNITEDSTATESOFAMERICA: 'US',
  USA: 'US',
  CANADA: 'CA',
  MEXICO: 'MX',
  UNITEDKINGDOM: 'GB',
  GREATBRITAIN: 'GB',
  BRITAIN: 'GB',
  IRELAND: 'IE',
  AUSTRALIA: 'AU',
  NEWZEALAND: 'NZ',
  FRANCE: 'FR',
  GERMANY: 'DE',
  SPAIN: 'ES',
  ITALY: 'IT',
  NETHERLANDS: 'NL',
  SWEDEN: 'SE',
  NORWAY: 'NO',
  DENMARK: 'DK'
};

const STATE_FIELDS = new Set([
  'BillingState',
  'ShippingState',
  'MailingState',
  'OtherState',
  'State'
]);

const STATE_CODE_FIELDS = new Set([
  'BillingStateCode',
  'ShippingStateCode',
  'MailingStateCode',
  'OtherStateCode',
  'StateCode'
]);

const COUNTRY_FIELDS = new Set([
  'BillingCountry',
  'ShippingCountry',
  'MailingCountry',
  'OtherCountry',
  'Country'
]);

const COUNTRY_CODE_FIELDS = new Set([
  'BillingCountryCode',
  'ShippingCountryCode',
  'MailingCountryCode',
  'OtherCountryCode',
  'CountryCode'
]);

function usage() {
  const script = path.basename(process.argv[1]);
  console.log(`Usage: node ${script} --input <csv> [--output <csv>] [--object <name>] [--preview <n>] [--prefer-name|--prefer-code|--auto] [--quiet]`);
  console.log('');
  console.log('Normalizes state/country values to reduce picklist mismatches.');
  process.exit(1);
}

function normalizeKey(value) {
  return String(value || '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildNameToCodeMap(source) {
  const map = {};
  Object.entries(source).forEach(([name, code]) => {
    map[normalizeKey(name)] = code;
  });
  return map;
}

function buildCodeToNameMap(source) {
  const map = {};
  Object.entries(source).forEach(([name, code]) => {
    map[String(code).toUpperCase()] = name;
  });
  return map;
}

const STATE_NAME_TO_CODE = {
  ...buildNameToCodeMap(US_STATES),
  ...buildNameToCodeMap(CANADA_PROVINCES),
  WASHINGTONDC: 'DC'
};

const STATE_CODE_TO_NAME = {
  ...buildCodeToNameMap(US_STATES),
  ...buildCodeToNameMap(CANADA_PROVINCES)
};

function normalizeStateValue(value, style) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return cleaned;
  }

  const key = normalizeKey(cleaned);

  if (style === 'code') {
    if (STATE_CODE_TO_NAME[key]) {
      return key;
    }
    if (STATE_NAME_TO_CODE[key]) {
      return STATE_NAME_TO_CODE[key];
    }
    return cleaned;
  }

  if (STATE_CODE_TO_NAME[key]) {
    return STATE_CODE_TO_NAME[key];
  }

  if (STATE_NAME_TO_CODE[key]) {
    const code = STATE_NAME_TO_CODE[key];
    return STATE_CODE_TO_NAME[code] || cleaned;
  }

  return cleaned;
}

function normalizeCountryValue(value, style) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return cleaned;
  }

  const key = normalizeKey(cleaned);

  if (style === 'code') {
    if (COUNTRY_CODE_TO_NAME[key]) {
      return key;
    }
    if (COUNTRY_CODE_ALIASES[key]) {
      return COUNTRY_CODE_ALIASES[key];
    }
    if (COUNTRY_NAME_TO_CODE[key]) {
      return COUNTRY_NAME_TO_CODE[key];
    }
    return cleaned;
  }

  if (COUNTRY_CODE_TO_NAME[key]) {
    return COUNTRY_CODE_TO_NAME[key];
  }

  if (COUNTRY_CODE_ALIASES[key]) {
    return COUNTRY_CODE_TO_NAME[COUNTRY_CODE_ALIASES[key]] || cleaned;
  }

  if (COUNTRY_NAME_TO_CODE[key]) {
    const code = COUNTRY_NAME_TO_CODE[key];
    return COUNTRY_CODE_TO_NAME[code] || cleaned;
  }

  return cleaned;
}

function detectFieldKey(header) {
  const parts = String(header || '').split('.');
  return parts[parts.length - 1];
}

function shouldNormalizeField(fieldKey) {
  if (STATE_FIELDS.has(fieldKey) || STATE_CODE_FIELDS.has(fieldKey)) {
    return 'state';
  }
  if (COUNTRY_FIELDS.has(fieldKey) || COUNTRY_CODE_FIELDS.has(fieldKey)) {
    return 'country';
  }
  return null;
}

function detectStyle(fieldKey, stats, type, preference) {
  if (type === 'state' && STATE_CODE_FIELDS.has(fieldKey)) {
    return 'code';
  }
  if (type === 'country' && COUNTRY_CODE_FIELDS.has(fieldKey)) {
    return 'code';
  }

  if (preference === 'name') {
    return 'name';
  }
  if (preference === 'code') {
    return 'code';
  }

  const total = stats.codeLike + stats.nameLike;
  if (total === 0) {
    return 'name';
  }

  const codeRatio = stats.codeLike / total;
  const nameRatio = stats.nameLike / total;

  if (codeRatio >= 0.6) {
    return 'code';
  }
  if (nameRatio >= 0.6) {
    return 'name';
  }

  return stats.codeLike >= stats.nameLike ? 'code' : 'name';
}

function classifyStateValue(value) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return null;
  }
  const key = normalizeKey(cleaned);
  if (STATE_CODE_TO_NAME[key]) {
    return 'code';
  }
  if (STATE_NAME_TO_CODE[key]) {
    return 'name';
  }
  return null;
}

function classifyCountryValue(value) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return null;
  }
  const key = normalizeKey(cleaned);
  if (COUNTRY_CODE_TO_NAME[key] || COUNTRY_CODE_ALIASES[key]) {
    return 'code';
  }
  if (COUNTRY_NAME_TO_CODE[key]) {
    return 'name';
  }
  return null;
}

function parseArgs(argv) {
  const options = {
    input: '',
    output: '',
    object: '',
    preview: 0,
    quiet: false,
    preference: 'name'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        if (!argv[i + 1]) {
          usage();
        }
        options.input = argv[i + 1];
        i += 1;
        break;
      case '--output':
      case '-o':
        if (!argv[i + 1]) {
          usage();
        }
        options.output = argv[i + 1];
        i += 1;
        break;
      case '--object':
        if (!argv[i + 1]) {
          usage();
        }
        options.object = argv[i + 1];
        i += 1;
        break;
      case '--preview':
      case '-p':
        if (!argv[i + 1]) {
          usage();
        }
        options.preview = Number(argv[i + 1] || 0);
        i += 1;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--prefer-name':
        options.preference = 'name';
        break;
      case '--prefer-code':
        options.preference = 'code';
        break;
      case '--auto':
        options.preference = 'auto';
        break;
      case '--help':
      case '-h':
        usage();
        break;
      default:
        break;
    }
  }

  if (!options.input) {
    usage();
  }

  if (!options.output) {
    options.output = options.input;
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.input)) {
    console.error(`Error: CSV file not found: ${options.input}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(options.input, 'utf8').replace(/^\uFEFF/, '');
  const parser = new RobustCSVParser();

  let rows = [];
  let headers = [];

  try {
    rows = parser.parse(csvContent, [], { allowMissingColumns: true });
    if (rows.length > 0) {
      headers = Object.keys(rows[0]).filter(key => !key.startsWith('_'));
    } else {
      const headerLine = csvContent.split('\n')[0] || '';
      headers = parser.parseCSVLine(headerLine).map(header => header.trim());
    }
  } catch (error) {
    console.error(`Error: Failed to parse CSV: ${error.message}`);
    process.exit(1);
  }

  if (headers.length === 0) {
    if (!options.quiet) {
      console.log('No headers found. Skipping normalization.');
    }
    fs.writeFileSync(options.output, csvContent, 'utf8');
    return;
  }

  const columns = [];
  const columnStats = {};

  headers.forEach(header => {
    const fieldKey = detectFieldKey(header);
    const type = shouldNormalizeField(fieldKey);
    if (!type) {
      return;
    }

    columns.push({ header, fieldKey, type });
    columnStats[header] = {
      codeLike: 0,
      nameLike: 0
    };
  });

  if (columns.length === 0 || rows.length === 0) {
    if (!options.quiet) {
      console.log('No state/country columns found. Skipping normalization.');
    }
    fs.writeFileSync(options.output, csvContent, 'utf8');
    return;
  }

  rows.forEach(row => {
    columns.forEach(({ header, type }) => {
      const value = row[header];
      if (type === 'state') {
        const classification = classifyStateValue(value);
        if (classification === 'code') {
          columnStats[header].codeLike += 1;
        } else if (classification === 'name') {
          columnStats[header].nameLike += 1;
        }
      } else {
        const classification = classifyCountryValue(value);
        if (classification === 'code') {
          columnStats[header].codeLike += 1;
        } else if (classification === 'name') {
          columnStats[header].nameLike += 1;
        }
      }
    });
  });

  const columnStyles = {};
  columns.forEach(({ header, fieldKey, type }) => {
    columnStyles[header] = detectStyle(fieldKey, columnStats[header], type, options.preference);
  });

  let changes = 0;
  const touchedColumns = new Set();

  rows.forEach(row => {
    columns.forEach(({ header, type }) => {
      const original = row[header];
      if (original === undefined) {
        return;
      }

      const style = columnStyles[header];
      const normalized = type === 'state'
        ? normalizeStateValue(original, style)
        : normalizeCountryValue(original, style);

      if (normalized !== original) {
        row[header] = normalized;
        changes += 1;
        touchedColumns.add(header);
      }
    });
  });

  const columnsTouched = touchedColumns.size;

  const output = parser.generate(rows, headers);
  fs.writeFileSync(options.output, output, 'utf8');

  if (!options.quiet) {
    const objectLabel = options.object ? ` for ${options.object}` : '';
    console.log(`Normalized state/country values${objectLabel}: ${changes} updates across ${columnsTouched} columns.`);
    console.log(`Preference: ${options.preference}`);
    if (options.preview > 0) {
      const previewRows = rows.slice(0, options.preview);
      console.log('');
      console.log('Preview:');
      previewRows.forEach((row, index) => {
        const rowLabel = `Row ${index + 1}`;
        const fields = columns.map(({ header }) => `${header}=${row[header] || ''}`).join(' | ');
        console.log(`${rowLabel}: ${fields}`);
      });
    }
  }
}

if (require.main === module) {
  main();
}
