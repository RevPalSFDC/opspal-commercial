#!/usr/bin/env node

/**
 * Government Organization Batch Classifier
 *
 * Classifies government organizations into 30 standardized department buckets
 * using email domains, company names, job titles, and contact information.
 *
 * @module gov-org-batch-classifier
 */

const fs = require('fs');
const path = require('path');

/**
 * 30 Canonical Government Organization Buckets
 */
const GOVERNMENT_BUCKETS = {
  // Local/Municipal Law Enforcement
  LOCAL_LAW_ENFORCEMENT: {
    name: 'Local Law Enforcement',
    patterns: {
      company: ['police dept', 'police department', 'pd', 'city police', 'municipal police', 'town police'],
      email: ['citypd', 'townpd', 'municipalpd'],
      title: ['police chief', 'police officer', 'detective', 'sergeant', 'lieutenant', 'captain']
    },
    excludePatterns: ['county', 'sheriff', 'state', 'highway', 'university', 'campus']
  },

  COUNTY_SHERIFF: {
    name: 'County Sheriff',
    patterns: {
      company: ['sheriff', 'sheriff office', 'sheriff dept', "sheriff's office", "sheriff's dept"],
      email: ['sheriff', 'so.', 'sheriffoffice'],
      title: ['sheriff', 'deputy', 'undersheriff']
    }
  },

  UNIVERSITY_POLICE: {
    name: 'University Police',
    patterns: {
      company: ['university police', 'campus police', 'college police', 'campus security'],
      email: ['university', 'college', '.edu'],
      title: ['campus police', 'university police', 'college police']
    }
  },

  // Legal/Prosecution
  DISTRICT_ATTORNEY: {
    name: 'District Attorney',
    patterns: {
      company: ['district attorney', 'da office', "district attorney's office"],
      email: ['da.', 'districtattorney'],
      title: ['district attorney', 'da', 'prosecutor', 'assistant da', 'ada']
    },
    excludePatterns: ['county attorney', 'commonwealth attorney']
  },

  COUNTY_PROSECUTORS: {
    name: 'County Prosecutors',
    patterns: {
      company: ['county attorney', 'county prosecutor', 'prosecuting attorney'],
      email: ['countyprosecutor', 'countyattorney'],
      title: ['county attorney', 'county prosecutor', 'prosecuting attorney']
    }
  },

  COMMONWEALTH_ATTORNEY: {
    name: 'Commonwealth Attorney',
    patterns: {
      company: ['commonwealth attorney', "commonwealth's attorney"],
      email: ['commonwealth'],
      title: ['commonwealth attorney']
    }
  },

  // Fire Departments
  MUNICIPAL_FIRE_DEPARTMENT: {
    name: 'Municipal Fire Department',
    patterns: {
      company: ['fire dept', 'fire department', 'city fire', 'town fire', 'municipal fire'],
      email: ['fire', 'fd.'],
      title: ['fire chief', 'firefighter', 'fire marshal', 'battalion chief']
    },
    excludePatterns: ['county fire', 'state fire']
  },

  COUNTY_FIRE_DEPARTMENT: {
    name: 'County Fire Department',
    patterns: {
      company: ['county fire'],
      email: ['countyfire'],
      title: ['county fire']
    }
  },

  // EMS
  COUNTY_EMS: {
    name: 'County EMS',
    patterns: {
      company: ['county ems', 'ems', 'emergency medical', 'ambulance'],
      email: ['ems', 'ambulance'],
      title: ['paramedic', 'emt', 'ems director', 'ems chief']
    },
    excludePatterns: ['hospital', 'health system']
  },

  HOSPITAL_EMS_DIVISIONS: {
    name: 'Hospital EMS Divisions',
    patterns: {
      company: ['hospital', 'health system', 'medical center'],
      email: ['hospital', 'health', 'medical'],
      title: ['paramedic', 'emt', 'ems']
    },
    requiresAll: ['company', 'title']
  },

  // Emergency Management
  CITY_COUNTY_EM_OFFICE: {
    name: 'City/County EM Office',
    patterns: {
      company: ['emergency management', 'emergency services', 'em office', 'ema'],
      email: ['emergencymanagement', 'ema.'],
      title: ['emergency manager', 'em director', 'emergency coordinator']
    },
    excludePatterns: ['state', 'fema', 'federal']
  },

  PUBLIC_SAFETY_ANSWERING_POINTS: {
    name: 'Public Safety Answering Points',
    patterns: {
      company: ['psap', 'public safety answering', 'dispatch center'],
      email: ['psap', 'dispatch'],
      title: ['dispatcher', 'call taker', 'psap director']
    }
  },

  '911_CENTER': {
    name: '911 Center',
    patterns: {
      company: ['911', 'e911', '9-1-1', 'nine one one'],
      email: ['911', 'e911'],
      title: ['911', 'dispatcher']
    }
  },

  // Corrections
  DOC: {
    name: 'DOC',
    patterns: {
      company: ['department of corrections', 'doc', 'corrections', 'prison', 'correctional facility', 'jail'],
      email: ['corrections', 'doc.'],
      title: ['corrections officer', 'warden', 'correctional']
    }
  },

  PAROLE_PROBATION_BOARDS: {
    name: 'Parole/Probation Boards',
    patterns: {
      company: ['parole', 'probation', 'parole board', 'probation dept'],
      email: ['parole', 'probation'],
      title: ['parole officer', 'probation officer']
    }
  },

  // State Agencies
  STATE_AGOS: {
    name: 'State AGOs',
    patterns: {
      company: ['attorney general', 'ag office', 'state ag'],
      email: ['ag.state', 'attorneygeneral'],
      title: ['attorney general', 'assistant attorney general', 'aag']
    }
  },

  DOT: {
    name: 'DOT',
    patterns: {
      company: ['department of transportation', 'dot', 'transportation dept', 'dmv'],
      email: ['dot.', 'transportation', 'dmv'],
      title: ['transportation', 'dot']
    },
    excludePatterns: ['highway patrol', 'state police']
  },

  HIGHWAY_AUTHORITY: {
    name: 'Highway Authority',
    patterns: {
      company: ['highway authority', 'turnpike', 'toll authority'],
      email: ['highway', 'turnpike', 'toll'],
      title: ['highway', 'toll']
    }
  },

  PORTS: {
    name: 'Ports',
    patterns: {
      company: ['port authority', 'port of', 'seaport', 'maritime'],
      email: ['port', 'maritime'],
      title: ['port', 'maritime']
    }
  },

  STATE_OEM: {
    name: 'State OEM',
    patterns: {
      company: ['state emergency', 'state ema', 'state oem', 'homeland security'],
      email: ['stateem', 'homelandsecurity'],
      title: ['state emergency manager']
    }
  },

  // State Police
  HIGHWAY_PATROL: {
    name: 'Highway Patrol',
    patterns: {
      company: ['highway patrol', 'chp', 'patrol'],
      email: ['patrol', 'chp'],
      title: ['trooper', 'highway patrol']
    }
  },

  STATE_POLICE: {
    name: 'State Police',
    patterns: {
      company: ['state police', 'state troopers'],
      email: ['statepolice', 'sp.state'],
      title: ['state trooper', 'state police']
    }
  },

  BUREAU_OF_INVESTIGATION: {
    name: 'Bureau of Investigation / State Investigative Divisions',
    patterns: {
      company: ['bureau of investigation', 'state bureau', 'investigative division', 'gbi', 'tbi', 'sbi'],
      email: ['investigation', 'bureau'],
      title: ['special agent', 'investigator']
    }
  },

  COMMERCIAL_VEHICLE_ENFORCEMENT: {
    name: 'Commercial Vehicle Enforcement',
    patterns: {
      company: ['commercial vehicle', 'motor carrier', 'truck enforcement'],
      email: ['commercialvehicle', 'motorcarrier'],
      title: ['commercial vehicle', 'motor carrier']
    }
  },

  CONSERVATION_AGENCIES: {
    name: 'Conservation Agencies',
    patterns: {
      company: ['fish and game', 'wildlife', 'conservation', 'game warden', 'natural resources'],
      email: ['wildlife', 'conservation', 'dnr'],
      title: ['game warden', 'conservation officer', 'wildlife officer']
    }
  },

  // Federal
  FEMA: {
    name: 'FEMA',
    patterns: {
      company: ['fema', 'federal emergency management'],
      email: ['fema.dhs.gov', 'fema.gov'],
      title: ['fema']
    },
    excludePatterns: ['regional']
  },

  DHS_SUB_AGENCY: {
    name: 'DHS Sub-Agency',
    patterns: {
      company: ['dhs', 'department of homeland security', 'tsa', 'customs', 'border protection', '\\bice\\b', 'secret service'],
      email: ['dhs.gov', 'tsa.gov', 'cbp.gov', 'ice.gov'],
      title: ['dhs', 'tsa', 'cbp', '\\bice\\b']
    }
  },

  FEDERAL_PROTECTIVE_SERVICE: {
    name: 'Federal Protective Service',
    patterns: {
      company: ['federal protective service', 'fps'],
      email: ['fps'],
      title: ['federal protective service']
    }
  },

  US_MARSHALS: {
    name: 'US Marshals',
    patterns: {
      company: ['u.s. marshals', 'us marshals', 'usms'],
      email: ['usms', 'usdoj.gov'],
      title: ['marshal', 'deputy marshal']
    }
  },

  FEMA_REGIONAL_OFFICE: {
    name: 'FEMA Regional Office',
    patterns: {
      company: ['fema region', 'fema regional'],
      email: ['fema.dhs.gov'],
      title: ['fema regional']
    }
  }
};

