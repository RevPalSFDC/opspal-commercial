#!/usr/bin/env node
/**
 * Domain Shadow Duplicate Scanner
 *
 * Scans account/company datasets (CSV, Salesforce, HubSpot, Marketo, domains list),
 * resolves websites to canonical domains via Gemini, and flags shadow duplicate groups
 * where distinct source domains resolve to the same canonical destination.
 *
 * @module domain-shadow-duplicate-scanner
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { invokeGemini, checkGeminiStatus } = require('./gemini-cli-invoker');

const DEFAULTS = {
  source: null,
  maxRecords: 200,
  batchSize: 15,
  timeout: 180000,
  resolutionMode: 'deterministic-first',
  localFallback: true,
  skipGemini: false,
  maxRedirectHops: 8,
  requestTimeoutMs: 8000,
  verbose: false
};

const RESOLUTION_MODES = new Set([
  'deterministic-first',
  'hybrid',
  'gemini-only'
]);

const WEBSITE_FIELD_CANDIDATES = [
  'website',
  'domain',
  'companydomain',
  'company_domain',
  'companywebsite',
  'company_website',
  'websiteurl',
  'website_url',
  'url',
  'homepage',
  'primarydomain',
  'accountwebsite'
];

const NAME_FIELD_CANDIDATES = [
  'name',
  'company',
  'companyname',
  'company_name',
  'accountname',
  'account_name',
  'displayname',
  'display_name',
  'legalname',
  'legal_name'
];

const ID_FIELD_CANDIDATES = [
  'id',
  'recordid',
  'record_id',
  'sfid',
  'sf_id',
  'accountid',
  'account_id',
  'hs_object_id',
  'mktoid',
  'marketoid',
  'marketo_id'
];

const STATUS_VALUES = new Set([
  'redirected',
  'active',
  'inactive',
  'unresolved',
  'redirected-local'
]);

function printHelp() {
  console.log(`
Domain Shadow Duplicate Scanner

Usage:
  node domain-shadow-duplicate-scanner.js --source <type> [options]

Sources:
  csv          Read from CSV file (--input required)
  json         Read from JSON array (--input required)
  salesforce   Query Salesforce Account websites via sf CLI (--org required)
  hubspot      Query HubSpot companies via API token
  marketo      Query Marketo named accounts via API credentials
  domains      Analyze a plain domain list (--domains or --input required)

Required / Common:
  --source <csv|json|salesforce|hubspot|marketo|domains>
  --input <path>                     Input file path for csv/json/domains
  --domains <a.com,b.com>            Comma-separated domains (domains source)
  --max-records <n>                  Maximum records to scan (default: ${DEFAULTS.maxRecords})
  --batch-size <n>                   Domains per Gemini request (default: ${DEFAULTS.batchSize})
  --output <path>                    JSON report output path

Field Mapping Overrides:
  --website-field <field>
  --name-field <field>
  --id-field <field>

Gemini Options:
  --model <gemini-model>
  --timeout <ms>                     Gemini timeout (default: ${DEFAULTS.timeout})
  --resolution-mode <mode>           deterministic-first|hybrid|gemini-only (default: ${DEFAULTS.resolutionMode})
  --skip-gemini                      Skip Gemini and only run local redirect checks
  --no-local-fallback                Disable HTTP redirect fallback

Salesforce:
  --org <alias>                      Salesforce org alias (required)
  --soql "<query>"                  Custom SOQL query

HubSpot:
  --hubspot-token <token>            Optional override; defaults to HUBSPOT_ACCESS_TOKEN / HUBSPOT_API_KEY

Marketo:
  --marketo-base-url <url>           Optional override; defaults to MARKETO_BASE_URL
  --marketo-client-id <id>           Optional override; defaults to MARKETO_CLIENT_ID
  --marketo-client-secret <secret>   Optional override; defaults to MARKETO_CLIENT_SECRET
  --marketo-endpoint <path>          Optional API path (default: /rest/v1/namedaccounts/list.json)

Other:
  --verbose
  --help

Examples:
  node domain-shadow-duplicate-scanner.js --source csv --input ./accounts.csv --output ./reports/shadow.json
  node domain-shadow-duplicate-scanner.js --source salesforce --org my-sandbox --max-records 300
  node domain-shadow-duplicate-scanner.js --source hubspot --max-records 250
  node domain-shadow-duplicate-scanner.js --source domains --domains acme.com,acquiredco.com
`);
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    source: null,
    input: null,
    domains: null,
    output: null,
    org: null,
    soql: null,
    model: null,
    websiteField: null,
    nameField: null,
    idField: null,
    hubspotToken: null,
    marketoBaseUrl: null,
    marketoClientId: null,
    marketoClientSecret: null,
    marketoEndpoint: '/rest/v1/namedaccounts/list.json'
  };

  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--skip-gemini':
        options.skipGemini = true;
        break;
      case '--no-local-fallback':
        options.localFallback = false;
        break;
      case '--source':
        options.source = (argv[++i] || '').toLowerCase();
        break;
      case '--input':
        options.input = argv[++i] || null;
        break;
      case '--domains':
        options.domains = argv[++i] || null;
        break;
      case '--output':
        options.output = argv[++i] || null;
        break;
      case '--org':
        options.org = argv[++i] || null;
        break;
      case '--soql':
        options.soql = argv[++i] || null;
        break;
      case '--model':
        options.model = argv[++i] || null;
        break;
      case '--timeout':
        options.timeout = parsePositiveInt(argv[++i], 'timeout');
        break;
      case '--resolution-mode':
        options.resolutionMode = String(argv[++i] || '').toLowerCase().trim();
        break;
      case '--max-records':
        options.maxRecords = parsePositiveInt(argv[++i], 'max-records');
        break;
      case '--batch-size':
        options.batchSize = parsePositiveInt(argv[++i], 'batch-size');
        break;
      case '--website-field':
        options.websiteField = argv[++i] || null;
        break;
      case '--name-field':
        options.nameField = argv[++i] || null;
        break;
      case '--id-field':
        options.idField = argv[++i] || null;
        break;
      case '--hubspot-token':
        options.hubspotToken = argv[++i] || null;
        break;
      case '--marketo-base-url':
        options.marketoBaseUrl = argv[++i] || null;
        break;
      case '--marketo-client-id':
        options.marketoClientId = argv[++i] || null;
        break;
      case '--marketo-client-secret':
        options.marketoClientSecret = argv[++i] || null;
        break;
      case '--marketo-endpoint':
        options.marketoEndpoint = argv[++i] || '/rest/v1/namedaccounts/list.json';
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positionals.push(arg);
        break;
    }
  }

  if (!options.source && positionals.length > 0) {
    options.source = positionals[0].toLowerCase();
  }

  if (!options.source) {
    if (options.domains) {
      options.source = 'domains';
    } else if (options.input) {
      const ext = path.extname(options.input).toLowerCase();
      if (ext === '.csv') {
        options.source = 'csv';
      } else if (ext === '.json') {
        options.source = 'json';
      } else {
        options.source = 'domains';
      }
    }
  }

  if (!RESOLUTION_MODES.has(options.resolutionMode)) {
    throw new Error(`--resolution-mode must be one of: ${Array.from(RESOLUTION_MODES).join(', ')}`);
  }

  return options;
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function inferFieldMap(records, options = {}) {
  const empty = {
    idField: options.idField || null,
    nameField: options.nameField || null,
    websiteField: options.websiteField || null
  };

  if (!Array.isArray(records) || records.length === 0) {
    return empty;
  }

  const headers = Object.keys(records[0]);
  const normalizedToOriginal = new Map();

  for (const header of headers) {
    const key = normalizeHeader(header);
    if (!normalizedToOriginal.has(key)) {
      normalizedToOriginal.set(key, header);
    }
  }

  function pickField(explicit, candidates) {
    if (explicit && headers.includes(explicit)) {
      return explicit;
    }

    for (const candidate of candidates) {
      const normalized = normalizeHeader(candidate);
      if (normalizedToOriginal.has(normalized)) {
        return normalizedToOriginal.get(normalized);
      }
    }

    return explicit || null;
  }

  return {
    idField: pickField(options.idField, ID_FIELD_CANDIDATES),
    nameField: pickField(options.nameField, NAME_FIELD_CANDIDATES),
    websiteField: pickField(options.websiteField, WEBSITE_FIELD_CANDIDATES)
  };
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];

    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') {
        i += 1;
      }

      row.push(value);
      value = '';

      if (!(row.length === 1 && row[0] === '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += ch;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    if (!(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
  }

  return rows;
}

function csvRowsToObjects(rows) {
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h || '').trim());
  const objects = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const obj = {};

    headers.forEach((header, idx) => {
      obj[header || `column_${idx + 1}`] = row[idx] !== undefined ? row[idx] : '';
    });

    objects.push(obj);
  }

  return objects;
}

function normalizeDomain(value) {
  if (value === null || value === undefined) return null;

  let text = String(value).trim();
  if (!text) return null;

  if (text.includes('@') && !text.includes(' ') && !text.includes('/')) {
    const emailParts = text.split('@');
    if (emailParts[1]) {
      text = emailParts[1].trim();
    }
  }

  text = text
    .replace(/^mailto:/i, '')
    .replace(/^\s*\[|\]\s*$/g, '')
    .trim();

  if (!text) return null;

  let candidate = text;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    let host = parsed.hostname.toLowerCase();

    host = host.replace(/^www\./, '').replace(/\.$/, '').trim();

    if (!host || !host.includes('.')) {
      return null;
    }

    return host;
  } catch (_) {
    return null;
  }
}

function loadJsonRecords(inputPath) {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Input file not found: ${absolute}`);
  }

  const content = fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(content);

  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;

  throw new Error('JSON input must be an array or an object containing a records array');
}

function loadCsvRecords(inputPath) {
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Input file not found: ${absolute}`);
  }

  const content = fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(content);
  return csvRowsToObjects(rows);
}

function loadDomainRecords(options) {
  let domains = [];

  if (options.domains) {
    domains = options.domains.split(',').map((d) => d.trim()).filter(Boolean);
  } else if (options.input) {
    const absolute = path.resolve(options.input);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Input file not found: ${absolute}`);
    }

    const content = fs.readFileSync(absolute, 'utf8');
    domains = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  if (domains.length === 0) {
    throw new Error('No domains provided. Use --domains or --input for source=domains');
  }

  return domains.map((domain, index) => ({
    id: `domain-${index + 1}`,
    name: domain,
    website: domain
  }));
}

function loadSalesforceRecords(options) {
  if (!options.org) {
    throw new Error('Salesforce source requires --org <alias>');
  }

  const soql = options.soql || `SELECT Id, Name, Website FROM Account WHERE Website != null ORDER BY LastModifiedDate DESC LIMIT ${options.maxRecords}`;
  const args = [
    'data',
    'query',
    '--target-org',
    options.org,
    '--query',
    soql,
    '--json'
  ];

  const result = spawnSync('sf', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Failed to execute sf CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').trim();
    throw new Error(`Salesforce query failed: ${details || `exit code ${result.status}`}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to parse Salesforce JSON response: ${error.message}`);
  }

  const records = Array.isArray(parsed?.result?.records)
    ? parsed.result.records.map((record) => {
      const clone = { ...record };
      delete clone.attributes;
      return clone;
    })
    : [];

  return {
    records,
    metadata: {
      org: options.org,
      soql
    }
  };
}

async function loadHubspotRecords(options) {
  const token = options.hubspotToken || process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY;
  if (!token) {
    throw new Error('HubSpot source requires HUBSPOT_ACCESS_TOKEN (or HUBSPOT_API_KEY) or --hubspot-token');
  }

  const records = [];
  let after = null;
  const maxRecords = options.maxRecords;

  const properties = Array.from(new Set([
    options.idField || 'hs_object_id',
    options.nameField || 'name',
    options.websiteField || 'website',
    'name',
    'website',
    'domain'
  ]));

  while (records.length < maxRecords) {
    const body = {
      limit: Math.min(100, maxRecords - records.length),
      properties
    };

    if (after) {
      body.after = after;
    }

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`HubSpot company query failed (${response.status}): ${details.slice(0, 500)}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload.results) ? payload.results : [];

    rows.forEach((row) => {
      records.push({
        id: row.id,
        hs_object_id: row.id,
        ...(row.properties || {})
      });
    });

    after = payload?.paging?.next?.after || null;
    if (!after || rows.length === 0) {
      break;
    }
  }

  return {
    records,
    metadata: {
      portalId: process.env.HUBSPOT_PORTAL_ID || null
    }
  };
}

async function loadMarketoRecords(options) {
  const baseUrl = (options.marketoBaseUrl || process.env.MARKETO_BASE_URL || '').replace(/\/$/, '');
  const clientId = options.marketoClientId || process.env.MARKETO_CLIENT_ID;
  const clientSecret = options.marketoClientSecret || process.env.MARKETO_CLIENT_SECRET;
  const endpoint = options.marketoEndpoint || '/rest/v1/namedaccounts/list.json';

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('Marketo source requires MARKETO_BASE_URL, MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET (or explicit --marketo-* flags)');
  }

  const tokenUrl = `${baseUrl}/identity/oauth/token?grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const tokenResponse = await fetch(tokenUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    throw new Error(`Marketo token request failed (${tokenResponse.status}): ${details.slice(0, 500)}`);
  }

  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload.access_token) {
    throw new Error(`Marketo token response missing access_token: ${JSON.stringify(tokenPayload).slice(0, 500)}`);
  }

  const endpointUrl = new URL(endpoint, `${baseUrl}/`);
  if (!endpointUrl.searchParams.has('maxReturn')) {
    endpointUrl.searchParams.set('maxReturn', String(Math.min(options.maxRecords, 200)));
  }
  if (!endpointUrl.searchParams.has('offset')) {
    endpointUrl.searchParams.set('offset', '0');
  }

  const apiResponse = await fetch(endpointUrl.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: 'application/json'
    }
  });

  if (!apiResponse.ok) {
    const details = await apiResponse.text();
    throw new Error(`Marketo data request failed (${apiResponse.status}): ${details.slice(0, 500)}`);
  }

  const payload = await apiResponse.json();
  if (!payload.success) {
    const errors = payload.errors ? JSON.stringify(payload.errors) : 'unknown error';
    throw new Error(`Marketo API returned success=false: ${errors}`);
  }

  const records = Array.isArray(payload.result) ? payload.result : [];

  return {
    records,
    metadata: {
      endpoint: endpointUrl.pathname,
      maxReturn: endpointUrl.searchParams.get('maxReturn')
    }
  };
}

async function loadRecordsBySource(options) {
  const source = (options.source || '').toLowerCase();

  switch (source) {
    case 'csv':
      if (!options.input) {
        throw new Error('CSV source requires --input <path>');
      }
      return {
        records: loadCsvRecords(options.input),
        metadata: { input: path.resolve(options.input) }
      };

    case 'json':
      if (!options.input) {
        throw new Error('JSON source requires --input <path>');
      }
      return {
        records: loadJsonRecords(options.input),
        metadata: { input: path.resolve(options.input) }
      };

    case 'domains':
      return {
        records: loadDomainRecords(options),
        metadata: {
          source: options.domains ? 'inline' : path.resolve(options.input)
        }
      };

    case 'salesforce':
      return loadSalesforceRecords(options);

    case 'hubspot':
      return loadHubspotRecords(options);

    case 'marketo':
      return loadMarketoRecords(options);

    default:
      throw new Error(`Unsupported source: ${options.source || '(missing)'}`);
  }
}

function toScanRecords(records, source, fieldMap, maxRecords) {
  const slice = records.slice(0, maxRecords);

  return slice.map((record, index) => {
    const rawWebsite = pickWebsite(record, fieldMap.websiteField);
    const inputDomain = normalizeDomain(rawWebsite);

    const sourceRecordId = pickFieldValue(record, fieldMap.idField) || `${source}-${index + 1}`;
    const companyName = pickFieldValue(record, fieldMap.nameField) || null;

    return {
      sourceSystem: source,
      sourceRecordId: String(sourceRecordId),
      companyName,
      website: rawWebsite || null,
      inputDomain
    };
  });
}

function pickFieldValue(record, fieldName) {
  if (!record || !fieldName || !(fieldName in record)) return null;
  const value = record[fieldName];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function pickWebsite(record, explicitWebsiteField) {
  if (!record || typeof record !== 'object') return null;

  if (explicitWebsiteField && record[explicitWebsiteField] !== undefined) {
    const value = String(record[explicitWebsiteField] || '').trim();
    if (value) return value;
  }

  for (const key of Object.keys(record)) {
    const normalized = normalizeHeader(key);
    if (!WEBSITE_FIELD_CANDIDATES.includes(normalized)) continue;

    const value = String(record[key] || '').trim();
    if (value) return value;
  }

  return null;
}

function chunk(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function buildGeminiPrompt(domains) {
  return [
    `Date context: ${new Date().toISOString().slice(0, 10)}.`,
    'You are analyzing company website canonicalization to detect CRM shadow duplicates caused by acquisitions or rebrands.',
    'For each input domain, determine the final canonical domain that the website effectively resolves to today.',
    'Use web reasoning/search when necessary. If uncertain, mark unresolved.',
    'Return ONLY valid JSON with this exact schema:',
    '{"results":[{"inputDomain":"example.com","resolvedDomain":"acquirer.com"|null,"status":"redirected|active|inactive|unresolved","confidence":0.0,"acquisitionSignal":false,"notes":"<=18 words"}]}',
    'Rules:',
    '- Keep domains lowercase and omit protocol/path.',
    '- If the domain redirects to another domain, status=redirected and resolvedDomain=final domain.',
    '- If the domain remains on itself, status=active and resolvedDomain=inputDomain.',
    '- If parked/dead/no reliable evidence, status=inactive or unresolved and resolvedDomain=null.',
    '- Prefer high precision over guessing.',
    `Input domains: ${JSON.stringify(domains)}`
  ].join('\n');
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const directCandidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    directCandidates.push(fenced[1].trim());
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    directCandidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    directCandidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of directCandidates) {
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // Try next candidate
    }
  }

  return null;
}

function extractGeminiContent(geminiResponse) {
  if (!geminiResponse) return '';
  if (typeof geminiResponse === 'string') return geminiResponse;

  if (typeof geminiResponse.content === 'string') {
    return geminiResponse.content;
  }

  if (typeof geminiResponse.response === 'string') {
    return geminiResponse.response;
  }

  if (geminiResponse.data) {
    if (typeof geminiResponse.data === 'string') {
      return geminiResponse.data;
    }

    if (typeof geminiResponse.data.response === 'string') {
      return geminiResponse.data.response;
    }
  }

  if (typeof geminiResponse.raw === 'string') {
    return geminiResponse.raw;
  }

  return JSON.stringify(geminiResponse);
}

function normalizeStatus(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (STATUS_VALUES.has(normalized)) return normalized;
  return 'unresolved';
}

function clampConfidence(value) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return Math.round(parsed * 100) / 100;
}

function createUnresolvedResult(inputDomain, notes = null) {
  return {
    inputDomain,
    resolvedDomain: null,
    status: 'unresolved',
    confidence: 0,
    acquisitionSignal: false,
    notes,
    resolutionMethod: 'none'
  };
}

function parseGeminiDomainResponse(geminiResponse, requestedDomains = []) {
  const content = extractGeminiContent(geminiResponse);
  const parsed = safeJsonParse(content);

  let results = [];

  if (Array.isArray(parsed)) {
    results = parsed;
  } else if (parsed && Array.isArray(parsed.results)) {
    results = parsed.results;
  } else if (geminiResponse?.data && Array.isArray(geminiResponse.data.results)) {
    results = geminiResponse.data.results;
  }

  const normalizedByDomain = new Map();

  for (const item of results) {
    const inputDomain = normalizeDomain(item?.inputDomain || item?.domain || item?.website);
    if (!inputDomain) continue;

    const resolvedDomain = normalizeDomain(
      item?.resolvedDomain || item?.canonicalDomain || item?.finalDomain || item?.redirectTarget
    );

    const status = normalizeStatus(item?.status || (resolvedDomain && resolvedDomain !== inputDomain ? 'redirected' : 'active'));

    const normalized = {
      inputDomain,
      resolvedDomain,
      status,
      confidence: clampConfidence(item?.confidence ?? (resolvedDomain ? 0.7 : 0)),
      acquisitionSignal: Boolean(item?.acquisitionSignal ?? item?.acquired ?? item?.possibleAcquisition),
      notes: String(item?.notes || item?.reason || '').trim() || null,
      resolutionMethod: 'gemini'
    };

    normalizedByDomain.set(inputDomain, normalized);
  }

  for (const domain of requestedDomains) {
    if (!normalizedByDomain.has(domain)) {
      normalizedByDomain.set(domain, createUnresolvedResult(domain, 'Gemini did not return this domain'));
    }
  }

  return Array.from(normalizedByDomain.values());
}

function isRedirectStatus(code) {
  return [301, 302, 303, 307, 308].includes(code);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function followRedirectChain(startUrl, options) {
  const chain = [];
  let currentUrl = startUrl;
  let method = 'HEAD';

  for (let hop = 0; hop <= options.maxRedirectHops; hop += 1) {
    let response;

    try {
      response = await fetchWithTimeout(currentUrl, {
        method,
        redirect: 'manual'
      }, options.requestTimeoutMs);

      if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
        method = 'GET';
        response = await fetchWithTimeout(currentUrl, {
          method,
          redirect: 'manual'
        }, options.requestTimeoutMs);
      }
    } catch (error) {
      return {
        finalDomain: null,
        finalUrl: null,
        status: 'unresolved',
        chain,
        error: error.message
      };
    }

    const location = response.headers.get('location');
    chain.push({
      url: currentUrl,
      status: response.status,
      location: location || null
    });

    if (isRedirectStatus(response.status) && location) {
      try {
        currentUrl = new URL(location, currentUrl).toString();
        method = 'HEAD';
        continue;
      } catch (error) {
        return {
          finalDomain: null,
          finalUrl: null,
          status: 'unresolved',
          chain,
          error: `Invalid redirect URL: ${error.message}`
        };
      }
    }

    return {
      finalDomain: normalizeDomain(currentUrl),
      finalUrl: currentUrl,
      status: response.ok ? 'active' : 'unresolved',
      chain,
      error: null
    };
  }

  return {
    finalDomain: normalizeDomain(currentUrl),
    finalUrl: currentUrl,
    status: 'unresolved',
    chain,
    error: 'Too many redirects'
  };
}

async function resolveDomainLocally(domain, options) {
  const attempts = [
    `https://${domain}`,
    `http://${domain}`
  ];

  let best = null;

  for (const url of attempts) {
    const result = await followRedirectChain(url, options);

    if (!best) {
      best = result;
    }

    if (result.finalDomain) {
      return result;
    }
  }

  return best || {
    finalDomain: null,
    finalUrl: null,
    status: 'unresolved',
    chain: [],
    error: 'Unable to resolve domain'
  };
}

function mergeLocalResolution(existing, local, inputDomain) {
  const merged = {
    ...existing,
    localResolution: {
      finalDomain: local.finalDomain,
      finalUrl: local.finalUrl,
      status: local.status,
      chain: local.chain,
      error: local.error
    }
  };

  if (!local.finalDomain) {
    return merged;
  }

  const redirected = local.finalDomain !== inputDomain;
  return {
    ...merged,
    resolvedDomain: local.finalDomain,
    status: redirected ? 'redirected-local' : 'active',
    confidence: Math.max(merged.confidence || 0, redirected ? 0.92 : 0.86),
    resolutionMethod: 'local_redirect',
    notes: merged.notes && !String(merged.notes).startsWith('Gemini')
      ? merged.notes
      : redirected
        ? 'Resolved via local HTTP redirect chain'
        : 'Resolved locally without cross-domain redirect'
  };
}

function buildGeminiResolutionSnapshot(entry) {
  if (!entry || !entry.resolvedDomain) return null;
  return {
    resolvedDomain: entry.resolvedDomain,
    status: entry.status,
    confidence: entry.confidence,
    acquisitionSignal: entry.acquisitionSignal,
    notes: entry.notes
  };
}

function mergeGeminiResolution(existing, geminiEntry, resolutionMode) {
  const fallback = existing || createUnresolvedResult(geminiEntry.inputDomain);

  if (resolutionMode === 'gemini-only') {
    return {
      ...fallback,
      ...geminiEntry,
      localResolution: fallback.localResolution || null,
      geminiResolution: buildGeminiResolutionSnapshot(geminiEntry),
      geminiError: null
    };
  }

  if (!fallback.resolvedDomain || fallback.status === 'unresolved') {
    return {
      ...fallback,
      ...geminiEntry,
      localResolution: fallback.localResolution || null,
      geminiResolution: buildGeminiResolutionSnapshot(geminiEntry),
      geminiError: null
    };
  }

  const geminiSnapshot = buildGeminiResolutionSnapshot(geminiEntry);

  if (geminiEntry.resolvedDomain && geminiEntry.resolvedDomain !== fallback.resolvedDomain) {
    return {
      ...fallback,
      geminiResolution: geminiSnapshot,
      geminiError: null,
      acquisitionSignal: fallback.acquisitionSignal || geminiEntry.acquisitionSignal,
      notes: fallback.notes || 'Resolved locally; Gemini suggested an alternate canonical domain'
    };
  }

  return {
    ...fallback,
    geminiResolution: geminiSnapshot || fallback.geminiResolution || null,
    geminiError: null,
    acquisitionSignal: fallback.acquisitionSignal || geminiEntry.acquisitionSignal,
    confidence: Math.max(fallback.confidence || 0, geminiEntry.confidence || 0),
    notes: fallback.notes || geminiEntry.notes || null
  };
}

async function resolveWithGeminiBatches(targetDomains, options, resultsByDomain) {
  if (targetDomains.length === 0) {
    return;
  }

  const status = checkGeminiStatus();
  if (!status.installed || !status.apiKeySet) {
    throw new Error(status.error || 'Gemini CLI is not configured');
  }

  const batches = chunk(targetDomains, options.batchSize);

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    if (options.verbose) {
      console.log(`Resolving batch ${i + 1}/${batches.length} with Gemini (${batch.length} domains)...`);
    }

    const prompt = buildGeminiPrompt(batch);

    try {
      const geminiResponse = await invokeGemini(prompt, {
        model: options.model || process.env.GEMINI_MODEL || null,
        outputFormat: 'json',
        timeout: options.timeout
      });

      const parsed = parseGeminiDomainResponse(geminiResponse, batch);
      parsed.forEach((entry) => {
        const current = resultsByDomain.get(entry.inputDomain) || createUnresolvedResult(entry.inputDomain);
        const merged = mergeGeminiResolution(current, entry, options.resolutionMode);
        resultsByDomain.set(entry.inputDomain, merged);
      });
    } catch (error) {
      batch.forEach((domain) => {
        const current = resultsByDomain.get(domain) || createUnresolvedResult(domain);
        const next = {
          ...current,
          geminiError: error.message
        };

        if (!current.resolvedDomain || current.status === 'unresolved') {
          next.notes = `Gemini error: ${error.message}`;
        }

        resultsByDomain.set(domain, next);
      });
    }
  }
}

async function resolveDomains(domains, options) {
  const uniqueDomains = Array.from(new Set(domains.filter(Boolean)));
  const resultsByDomain = new Map();

  if (uniqueDomains.length === 0) {
    return [];
  }

  uniqueDomains.forEach((domain) => {
    resultsByDomain.set(domain, createUnresolvedResult(domain));
  });

  if (options.localFallback && options.resolutionMode !== 'gemini-only') {
    for (const domain of uniqueDomains) {
      const current = resultsByDomain.get(domain);
      const local = await resolveDomainLocally(domain, options);
      const merged = mergeLocalResolution(current, local, domain);
      resultsByDomain.set(domain, merged);
    }
  }

  if (!options.skipGemini) {
    let geminiTargets;

    if (options.resolutionMode === 'gemini-only' || options.resolutionMode === 'hybrid') {
      geminiTargets = uniqueDomains;
    } else {
      geminiTargets = uniqueDomains.filter((domain) => {
        const current = resultsByDomain.get(domain);
        return !current.resolvedDomain || current.status === 'unresolved';
      });
    }

    await resolveWithGeminiBatches(geminiTargets, options, resultsByDomain);
  } else {
    for (const domain of uniqueDomains) {
      const current = resultsByDomain.get(domain);
      if (!current.resolvedDomain) {
        resultsByDomain.set(domain, {
          ...current,
          notes: current.notes || 'Gemini skipped by flag'
        });
      }
    }
  }

  if (options.localFallback && options.resolutionMode === 'gemini-only') {
    for (const domain of uniqueDomains) {
      const current = resultsByDomain.get(domain);
      const needsFallback = !current.resolvedDomain || current.status === 'unresolved';
      if (!needsFallback) continue;

      const local = await resolveDomainLocally(domain, options);
      const merged = mergeLocalResolution(current, local, domain);
      resultsByDomain.set(domain, merged);
    }
  }

  for (const domain of uniqueDomains) {
    const current = resultsByDomain.get(domain);
    if (!current.notes && !current.resolvedDomain) {
      resultsByDomain.set(domain, {
        ...current,
        notes: 'No resolution evidence'
      });
    }
  }

  return uniqueDomains.map((domain) => resultsByDomain.get(domain));
}

function clusterShadowDuplicates(records) {
  const byResolvedDomain = new Map();

  for (const record of records) {
    if (!record.resolvedDomain || !record.inputDomain) continue;

    if (!byResolvedDomain.has(record.resolvedDomain)) {
      byResolvedDomain.set(record.resolvedDomain, []);
    }

    byResolvedDomain.get(record.resolvedDomain).push(record);
  }

  const groups = [];

  for (const [resolvedDomain, members] of byResolvedDomain.entries()) {
    const uniqueInputDomains = Array.from(new Set(members.map((m) => m.inputDomain))).sort();

    if (uniqueInputDomains.length < 2) {
      continue;
    }

    const confidenceTotal = members.reduce((sum, member) => sum + (member.confidence || 0), 0);
    const averageConfidence = members.length > 0
      ? Math.round((confidenceTotal / members.length) * 100) / 100
      : 0;

    groups.push({
      resolvedDomain,
      memberCount: members.length,
      uniqueInputDomains,
      sourceSystems: Array.from(new Set(members.map((m) => m.sourceSystem))).sort(),
      likelyAcquisition: members.some((m) => Boolean(m.acquisitionSignal)),
      averageConfidence,
      records: members.map((m) => ({
        sourceSystem: m.sourceSystem,
        sourceRecordId: m.sourceRecordId,
        companyName: m.companyName,
        website: m.website,
        inputDomain: m.inputDomain,
        status: m.status,
        resolutionMethod: m.resolutionMethod || 'none',
        confidence: m.confidence,
        acquisitionSignal: m.acquisitionSignal,
        notes: m.notes
      }))
    });
  }

  groups.sort((a, b) => {
    if (b.memberCount !== a.memberCount) {
      return b.memberCount - a.memberCount;
    }

    return a.resolvedDomain.localeCompare(b.resolvedDomain);
  });

  return groups;
}

function summarizeStatus(records) {
  const summary = {};
  for (const record of records) {
    const key = record.status || 'unresolved';
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

function summarizeResolutionMethods(records) {
  const summary = {};
  for (const record of records) {
    const key = record.resolutionMethod || 'none';
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

function buildReport(options, sourceMetadata, fieldMap, scanRecords, resolutions, enrichedRecords, shadowDuplicateGroups) {
  const uniqueInputDomains = new Set(scanRecords.map((r) => r.inputDomain).filter(Boolean));
  const resolvedDomainCount = new Set(enrichedRecords.map((r) => r.resolvedDomain).filter(Boolean));

  return {
    generatedAt: new Date().toISOString(),
    source: {
      type: options.source,
      metadata: sourceMetadata
    },
    fieldMap,
    options: {
      maxRecords: options.maxRecords,
      batchSize: options.batchSize,
      model: options.model || process.env.GEMINI_MODEL || null,
      resolutionMode: options.resolutionMode,
      skipGemini: options.skipGemini,
      localFallback: options.localFallback
    },
    stats: {
      inputRecords: scanRecords.length,
      recordsWithWebsite: scanRecords.filter((r) => Boolean(r.inputDomain)).length,
      uniqueInputDomains: uniqueInputDomains.size,
      resolvedDomains: resolvedDomainCount.size,
      unresolvedDomains: resolutions.filter((r) => !r.resolvedDomain).length,
      shadowDuplicateGroups: shadowDuplicateGroups.length,
      shadowDuplicateRecords: shadowDuplicateGroups.reduce((sum, group) => sum + group.memberCount, 0),
      statusBreakdown: summarizeStatus(enrichedRecords),
      resolutionMethodBreakdown: summarizeResolutionMethods(enrichedRecords)
    },
    resolutions,
    shadowDuplicateGroups,
    records: enrichedRecords
  };
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'reports', `gemini-domain-shadow-duplicates-${stamp}.json`);
}

function writeReport(report, outputPath) {
  const resolvedPath = path.resolve(outputPath || defaultOutputPath());
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

function printSummary(report, outputPath) {
  console.log('\nDomain Shadow Duplicate Scan Complete');
  console.log('====================================');
  console.log(`Source: ${report.source.type}`);
  console.log(`Records scanned: ${report.stats.inputRecords}`);
  console.log(`Records with websites: ${report.stats.recordsWithWebsite}`);
  console.log(`Unique input domains: ${report.stats.uniqueInputDomains}`);
  console.log(`Resolved domains: ${report.stats.resolvedDomains}`);
  console.log(`Resolved locally: ${report.stats.resolutionMethodBreakdown.local_redirect || 0}`);
  console.log(`Resolved via Gemini: ${report.stats.resolutionMethodBreakdown.gemini || 0}`);
  console.log(`Shadow duplicate groups: ${report.stats.shadowDuplicateGroups}`);

  if (report.shadowDuplicateGroups.length > 0) {
    console.log('\nTop shadow duplicate groups:');

    report.shadowDuplicateGroups.slice(0, 10).forEach((group, index) => {
      const domains = group.uniqueInputDomains.slice(0, 4).join(', ');
      const plusMore = group.uniqueInputDomains.length > 4 ? ` +${group.uniqueInputDomains.length - 4} more` : '';
      console.log(`  ${index + 1}. ${group.resolvedDomain} (${group.memberCount} records)`);
      console.log(`     Inputs: ${domains}${plusMore}`);
    });
  }

  if (outputPath) {
    console.log(`\nReport written to: ${outputPath}`);
  }
}

async function scanShadowDuplicates(options) {
  const sourceResult = await loadRecordsBySource(options);
  const sourceRecords = Array.isArray(sourceResult.records) ? sourceResult.records : [];

  if (sourceRecords.length === 0) {
    throw new Error(`No records returned from source ${options.source}`);
  }

  const fieldMap = inferFieldMap(sourceRecords, options);
  const scanRecords = toScanRecords(sourceRecords, options.source, fieldMap, options.maxRecords);

  const domains = Array.from(new Set(scanRecords.map((record) => record.inputDomain).filter(Boolean)));
  const resolutions = await resolveDomains(domains, options);

  const resolutionMap = new Map(resolutions.map((resolution) => [resolution.inputDomain, resolution]));

  const enrichedRecords = scanRecords.map((record) => {
    const resolution = record.inputDomain ? resolutionMap.get(record.inputDomain) : null;

    return {
      ...record,
      resolvedDomain: resolution?.resolvedDomain || null,
      status: resolution?.status || 'unresolved',
      resolutionMethod: resolution?.resolutionMethod || 'none',
      confidence: resolution?.confidence || 0,
      acquisitionSignal: resolution?.acquisitionSignal || false,
      notes: resolution?.notes || null,
      localResolution: resolution?.localResolution || null,
      geminiResolution: resolution?.geminiResolution || null,
      geminiError: resolution?.geminiError || null
    };
  });

  const shadowDuplicateGroups = clusterShadowDuplicates(enrichedRecords);

  return buildReport(
    options,
    sourceResult.metadata || {},
    fieldMap,
    scanRecords,
    resolutions,
    enrichedRecords,
    shadowDuplicateGroups
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.source) {
    throw new Error('Missing --source. Run with --help for usage.');
  }

  if (options.verbose) {
    console.log(`Starting scan for source=${options.source}, maxRecords=${options.maxRecords}`);
  }

  const report = await scanShadowDuplicates(options);
  const outputPath = writeReport(report, options.output);
  printSummary(report, outputPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULTS,
  parseArgs,
  parseCsv,
  normalizeDomain,
  inferFieldMap,
  buildGeminiPrompt,
  parseGeminiDomainResponse,
  clusterShadowDuplicates,
  scanShadowDuplicates
};
