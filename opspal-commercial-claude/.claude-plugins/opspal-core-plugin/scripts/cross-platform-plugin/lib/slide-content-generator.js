#!/usr/bin/env node

/**
 * Slide Content Generator
 *
 * Generates NET NEW slide content based on transcript analysis.
 * Creates Title, Executive Summary, and "What We Heard" slides
 * that don't exist in the template but are essential for personalization.
 *
 * Also handles content personalization for ADJUSTABLE template slides
 * by inserting learnings from the discovery call.
 */

const fs = require('fs');
const path = require('path');

class SlideContentGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;

    // Load configuration
    const configPath = options.configPath ||
      path.join(__dirname, '../../config/slide-content-templates.json');

    if (fs.existsSync(configPath)) {
      this.templates = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      this.templates = this.getDefaultTemplates();
    }

    this.log('SlideContentGenerator initialized');
  }

  log(message, data) {
    if (this.verbose) {
      console.log(`[ContentGen] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }

  /**
   * Generate all NET NEW slides based on transcript
   *
   * @param {Object} parsed - Parsed transcript data
   * @param {Object} semanticAnalysis - Optional LLM analysis
   * @returns {Object[]} Array of net new slide content objects
   */
  generateNetNewSlides(parsed, semanticAnalysis = null) {
    const netNewSlides = [];

    // 1. Title Slide (always first)
    netNewSlides.push(this.generateTitleSlide(parsed));

    // 2. Executive Summary (always second)
    netNewSlides.push(this.generateExecutiveSummary(parsed, semanticAnalysis));

    // 3. What We Heard (pain points + quote)
    netNewSlides.push(this.generateWhatWeHeard(parsed, semanticAnalysis));

    return netNewSlides;
  }

  /**
   * Generate personalized Title Slide content
   */
  generateTitleSlide(parsed) {
    const companyName = parsed?.client?.companyName || 'Client';
    const date = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });

    // Extract primary contact
    const primaryContact = parsed?.stakeholders?.[0];
    const contactName = primaryContact?.name || '';
    const contactRole = primaryContact?.role || '';

    // Determine proposal focus from pain points
    const focusAreas = this.extractFocusAreas(parsed?.painPoints || []);

    return {
      role: 'title',
      slideType: 'netNew',
      position: 'first',
      content: {
        headline: `RevPal Proposal for ${companyName}`,
        subtitle: focusAreas.length > 0
          ? focusAreas.slice(0, 2).join(' & ')
          : 'Salesforce & Revenue Operations',
        date: date,
        preparedFor: contactName
          ? `Prepared for ${contactName}${contactRole ? `, ${contactRole}` : ''}`
          : `Prepared for ${companyName} Team`,
        revpalTagline: 'Your Strategic Operations Partner'
      },
      layoutHints: {
        style: 'full-bleed',
        textPosition: 'center',
        includeDate: true,
        includePreparedFor: true
      }
    };
  }

  /**
   * Generate personalized Executive Summary slide
   */
  generateExecutiveSummary(parsed, semanticAnalysis = null) {
    const companyName = parsed?.client?.companyName || 'Client';
    const painPoints = parsed?.painPoints || [];
    const budget = parsed?.budget || {};
    const timeline = parsed?.timeline || {};

    // Build situation summary
    const situationBullets = this.buildSituationBullets(parsed, semanticAnalysis);

    // Build recommended approach
    const approachBullets = this.buildApproachBullets(parsed, semanticAnalysis);

    // Build expected outcomes
    const outcomeBullets = this.buildOutcomeBullets(parsed, semanticAnalysis);

    // Investment summary
    const investmentSummary = this.buildInvestmentSummary(budget, timeline);

    return {
      role: 'executiveSummary',
      slideType: 'netNew',
      position: 'second',
      content: {
        headline: 'Executive Summary',
        subheadline: `Our Understanding of ${companyName}'s Needs`,
        sections: [
          {
            title: 'Current Situation',
            bullets: situationBullets,
            icon: 'situation'
          },
          {
            title: 'Recommended Approach',
            bullets: approachBullets,
            icon: 'approach'
          },
          {
            title: 'Expected Outcomes',
            bullets: outcomeBullets,
            icon: 'outcomes'
          }
        ],
        investmentSummary: investmentSummary,
        bottomLine: this.generateBottomLine(parsed, semanticAnalysis)
      },
      layoutHints: {
        style: 'three-column',
        includeInvestment: true,
        includeBottomLine: true
      }
    };
  }

  /**
   * Generate "What We Heard" slide
   */
  generateWhatWeHeard(parsed, semanticAnalysis = null) {
    const painPoints = parsed?.painPoints || [];
    const keyQuotes = parsed?.keyQuotes || [];

    // Select top pain points (max 5)
    const topPainPoints = this.prioritizePainPoints(painPoints, semanticAnalysis);

    // Select best quote
    const bestQuote = this.selectBestQuote(keyQuotes, semanticAnalysis);

    // Group pain points by category
    const categorizedPainPoints = this.categorizePainPoints(topPainPoints);

    return {
      role: 'whatWeHeard',
      slideType: 'netNew',
      position: 'third',
      content: {
        headline: 'What We Heard',
        subheadline: 'Key Challenges from Our Discovery Conversation',
        painPointCategories: categorizedPainPoints,
        quote: bestQuote ? {
          text: bestQuote.text,
          speaker: bestQuote.speaker,
          role: bestQuote.role,
          context: bestQuote.context
        } : null,
        techStack: parsed?.techStack || [],
        techStackNote: this.generateTechStackNote(parsed?.techStack || [])
      },
      layoutHints: {
        style: 'two-column-with-quote',
        showTechStack: true,
        quotePosition: 'bottom-right'
      }
    };
  }

  /**
   * Build situation bullets from parsed data
   */
  buildSituationBullets(parsed, semanticAnalysis) {
    const bullets = [];
    const painPoints = parsed?.painPoints || [];

    // Add 2-3 key situation bullets
    if (painPoints.length > 0) {
      // Get highest priority pain points, clean them, validate, then reframe
      const topPainPoints = painPoints
        .slice(0, 6)  // Get more to account for filtering
        .map(pp => {
          const text = pp.text || pp;
          // Clean transcript text first
          return this.cleanTranscriptText(text);
        })
        .filter(text => this.isValidSentence(text))  // Use same validation as prioritizePainPoints
        .map(text => this.reframeAssSituation(text))
        .slice(0, 3);

      bullets.push(...topPainPoints);
    }

    // Add tech stack context if relevant
    if (parsed?.techStack?.length > 2) {
      bullets.push(`Managing ${parsed.techStack.length} connected systems requiring coordination`);
    }

    return bullets.slice(0, 3);
  }

  /**
   * Build approach bullets
   */
  buildApproachBullets(parsed, semanticAnalysis) {
    const bullets = [];
    const services = this.extractServicesNeeded(parsed);

    // Map services to approach statements
    const serviceApproaches = {
      'RevOps': 'Implement data-driven pipeline management and forecasting',
      'Integration': 'Streamline system integrations for seamless data flow',
      'Salesforce Administration': 'Provide dedicated Salesforce admin support and optimization',
      'Data Quality': 'Execute systematic data cleansing and governance',
      'Automation': 'Automate manual processes to increase efficiency',
      'Reporting': 'Build actionable dashboards and reporting infrastructure'
    };

    for (const service of services.slice(0, 3)) {
      if (serviceApproaches[service]) {
        bullets.push(serviceApproaches[service]);
      }
    }

    // Default approach if no specific services detected
    if (bullets.length === 0) {
      bullets.push(
        'Phased implementation starting with quick wins',
        'Dedicated team familiar with your tech stack',
        'Continuous optimization and proactive support'
      );
    }

    return bullets.slice(0, 3);
  }

  /**
   * Build outcome bullets
   */
  buildOutcomeBullets(parsed, semanticAnalysis) {
    const bullets = [];

    // Extract expected outcomes from semantic analysis if available
    if (semanticAnalysis?.implicitGoals) {
      bullets.push(...semanticAnalysis.implicitGoals.slice(0, 2));
    }

    // Add generic outcomes based on pain points
    const painPoints = parsed?.painPoints || [];
    if (painPoints.length > 0) {
      const outcomeMap = {
        'backlog': 'Clear Salesforce backlog within 90 days',
        'report': 'Reliable, trusted reporting and dashboards',
        'data': 'Improved data quality and integrity',
        'automat': 'Reduced manual work through automation',
        'visib': 'Full pipeline visibility for leadership',
        'integrat': 'Seamless data flow across systems'
      };

      for (const pp of painPoints) {
        const text = (pp.text || pp).toLowerCase();
        for (const [key, outcome] of Object.entries(outcomeMap)) {
          if (text.includes(key) && !bullets.includes(outcome)) {
            bullets.push(outcome);
            break;
          }
        }
        if (bullets.length >= 3) break;
      }
    }

    // Defaults
    if (bullets.length < 2) {
      bullets.push(
        'Increased operational efficiency',
        'Better data-driven decision making',
        'Scalable processes for growth'
      );
    }

    return bullets.slice(0, 3);
  }

  /**
   * Build investment summary
   */
  buildInvestmentSummary(budget, timeline) {
    const budgetRange = budget?.range || budget?.min
      ? `${budget.min || '$10,000'} - ${budget.max || '$20,000'}/month`
      : 'To be discussed';

    const startDate = timeline?.startDate || timeline?.preference || 'Flexible';

    return {
      monthlyInvestment: budgetRange,
      targetStart: startDate,
      engagementModel: budget?.model || 'Retainer-based support'
    };
  }

  /**
   * Generate bottom line statement
   */
  generateBottomLine(parsed, semanticAnalysis) {
    const companyName = parsed?.client?.companyName || 'your organization';
    const primaryPainPoint = parsed?.painPoints?.[0];

    if (primaryPainPoint) {
      const painText = primaryPainPoint.text || primaryPainPoint;
      const painKeyword = this.extractKeyword(painText);
      return `RevPal will help ${companyName} address ${painKeyword} through a dedicated, expert team that understands your tech stack and business needs.`;
    }

    return `RevPal will partner with ${companyName} to transform your operations through expert Salesforce and RevOps support.`;
  }

  /**
   * Prioritize pain points based on frequency, urgency, and semantic analysis
   */
  prioritizePainPoints(painPoints, semanticAnalysis) {
    if (!painPoints.length) return [];

    // Score each pain point
    const scored = painPoints.map((pp, idx) => {
      const text = pp.text || pp;
      let score = 10 - idx; // Base score from position

      // Boost for urgency words
      const urgencyWords = ['urgent', 'critical', 'immediate', 'asap', 'broken', 'failing'];
      if (urgencyWords.some(w => text.toLowerCase().includes(w))) {
        score += 5;
      }

      // Boost for financial impact words
      const impactWords = ['revenue', 'cost', 'budget', 'money', 'expensive', 'waste'];
      if (impactWords.some(w => text.toLowerCase().includes(w))) {
        score += 3;
      }

      // Use semantic analysis scores if available
      if (semanticAnalysis?.painPointPriorities?.[text]) {
        score += semanticAnalysis.painPointPriorities[text] * 10;
      }

      return { ...pp, text, score };
    });

    // Sort by score, clean up text, filter invalid, and return top 5
    return scored
      .sort((a, b) => b.score - a.score)
      .map(pp => this.cleanTranscriptText(pp.text))
      .filter(text => this.isValidSentence(text))
      .slice(0, 5);
  }

  /**
   * Clean transcript text - remove filler words, verbal tics, and make professional
   */
  cleanTranscriptText(text) {
    if (!text) return '';

    let cleaned = text
      // Remove common filler phrases (careful with word boundaries)
      .replace(/,?\s*you know,?\s*/gi, ' ')
      .replace(/,?\s*I mean,?\s*/gi, ' ')
      .replace(/,?\s*kind of\s*/gi, ' ')
      .replace(/,?\s*sort of\s*/gi, ' ')
      .replace(/,?\s*basically,?\s*/gi, ' ')
      .replace(/,?\s*actually,?\s*/gi, ' ')
      .replace(/,?\s*like,\s*/gi, ' ')  // "like," with comma
      .replace(/,?\s*right,\s*/gi, ' ')  // "right," with comma
      .replace(/,?\s*okay,\s*/gi, ' ')   // "okay," with comma
      // "like" as filler (not as verb): "for like sales" → "for sales"
      .replace(/\b(for|is|are|was|were|be|being|been)\s+like\s+/gi, '$1 ')
      // "like" before numbers/amounts: "like 5k" → "5k"
      .replace(/\blike\s+(\d+)/gi, '$1')
      // "about like" filler: "about like the same" → "about the same"
      .replace(/\babout\s+like\s+/gi, 'about ')
      // "like" before adjectives (common pattern): "That's like stupid" → "That's stupid"
      .replace(/\bthat's\s+like\s+(stupid|crazy|insane|dumb|bad|good|great)\b/gi, "that's $1")
      .replace(/\bit's\s+like\s+(stupid|crazy|insane|dumb|bad|good|great)\b/gi, "it's $1")
      // Soften crude language (make business-appropriate)
      .replace(/\bthat's\s+stupid\b/gi, "that doesn't make sense")
      .replace(/\bthat's\s+dumb\b/gi, "that doesn't make sense")
      .replace(/\bthat's\s+crazy\b/gi, "that seems excessive")
      // Fix double "is" grammatical error: "is, I want to see is" → "is"
      .replace(/\bis,?\s+I\s+want\s+to\s+see\s+is\b/gi, 'is')
      // "like totally" as filler: "is like totally dragging" → "is dragging"
      .replace(/\blike\s+totally\s*/gi, '')
      .replace(/\btotally\s+/gi, '')
      .replace(/\bum\b,?\s*/gi, '')
      .replace(/\buh\b,?\s*/gi, '')
      // Remove isolated interjections: "so. Right." → "so."
      .replace(/\.\s*Right\.\s*/gi, '. ')
      .replace(/\.\s*Okay\.\s*/gi, '. ')
      .replace(/\.\s*Yeah\.\s*/gi, '. ')
      // "so." at end of sentence before another sentence
      .replace(/,\s*so\.\s+/gi, '. ')
      // Fix "so, " at start of sentence only
      .replace(/^so,?\s*/i, '')
      // Remove repeated words (but be careful)
      .replace(/\b(someone|something|somewhere)\s+\1\b/gi, '$1')
      .replace(/\b(the|a|an|is|are|was|were)\s+\1\b/gi, '$1')
      // Clean up punctuation issues
      .replace(/,\s*,/g, ',')
      .replace(/\s+,/g, ',')
      .replace(/,\s+is\b/gi, ' is')  // Fix ", is" → " is"
      // Clean up multiple spaces
      .replace(/\s{2,}/g, ' ')
      // Remove trailing fragments
      .replace(/\s+(or|and|but|the|a|an)\s*$/i, '')
      .trim();

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  /**
   * Check if text is a valid, complete sentence (not a fragment)
   */
  isValidSentence(text) {
    if (!text || text.length < 20) return false;

    // Must have a subject (capital letter or pronoun at start)
    // and not be obviously truncated
    const truncatedPatterns = [
      /^(maybe|or|and|but|just|also)\s/i,  // Starts with weak/fragment word
      /^(having|being|getting|making)\s/i,  // Gerund fragment start
      /\s(the|a|an|to|for|with|in|on|at)\s*$/i,  // Ends mid-thought
      /^[a-z]/,  // Starts with lowercase (fragment)
      /\bmeone\b/i,  // Broken word
      /\.\s*$/,  // Ends with just period and space
      /^.{0,30}\s+(the|a|an)$/i,  // Very short ending in article
      /^the\s+(first|second|third|next|other)\s+(is|thing)/i,  // Refers to conversation context
      /^I\s+(want|need|think|believe)\s+to\s+see/i,  // First-person perspective statements
    ];

    for (const pattern of truncatedPatterns) {
      if (pattern.test(text)) return false;
    }

    // Must have at least a verb-like word
    const hasVerb = /\b(is|are|was|were|have|has|had|need|want|can|could|would|should|will|do|does|did|get|make|take|help)\b/i.test(text);

    // Must have clear subject (not just gerund phrases)
    const hasSubject = /^(we|they|the|our|their|account|salesforce|data|reports?|teams?|system|process)/i.test(text) ||
                       /^[A-Z][a-z]+\s+(is|are|was|were|has|have|need|want|can)/i.test(text);

    return hasVerb && hasSubject && text.length >= 25;
  }

  /**
   * Select the best quote for the proposal
   */
  selectBestQuote(quotes, semanticAnalysis) {
    if (!quotes || quotes.length === 0) return null;

    // Score quotes
    const scored = quotes.map((quote, idx) => {
      const text = quote.text || quote;
      let score = 10 - idx;

      // DISQUALIFY very short quotes (less than 25 chars) - they lack context
      if (text.length < 25) {
        score -= 50;
      }

      // Prefer quotes that express clear pain or need
      const painIndicators = ['need', 'want', 'struggle', 'challenge', 'issue', 'problem', 'can\'t', 'difficult', 'hard', 'frustrat', 'broken', 'mess'];
      if (painIndicators.some(w => text.toLowerCase().includes(w))) {
        score += 5;
      }

      // Prefer quotes about business impact
      const impactWords = ['revenue', 'customer', 'time', 'data', 'visibility', 'efficiency', 'growth', 'scale'];
      if (impactWords.some(w => text.toLowerCase().includes(w))) {
        score += 4;
      }

      // Prefer medium-length quotes (not too short, not too long)
      if (text.length >= 40 && text.length < 150) score += 4;
      if (text.length >= 60 && text.length < 120) score += 2;

      // Prefer quotes from decision makers
      if (quote.role && ['ceo', 'cro', 'vp', 'director', 'head'].some(r =>
        quote.role.toLowerCase().includes(r))) {
        score += 4;
      }

      // PENALIZE self-referential quotes (not impactful for proposals)
      const selfRefPatterns = [
        /^I said that/i,
        /^I told them/i,
        /^I mentioned/i,
        /^I think that/i,
        /^I believe/i,
        /^we said/i,
        /^we told/i,
        /\bI said\b/i
      ];
      if (selfRefPatterns.some(p => p.test(text))) {
        score -= 15;
      }

      // Penalize quotes that are clearly filler or incomplete
      const fillerPatterns = ['good enough', 'i guess', 'whatever', 'i don\'t know', 'that\'s fine', 'sure', 'okay'];
      if (fillerPatterns.some(p => text.toLowerCase().includes(p))) {
        score -= 10;
      }

      // Penalize abstract/vague quotes
      const vaguePatterns = ['stuff', 'things', 'foundational input', 'this stuff', 'that stuff', 'all this', 'all that'];
      if (vaguePatterns.some(p => text.toLowerCase().includes(p))) {
        score -= 8;
      }

      return { ...quote, text, score };
    });

    const best = scored.sort((a, b) => b.score - a.score)[0];

    // Only return if score is positive (meaningful quote)
    if (best && best.score > 0) {
      // Clean the quote text
      return {
        ...best,
        text: this.cleanTranscriptText(best.text)
      };
    }

    return null;
  }

  /**
   * Categorize pain points into logical groups
   */
  categorizePainPoints(painPoints) {
    const categories = {
      process: { label: 'Process Challenges', items: [] },
      data: { label: 'Data Issues', items: [] },
      reporting: { label: 'Reporting Gaps', items: [] },
      resources: { label: 'Resource Constraints', items: [] }
    };

    for (const pp of painPoints) {
      const text = pp.toLowerCase();

      if (/data|duplicate|quality|clean|record/.test(text)) {
        categories.data.items.push(pp);
      } else if (/report|dashboard|visib|insight|metric/.test(text)) {
        categories.reporting.items.push(pp);
      } else if (/team|resource|time|bandwidth|capacity/.test(text)) {
        categories.resources.items.push(pp);
      } else {
        categories.process.items.push(pp);
      }
    }

    // Return only non-empty categories
    return Object.values(categories).filter(c => c.items.length > 0);
  }

  /**
   * Generate tech stack note
   */
  generateTechStackNote(techStack) {
    if (!techStack.length) return '';

    const hasSalesforce = techStack.some(t => t.toLowerCase().includes('salesforce'));
    const hasMarketing = techStack.some(t =>
      /hubspot|marketo|pardot|mailchimp/i.test(t.toLowerCase())
    );

    if (hasSalesforce && hasMarketing) {
      return 'Your tech stack spans CRM and marketing automation — integration and data flow are critical.';
    } else if (hasSalesforce) {
      return 'Salesforce is your core system — optimization and support are essential.';
    }

    return `Managing ${techStack.length} connected systems requires careful coordination.`;
  }

  /**
   * Extract focus areas from pain points
   */
  extractFocusAreas(painPoints) {
    const focusAreas = new Set();
    const areaPatterns = {
      'Salesforce Operations': /salesforce|admin|support|crm/i,
      'Revenue Operations': /revops|revenue|pipeline|forecast/i,
      'Marketing Operations': /marketing|campaign|lead|mql/i,
      'Data Management': /data|quality|duplicate|clean/i,
      'System Integration': /integrat|sync|connect|api/i,
      'Analytics & Reporting': /report|dashboard|analytics|metric/i
    };

    for (const pp of painPoints) {
      const text = pp.text || pp;
      for (const [area, pattern] of Object.entries(areaPatterns)) {
        if (pattern.test(text)) {
          focusAreas.add(area);
        }
      }
    }

    return [...focusAreas];
  }

  /**
   * Extract services needed from pain points
   */
  extractServicesNeeded(parsed) {
    const services = new Set();
    const painPoints = parsed?.painPoints || [];

    const servicePatterns = {
      'RevOps': /revops|revenue|pipeline|forecast/i,
      'Integration': /integrat|sync|connect|api/i,
      'Salesforce Administration': /salesforce|admin|support|sfdc|crm/i,
      'Data Quality': /data quality|duplicate|clean|enrich/i,
      'Automation': /automat|workflow|process|flow/i,
      'Reporting': /report|dashboard|visib|analytic/i
    };

    for (const pp of painPoints) {
      const text = pp.text || pp;
      for (const [service, pattern] of Object.entries(servicePatterns)) {
        if (pattern.test(text)) {
          services.add(service);
        }
      }
    }

    return [...services];
  }

  /**
   * Reframe a complaint/pain point as a situation statement
   */
  reframeAssSituation(text) {
    // Remove negative framing words
    let reframed = text
      .replace(/^(we have |our |the )/i, '')
      .replace(/is broken/gi, 'needs optimization')
      .replace(/doesn't work/gi, 'requires improvement')
      .replace(/is terrible/gi, 'has room for improvement')
      .replace(/can't/gi, 'currently unable to');

    // Ensure it starts with capital letter
    reframed = reframed.charAt(0).toUpperCase() + reframed.slice(1);

    return reframed;
  }

  /**
   * Extract main keyword from text
   */
  extractKeyword(text) {
    const keywords = [
      'salesforce', 'reporting', 'data quality', 'automation',
      'integration', 'pipeline', 'backlog', 'visibility'
    ];

    const lowerText = text.toLowerCase();
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        return kw;
      }
    }

    return 'operational challenges';
  }

  /**
   * Generate content for adjustable template slides
   *
   * @param {Object} slide - The template slide being adjusted
   * @param {Object} parsed - Parsed transcript data
   * @param {Object} semanticAnalysis - Optional semantic analysis
   * @returns {Object} Personalization instructions for the slide
   */
  generateAdjustableSlideContent(slide, parsed, semanticAnalysis) {
    const slideType = slide.type || 'service';
    const clientName = parsed?.client?.companyName || 'Client';

    switch (slideType) {
      case 'investment':
        return this.generateInvestmentContent(slide, parsed);

      case 'roadmap':
        return this.generateRoadmapContent(slide, parsed);

      case 'closing':
        return this.generateClosingContent(slide, parsed);

      default:
        return this.generateGenericPersonalization(slide, parsed);
    }
  }

  /**
   * Generate investment slide content
   */
  generateInvestmentContent(slide, parsed) {
    const budget = parsed?.budget || {};
    const timeline = parsed?.timeline || {};

    return {
      personalizations: [
        {
          element: 'budgetAmount',
          value: budget.range || '$10,000 - $20,000/month',
          fallback: 'Customized to your needs'
        },
        {
          element: 'startDate',
          value: timeline.startDate || timeline.preference || 'January 2025',
          fallback: 'Flexible start date'
        },
        {
          element: 'nextSteps',
          value: this.generateNextSteps(parsed),
          format: 'numbered-list'
        }
      ],
      keepTemplate: ['serviceDescription', 'deliverables', 'teamComposition']
    };
  }

  /**
   * Generate roadmap content
   */
  generateRoadmapContent(slide, parsed) {
    const phases = this.generatePhases(parsed);

    return {
      personalizations: [
        {
          element: 'timeline',
          value: phases,
          format: 'phase-timeline'
        }
      ],
      keepTemplate: ['milestoneDescriptions']
    };
  }

  /**
   * Generate closing slide content
   */
  generateClosingContent(slide, parsed) {
    const clientName = parsed?.client?.companyName || 'Client';
    const primaryContact = parsed?.stakeholders?.[0];

    return {
      personalizations: [
        {
          element: 'callToAction',
          value: `Let's build the right model for ${clientName}`,
          fallback: "Let's build the right model together"
        },
        {
          element: 'contactInfo',
          value: primaryContact?.email || '',
          optional: true
        }
      ],
      keepTemplate: ['companyInfo', 'contactDetails']
    };
  }

  /**
   * Generate generic personalization
   */
  generateGenericPersonalization(slide, parsed) {
    const clientName = parsed?.client?.companyName || 'Client';

    return {
      personalizations: [
        {
          element: 'clientNamePlaceholder',
          value: clientName,
          replacePattern: /\[Client\]|\[Company\]|Client Name/gi
        }
      ],
      keepTemplate: ['*']
    };
  }

  /**
   * Generate next steps list
   */
  generateNextSteps(parsed) {
    const steps = [];

    // Standard next steps
    steps.push('Review and finalize proposal scope');
    steps.push('Sign Statement of Work');

    // Add timeline-specific step
    if (parsed?.timeline?.startDate) {
      steps.push(`Schedule kick-off meeting for ${parsed.timeline.startDate}`);
    } else {
      steps.push('Schedule kick-off meeting');
    }

    steps.push('Begin onboarding and discovery');

    return steps;
  }

  /**
   * Generate implementation phases
   */
  generatePhases(parsed) {
    const startDate = parsed?.timeline?.startDate || 'Month 1';

    return [
      {
        name: 'Foundation',
        duration: 'Weeks 1-4',
        activities: ['System access & audit', 'Process documentation', 'Quick wins']
      },
      {
        name: 'Optimization',
        duration: 'Weeks 5-8',
        activities: ['Process improvements', 'Automation setup', 'Training']
      },
      {
        name: 'Scale',
        duration: 'Weeks 9-12',
        activities: ['Advanced features', 'Team enablement', 'Ongoing support']
      }
    ];
  }

  /**
   * Get default templates
   */
  getDefaultTemplates() {
    return {
      title: {
        headline: 'RevPal Proposal for {clientName}',
        subtitle: '{focusAreas}',
        preparedFor: 'Prepared for {contactName}'
      },
      executiveSummary: {
        sections: 3,
        includeInvestment: true,
        includeBottomLine: true
      },
      whatWeHeard: {
        maxPainPoints: 5,
        includeQuote: true,
        showTechStack: true
      }
    };
  }
}

module.exports = { SlideContentGenerator };

// CLI for testing
if (require.main === module) {
  const testParsed = {
    client: { companyName: 'Aspire' },
    stakeholders: [{ name: 'Tom Jenkins', role: 'Head of Sales Ops' }],
    painPoints: [
      { text: 'Salesforce backlog is overwhelming' },
      { text: 'Reporting is unreliable' },
      { text: 'Data quality issues everywhere' }
    ],
    keyQuotes: [
      { text: 'We need help yesterday', speaker: 'Tom Jenkins', role: 'Head of Sales Ops' }
    ],
    techStack: ['Salesforce', 'HubSpot', 'Marketo', 'PandaDoc'],
    budget: { range: '$15,000 - $25,000/month' },
    timeline: { startDate: 'January 2025' }
  };

  const generator = new SlideContentGenerator({ verbose: true });
  const netNew = generator.generateNetNewSlides(testParsed);

  console.log('\n' + '='.repeat(70));
  console.log('NET NEW SLIDES GENERATED');
  console.log('='.repeat(70));

  netNew.forEach((slide, idx) => {
    console.log(`\n--- Slide ${idx + 1}: ${slide.role} ---`);
    console.log(JSON.stringify(slide.content, null, 2));
  });
}