class GovOrgBatchClassifier {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 50;
    this.delay = options.delay || 1000; // 1 second delay between batches
    this.outputDir = options.outputDir || './data/gov-classifications';

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Classify a single organization
   */
  classify(input) {
    const { company, email, name, title } = input;

    // Normalize inputs
    const normalizedCompany = (company || '').toLowerCase();
    const normalizedEmail = (email || '').toLowerCase();
    const normalizedTitle = (title || '').toLowerCase();

    let bestMatch = null;
    let bestScore = 0;
    let rationale = '';

    // Score each bucket
    for (const [key, bucket] of Object.entries(GOVERNMENT_BUCKETS)) {
      const score = this.scoreBucket(bucket, {
        company: normalizedCompany,
        email: normalizedEmail,
        title: normalizedTitle
      });

      if (score > bestScore) {
        bestScore = score;
        bestMatch = bucket;
        rationale = this.generateRationale(bucket, {
          company: normalizedCompany,
          email: normalizedEmail,
          title: normalizedTitle
        });
      }
    }

    // Convert score to confidence (0-1)
    const confidence = Math.min(bestScore / 10, 1.0);

    return {
      bucket: bestMatch ? bestMatch.name : 'Unclassified',
      confidence: confidence,
      rationale: rationale || 'No strong match found',
      normalized: {
        company: normalizedCompany,
        email: normalizedEmail,
        title: normalizedTitle
      }
    };
  }

