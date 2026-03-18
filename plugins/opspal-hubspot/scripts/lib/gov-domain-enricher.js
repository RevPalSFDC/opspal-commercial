#!/usr/bin/env node

/**
 * Government Domain Enricher
 *
 * Enriches contacts by deriving full organization names from .gov email domains.
 * Addresses the key issue: contacts with domains like "@fbi.gov" but company field
 * missing "Federal Bureau of Investigation" can't be classified.
 *
 * Strategy:
 * 1. Extract domain from email
 * 2. Lookup domain in federal/state/local registry
 * 3. Return full organization name for classifier
 *
 * Expected Impact: 30-40% improvement in classification rate
 */

// Federal Agency Domain Registry
// Source: Common federal .gov domains
const FEDERAL_DOMAINS = {
  // Law Enforcement & Justice
  'fbi.gov': 'Federal Bureau of Investigation',
  'atf.gov': 'Bureau of Alcohol, Tobacco, Firearms and Explosives',
  'dea.gov': 'Drug Enforcement Administration',
  'usmarshals.gov': 'U.S. Marshals Service',
  'bop.gov': 'Federal Bureau of Prisons',
  'usdoj.gov': 'U.S. Department of Justice',
  'doj.gov': 'U.S. Department of Justice',

  // Homeland Security & Emergency
  'dhs.gov': 'Department of Homeland Security',
  'fema.gov': 'Federal Emergency Management Agency',
  'fema.dhs.gov': 'Federal Emergency Management Agency',
  'tsa.gov': 'Transportation Security Administration',
  'uscg.mil': 'U.S. Coast Guard',
  'ice.gov': 'Immigration and Customs Enforcement',
  'cbp.gov': 'Customs and Border Protection',
  'usss.gov': 'U.S. Secret Service',

  // Transportation
  'dot.gov': 'U.S. Department of Transportation',
  'faa.gov': 'Federal Aviation Administration',
  'nhtsa.gov': 'National Highway Traffic Safety Administration',
  'fmcsa.dot.gov': 'Federal Motor Carrier Safety Administration',

  // Other Federal
  'gsa.gov': 'General Services Administration',
  'opm.gov': 'Office of Personnel Management',
  'va.gov': 'Department of Veterans Affairs'
};

// State Domain Patterns
// Pattern: {state}.gov or agency.{state}.gov
const STATE_PATTERNS = {
  // State Agencies (Attorney General Offices)
  'doj.ca.gov': 'California Department of Justice',
  'ag.state': 'State Attorney General Office', // Generic pattern

  // State DOT/DMV
  'dmv.ca.gov': 'California Department of Motor Vehicles',
  'dot.ca.gov': 'California Department of Transportation',
  'dmv': 'State Department of Motor Vehicles',
  'dot': 'State Department of Transportation',

  // State Corrections
  'cdcr.ca.gov': 'California Department of Corrections and Rehabilitation',
  'doc': 'State Department of Corrections',

  // State Police/Patrol
  'chp.ca.gov': 'California Highway Patrol',
  'osp.state.or.us': 'Oregon State Police',
  'nysp.ny.gov': 'New York State Police',
  'statepolice': 'State Police',
  'highwaypatrol': 'Highway Patrol',

  // State Emergency Management
  'caloes.ca.gov': 'California Office of Emergency Services',
  'dhsem': 'State Department of Homeland Security and Emergency Management',
  'oem': 'State Office of Emergency Management'
};

// Municipal Domain Patterns
// Pattern: city{name}.gov, {name}city.gov, {name}.gov
const MUNICIPAL_PATTERNS = {
  // Known city patterns
  'cabq.gov': 'City of Albuquerque',
  'atlantaga.gov': 'City of Atlanta',
  'longbeach.gov': 'City of Long Beach',
  'sandiego.gov': 'City of San Diego',
  'sanjoseca.gov': 'City of San Jose',
  'fremont.gov': 'City of Fremont',
  'oaklandca.gov': 'City of Oakland',
  'sfgov.org': 'City and County of San Francisco',
  'lacity.org': 'City of Los Angeles',
  'nyc.gov': 'City of New York',
  'boston.gov': 'City of Boston',
  'chicago.gov': 'City of Chicago',
  'phila.gov': 'City of Philadelphia',
  'phoenix.gov': 'City of Phoenix',
  'seattle.gov': 'City of Seattle',
  'denver.gov': 'City and County of Denver',
  'miamidade.gov': 'Miami-Dade County',

  // Department-specific patterns within cities
  'pd.': 'Police Department',
  'fire.': 'Fire Department',
  'sheriff': "Sheriff's Office"
};

class GovDomainEnricher {
  /**
   * Enrich a contact by deriving organization from email domain
   * @param {Object} contact - Contact with email, company, jobtitle
   * @returns {Object} Enriched contact with derived organization
   */
  enrichContact(contact) {
    const email = (contact.email || '').toLowerCase();
    const company = (contact.company || '').toLowerCase();

    if (!email.includes('@')) {
      return { ...contact, enriched: false };
    }

    const domain = email.split('@')[1];
    const enriched = this.deriveMunicipality(domain) ||
      this.deriveFederalAgency(domain) ||
      this.deriveStateAgency(domain);

    if (enriched) {
      return {
        ...contact,
        enrichedOrganization: enriched.organization,
        enrichedType: enriched.type,
        enrichedConfidence: enriched.confidence,
        enriched: true
      };
    }

    return { ...contact, enriched: false };
  }

