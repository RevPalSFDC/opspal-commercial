#!/usr/bin/env node

/**
 * Location Normalization
 *
 * Geographic-specific utilities for normalizing and comparing location data.
 * Used by the Geographic Entity Resolver for multi-location entity matching.
 *
 * Features:
 * - City name normalization and alias mapping
 * - Phone area code extraction and comparison
 * - US state code handling
 * - Address proximity estimation
 * - Domain/website normalization
 *
 * Usage:
 *   const { LocationNormalizer } = require('./location-normalization');
 *   const normalizer = new LocationNormalizer();
 *
 *   normalizer.normalizeCity('NYC');  // 'New York'
 *   normalizer.extractAreaCode('+1 (555) 123-4567');  // '555'
 *   normalizer.sharePhonePattern(phoneA, phoneB);  // true/false
 */

'use strict';

class LocationNormalizer {
  constructor(options = {}) {
    this.options = options;

    // City aliases - common abbreviations and variations
    this.cityAliases = new Map([
      // Major US cities
      ['nyc', 'new york'],
      ['new york city', 'new york'],
      ['ny', 'new york'],
      ['la', 'los angeles'],
      ['l.a.', 'los angeles'],
      ['sf', 'san francisco'],
      ['s.f.', 'san francisco'],
      ['chi', 'chicago'],
      ['philly', 'philadelphia'],
      ['dc', 'washington'],
      ['d.c.', 'washington'],
      ['washington dc', 'washington'],
      ['washington d.c.', 'washington'],
      ['atl', 'atlanta'],
      ['dtw', 'detroit'],
      ['dfw', 'dallas'],
      ['dallas-fort worth', 'dallas'],
      ['dallas/fort worth', 'dallas'],
      ['mpls', 'minneapolis'],
      ['minneapolis-st paul', 'minneapolis'],
      ['minneapolis/st paul', 'minneapolis'],
      ['twin cities', 'minneapolis'],
      ['stl', 'st louis'],
      ['saint louis', 'st louis'],
      ['nola', 'new orleans'],
      ['vegas', 'las vegas'],
      ['lv', 'las vegas'],
      ['slc', 'salt lake city'],
      ['okc', 'oklahoma city'],
      ['kc', 'kansas city'],
      ['bmore', 'baltimore'],
      ['phl', 'philadelphia'],
      ['bos', 'boston'],
      ['sea', 'seattle'],
      ['pdx', 'portland'],
      ['phx', 'phoenix'],
      ['sat', 'san antonio'],
      ['sd', 'san diego'],
      ['sj', 'san jose'],
      ['jax', 'jacksonville'],
      ['clt', 'charlotte'],
      ['ind', 'indianapolis'],
      ['indy', 'indianapolis'],
      ['cbus', 'columbus'],
      ['den', 'denver'],
      ['hou', 'houston'],
      ['aus', 'austin'],
      ['mke', 'milwaukee'],
      ['mem', 'memphis'],
      ['nash', 'nashville'],
      ['lou', 'louisville'],
      ['abq', 'albuquerque'],
      ['tuc', 'tucson'],
      ['fresno', 'fresno'],
      ['sacto', 'sacramento'],
      ['sac', 'sacramento'],
      ['oak', 'oakland'],

      // Canadian cities
      ['van', 'vancouver'],
      ['tor', 'toronto'],
      ['mtl', 'montreal'],
      ['ott', 'ottawa'],
      ['cal', 'calgary'],
      ['edm', 'edmonton'],
      ['wpg', 'winnipeg'],
    ]);

    // US State codes
    this.stateCodes = new Map([
      ['AL', 'alabama'], ['AK', 'alaska'], ['AZ', 'arizona'], ['AR', 'arkansas'],
      ['CA', 'california'], ['CO', 'colorado'], ['CT', 'connecticut'], ['DE', 'delaware'],
      ['FL', 'florida'], ['GA', 'georgia'], ['HI', 'hawaii'], ['ID', 'idaho'],
      ['IL', 'illinois'], ['IN', 'indiana'], ['IA', 'iowa'], ['KS', 'kansas'],
      ['KY', 'kentucky'], ['LA', 'louisiana'], ['ME', 'maine'], ['MD', 'maryland'],
      ['MA', 'massachusetts'], ['MI', 'michigan'], ['MN', 'minnesota'], ['MS', 'mississippi'],
      ['MO', 'missouri'], ['MT', 'montana'], ['NE', 'nebraska'], ['NV', 'nevada'],
      ['NH', 'new hampshire'], ['NJ', 'new jersey'], ['NM', 'new mexico'], ['NY', 'new york'],
      ['NC', 'north carolina'], ['ND', 'north dakota'], ['OH', 'ohio'], ['OK', 'oklahoma'],
      ['OR', 'oregon'], ['PA', 'pennsylvania'], ['RI', 'rhode island'], ['SC', 'south carolina'],
      ['SD', 'south dakota'], ['TN', 'tennessee'], ['TX', 'texas'], ['UT', 'utah'],
      ['VT', 'vermont'], ['VA', 'virginia'], ['WA', 'washington'], ['WV', 'west virginia'],
      ['WI', 'wisconsin'], ['WY', 'wyoming'], ['DC', 'district of columbia']
    ]);

    // State name to code reverse mapping
    this.stateNames = new Map();
    for (const [code, name] of this.stateCodes) {
      this.stateNames.set(name, code);
    }

    // Canadian province codes
    this.provinceCodes = new Map([
      ['ON', 'ontario'], ['QC', 'quebec'], ['BC', 'british columbia'],
      ['AB', 'alberta'], ['SK', 'saskatchewan'], ['MB', 'manitoba'],
      ['NS', 'nova scotia'], ['NB', 'new brunswick'],
      ['PE', 'prince edward island'], ['NL', 'newfoundland and labrador']
    ]);

    // Area code to state/region mapping (sample - major codes)
    this.areaCodeRegions = new Map([
      // California
      ['213', 'CA'], ['310', 'CA'], ['323', 'CA'], ['408', 'CA'], ['415', 'CA'],
      ['510', 'CA'], ['562', 'CA'], ['619', 'CA'], ['626', 'CA'], ['650', 'CA'],
      ['707', 'CA'], ['714', 'CA'], ['760', 'CA'], ['805', 'CA'], ['818', 'CA'],
      ['858', 'CA'], ['909', 'CA'], ['916', 'CA'], ['925', 'CA'], ['949', 'CA'],
      // Texas
      ['210', 'TX'], ['214', 'TX'], ['281', 'TX'], ['361', 'TX'], ['409', 'TX'],
      ['512', 'TX'], ['713', 'TX'], ['817', 'TX'], ['832', 'TX'], ['903', 'TX'],
      ['915', 'TX'], ['936', 'TX'], ['940', 'TX'], ['956', 'TX'], ['972', 'TX'],
      // New York
      ['212', 'NY'], ['315', 'NY'], ['347', 'NY'], ['516', 'NY'], ['518', 'NY'],
      ['585', 'NY'], ['607', 'NY'], ['631', 'NY'], ['646', 'NY'], ['716', 'NY'],
      ['718', 'NY'], ['845', 'NY'], ['914', 'NY'], ['917', 'NY'],
      // Florida
      ['239', 'FL'], ['305', 'FL'], ['321', 'FL'], ['352', 'FL'], ['386', 'FL'],
      ['407', 'FL'], ['561', 'FL'], ['727', 'FL'], ['754', 'FL'], ['772', 'FL'],
      ['786', 'FL'], ['813', 'FL'], ['850', 'FL'], ['863', 'FL'], ['904', 'FL'],
      ['941', 'FL'], ['954', 'FL'],
      // Illinois
      ['217', 'IL'], ['224', 'IL'], ['309', 'IL'], ['312', 'IL'], ['331', 'IL'],
      ['618', 'IL'], ['630', 'IL'], ['708', 'IL'], ['773', 'IL'], ['815', 'IL'],
      ['847', 'IL'],
      // Pennsylvania
      ['215', 'PA'], ['267', 'PA'], ['412', 'PA'], ['484', 'PA'], ['570', 'PA'],
      ['610', 'PA'], ['717', 'PA'], ['724', 'PA'], ['814', 'PA'],
      // Ohio
      ['216', 'OH'], ['234', 'OH'], ['330', 'OH'], ['419', 'OH'], ['440', 'OH'],
      ['513', 'OH'], ['567', 'OH'], ['614', 'OH'], ['740', 'OH'], ['937', 'OH'],
      // Georgia
      ['229', 'GA'], ['404', 'GA'], ['470', 'GA'], ['478', 'GA'], ['678', 'GA'],
      ['706', 'GA'], ['762', 'GA'], ['770', 'GA'], ['912', 'GA'],
      // North Carolina
      ['252', 'NC'], ['336', 'NC'], ['704', 'NC'], ['828', 'NC'], ['910', 'NC'],
      ['919', 'NC'], ['980', 'NC'],
      // Michigan
      ['231', 'MI'], ['248', 'MI'], ['269', 'MI'], ['313', 'MI'], ['517', 'MI'],
      ['586', 'MI'], ['616', 'MI'], ['734', 'MI'], ['810', 'MI'], ['906', 'MI'],
      // New Jersey
      ['201', 'NJ'], ['551', 'NJ'], ['609', 'NJ'], ['732', 'NJ'], ['848', 'NJ'],
      ['856', 'NJ'], ['862', 'NJ'], ['908', 'NJ'], ['973', 'NJ'],
      // Virginia
      ['276', 'VA'], ['434', 'VA'], ['540', 'VA'], ['571', 'VA'], ['703', 'VA'],
      ['757', 'VA'], ['804', 'VA'],
      // Washington
      ['206', 'WA'], ['253', 'WA'], ['360', 'WA'], ['425', 'WA'], ['509', 'WA'],
      // Massachusetts
      ['339', 'MA'], ['351', 'MA'], ['413', 'MA'], ['508', 'MA'], ['617', 'MA'],
      ['774', 'MA'], ['781', 'MA'], ['857', 'MA'], ['978', 'MA'],
      // Arizona
      ['480', 'AZ'], ['520', 'AZ'], ['602', 'AZ'], ['623', 'AZ'], ['928', 'AZ'],
      // Tennessee
      ['423', 'TN'], ['615', 'TN'], ['629', 'TN'], ['731', 'TN'], ['865', 'TN'],
      ['901', 'TN'], ['931', 'TN'],
      // Colorado
      ['303', 'CO'], ['719', 'CO'], ['720', 'CO'], ['970', 'CO'],
      // Missouri
      ['314', 'MO'], ['417', 'MO'], ['573', 'MO'], ['636', 'MO'], ['660', 'MO'],
      ['816', 'MO'],
      // Maryland
      ['240', 'MD'], ['301', 'MD'], ['410', 'MD'], ['443', 'MD'], ['667', 'MD'],
      // Wisconsin
      ['262', 'WI'], ['414', 'WI'], ['608', 'WI'], ['715', 'WI'], ['920', 'WI'],
      // Minnesota
      ['218', 'MN'], ['320', 'MN'], ['507', 'MN'], ['612', 'MN'], ['651', 'MN'],
      ['763', 'MN'], ['952', 'MN'],
      // Oregon
      ['458', 'OR'], ['503', 'OR'], ['541', 'OR'], ['971', 'OR'],
      // Alabama
      ['205', 'AL'], ['251', 'AL'], ['256', 'AL'], ['334', 'AL'],
      // South Carolina
      ['803', 'SC'], ['843', 'SC'], ['864', 'SC'],
      // Louisiana
      ['225', 'LA'], ['318', 'LA'], ['337', 'LA'], ['504', 'LA'], ['985', 'LA'],
      // Kentucky
      ['270', 'KY'], ['502', 'KY'], ['606', 'KY'], ['859', 'KY'],
      // Connecticut
      ['203', 'CT'], ['475', 'CT'], ['860', 'CT'],
      // Oklahoma
      ['405', 'OK'], ['539', 'OK'], ['580', 'OK'], ['918', 'OK'],
      // Iowa
      ['319', 'IA'], ['515', 'IA'], ['563', 'IA'], ['641', 'IA'], ['712', 'IA'],
      // Arkansas
      ['479', 'AR'], ['501', 'AR'], ['870', 'AR'],
      // Nevada
      ['702', 'NV'], ['725', 'NV'], ['775', 'NV'],
      // Utah
      ['385', 'UT'], ['435', 'UT'], ['801', 'UT'],
      // Kansas
      ['316', 'KS'], ['620', 'KS'], ['785', 'KS'], ['913', 'KS'],
      // Mississippi
      ['228', 'MS'], ['601', 'MS'], ['662', 'MS'], ['769', 'MS'],
      // Nebraska
      ['308', 'NE'], ['402', 'NE'], ['531', 'NE'],
      // New Mexico
      ['505', 'NM'], ['575', 'NM'],
      // West Virginia
      ['304', 'WV'], ['681', 'WV'],
      // Idaho
      ['208', 'ID'], ['986', 'ID'],
      // Hawaii
      ['808', 'HI'],
      // Maine
      ['207', 'ME'],
      // New Hampshire
      ['603', 'NH'],
      // Rhode Island
      ['401', 'RI'],
      // Montana
      ['406', 'MT'],
      // Delaware
      ['302', 'DE'],
      // South Dakota
      ['605', 'SD'],
      // North Dakota
      ['701', 'ND'],
      // Alaska
      ['907', 'AK'],
      // Vermont
      ['802', 'VT'],
      ['DC', '202'], ['202', 'DC'],
      // Wyoming
      ['307', 'WY'],
    ]);
  }