  /**
   * Score a bucket against normalized inputs
   */
  scoreBucket(bucket, normalized) {
    let score = 0;
    const { company, email, title } = normalized;
    const patterns = bucket.patterns;

    // Helper function to check pattern match (supports regex)
    const matchesPattern = (text, pattern) => {
      // Check if pattern is a regex (contains \b word boundaries)
      if (pattern.includes('\\b')) {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(text);
        } catch (e) {
          // Fallback to simple includes if regex fails
          return text.includes(pattern.replace(/\\b/g, ''));
        }
      }
      return text.includes(pattern);
    };

    // Check exclude patterns first
    if (bucket.excludePatterns) {
      for (const exclude of bucket.excludePatterns) {
        if (matchesPattern(company, exclude) || matchesPattern(email, exclude) || matchesPattern(title, exclude)) {
          return 0; // Excluded
        }
      }
    }

    // Score company name matches
    if (patterns.company) {
      for (const pattern of patterns.company) {
        if (matchesPattern(company, pattern)) {
          score += 5; // High weight for company match
        }
      }
    }

    // Score email domain matches
    if (patterns.email) {
      for (const pattern of patterns.email) {
        if (matchesPattern(email, pattern)) {
          score += 4; // High weight for email match
        }
      }
    }

    // Score title matches
    if (patterns.title) {
      for (const pattern of patterns.title) {
        if (matchesPattern(title, pattern)) {
          score += 3; // Medium weight for title match
        }
      }
    }