  /**
   * Derive federal agency from domain
   */
  deriveFederalAgency(domain) {
    // Direct lookup
    if (FEDERAL_DOMAINS[domain]) {
      return {
        organization: FEDERAL_DOMAINS[domain],
        type: 'federal',
        confidence: 95
      };
    }

    // Subdomain matching (e.g., regional.fema.gov)
    for (const [fedDomain, orgName] of Object.entries(FEDERAL_DOMAINS)) {
      if (domain.endsWith('.' + fedDomain) || domain === fedDomain) {
        return {
          organization: orgName,
          type: 'federal',
          confidence: 90
        };
      }
    }

    return null;
  }

  /**
   * Derive state agency from domain
   */
  deriveStateAgency(domain) {
    // Direct state pattern lookup
    if (STATE_PATTERNS[domain]) {
      return {
        organization: STATE_PATTERNS[domain],
        type: 'state',
        confidence: 90
      };
    }

    // Pattern matching for common state agency types
    const parts = domain.split('.');

    // Check for state DOJ/AG patterns
    if (domain.includes('doj.') || domain.includes('.doj')) {
      const state = this.extractState(domain);
      return {
        organization: state ? `${state} Department of Justice` : 'State Department of Justice',
        type: 'state',
        confidence: 85
      };
    }

    // Check for DMV patterns
    if (domain.includes('dmv.') || domain.includes('.dmv')) {
      const state = this.extractState(domain);
      return {
        organization: state ? `${state} Department of Motor Vehicles` : 'State Department of Motor Vehicles',
        type: 'state',
        confidence: 85
      };
    }

    // Check for DOC/corrections patterns
    if (domain.includes('doc.') || domain.includes('corrections') || domain.includes('cdcr')) {
      const state = this.extractState(domain);
      return {
        organization: state ? `${state} Department of Corrections` : 'State Department of Corrections',
        type: 'state',
        confidence: 85
      };
    }

    // Check for highway patrol patterns
    if (domain.includes('chp.') || domain.includes('patrol') || domain.includes('highwaypatrol')) {
      const state = this.extractState(domain);
      return {
        organization: state ? `${state} Highway Patrol` : 'State Highway Patrol',
        type: 'state',
        confidence: 85
      };
    }

    return null;
  }

  /**
   * Derive municipality from domain
   */
  deriveMunicipality(domain) {
    // Direct municipal lookup
    if (MUNICIPAL_PATTERNS[domain]) {
      return {
        organization: MUNICIPAL_PATTERNS[domain],
        type: 'municipal',
        confidence: 95
      };
    }

    // Pattern-based city detection
    // e.g., fremont.gov, cityoffremont.gov
    const cityNameMatch = domain.match(/^(?:cityof)?([a-z]+)(?:city)?\.gov$/);
    if (cityNameMatch) {
      const cityName = this.capitalize(cityNameMatch[1]);
      return {
        organization: `City of ${cityName}`,
        type: 'municipal',
        confidence: 75
      };
    }

    // County pattern
    const countyMatch = domain.match(/^([a-z]+)county\.gov$/);
    if (countyMatch) {
      const countyName = this.capitalize(countyMatch[1]);
      return {
        organization: `${countyName} County`,
        type: 'county',
        confidence: 75
      };
    }

    // Department-specific within city
    // e.g., pd.cityname.gov, fire.cityname.gov
    if (domain.includes('.gov')) {
      const parts = domain.split('.');
      if (parts.length >= 3) {
        const subdomain = parts[0];
        if (subdomain === 'pd' || subdomain === 'police') {
          const cityName = this.capitalize(parts[1]);
          return {
            organization: `${cityName} Police Department`,
            type: 'municipal',
            confidence: 80
          };
        }
        if (subdomain === 'fire') {
          const cityName = this.capitalize(parts[1]);
          return {
            organization: `${cityName} Fire Department`,
            type: 'municipal',
            confidence: 80
          };
        }
      }
    }

    return null;
  }

  /**
   * Extract state from domain (e.g., ca.gov -> California)
   */
  extractState(domain) {
    const stateAbbreviations = {
      'ca': 'California',
      'ny': 'New York',
      'tx': 'Texas',
      'fl': 'Florida',
      'ga': 'Georgia',
      'il': 'Illinois',
      'or': 'Oregon',
      'wa': 'Washington',
      'co': 'Colorado',
      'az': 'Arizona',
      'ma': 'Massachusetts',
      'pa': 'Pennsylvania',
      'oh': 'Ohio',
      'mi': 'Michigan',
      'nc': 'North Carolina',
      'tn': 'Tennessee',
      'nv': 'Nevada',
      'nm': 'New Mexico'
    };

    const match = domain.match(/\.([a-z]{2})\.gov/);
    if (match && stateAbbreviations[match[1]]) {
      return stateAbbreviations[match[1]];
    }

    return null;
  }

  /**
   * Capitalize first letter of each word
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Batch enrich multiple contacts
   */
  enrichBatch(contacts) {
    return contacts.map(contact => this.enrichContact(contact));
  }
}

module.exports = GovDomainEnricher;
