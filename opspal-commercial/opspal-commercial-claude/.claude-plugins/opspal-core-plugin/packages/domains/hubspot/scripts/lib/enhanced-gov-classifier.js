#!/usr/bin/env node

/**
 * Enhanced Government Organization Classifier
 *
 * Uses contact information (company, email, title) with intelligent
 * pattern matching and contextual analysis for accurate classification.
 *
 * Features:
 * - No external API dependencies
 * - Parallel processing
 * - High accuracy pattern matching
 * - Contextual analysis
 */

const GOVERNMENT_BUCKETS = {
  'Local Law Enforcement': {
    keywords: ['police department', 'police dept', ' pd ', 'city police', 'town police', 'municipal police'],
    emailPatterns: ['pd.', 'police', 'citypd', 'townpd'],
    titlePatterns: ['police', 'officer', 'detective', 'sergeant', 'lieutenant', 'captain'],
    excludes: ['county', 'sheriff', 'university', 'state', 'highway'],
    confidence: 90
  },

  'County Sheriff': {
    keywords: ['sheriff', "sheriff's office", "sheriff's dept", 'county sheriff'],
    emailPatterns: ['sheriff', 'so.'],
    titlePatterns: ['sheriff', 'deputy'],
    confidence: 95
  },

  'University Police': {
    keywords: ['university police', 'campus police', 'college police'],
    emailPatterns: ['.edu', 'university', 'college', 'campus'],
    titlePatterns: ['campus police', 'university police'],
    confidence: 95
  },

  'District Attorney': {
    keywords: ['district attorney', "district attorney's", ' da ', 'da office'],
    emailPatterns: ['da.', 'districtattorney'],
    titlePatterns: ['district attorney', ' da ', 'prosecutor', 'assistant da'],
    excludes: ['county attorney', 'commonwealth'],
    confidence: 95
  },

  'County Prosecutors': {
    keywords: ['county attorney', 'county prosecutor', 'prosecuting attorney'],
    emailPatterns: ['countyprosecutor', 'countyattorney'],
    titlePatterns: ['county attorney', 'county prosecutor'],
    confidence: 90
  },

  'Commonwealth Attorney': {
    keywords: ['commonwealth attorney', "commonwealth's attorney"],
    emailPatterns: ['commonwealth'],
    titlePatterns: ['commonwealth attorney'],
    confidence: 95
  },

  'Municipal Fire Department': {
    keywords: ['fire department', 'fire dept', 'city fire', 'town fire', 'municipal fire'],
    emailPatterns: ['fire', 'fd.'],
    titlePatterns: ['fire chief', 'firefighter', 'fire marshal', 'battalion chief'],
    excludes: ['county fire', 'state'],
    confidence: 85
  },

  'County Fire Department': {
    keywords: ['county fire'],
    emailPatterns: ['countyfire'],
    titlePatterns: ['county fire'],
    confidence: 90
  },

  'County EMS': {
    keywords: ['county ems', 'ems', 'emergency medical', 'ambulance service'],
    emailPatterns: ['ems', 'ambulance'],
    titlePatterns: ['paramedic', 'emt', 'ems director'],
    excludes: ['hospital', 'health system'],
    confidence: 85
  },

  'Hospital EMS Divisions': {
    keywords: ['hospital', 'health system', 'medical center'],
    requiresTitle: ['paramedic', 'emt', 'ems'],
    confidence: 85
  },

  'City/County EM Office': {
    keywords: ['emergency management', 'emergency services', 'em office', 'ema'],
    emailPatterns: ['emergencymanagement', 'ema.'],
    titlePatterns: ['emergency manager', 'em director'],
    excludes: ['state', 'fema'],
    confidence: 85
  },

  'Public Safety Answering Points': {
    keywords: ['psap', 'public safety answering', 'dispatch center'],
    emailPatterns: ['psap', 'dispatch'],
    titlePatterns: ['dispatcher', 'call taker'],
    confidence: 90
  },

  '911 Center': {
    keywords: ['911', 'e911', '9-1-1', 'nine one one'],
    emailPatterns: ['911', 'e911'],
    titlePatterns: ['911', 'dispatcher'],
    confidence: 95
  },

  'DOC': {
    keywords: ['department of corrections', ' doc ', 'corrections', 'prison', 'jail', 'correctional facility'],
    emailPatterns: ['corrections', 'doc.'],
    titlePatterns: ['corrections officer', 'warden', 'correctional'],
    confidence: 90
  },

  'Parole/Probation Boards': {
    keywords: ['parole', 'probation'],
    emailPatterns: ['parole', 'probation'],
    titlePatterns: ['parole officer', 'probation officer'],
    confidence: 90
  },

  'State AGOs': {
    keywords: ['attorney general', 'ag office', 'state ag'],
    emailPatterns: ['ag.state', 'attorneygeneral'],
    titlePatterns: ['attorney general', 'assistant attorney general', 'aag'],
    confidence: 95
  },

  'DOT': {
    keywords: ['department of transportation', ' dot ', 'dmv', 'motor vehicles'],
    emailPatterns: ['dot.', 'transportation', 'dmv'],
    titlePatterns: ['transportation'],
    excludes: ['police', 'patrol'],
    confidence: 85
  },

  'Highway Authority': {
    keywords: ['highway authority', 'turnpike', 'toll authority'],
    emailPatterns: ['highway', 'turnpike', 'toll'],
    confidence: 90
  },

  'Ports': {
    keywords: ['port authority', 'port of', 'seaport', 'maritime'],
    emailPatterns: ['port', 'maritime'],
    confidence: 90
  },

  'State OEM': {
    keywords: ['state emergency', 'state ema', 'state oem', 'homeland security'],
    emailPatterns: ['stateem', 'homelandsecurity'],
    requiresState: true,
    confidence: 90
  },

  'Highway Patrol': {
    keywords: ['highway patrol', ' chp ', 'patrol'],
    emailPatterns: ['patrol', 'chp'],
    titlePatterns: ['trooper', 'highway patrol'],
    confidence: 95
  },

  'State Police': {
    keywords: ['state police', 'state troopers'],
    emailPatterns: ['statepolice', 'sp.state'],
    titlePatterns: ['state trooper', 'state police'],
    confidence: 95
  },

  'Bureau of Investigation / State Investigative Divisions': {
    keywords: ['bureau of investigation', 'state bureau', ' gbi ', ' tbi ', ' sbi ', 'investigative division'],
    emailPatterns: ['investigation', 'bureau'],
    titlePatterns: ['special agent', 'investigator'],
    confidence: 90
  },

  'Commercial Vehicle Enforcement': {
    keywords: ['commercial vehicle', 'motor carrier', 'truck enforcement'],
    emailPatterns: ['commercialvehicle', 'motorcarrier'],
    confidence: 85
  },

  'Conservation Agencies': {
    keywords: ['fish and game', 'wildlife', 'conservation', 'natural resources', 'dnr'],
    emailPatterns: ['wildlife', 'conservation', 'dnr'],
    titlePatterns: ['game warden', 'conservation officer'],
    confidence: 85
  },

  'FEMA': {
    keywords: ['fema', 'federal emergency management'],
    emailPatterns: ['fema.dhs.gov', 'fema.gov'],
    titlePatterns: ['fema'],
    excludes: ['regional'],
    confidence: 95
  },

  'FEMA Regional Office': {
    keywords: ['fema region', 'fema regional'],
    emailPatterns: ['fema.dhs.gov'],
    confidence: 95
  },

  'DHS Sub-Agency': {
    keywords: [' dhs ', 'department of homeland security', ' tsa ', 'customs', 'border protection', 'secret service', 'immigration and customs enforcement'],
    emailPatterns: ['dhs.gov', 'tsa.gov', 'cbp.gov', 'ice.gov'],
    titlePatterns: [' dhs ', ' tsa ', ' cbp '],
    confidence: 90
  },

  'Federal Protective Service': {
    keywords: ['federal protective service', ' fps '],
    emailPatterns: ['fps'],
    confidence: 95
  },

  'US Marshals': {
    keywords: ['u.s. marshals', 'us marshals', 'usms'],
    emailPatterns: ['usms', 'usdoj.gov'],
    titlePatterns: ['marshal', 'deputy marshal'],
    confidence: 95
  }
};