  /**
   * Normalize city name to canonical form
   * @param {string} city - City name or abbreviation
   * @returns {string} Normalized city name
   */
  normalizeCity(city) {
    if (!city) return '';

    const normalized = city.toLowerCase().trim();

    // Check aliases first
    if (this.cityAliases.has(normalized)) {
      return this._titleCase(this.cityAliases.get(normalized));
    }

    // Return title-cased original
    return this._titleCase(normalized);
  }

  /**
   * Extract area code from phone number
   * @param {string} phone - Phone number in any format
   * @returns {string|null} Area code or null
   */
  extractAreaCode(phone) {
    if (!phone) return null;

    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Handle various formats
    let digits = cleaned;

    // Remove country code if present
    if (digits.startsWith('+1')) {
      digits = digits.substring(2);
    } else if (digits.startsWith('1') && digits.length === 11) {
      digits = digits.substring(1);
    }

    // Extract first 3 digits as area code
    if (digits.length >= 10) {
      return digits.substring(0, 3);
    }

    return null;
  }

  /**
   * Check if two phone numbers share the same area code
   * @param {string} phoneA - First phone number
   * @param {string} phoneB - Second phone number
   * @returns {boolean}
   */
  sharePhonePattern(phoneA, phoneB) {
    const areaCodeA = this.extractAreaCode(phoneA);
    const areaCodeB = this.extractAreaCode(phoneB);

    if (!areaCodeA || !areaCodeB) return false;
    return areaCodeA === areaCodeB;
  }

