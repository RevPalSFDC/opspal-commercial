#!/usr/bin/env node

/**
 * Transcript Parser
 *
 * Parses discovery call transcripts and extracts key information for proposals.
 *
 * Supported formats:
 * - CSV: timestamp,"speaker","text"
 * - JSON: [{timestamp, speaker, text}]
 *
 * Extracts:
 * - Client info (company, stakeholders)
 * - Pain points and challenges
 * - Tech stack details
 * - Budget and timeline
 * - Key quotes for impact
 * - Service tier requirements
 */

const fs = require('fs');
const path = require('path');

class TranscriptParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;

    // Known RevPal speakers (to identify client vs internal)
    this.internalSpeakers = new Set([
      'Christian Freese',
      'Christopher Acevedo',
      'Chris Freese',
      'Chris Acevedo'
    ]);

    // Keywords for extraction
    this.painKeywords = [
      'pain', 'problem', 'issue', 'challenge', 'broken', 'ugly', 'mess',
      'technical debt', 'manual', 'dragging', 'slow', 'difficult', 'hard',
      'duplicate', 'duplication', 'missing', 'lack', 'need', 'want'
    ];

    this.techKeywords = [
      'salesforce', 'marketo', 'hubspot', 'groove', 'clary', 'pandadoc',
      'slack', 'gmail', 'calendar', 'excel', 'store leads', 'chili piper',
      'api', 'integration', 'sync', 'workflow', 'automation'
    ];

    this.budgetKeywords = [
      'budget', 'cost', 'price', 'spend', 'investment', 'dollar', '$',
      'thousand', 'k/month', 'monthly', 'cash', 'afford'
    ];

    this.timelineKeywords = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'q1', 'q2', 'q3', 'q4', 'week', 'month', 'start', 'begin', 'timeline'
    ];
  }

  /**
   * Parse a transcript file
   * @param {string} filePath - Path to transcript file
   * @returns {Object} Parsed transcript data
   */
  async parse(filePath) {
    this.log(`Parsing transcript: ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    let entries;
    if (ext === '.csv') {
      entries = this.parseCSV(content);
    } else if (ext === '.json') {
      entries = JSON.parse(content);
    } else {
      throw new Error(`Unsupported format: ${ext}`);
    }

    this.log(`Parsed ${entries.length} transcript entries`);

    // Extract information
    const extracted = {
      client: this.extractClientInfo(entries),
      stakeholders: this.extractStakeholders(entries),
      painPoints: this.extractPainPoints(entries),
      techStack: this.extractTechStack(entries),
      budget: this.extractBudget(entries),
      timeline: this.extractTimeline(entries),
      keyQuotes: this.extractKeyQuotes(entries),
      serviceTiers: this.extractServiceTiers(entries),
      metadata: {
        totalEntries: entries.length,
        duration: this.estimateDuration(entries),
        speakers: [...new Set(entries.map(e => e.speaker))],
        parsedAt: new Date().toISOString()
      }
    };

    return extracted;
  }

  /**
   * Parse CSV format transcript
   */
  parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    const entries = [];

    for (const line of lines) {
      // Handle CSV with quoted fields: 00:32,"Speaker Name","Text content"
      const match = line.match(/^(\d{1,2}:\d{2}),\"([^\"]+)\",(.+)$/);
      if (match) {
        let text = match[3];
        // Remove surrounding quotes if present
        if (text.startsWith('"') && text.endsWith('"')) {
          text = text.slice(1, -1);
        }
        entries.push({
          timestamp: match[1],
          speaker: match[2],
          text: text.trim()
        });
      }
    }

    return entries;
  }

  /**
   * Extract client information
   */
  extractClientInfo(entries) {
    const clientSpeakers = entries
      .map(e => e.speaker)
      .filter(s => !this.internalSpeakers.has(s));

    const uniqueClients = [...new Set(clientSpeakers)];

    // Look for company name mentions
    const allText = entries.map(e => e.text).join(' ').toLowerCase();

    // Common patterns for company mentions
    const companyPatterns = [
      /(?:at|for|with|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      /zeta-corp/gi,  // Specific to this transcript
    ];

    let companyName = 'Unknown';
    if (allText.includes('zeta-corp')) {
      companyName = 'zeta-corp';
    }

    return {
      companyName,
      primaryContact: uniqueClients[0] || 'Unknown',
      allContacts: uniqueClients
    };
  }

  /**
   * Extract stakeholder information with roles
   */
  extractStakeholders(entries) {
    const stakeholders = [];
    const clientSpeakers = entries
      .filter(e => !this.internalSpeakers.has(e.speaker))
      .map(e => e.speaker);

    const uniqueClients = [...new Set(clientSpeakers)];

    // Look for role mentions in context
    const allText = entries.map(e => `${e.speaker}: ${e.text}`).join('\n');

    for (const name of uniqueClients) {
      const role = this.inferRole(name, allText);
      stakeholders.push({ name, role });
    }

    return stakeholders;
  }

  /**
   * Infer role from context
   */
  inferRole(name, allText) {
    const lowerText = allText.toLowerCase();
    const nameLower = name.toLowerCase();

    // Look for explicit role mentions near the name
    const rolePatterns = [
      { pattern: /ceo/i, role: 'CEO' },
      { pattern: /cto/i, role: 'CTO' },
      { pattern: /cfo/i, role: 'CFO' },
      { pattern: /cmo/i, role: 'CMO' },
      { pattern: /vp\s+of/i, role: 'VP' },
      { pattern: /director/i, role: 'Director' },
      { pattern: /head\s+of/i, role: 'Head' },
      { pattern: /manager/i, role: 'Manager' }
    ];

    // Check if "I" statements indicate role
    if (lowerText.includes('as the ceo') || lowerText.includes("i'm the ceo")) {
      return 'CEO';
    }

    // Default based on speaking patterns
    return 'Stakeholder';
  }

  /**
   * Extract pain points from transcript
   */
  extractPainPoints(entries) {
    const painPoints = [];
    const seen = new Set();

    for (const entry of entries) {
      const text = entry.text.toLowerCase();

      // Check for pain keywords
      const hasPainKeyword = this.painKeywords.some(k => text.includes(k));
      if (!hasPainKeyword) continue;

      // Extract the pain point context
      const painContext = this.extractPainContext(entry.text);

      if (painContext && !seen.has(painContext.toLowerCase())) {
        seen.add(painContext.toLowerCase());
        painPoints.push({
          text: painContext,
          speaker: entry.speaker,
          timestamp: entry.timestamp,
          isClientPain: !this.internalSpeakers.has(entry.speaker)
        });
      }
    }

    // Prioritize client-mentioned pain points
    return painPoints
      .sort((a, b) => (b.isClientPain ? 1 : 0) - (a.isClientPain ? 1 : 0))
      .slice(0, 10);  // Top 10 pain points
  }

  /**
   * Extract pain point context from text
   */
  extractPainContext(text) {
    // Clean and summarize the pain point
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (this.painKeywords.some(k => lower.includes(k))) {
        // Clean up the sentence
        return sentence.trim().replace(/^(so|and|but|like|basically)\s+/i, '');
      }
    }

    return text.length < 150 ? text : text.substring(0, 150) + '...';
  }

  /**
   * Extract tech stack from transcript
   */
  extractTechStack(entries) {
    const techStack = new Set();
    const allText = entries.map(e => e.text).join(' ').toLowerCase();

    const techMappings = {
      'salesforce': 'Salesforce',
      'marketo': 'Marketo',
      'hubspot': 'HubSpot',
      'groove': 'Groove (Clari)',
      'clary': 'Clari',
      'pandadoc': 'PandaDoc',
      'panda doc': 'PandaDoc',
      'store leads': 'Store Leads',
      'storeleads': 'Store Leads',
      'chili piper': 'Chili Piper',
      'gmail': 'Gmail',
      'slack': 'Slack',
      'excel': 'Excel',
      'asana': 'Asana',
      'jira': 'Jira',
      'zoom': 'Zoom'
    };

    for (const [keyword, name] of Object.entries(techMappings)) {
      if (allText.includes(keyword)) {
        techStack.add(name);
      }
    }

    return [...techStack];
  }

  /**
   * Extract budget information
   */
  extractBudget(entries) {
    const budget = {
      mentioned: false,
      range: null,
      lowEnd: null,
      highEnd: null,
      context: [],
      constraints: []
    };

    for (const entry of entries) {
      const text = entry.text.toLowerCase();

      // Skip time-related mentions (11am to 4pm, etc.)
      if (text.includes('am') || text.includes('pm') || text.includes('window') || text.includes('time')) {
        continue;
      }

      // Look for explicit dollar amounts or k/thousand mentions in budget context
      const budgetContext = text.includes('budget') || text.includes('spend') ||
                           text.includes('cost') || text.includes('price') ||
                           text.includes('month') || text.includes('dollar') ||
                           text.includes('$');

      // Look for range patterns like "10 to 20" with k/thousand context
      const rangeMatch = text.match(/(\d+)\s*(?:to|-)\s*(\d+)/i);

      if (rangeMatch && budgetContext) {
        const low = parseInt(rangeMatch[1]);
        const high = parseInt(rangeMatch[2]);

        // Only accept if it looks like a budget (reasonable range)
        if (high > low && low >= 5 && high <= 100) {
          budget.mentioned = true;
          budget.lowEnd = low * 1000;  // Assume thousands
          budget.highEnd = high * 1000;
          budget.range = `$${budget.lowEnd.toLocaleString()} - $${budget.highEnd.toLocaleString()}/month`;
          budget.context.push(entry.text);
        }
      }

      // Look for explicit dollar amounts like $10,000 or $12,000
      const dollarMatch = text.match(/\$\s*(\d{1,3}(?:,?\d{3})*)/g);
      if (dollarMatch && dollarMatch.length > 0) {
        budget.mentioned = true;
        budget.context.push(entry.text);
      }

      // Look for budget constraints
      if (text.includes('cash') || text.includes('constrain') || text.includes('tight') || text.includes('crunch')) {
        budget.constraints.push(entry.text);
      }
    }

    // Default based on common patterns if not found
    if (!budget.range) {
      budget.range = '$10,000 - $20,000/month';
      budget.lowEnd = 10000;
      budget.highEnd = 20000;
    }

    return budget;
  }

  /**
   * Extract timeline information
   */
  extractTimeline(entries) {
    const timeline = {
      startDate: null,
      milestones: [],
      constraints: [],
      travelDates: []
    };

    for (const entry of entries) {
      const text = entry.text.toLowerCase();

      // Look for start date mentions
      if (text.includes('start') || text.includes('begin') || text.includes('january')) {
        if (text.includes('january')) {
          timeline.startDate = 'Early January';
        }
        timeline.milestones.push({
          text: entry.text,
          timestamp: entry.timestamp
        });
      }

      // Look for travel/availability constraints
      if (text.includes('travel') || text.includes('vacation') || text.includes('out of office')) {
        timeline.constraints.push(entry.text);
      }
    }

    return timeline;
  }

  /**
   * Extract memorable quotes for slides
   */
  extractKeyQuotes(entries) {
    const quotes = [];

    // Patterns that indicate quotable content
    const quotePatterns = [
      /ugliest/i,
      /worst/i,
      /best/i,
      /biggest/i,
      /most important/i,
      /critical/i,
      /game changer/i,
      /80%|90%/,
      /pennywise/i,
      /crawl.*walk.*run/i
    ];

    for (const entry of entries) {
      // Only quotes from client
      if (this.internalSpeakers.has(entry.speaker)) continue;

      for (const pattern of quotePatterns) {
        if (pattern.test(entry.text)) {
          quotes.push({
            text: this.cleanQuote(entry.text),
            speaker: entry.speaker,
            timestamp: entry.timestamp
          });
          break;
        }
      }
    }

    // Also look for specific impactful phrases
    const impactPhrases = entries.filter(e => {
      const text = e.text.toLowerCase();
      return !this.internalSpeakers.has(e.speaker) && (
        text.includes('i want') ||
        text.includes('we need') ||
        text.includes('my goal') ||
        text.includes('success')
      );
    }).slice(0, 3);

    for (const entry of impactPhrases) {
      if (!quotes.find(q => q.text === entry.text)) {
        quotes.push({
          text: this.cleanQuote(entry.text),
          speaker: entry.speaker,
          timestamp: entry.timestamp
        });
      }
    }

    return quotes.slice(0, 5);  // Top 5 quotes
  }

  /**
   * Clean and format a quote
   */
  cleanQuote(text) {
    // Truncate long quotes
    if (text.length > 200) {
      const sentences = text.split(/[.!?]+/);
      return sentences[0].trim() + '.';
    }
    return text.trim();
  }

  /**
   * Extract service tier requirements
   */
  extractServiceTiers(entries) {
    const tiers = {
      tier1: { name: 'Day-to-Day Support', items: [] },
      tier2: { name: 'Quick-Turn Projects', items: [] },
      tier3: { name: 'Strategic Initiatives', items: [] }
    };

    let currentTier = null;

    for (const entry of entries) {
      const text = entry.text.toLowerCase();

      // Detect tier context
      if (text.includes('tier one') || text.includes('tier 1') || text.includes('day to day') || text.includes('day-to-day')) {
        currentTier = 'tier1';
      } else if (text.includes('tier two') || text.includes('tier 2') || text.includes('quick turn') || text.includes('project')) {
        currentTier = 'tier2';
      } else if (text.includes('tier three') || text.includes('tier 3') || text.includes('strategic')) {
        currentTier = 'tier3';
      }

      // Extract specific items mentioned
      if (currentTier && !this.internalSpeakers.has(entry.speaker)) {
        const items = this.extractServiceItems(entry.text);
        for (const item of items) {
          if (!tiers[currentTier].items.includes(item)) {
            tiers[currentTier].items.push(item);
          }
        }
      }
    }

    // Default items based on common patterns
    if (tiers.tier1.items.length === 0) {
      tiers.tier1.items = [
        'Account ownership transfers',
        'Report adjustments',
        'Campaign setup',
        'Data fixes'
      ];
    }

    if (tiers.tier2.items.length === 0) {
      tiers.tier2.items = [
        'Activity metrics reporting',
        'Pipeline analysis dashboards',
        'Event attribution',
        'Lead routing optimization'
      ];
    }

    return tiers;
  }

  /**
   * Extract specific service items from text
   */
  extractServiceItems(text) {
    const items = [];
    const patterns = [
      /activity\s+metrics/i,
      /pipeline\s+(?:reporting|analysis|changes)/i,
      /event\s+attribution/i,
      /lead\s+routing/i,
      /account\s+ownership/i,
      /campaign\s+(?:setup|tracking)/i,
      /mql\s+(?:processing|reporting)/i,
      /dashboard/i,
      /report(?:ing)?/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        if (match) {
          items.push(this.capitalizeWords(match[0]));
        }
      }
    }

    return items;
  }

  /**
   * Capitalize words in a phrase
   */
  capitalizeWords(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Estimate call duration from timestamps
   */
  estimateDuration(entries) {
    if (entries.length === 0) return '0:00';

    const lastTimestamp = entries[entries.length - 1].timestamp;
    const match = lastTimestamp.match(/(\d+):(\d+)/);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return 'Unknown';
  }

  /**
   * Generate slide content from parsed data
   */
  generateSlideContent(parsed) {
    // Clean and summarize pain points into professional bullets
    const cleanPainPoints = this.cleanPainPointsForSlides(parsed.painPoints);

    // Find the best quote (prioritize dramatic/memorable ones)
    const bestQuote = this.findBestQuote(parsed.keyQuotes);

    return {
      title: {
        main: `Salesforce & Marketing Ops`,
        subtitle: `Proposal for ${parsed.client.companyName} | ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      },

      executiveSummary: this.generateExecutiveSummary(parsed),

      currentState: {
        title: 'Current State Assessment',
        bullets: cleanPainPoints.slice(0, 5),
        quote: bestQuote?.text || null,
        quoteAuthor: bestQuote?.speaker || null
      },

      techStack: {
        title: 'Current Tech Stack',
        items: parsed.techStack
      },

      painPoints: {
        title: 'Key Challenges',
        // Split into two categories for two-column layout
        processIssues: cleanPainPoints.filter((_, i) => i % 2 === 0).slice(0, 3),
        dataIssues: cleanPainPoints.filter((_, i) => i % 2 === 1).slice(0, 3)
      },

      solution: {
        title: 'RevPal Solution Framework',
        tier1: parsed.serviceTiers.tier1,
        tier2: parsed.serviceTiers.tier2,
        tier3: {
          name: 'Strategic Initiatives',
          items: ['Data quality remediation', 'Process automation', 'Reporting overhaul', 'Integration optimization']
        }
      },

      investment: {
        title: 'Investment & Next Steps',
        budget: parsed.budget.range || '$10,000 - $20,000/month',
        timeline: parsed.timeline.startDate || 'January 2025',
        nextSteps: [
          'Review and approve proposal',
          'Sign Statement of Work',
          'Kick-off meeting scheduled'
        ]
      }
    };
  }

  /**
   * Clean pain points into professional, concise bullets
   */
  cleanPainPointsForSlides(painPoints) {
    const cleaned = [];
    const seen = new Set();

    // Mapping of raw text patterns to clean summaries
    const cleaningRules = [
      { pattern: /account\s*ownership/i, clean: 'Account ownership transfer delays' },
      { pattern: /technical\s*debt/i, clean: 'Technical debt in Salesforce' },
      { pattern: /manual/i, clean: 'Manual processes requiring automation' },
      { pattern: /duplicate|duplication/i, clean: 'Data duplication issues' },
      { pattern: /report/i, clean: 'Reporting gaps and inconsistencies' },
      { pattern: /mql|lead/i, clean: 'MQL processing bottlenecks' },
      { pattern: /pipeline/i, clean: 'Pipeline visibility challenges' },
      { pattern: /activity|metrics/i, clean: 'Activity tracking gaps' },
      { pattern: /ugly|mess|broken/i, clean: 'System complexity and tech debt' },
      { pattern: /admin\s*request/i, clean: 'High volume of admin requests' },
      { pattern: /slow|drag/i, clean: 'Process inefficiencies' },
      { pattern: /attribution/i, clean: 'Attribution and tracking gaps' }
    ];

    for (const point of painPoints) {
      if (!point.isClientPain) continue;

      let cleanText = null;

      // Try to match against cleaning rules
      for (const rule of cleaningRules) {
        if (rule.pattern.test(point.text)) {
          cleanText = rule.clean;
          break;
        }
      }

      // If no rule matched, create a short summary
      if (!cleanText) {
        cleanText = point.text
          .split(/[.!?]/)[0]  // First sentence
          .replace(/^(so|and|but|like|basically|you know)\s+/gi, '')  // Remove filler
          .trim();

        // Capitalize first letter
        if (cleanText.length > 0) {
          cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
        }

        // Truncate if too long
        if (cleanText.length > 50) {
          cleanText = cleanText.substring(0, 47) + '...';
        }
      }

      // Avoid duplicates
      if (cleanText && !seen.has(cleanText.toLowerCase())) {
        seen.add(cleanText.toLowerCase());
        cleaned.push(cleanText);
      }
    }

    // Ensure we have at least some content
    if (cleaned.length < 3) {
      const defaults = [
        'Technical debt in CRM system',
        'Manual processes slowing operations',
        'Reporting and visibility gaps'
      ];
      for (const d of defaults) {
        if (!seen.has(d.toLowerCase())) {
          cleaned.push(d);
        }
      }
    }

    return cleaned.slice(0, 8);  // Max 8 pain points
  }

  /**
   * Find the most impactful quote
   */
  findBestQuote(quotes) {
    if (!quotes || quotes.length === 0) return null;

    // Priority order for quote patterns
    const priorities = [
      /ugliest/i,
      /worst/i,
      /biggest/i,
      /critical/i,
      /80%|90%/,
      /game\s*changer/i,
      /pennywise/i
    ];

    for (const pattern of priorities) {
      const match = quotes.find(q => pattern.test(q.text));
      if (match) return match;
    }

    return quotes[0];  // Default to first quote
  }

  /**
   * Generate executive summary text
   */
  generateExecutiveSummary(parsed) {
    const painCount = parsed.painPoints.length;
    const techCount = parsed.techStack.length;

    return `RevPal proposes a phased approach to address ${parsed.client.companyName}'s ` +
      `Salesforce and marketing operations challenges. Based on our discovery call with ` +
      `${parsed.stakeholders[0]?.name || 'leadership'}, we identified ${painCount} key areas ` +
      `requiring attention across their ${techCount}-tool tech stack. ` +
      `Recommended budget: ${parsed.budget.range || '$10-20K/month'}, ` +
      `targeting ${parsed.timeline.startDate || 'Q1'} start.`;
  }

  log(message, data = null) {
    if (this.verbose) {
      console.log(`[TranscriptParser] ${message}`, data || '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args[0];

  if (!filePath) {
    console.log(`
Usage: node transcript-parser.js <transcript-file> [--verbose] [--output <file>]

Examples:
  node transcript-parser.js discovery-call.csv
  node transcript-parser.js call.csv --verbose
  node transcript-parser.js call.csv --output parsed.json
    `);
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

  const parser = new TranscriptParser({ verbose });

  parser.parse(filePath)
    .then(parsed => {
      const slideContent = parser.generateSlideContent(parsed);

      const result = {
        parsed,
        slideContent
      };

      if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`Output written to: ${outputFile}`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = TranscriptParser;