class EnhancedGovClassifier {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 10;
    this.cache = new Map();
  }

  /**
   * Classify a single contact
   */
  classify(contact) {
    const text = this.buildSearchText(contact);
    let bestBucket = 'Unclassified';
    let bestScore = 0;
    let matchedReasons = [];

    for (const [bucket, config] of Object.entries(GOVERNMENT_BUCKETS)) {
      const score = this.scoreBucket(bucket, config, contact, text);

      if (score > bestScore) {
        bestScore = score;
        bestBucket = bucket;
        matchedReasons = this.getMatchReasons(config, contact, text);
      }
    }

    const confidence = Math.min(bestScore, 100);

    return {
      bucket: bestBucket,
      confidence: confidence,
      rationale: matchedReasons.length > 0
        ? matchedReasons.join('; ')
        : 'Pattern-based classification from contact information'
    };
  }

  /**
   * Build searchable text from contact
   */
  buildSearchText(contact) {
    return [
      contact.company || '',
      contact.email || '',
      contact.title || ''
    ].join(' ').toLowerCase();
  }

  /**
   * Score a bucket against contact information
   */
  scoreBucket(bucket, config, contact, text) {
    let score = 0;
    const company = (contact.company || '').toLowerCase();
    const email = (contact.email || '').toLowerCase();
    const title = (contact.title || '').toLowerCase();

    // Check excludes first
    if (config.excludes) {
      for (const exclude of config.excludes) {
        if (text.includes(exclude)) {
          return 0;
        }
      }
    }

    // Check requiresTitle
    if (config.requiresTitle) {
      const hasRequiredTitle = config.requiresTitle.some(t => title.includes(t));
      if (!hasRequiredTitle) {
        return 0;
      }
    }

    // Score company keywords (most important indicator)
    let hasCompanyMatch = false;
    if (config.keywords) {
      for (const keyword of config.keywords) {
        if (company.includes(keyword)) {
          score = config.confidence - 15; // Start near bucket confidence
          hasCompanyMatch = true;
          break;
        }
      }
    }

    // Score email patterns (strong confirmation)
    if (config.emailPatterns) {
      for (const pattern of config.emailPatterns) {
        if (email.includes(pattern)) {
          score += hasCompanyMatch ? 10 : 20;
          break;
        }
      }
    }

    // Score title patterns (additional confirmation)
    if (config.titlePatterns) {
      for (const pattern of config.titlePatterns) {
        if (title.includes(pattern)) {
          score += hasCompanyMatch ? 10 : 15;
          break;
        }
      }
    }

    // Cap at bucket's maximum confidence
    score = Math.min(score, config.confidence);

    return score;
  }

  /**
   * Get match reasons for rationale
   */
  getMatchReasons(config, contact, text) {
    const reasons = [];
    const company = (contact.company || '').toLowerCase();
    const email = (contact.email || '').toLowerCase();
    const title = (contact.title || '').toLowerCase();

    if (config.keywords) {
      for (const keyword of config.keywords) {
        if (company.includes(keyword)) {
          reasons.push(`Company name contains "${keyword}"`);
          break;
        }
      }
    }

    if (config.emailPatterns) {
      for (const pattern of config.emailPatterns) {
        if (email.includes(pattern)) {
          reasons.push(`Email domain pattern "${pattern}"`);
          break;
        }
      }
    }

    if (config.titlePatterns) {
      for (const pattern of config.titlePatterns) {
        if (title.includes(pattern)) {
          reasons.push(`Job title contains "${pattern}"`);
          break;
        }
      }
    }

    return reasons;
  }

  /**
   * Classify batch in parallel
   */
  async classifyBatch(contacts) {
    console.log(`🔍 Classifying ${contacts.length} contacts in parallel...\n`);

    const batches = this.splitIntoBatches(contacts, this.concurrency);
    const results = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} contacts)...`);

      const batchResults = batch.map(contact => ({
        input: contact,
        classification: this.classify(contact)
      }));

      results.push(...batchResults);

      const avgConf = batchResults.reduce((sum, r) => sum + r.classification.confidence, 0) / batchResults.length;
      console.log(`  ✓ Batch complete. Avg confidence: ${avgConf.toFixed(0)}%`);
    }

    console.log(`\n✅ Classified ${results.length} contacts\n`);
    return results;
  }

  splitIntoBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  getStatistics(results) {
    const stats = {
      total: results.length,
      byBucket: {},
      avgConfidence: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    };

    let totalConf = 0;

    for (const result of results) {
      const bucket = result.classification.bucket;
      const conf = result.classification.confidence;

      stats.byBucket[bucket] = (stats.byBucket[bucket] || 0) + 1;
      totalConf += conf;

      if (conf >= 80) stats.highConfidence++;
      else if (conf >= 60) stats.mediumConfidence++;
      else stats.lowConfidence++;
    }

    stats.avgConfidence = totalConf / results.length;
    return stats;
  }
}

module.exports = EnhancedGovClassifier;