  /**
   * Get state from area code
   * @param {string} areaCode - 3-digit area code
   * @returns {string|null} State code or null
   */
  getStateFromAreaCode(areaCode) {
    if (!areaCode) return null;
    return this.areaCodeRegions.get(areaCode) || null;
  }

  /**
   * Check if two phone numbers are from the same state based on area code
   * @param {string} phoneA - First phone number
   * @param {string} phoneB - Second phone number
   * @returns {Object} { sameState, stateA, stateB }
   */
  comparePhoneStates(phoneA, phoneB) {
    const areaCodeA = this.extractAreaCode(phoneA);
    const areaCodeB = this.extractAreaCode(phoneB);

    const stateA = this.getStateFromAreaCode(areaCodeA);
    const stateB = this.getStateFromAreaCode(areaCodeB);

    return {
      sameState: stateA && stateB && stateA === stateB,
      stateA,
      stateB,
      areaCodeA,
      areaCodeB
    };
  }

  /**
   * Normalize domain/website
   * @param {string} domain - Domain or URL
   * @returns {string} Normalized domain
   */
  normalizeDomain(domain) {
    if (!domain) return '';

    let normalized = domain.toLowerCase().trim();

    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove www
    normalized = normalized.replace(/^www\./, '');

    // Remove trailing slash and path
    normalized = normalized.replace(/\/.*$/, '');

    // Remove port
    normalized = normalized.replace(/:\d+$/, '');

    return normalized;
  }

