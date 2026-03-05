#!/usr/bin/env node

/**
 * Slide Catalog Indexer
 *
 * Reads a Google Slides template and generates a catalog JSON file
 * with metadata for each slide, enabling intelligent slide selection.
 *
 * Usage:
 *   node slide-catalog-indexer.js --template <TEMPLATE_ID> --output <OUTPUT_PATH>
 *   node slide-catalog-indexer.js --template 1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc
 *
 * Features:
 *   - Extracts all text content from each slide
 *   - Auto-detects slide types (title, service, case_study, methodology, etc.)
 *   - Extracts keywords from content
 *   - Identifies mandatory vs optional slides
 *   - Generates trigger conditions for smart selection
 */

const fs = require('fs');
const path = require('path');

// Default template ID (RevPal proposal template)
const DEFAULT_TEMPLATE_ID = '1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc';

// Slide type detection patterns
const SLIDE_TYPE_PATTERNS = {
  title: {
    patterns: [/welcome|title|presentation|proposal/i, /^[^.]{5,50}$/],
    positions: [0],
    weight: 0.9
  },
  executiveSummary: {
    patterns: [/executive summary|overview|at a glance|highlights/i],
    weight: 0.85
  },
  service: {
    patterns: [
      /salesforce|hubspot|revops|integration|automation|admin|support|data quality/i,
      /our services|what we offer|service offering|capabilities/i
    ],
    keywords: ['salesforce', 'hubspot', 'admin', 'support', 'integration', 'automation', 'data', 'revops'],
    weight: 0.7
  },
  caseStudy: {
    patterns: [/case study|success story|client story|results|transformation/i, /\d+%|\$\d+|ROI/i],
    keywords: ['case study', 'success', 'results', 'transformation', 'ROI'],
    weight: 0.75
  },
  methodology: {
    patterns: [/methodology|approach|process|framework|how we work|crawl.?walk.?run/i],
    keywords: ['methodology', 'approach', 'process', 'framework'],
    weight: 0.6
  },
  team: {
    patterns: [/our team|meet the team|about us|who we are|leadership/i],
    keywords: ['team', 'about', 'company', 'leadership'],
    weight: 0.5
  },
  investment: {
    patterns: [/investment|pricing|budget|cost|proposal|next steps|timeline/i],
    positions: [-1, -2, -3], // Last few slides
    weight: 0.95
  },
  technical: {
    patterns: [/architecture|integration|technical|api|data model|schema/i],
    keywords: ['architecture', 'technical', 'integration', 'API', 'data model'],
    weight: 0.65
  },
  closing: {
    patterns: [/thank you|questions|contact|get in touch|let'?s connect/i],
    positions: [-1],
    weight: 0.9
  }
};

// Keywords for service matching
const SERVICE_KEYWORDS = {
  salesforce: ['salesforce', 'sf', 'sfdc', 'salesforce.com', 'lightning', 'apex', 'flow', 'cpq'],
  hubspot: ['hubspot', 'hs', 'hubspot crm', 'marketing hub', 'sales hub'],
  integration: ['integration', 'api', 'middleware', 'sync', 'connect', 'zapier', 'workato'],
  revops: ['revops', 'revenue operations', 'gtm', 'go-to-market', 'sales ops', 'marketing ops'],
  admin: ['admin', 'administration', 'support', 'maintenance', 'day-to-day', 'backlog'],
  data: ['data quality', 'data migration', 'deduplication', 'enrichment', 'hygiene', 'cleansing'],
  automation: ['automation', 'workflow', 'process builder', 'flow', 'trigger', 'scheduled']
};

// Persona relevance defaults by slide type
const PERSONA_DEFAULTS = {
  title: { executive: 0.9, operations: 0.7, technical: 0.5, endUser: 0.6 },
  executiveSummary: { executive: 0.95, operations: 0.75, technical: 0.6, endUser: 0.5 },
  service: { executive: 0.6, operations: 0.9, technical: 0.8, endUser: 0.5 },
  caseStudy: { executive: 0.85, operations: 0.75, technical: 0.6, endUser: 0.5 },
  methodology: { executive: 0.7, operations: 0.85, technical: 0.75, endUser: 0.4 },
  team: { executive: 0.8, operations: 0.6, technical: 0.5, endUser: 0.3 },
  investment: { executive: 0.95, operations: 0.7, technical: 0.4, endUser: 0.3 },
  technical: { executive: 0.4, operations: 0.7, technical: 0.95, endUser: 0.3 },
  closing: { executive: 0.8, operations: 0.6, technical: 0.5, endUser: 0.4 }
};

class SlideCatalogIndexer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.templateId = options.templateId || DEFAULT_TEMPLATE_ID;
    this.outputPath = options.outputPath ||
      path.join(__dirname, '../../config/template-slide-catalog.json');
  }

  log(message, data) {
    if (this.verbose) {
      console.log(`[SlideCatalogIndexer] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  /**
   * Initialize Google Slides API client
   */
  async _initializeApiClient() {
    const { google } = require('googleapis');

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(process.env.HOME, '.credentials', 'google-credentials.json');
    const tokenPath = path.join(process.env.HOME, '.credentials', 'google-token.json');

    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Google credentials not found at: ${credentialsPath}`);
    }

    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        `Google token not found at: ${tokenPath}\n` +
        `Run: node scripts/authorize-google-slides.js`
      );
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath));
    const { client_secret, client_id, redirect_uris } = credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    const token = JSON.parse(fs.readFileSync(tokenPath));
    oAuth2Client.setCredentials(token);

    this.slides = google.slides({ version: 'v1', auth: oAuth2Client });
    this.log('API client initialized');
  }

  /**
   * Extract all text from a slide's page elements
   */
  extractSlideText(slide) {
    const texts = [];

    if (!slide.pageElements) return texts;

    for (const element of slide.pageElements) {
      if (element.shape?.text?.textElements) {
        for (const textEl of element.shape.text.textElements) {
          if (textEl.textRun?.content) {
            const content = textEl.textRun.content.trim();
            if (content && content !== '\n') {
              texts.push(content);
            }
          }
        }
      }

      // Also check tables
      if (element.table?.tableRows) {
        for (const row of element.table.tableRows) {
          if (row.tableCells) {
            for (const cell of row.tableCells) {
              if (cell.text?.textElements) {
                for (const textEl of cell.text.textElements) {
                  if (textEl.textRun?.content) {
                    const content = textEl.textRun.content.trim();
                    if (content && content !== '\n') {
                      texts.push(content);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return texts;
  }

  /**
   * Detect the slide type based on content and position
   */
  detectSlideType(slideIndex, totalSlides, texts) {
    const fullText = texts.join(' ').toLowerCase();
    let bestMatch = { type: 'general', score: 0 };

    for (const [type, config] of Object.entries(SLIDE_TYPE_PATTERNS)) {
      let score = 0;

      // Check position matches
      if (config.positions) {
        for (const pos of config.positions) {
          const targetIndex = pos < 0 ? totalSlides + pos : pos;
          if (slideIndex === targetIndex) {
            score += 0.5;
          }
        }
      }

      // Check pattern matches
      if (config.patterns) {
        for (const pattern of config.patterns) {
          if (pattern.test(fullText)) {
            score += 0.3;
          }
        }
      }

      // Check keyword matches
      if (config.keywords) {
        const matchCount = config.keywords.filter(kw =>
          fullText.includes(kw.toLowerCase())
        ).length;
        score += (matchCount / config.keywords.length) * 0.2;
      }

      // Apply weight
      score *= config.weight;

      if (score > bestMatch.score) {
        bestMatch = { type, score };
      }
    }

    return bestMatch.score > 0.2 ? bestMatch.type : 'general';
  }

  /**
   * Extract the primary title from slide texts
   */
  extractTitle(texts) {
    if (!texts.length) return 'Untitled Slide';

    // First non-empty text is usually the title
    for (const text of texts) {
      const cleaned = text.replace(/\n/g, ' ').trim();
      if (cleaned.length >= 3 && cleaned.length <= 100) {
        return cleaned;
      }
    }

    return texts[0].substring(0, 100);
  }

  /**
   * Extract keywords from slide content
   */
  extractKeywords(texts) {
    const fullText = texts.join(' ').toLowerCase();
    const keywords = new Set();

    // Check against service keywords
    for (const [service, kws] of Object.entries(SERVICE_KEYWORDS)) {
      for (const kw of kws) {
        if (fullText.includes(kw.toLowerCase())) {
          keywords.add(service);
          keywords.add(kw);
        }
      }
    }

    // Extract common business terms
    const businessTerms = [
      'roi', 'efficiency', 'productivity', 'growth', 'revenue', 'cost',
      'backlog', 'automation', 'reporting', 'dashboards', 'analytics',
      'migration', 'implementation', 'optimization', 'compliance', 'security'
    ];

    for (const term of businessTerms) {
      if (fullText.includes(term)) {
        keywords.add(term);
      }
    }

    return [...keywords].slice(0, 10);
  }

  /**
   * Generate trigger conditions for slide selection
   */
  generateTriggerConditions(slideType, keywords, texts) {
    const fullText = texts.join(' ').toLowerCase();
    const conditions = {
      painPointsMatch: [],
      techStackMatch: [],
      servicesMatch: []
    };

    // Pain points based on slide type and content
    if (slideType === 'service' || slideType === 'caseStudy') {
      if (fullText.includes('backlog') || fullText.includes('admin')) {
        conditions.painPointsMatch.push('admin backlog', 'salesforce support');
      }
      if (fullText.includes('data quality') || fullText.includes('duplicate')) {
        conditions.painPointsMatch.push('data quality', 'duplicate records');
      }
      if (fullText.includes('integration') || fullText.includes('sync')) {
        conditions.painPointsMatch.push('integration issues', 'data sync');
      }
      if (fullText.includes('report') || fullText.includes('dashboard')) {
        conditions.painPointsMatch.push('reporting needs', 'visibility');
      }
    }

    // Tech stack based on keywords
    for (const kw of keywords) {
      if (['salesforce', 'hubspot', 'zapier', 'workato'].includes(kw)) {
        conditions.techStackMatch.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    }

    // Services based on content
    const serviceMapping = {
      admin: 'Salesforce Administration',
      revops: 'Revenue Operations',
      integration: 'Integration Services',
      automation: 'Automation Development',
      data: 'Data Quality Services',
      migration: 'Data Migration'
    };

    for (const [key, value] of Object.entries(serviceMapping)) {
      if (keywords.includes(key)) {
        conditions.servicesMatch.push(value);
      }
    }

    return conditions;
  }

  /**
   * Build the catalog from a presentation
   */
  async buildCatalog() {
    await this._initializeApiClient();

    console.log(`\n📊 Indexing Template: ${this.templateId}\n`);

    // Fetch presentation
    const response = await this.slides.presentations.get({
      presentationId: this.templateId
    });

    const presentation = response.data;
    const totalSlides = presentation.slides.length;

    console.log(`Title: ${presentation.title}`);
    console.log(`Total Slides: ${totalSlides}\n`);
    console.log('═'.repeat(70));

    const catalog = {
      templateId: this.templateId,
      templateTitle: presentation.title,
      totalSlides,
      indexedAt: new Date().toISOString(),
      mandatorySlides: [],
      slides: []
    };

    // Process each slide
    for (let i = 0; i < totalSlides; i++) {
      const slide = presentation.slides[i];
      const texts = this.extractSlideText(slide);
      const slideType = this.detectSlideType(i, totalSlides, texts);
      const title = this.extractTitle(texts);
      const keywords = this.extractKeywords(texts);
      const triggerConditions = this.generateTriggerConditions(slideType, keywords, texts);

      // Determine if mandatory
      const isMandatory = ['title', 'executiveSummary', 'investment', 'closing'].includes(slideType) &&
        (i === 0 || i === 1 || i >= totalSlides - 2);

      const slideEntry = {
        slideIndex: i,
        objectId: slide.objectId,
        type: slideType,
        title,
        description: texts.slice(1, 3).join(' ').substring(0, 150) || '',
        keywords,
        triggerConditions,
        personaRelevanceScores: PERSONA_DEFAULTS[slideType] || PERSONA_DEFAULTS.service,
        isMandatory,
        textPreview: texts.slice(0, 5)
      };

      // Track mandatory slides separately
      if (isMandatory) {
        let position = 'middle';
        if (i === 0) position = 'first';
        else if (i === 1) position = 'second';
        else if (i === totalSlides - 1) position = 'last';
        else if (i >= totalSlides - 2) position = 'nearEnd';

        catalog.mandatorySlides.push({
          slideIndex: i,
          role: slideType,
          position
        });
      }

      catalog.slides.push(slideEntry);

      // Log progress
      const typeIcon = {
        title: '🎯',
        executiveSummary: '📋',
        service: '🔧',
        caseStudy: '📈',
        methodology: '⚙️',
        team: '👥',
        investment: '💰',
        technical: '🔌',
        closing: '👋',
        general: '📄'
      }[slideType] || '📄';

      console.log(`\nSlide ${i + 1}: ${typeIcon} ${slideType.toUpperCase()}`);
      console.log(`  Title: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`);
      console.log(`  Keywords: ${keywords.slice(0, 5).join(', ') || 'none'}`);
      if (isMandatory) {
        console.log(`  ⭐ MANDATORY`);
      }
    }

    console.log('\n' + '═'.repeat(70));

    // Summary
    const typeCounts = {};
    for (const slide of catalog.slides) {
      typeCounts[slide.type] = (typeCounts[slide.type] || 0) + 1;
    }

    console.log('\n📊 Slide Type Summary:');
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count} slides`);
    }
    console.log(`  MANDATORY: ${catalog.mandatorySlides.length} slides`);

    return catalog;
  }

  /**
   * Save catalog to file
   */
  async saveCatalog(catalog) {
    // Ensure output directory exists
    const outputDir = path.dirname(this.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(this.outputPath, JSON.stringify(catalog, null, 2));
    console.log(`\n✅ Catalog saved to: ${this.outputPath}`);

    return this.outputPath;
  }

  /**
   * Run the indexer
   */
  async run() {
    try {
      const catalog = await this.buildCatalog();
      await this.saveCatalog(catalog);

      console.log('\n🎉 Indexing complete!');
      console.log('\nNext steps:');
      console.log('1. Review the catalog and enrich with manual keywords');
      console.log('2. Adjust persona relevance scores based on actual use');
      console.log('3. Run: node generate-zeta-corp-proposal.js --preview-selection');

      return catalog;
    } catch (error) {
      console.error('\n❌ Indexing failed:', error.message);
      throw error;
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  // Parse template ID
  const templateIdx = args.indexOf('--template');
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    options.templateId = args[templateIdx + 1];
  }

  // Parse output path
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    options.outputPath = args[outputIdx + 1];
  }

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Slide Catalog Indexer

Usage:
  node slide-catalog-indexer.js [options]

Options:
  --template <ID>   Template presentation ID (default: RevPal proposal template)
  --output <PATH>   Output path for catalog JSON
  --verbose, -v     Enable verbose logging
  --help, -h        Show this help

Examples:
  node slide-catalog-indexer.js
  node slide-catalog-indexer.js --template 1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc
  node slide-catalog-indexer.js --output ./my-catalog.json
`);
    process.exit(0);
  }

  const indexer = new SlideCatalogIndexer(options);
  await indexer.run();
}

// Export for programmatic use
module.exports = { SlideCatalogIndexer };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