    // Check requiresAll constraint
    if (bucket.requiresAll) {
      const hasAll = bucket.requiresAll.every(field => {
        if (field === 'company') return patterns.company && patterns.company.some(p => matchesPattern(company, p));
        if (field === 'email') return patterns.email && patterns.email.some(p => matchesPattern(email, p));
        if (field === 'title') return patterns.title && patterns.title.some(p => matchesPattern(title, p));
        return false;
      });

      if (!hasAll) {
        return 0; // Doesn't meet requirements
      }
    }

    return score;
  }

  /**
   * Generate rationale for classification
   */
  generateRationale(bucket, normalized) {
    const matches = [];
    const { company, email, title } = normalized;

    if (bucket.patterns.company) {
      for (const pattern of bucket.patterns.company) {
        if (company.includes(pattern)) {
          matches.push(`Company name contains "${pattern}"`);
          break;
        }
      }
    }

    if (bucket.patterns.email) {
      for (const pattern of bucket.patterns.email) {
        if (email.includes(pattern)) {
          matches.push(`Email domain contains "${pattern}"`);
          break;
        }
      }
    }

    if (bucket.patterns.title) {
      for (const pattern of bucket.patterns.title) {
        if (title.includes(pattern)) {
          matches.push(`Job title contains "${pattern}"`);
          break;
        }
      }
    }

    return matches.join('; ') || 'Pattern-based classification';
  }

  /**
   * Classify a batch of organizations
   */
  async classifyBatch(inputs) {
    console.log(`📋 Classifying ${inputs.length} organizations...`);

    const results = [];
    const batches = this.splitIntoBatches(inputs, this.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`   Processing batch ${i + 1}/${batches.length} (${batch.length} items)...`);

      for (const input of batch) {
        const classification = this.classify(input);
        results.push({
          input,
          classification
        });
      }

      // Delay between batches
      if (i < batches.length - 1) {
        await this.sleep(this.delay);
      }
    }

    console.log(`✅ Classified ${results.length} organizations\n`);

    return results;
  }

  /**
   * Split array into batches
   */
  splitIntoBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get classification statistics
   */
  getStatistics(results) {
    const stats = {
      total: results.length,
      byBucket: {},
      avgConfidence: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0
    };

    let totalConfidence = 0;

    for (const result of results) {
      const bucket = result.classification.bucket;
      const confidence = result.classification.confidence;

      // Count by bucket
      if (!stats.byBucket[bucket]) {
        stats.byBucket[bucket] = 0;
      }
      stats.byBucket[bucket]++;

      // Confidence distribution
      totalConfidence += confidence;
      if (confidence >= 0.7) stats.highConfidence++;
      else if (confidence >= 0.5) stats.mediumConfidence++;
      else stats.lowConfidence++;
    }

    stats.avgConfidence = totalConfidence / results.length;

    return stats;
  }
}

module.exports = GovOrgBatchClassifier;