  /**
   * Check if two domains are the same (after normalization)
   * @param {string} domainA - First domain
   * @param {string} domainB - Second domain
   * @returns {boolean}
   */
  sameDomain(domainA, domainB) {
    const normalizedA = this.normalizeDomain(domainA);
    const normalizedB = this.normalizeDomain(domainB);

    if (!normalizedA || !normalizedB) return false;
    return normalizedA === normalizedB;
  }

  /**
   * Normalize state to code
   * @param {string} state - State name or code
   * @returns {string|null} State code or null
   */
  normalizeState(state) {
    if (!state) return null;

    const normalized = state.trim().toUpperCase();

    // Already a code
    if (normalized.length === 2 && this.stateCodes.has(normalized)) {
      return normalized;
    }

    // Check state names
    const lowerState = state.toLowerCase().trim();
    if (this.stateNames.has(lowerState)) {
      return this.stateNames.get(lowerState);
    }

    // Check province codes
    if (normalized.length === 2 && this.provinceCodes.has(normalized)) {
      return normalized;
    }

    return null;
  }

  /**
   * Check if two states are the same
   * @param {string} stateA - First state
   * @param {string} stateB - Second state
   * @returns {boolean}
   */
  sameState(stateA, stateB) {
    const codeA = this.normalizeState(stateA);
    const codeB = this.normalizeState(stateB);

    if (!codeA || !codeB) return false;
    return codeA === codeB;
  }

  /**
   * Get full state name from code
   * @param {string} code - State code
   * @returns {string|null} Full state name
   */
  getStateName(code) {
    if (!code) return null;
    const normalized = code.toUpperCase();
    return this.stateCodes.get(normalized) || null;
  }

  /**
   * Compare two locations for proximity signals
   * @param {Object} locationA - { state, city, phone, domain }
   * @param {Object} locationB - { state, city, phone, domain }
   * @returns {Object} Comparison result with signals
   */
  compareLocations(locationA, locationB) {
    const signals = [];
    let score = 0;

    // State comparison
    if (locationA.state && locationB.state) {
      if (this.sameState(locationA.state, locationB.state)) {
        score += 30;
        signals.push({ type: 'SAME_STATE', weight: 30 });
      } else {
        score -= 20;
        signals.push({
          type: 'DIFFERENT_STATE',
          stateA: this.normalizeState(locationA.state),
          stateB: this.normalizeState(locationB.state),
          weight: -20
        });
      }
    }

    // City comparison
    if (locationA.city && locationB.city) {
      const cityA = this.normalizeCity(locationA.city);
      const cityB = this.normalizeCity(locationB.city);
      if (cityA.toLowerCase() === cityB.toLowerCase()) {
        score += 25;
        signals.push({ type: 'SAME_CITY', value: cityA, weight: 25 });
      }
    }

    // Phone area code comparison
    if (locationA.phone && locationB.phone) {
      const phoneComparison = this.comparePhoneStates(locationA.phone, locationB.phone);
      if (this.sharePhonePattern(locationA.phone, locationB.phone)) {
        score += 15;
        signals.push({
          type: 'SAME_AREA_CODE',
          areaCode: this.extractAreaCode(locationA.phone),
          weight: 15
        });
      } else if (phoneComparison.sameState) {
        score += 10;
        signals.push({
          type: 'SAME_STATE_PHONE',
          state: phoneComparison.stateA,
          weight: 10
        });
      }
    }

    // Domain comparison
    if (locationA.domain && locationB.domain) {
      if (this.sameDomain(locationA.domain, locationB.domain)) {
        score += 40;
        signals.push({
          type: 'SAME_DOMAIN',
          domain: this.normalizeDomain(locationA.domain),
          weight: 40
        });
      } else {
        score -= 25;
        signals.push({
          type: 'DIFFERENT_DOMAIN',
          domainA: this.normalizeDomain(locationA.domain),
          domainB: this.normalizeDomain(locationB.domain),
          weight: -25
        });
      }
    }

    return {
      score,
      signals,
      sameState: locationA.state && locationB.state && this.sameState(locationA.state, locationB.state),
      sameDomain: locationA.domain && locationB.domain && this.sameDomain(locationA.domain, locationB.domain),
      sameAreaCode: locationA.phone && locationB.phone && this.sharePhonePattern(locationA.phone, locationB.phone)
    };
  }

  /**
   * Title case a string
   * @private
   */
  _titleCase(str) {
    return str.replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
}

// Export
module.exports = { LocationNormalizer };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const normalizer = new LocationNormalizer();

  if (args.length === 0) {
    console.log(`
Location Normalization CLI

Usage:
  node location-normalization.js city "<city>"            Normalize city name
  node location-normalization.js phone "<phone>"          Extract area code
  node location-normalization.js compare-phones "<p1>" "<p2>"  Compare phone area codes
  node location-normalization.js domain "<domain>"        Normalize domain
  node location-normalization.js state "<state>"          Normalize state
  node location-normalization.js compare "<json1>" "<json2>"  Compare locations

Examples:
  node location-normalization.js city "NYC"
  node location-normalization.js phone "+1 (555) 123-4567"
  node location-normalization.js compare-phones "(213) 555-1234" "(310) 555-5678"
  node location-normalization.js domain "https://www.example.com/page"
  node location-normalization.js state "California"
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'city') {
    const city = args[1];
    console.log(`\nOriginal: "${city}"`);
    console.log(`Normalized: "${normalizer.normalizeCity(city)}"\n`);

  } else if (command === 'phone') {
    const phone = args[1];
    const areaCode = normalizer.extractAreaCode(phone);
    const state = normalizer.getStateFromAreaCode(areaCode);
    console.log(`\nPhone: "${phone}"`);
    console.log(`Area Code: ${areaCode || 'N/A'}`);
    console.log(`State: ${state || 'Unknown'}\n`);

  } else if (command === 'compare-phones') {
    const phone1 = args[1];
    const phone2 = args[2];
    const result = normalizer.comparePhoneStates(phone1, phone2);
    console.log(`\nPhone 1: "${phone1}" → Area ${result.areaCodeA} (${result.stateA || '?'})`);
    console.log(`Phone 2: "${phone2}" → Area ${result.areaCodeB} (${result.stateB || '?'})`);
    console.log(`Same Area Code: ${normalizer.sharePhonePattern(phone1, phone2)}`);
    console.log(`Same State: ${result.sameState}\n`);

  } else if (command === 'domain') {
    const domain = args[1];
    console.log(`\nOriginal: "${domain}"`);
    console.log(`Normalized: "${normalizer.normalizeDomain(domain)}"\n`);

  } else if (command === 'state') {
    const state = args[1];
    const code = normalizer.normalizeState(state);
    const name = normalizer.getStateName(code);
    console.log(`\nInput: "${state}"`);
    console.log(`Code: ${code || 'N/A'}`);
    console.log(`Full Name: ${name || 'N/A'}\n`);

  } else if (command === 'compare') {
    const loc1 = JSON.parse(args[1]);
    const loc2 = JSON.parse(args[2]);
    const result = normalizer.compareLocations(loc1, loc2);
    console.log('\n--- Location Comparison ---');
    console.log(`Score: ${result.score}`);
    console.log(`Same State: ${result.sameState}`);
    console.log(`Same Domain: ${result.sameDomain}`);
    console.log(`Same Area Code: ${result.sameAreaCode}`);
    console.log('\nSignals:');
    result.signals.forEach(s => {
      console.log(`  ${s.weight > 0 ? '+' : ''}${s.weight}: ${s.type}`);
    });
    console.log('');

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
