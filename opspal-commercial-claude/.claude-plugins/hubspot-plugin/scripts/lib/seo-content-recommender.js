#!/usr/bin/env node

/**
 * SEO Content Recommender
 *
 * Generates content improvement recommendations based on:
 * - Gap analysis from Phase 2
 * - Competitor content analysis
 * - Keyword research
 * - Content quality scores
 * - AEO opportunities
 *
 * Part of Phase 3: Content Optimization & AEO
 *
 * Usage:
 *   node seo-content-recommender.js --gap-analysis ./gaps.json
 *   node seo-content-recommender.js --url https://example.com --keywords "keyword1,keyword2"
 *   node seo-content-recommender.js --crawl ./crawl.json --keywords ./keywords.json
 */

const fs = require('fs');
const path = require('path');

class SEOContentRecommender {
  constructor(options = {}) {
    this.options = {
      minOpportunityScore: 5,
      maxRecommendations: 20,
      ...options
    };

    // Content types by intent
    this.contentTypes = {
      'how-to': {
        format: 'step-by-step guide',
        avgLength: 2500,
        elements: ['numbered steps', 'screenshots', 'examples', 'tips'],
        schema: 'HowTo'
      },
      'what-is': {
        format: 'definition + explanation',
        avgLength: 1500,
        elements: ['definition', 'benefits', 'examples', 'comparison'],
        schema: 'DefinedTerm'
      },
      'comparison': {
        format: 'comparison guide',
        avgLength: 2000,
        elements: ['comparison table', 'pros/cons', 'use cases'],
        schema: 'Article'
      },
      'list': {
        format: 'listicle',
        avgLength: 1800,
        elements: ['numbered items', 'descriptions', 'examples'],
        schema: 'Article'
      },
      'guide': {
        format: 'comprehensive guide',
        avgLength: 3000,
        elements: ['sections', 'examples', 'diagrams', 'FAQ'],
        schema: 'Article'
      }
    };

    // Priority scoring factors
    this.priorityFactors = {
      searchVolume: 0.25,
      difficulty: 0.20,
      currentRanking: 0.20,
      gapSeverity: 0.20,
      businessValue: 0.15
    };
  }

  /**
   * Generate content recommendations
   */
  async generateRecommendations(input) {
    console.log('💡 Generating content recommendations...');

    // Parse input data
    const data = this.parseInput(input);

    const recommendations = [];

    // Generate recommendations from gap analysis
    if (data.gaps) {
      const gapRecs = this.recommendFromGaps(data.gaps, data.keywords);
      recommendations.push(...gapRecs);
    }

    // Generate recommendations from keyword research
    if (data.keywords) {
      const keywordRecs = this.recommendFromKeywords(data.keywords, data.crawl);
      recommendations.push(...keywordRecs);
    }

    // Generate upgrade recommendations for existing content
    if (data.crawl) {
      const upgradeRecs = this.recommendUpgrades(data.crawl, data.keywords, data.contentScores);
      recommendations.push(...upgradeRecs);
    }

    // Generate consolidation recommendations
    if (data.crawl) {
      const consolidationRecs = this.recommendConsolidation(data.crawl);
      recommendations.push(...consolidationRecs);
    }

    // Score and prioritize
    const prioritized = this.prioritizeRecommendations(recommendations);

    // Generate content briefs for top recommendations
    const withBriefs = prioritized.slice(0, 10).map(rec =>
      this.generateContentBrief(rec, data)
    );

    return {
      totalRecommendations: prioritized.length,
      highPriority: prioritized.filter(r => r.priority === 'high').length,
      mediumPriority: prioritized.filter(r => r.priority === 'medium').length,
      lowPriority: prioritized.filter(r => r.priority === 'low').length,
      recommendations: withBriefs,
      summary: this.generateSummary(withBriefs)
    };
  }

  /**
   * Recommend content from gap analysis
   */
  recommendFromGaps(gaps, keywords) {
    const recommendations = [];

    // Topic gaps
    if (gaps.topicGaps) {
      gaps.topicGaps.forEach(gap => {
        const relatedKeywords = this.findRelatedKeywords(gap.topic, keywords);

        if (relatedKeywords.length > 0) {
          recommendations.push({
            type: 'new_content',
            reason: 'topic_gap',
            title: this.generateTitle(gap.topic, relatedKeywords[0]),
            targetKeyword: relatedKeywords[0]?.keyword || gap.topic,
            topic: gap.topic,
            opportunity: gap.severity * 10 / 10,
            competitorAnalysis: {
              topRanking: gap.competitorUrls || [],
              avgWordCount: gap.avgWordCount || 2000,
              commonElements: gap.commonElements || []
            },
            metrics: {
              searchVolume: relatedKeywords[0]?.searchVolume || 0,
              difficulty: relatedKeywords[0]?.difficulty || 50,
              gapSeverity: gap.severity
            }
          });
        }
      });
    }

    // Keyword gaps
    if (gaps.keywordGaps) {
      gaps.keywordGaps.forEach(gap => {
        recommendations.push({
          type: 'new_content',
          reason: 'keyword_gap',
          title: this.generateTitle(gap.keyword, { keyword: gap.keyword }),
          targetKeyword: gap.keyword,
          topic: this.extractTopic(gap.keyword),
          opportunity: gap.opportunity || 5,
          competitorAnalysis: {
            topRanking: gap.competitorUrls || [],
            avgWordCount: 2500
          },
          metrics: {
            searchVolume: gap.searchVolume || 0,
            difficulty: gap.difficulty || 50,
            gapSeverity: 5
          }
        });
      });
    }

    // SERP feature gaps
    if (gaps.serpFeatureGaps) {
      gaps.serpFeatureGaps.forEach(gap => {
        recommendations.push({
          type: 'format_optimization',
          reason: 'serp_feature_gap',
          title: `Optimize for ${gap.feature} on existing content`,
          targetKeyword: gap.keyword || 'relevant keyword',
          topic: gap.topic || this.extractTopic(gap.keyword),
          opportunity: gap.opportunity || 6,
          suggestedFormat: this.getSerpFeatureFormat(gap.feature),
          competitorAnalysis: {
            hasFeature: gap.competitorUrls || []
          },
          metrics: {
            featureType: gap.feature,
            currentFormat: gap.currentFormat || 'unknown'
          }
        });
      });
    }

    return recommendations;
  }

  /**
   * Recommend content from keyword research
   */
  recommendFromKeywords(keywords, crawl) {
    const recommendations = [];

    // Filter high-opportunity keywords
    const highOpportunity = keywords.keywords
      ?.filter(kw => kw.opportunityScore >= this.options.minOpportunityScore)
      .slice(0, 15) || [];

    highOpportunity.forEach(keyword => {
      // Check if we already have content for this keyword
      const existingContent = this.findExistingContent(keyword.keyword, crawl);

      if (!existingContent) {
        // Recommend new content
        const contentType = this.detectContentType(keyword.keyword);

        recommendations.push({
          type: 'new_content',
          reason: 'high_opportunity_keyword',
          title: this.generateTitle(keyword.keyword, keyword),
          targetKeyword: keyword.keyword,
          topic: this.extractTopic(keyword.keyword),
          opportunity: keyword.opportunityScore,
          contentType,
          metrics: {
            searchVolume: keyword.searchVolume,
            difficulty: keyword.difficulty,
            opportunityScore: keyword.opportunityScore
          }
        });
      } else {
        // Recommend content upgrade
        recommendations.push({
          type: 'content_upgrade',
          reason: 'keyword_optimization',
          title: `Optimize "${existingContent.title}" for "${keyword.keyword}"`,
          targetKeyword: keyword.keyword,
          existingUrl: existingContent.url,
          currentTitle: existingContent.title,
          opportunity: keyword.opportunityScore * 0.8, // Slightly lower for upgrades
          metrics: {
            searchVolume: keyword.searchVolume,
            difficulty: keyword.difficulty,
            currentWordCount: existingContent.wordCount || 0
          }
        });
      }
    });

    return recommendations;
  }

  /**
   * Recommend upgrades for existing content
   */
  recommendUpgrades(crawl, keywords, contentScores) {
    const recommendations = [];

    crawl.pages?.forEach(page => {
      const upgrades = [];

      // Low word count
      if (page.content?.wordCount < 1000) {
        upgrades.push({
          issue: 'low_word_count',
          action: `Expand content from ${page.content.wordCount} to 1500+ words`,
          impact: 7
        });
      }

      // Missing images
      if (!page.content?.images || page.content.images.length < 3) {
        upgrades.push({
          issue: 'insufficient_images',
          action: `Add ${5 - (page.content?.images?.length || 0)} more images`,
          impact: 5
        });
      }

      // Poor readability (if scores available)
      if (contentScores) {
        const score = contentScores[page.url];
        if (score && score.readability < 60) {
          upgrades.push({
            issue: 'poor_readability',
            action: 'Simplify language and shorten sentences',
            impact: 6
          });
        }
      }

      // Missing schema
      if (!page.schema || page.schema.length === 0) {
        upgrades.push({
          issue: 'missing_schema',
          action: 'Add appropriate schema markup',
          impact: 6
        });
      }

      // Thin content
      if (page.content?.headings?.h2?.length < 3) {
        upgrades.push({
          issue: 'thin_structure',
          action: 'Add more sections with H2 headings',
          impact: 5
        });
      }

      if (upgrades.length > 0) {
        recommendations.push({
          type: 'content_upgrade',
          reason: 'quality_improvement',
          title: `Upgrade: ${page.title}`,
          existingUrl: page.url,
          currentTitle: page.title,
          opportunity: this.calculateUpgradeOpportunity(upgrades),
          upgrades,
          metrics: {
            currentWordCount: page.content?.wordCount || 0,
            currentImages: page.content?.images?.length || 0,
            currentHeadings: page.content?.headings?.h2?.length || 0
          }
        });
      }
    });

    return recommendations;
  }

  /**
   * Recommend content consolidation
   */
  recommendConsolidation(crawl) {
    const recommendations = [];

    // Find thin content pages
    const thinPages = crawl.pages?.filter(p =>
      p.content?.wordCount < 500 && p.content?.wordCount > 0
    ) || [];

    if (thinPages.length >= 3) {
      // Group by topic similarity
      const groups = this.groupByTopic(thinPages);

      groups.forEach(group => {
        if (group.pages.length >= 2) {
          recommendations.push({
            type: 'content_consolidation',
            reason: 'thin_content',
            title: `Consolidate ${group.pages.length} pages on "${group.topic}"`,
            topic: group.topic,
            pagesToMerge: group.pages.map(p => ({
              url: p.url,
              title: p.title,
              wordCount: p.content?.wordCount || 0
            })),
            opportunity: 6,
            suggestedTitle: this.generateTitle(group.topic, null),
            estimatedLength: group.pages.reduce((sum, p) => sum + (p.content?.wordCount || 0), 0)
          });
        }
      });
    }

    return recommendations;
  }

  /**
   * Prioritize recommendations
   */
  prioritizeRecommendations(recommendations) {
    // Calculate priority score for each
    const scored = recommendations.map(rec => {
      const score = this.calculatePriorityScore(rec);
      const priority = this.scoreToPriority(score);

      return {
        ...rec,
        priorityScore: score,
        priority,
        estimatedEffort: this.estimateEffort(rec),
        estimatedImpact: this.estimateImpact(rec)
      };
    });

    // Sort by priority score (highest first)
    return scored.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Calculate priority score (0-100)
   */
  calculatePriorityScore(rec) {
    let score = 0;

    // Base opportunity score
    score += (rec.opportunity || 5) * 10;

    // Search volume factor
    if (rec.metrics?.searchVolume) {
      const volumeScore = Math.min(rec.metrics.searchVolume / 100, 20);
      score += volumeScore * this.priorityFactors.searchVolume * 100;
    }

    // Difficulty factor (lower difficulty = higher priority)
    if (rec.metrics?.difficulty) {
      const difficultyScore = (100 - rec.metrics.difficulty) / 5;
      score += difficultyScore * this.priorityFactors.difficulty * 100;
    }

    // Type-specific adjustments
    if (rec.type === 'new_content') score += 10;
    if (rec.type === 'content_upgrade') score += 5;
    if (rec.type === 'format_optimization') score += 8;

    // Reason-specific adjustments
    if (rec.reason === 'topic_gap') score += 10;
    if (rec.reason === 'high_opportunity_keyword') score += 8;

    return Math.min(Math.round(score), 100);
  }

  scoreToPriority(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * Estimate effort (hours)
   */
  estimateEffort(rec) {
    const baseEffort = {
      'new_content': 8,
      'content_upgrade': 4,
      'content_consolidation': 6,
      'content_refresh': 3,
      'format_optimization': 2
    };

    let effort = baseEffort[rec.type] || 4;

    // Adjust for content length
    if (rec.contentBrief?.suggestedLength) {
      const words = parseInt(rec.contentBrief.suggestedLength.split('-')[0]);
      if (words > 3000) effort += 3;
      else if (words > 2000) effort += 2;
      else if (words > 1000) effort += 1;
    }

    // Adjust for complexity
    if (rec.contentType?.format === 'comprehensive guide') effort += 4;
    if (rec.contentType?.format === 'step-by-step guide') effort += 2;

    return effort;
  }

  /**
   * Estimate impact (1-10)
   */
  estimateImpact(rec) {
    let impact = rec.opportunity || 5;

    // Type-specific adjustments
    if (rec.type === 'new_content') impact += 1;
    if (rec.type === 'format_optimization') impact += 0.5;

    // Keyword metrics
    if (rec.metrics?.searchVolume > 1000) impact += 1;
    if (rec.metrics?.difficulty < 30) impact += 1;

    return Math.min(Math.round(impact * 10) / 10, 10);
  }

  /**
   * Generate content brief
   */
  generateContentBrief(rec, data) {
    const contentType = rec.contentType || this.detectContentType(rec.targetKeyword);
    const competitors = rec.competitorAnalysis?.topRanking || [];

    const brief = {
      ...rec,
      contentBrief: {
        suggestedLength: this.suggestLength(rec, contentType),
        requiredSections: this.suggestSections(rec, contentType),
        requiredImages: this.suggestImageCount(rec, contentType),
        requiredExamples: this.suggestExampleCount(contentType),
        targetSnippet: this.suggestSnippetFormat(rec),
        schema: contentType?.schema,
        internalLinks: this.suggestInternalLinks(rec, data),
        externalLinks: this.suggestExternalLinks(rec),
        keywords: {
          primary: rec.targetKeyword,
          secondary: this.suggestSecondaryKeywords(rec, data.keywords),
          lsi: this.suggestLSIKeywords(rec.targetKeyword)
        },
        tone: this.suggestTone(rec),
        audience: this.suggestAudience(rec),
        callToAction: this.suggestCTA(rec)
      }
    };

    return brief;
  }

  suggestLength(rec, contentType) {
    const baseLength = contentType?.avgLength || 2000;
    const competitorLength = rec.competitorAnalysis?.avgWordCount || baseLength;

    // Aim for 10-20% longer than competitors
    const target = Math.round(competitorLength * 1.15);
    const range = Math.round(target * 0.2);

    return `${target - range}-${target + range} words`;
  }

  suggestSections(rec, contentType) {
    const sections = ['Introduction'];
    const format = contentType?.format;

    if (format === 'step-by-step guide') {
      sections.push('Prerequisites', 'Step-by-Step Instructions', 'Tips & Best Practices', 'Common Mistakes', 'FAQ');
    } else if (format === 'definition + explanation') {
      sections.push('Definition', 'Key Components', 'Benefits', 'Examples', 'Related Concepts');
    } else if (format === 'comparison guide') {
      sections.push('Overview', 'Comparison Table', 'Pros & Cons', 'Use Cases', 'Recommendations');
    } else if (format === 'listicle') {
      const itemCount = this.extractNumberFromKeyword(rec.targetKeyword) || 10;
      for (let i = 1; i <= itemCount; i++) {
        sections.push(`Item ${i}`);
      }
      sections.push('Conclusion');
    } else {
      sections.push('Key Points', 'Detailed Explanation', 'Examples', 'Best Practices', 'Conclusion');
    }

    return sections;
  }

  suggestImageCount(rec, contentType) {
    const baseCount = {
      'step-by-step guide': 8,
      'definition + explanation': 4,
      'comparison guide': 6,
      'listicle': 5,
      'comprehensive guide': 10
    };

    return baseCount[contentType?.format] || 5;
  }

  suggestExampleCount(contentType) {
    const format = contentType?.format;
    if (format === 'step-by-step guide') return 3;
    if (format === 'comprehensive guide') return 5;
    return 2;
  }

  suggestSnippetFormat(rec) {
    if (!rec.targetKeyword) return 'paragraph';
    const keyword = rec.targetKeyword.toLowerCase();

    if (keyword.includes('how to')) return 'numbered list';
    if (keyword.includes('what is')) return 'concise paragraph (40-60 words)';
    if (keyword.includes('vs') || keyword.includes('comparison')) return 'comparison table';
    if (keyword.match(/\d+ (ways|tips|steps|best)/)) return 'numbered list';

    return 'paragraph';
  }

  suggestInternalLinks(rec, data) {
    // Find related pages from crawl
    if (!data.crawl) return [];

    const related = data.crawl.pages
      ?.filter(p => this.isRelated(rec.topic, p.url) || this.isRelated(rec.topic, p.title))
      .slice(0, 5)
      .map(p => ({
        url: p.url,
        title: p.title,
        anchorText: this.suggestAnchorText(rec.targetKeyword, p.title)
      })) || [];

    return related;
  }

  suggestExternalLinks(rec) {
    // Suggest authoritative external sources
    const topic = rec.topic || this.extractTopic(rec.targetKeyword);

    return [
      { type: 'statistics', description: 'Find relevant statistics from authoritative sources' },
      { type: 'research', description: 'Link to relevant research papers or studies' },
      { type: 'tools', description: 'Link to helpful tools or resources' }
    ];
  }

  suggestSecondaryKeywords(rec, keywords) {
    if (!keywords) return [];

    // Find related keywords
    const related = keywords.keywords
      ?.filter(kw =>
        kw.keyword !== rec.targetKeyword &&
        this.isRelated(rec.targetKeyword, kw.keyword)
      )
      .slice(0, 5)
      .map(kw => kw.keyword) || [];

    return related;
  }

  suggestLSIKeywords(keyword) {
    // Generate LSI (Latent Semantic Indexing) keyword suggestions
    if (!keyword) return [];
    const words = keyword.toLowerCase().split(/\s+/);
    const lsi = [];

    // Add variations
    lsi.push(`${keyword} guide`);
    lsi.push(`${keyword} tips`);
    lsi.push(`best ${keyword}`);

    return lsi.slice(0, 5);
  }

  suggestTone(rec) {
    if (!rec.targetKeyword) return 'Professional, informative, accessible';
    if (rec.targetKeyword.includes('guide') || rec.targetKeyword.includes('how to')) {
      return 'Educational, helpful, step-by-step';
    }
    if (rec.targetKeyword.includes('best') || rec.targetKeyword.includes('top')) {
      return 'Authoritative, comparative, data-driven';
    }
    return 'Professional, informative, accessible';
  }

  suggestAudience(rec) {
    if (!rec.targetKeyword) return 'General audience with basic understanding';
    if (rec.targetKeyword.includes('beginner')) return 'Beginners with no prior experience';
    if (rec.targetKeyword.includes('advanced')) return 'Advanced practitioners';
    return 'General audience with basic understanding';
  }

  suggestCTA(rec) {
    if (rec.type === 'new_content') {
      return 'Sign up for our newsletter to get more tips';
    }
    if (rec.type === 'content_upgrade') {
      return 'Download our free guide';
    }
    return 'Contact us to learn more';
  }

  /**
   * Generate summary
   */
  generateSummary(recommendations) {
    const byType = {};
    const byPriority = { high: 0, medium: 0, low: 0 };

    recommendations.forEach(rec => {
      byType[rec.type] = (byType[rec.type] || 0) + 1;
      byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;
    });

    const totalEffort = recommendations.reduce((sum, rec) => sum + rec.estimatedEffort, 0);
    const avgImpact = recommendations.reduce((sum, rec) => sum + rec.estimatedImpact, 0) / recommendations.length;

    return {
      totalRecommendations: recommendations.length,
      byType,
      byPriority,
      estimatedTotalEffort: `${totalEffort} hours`,
      averageImpact: Math.round(avgImpact * 10) / 10,
      quickWins: recommendations.filter(r =>
        r.estimatedEffort <= 4 && r.estimatedImpact >= 7
      ).length,
      topRecommendation: recommendations[0]?.title || null
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  parseInput(input) {
    const data = {
      gaps: null,
      keywords: null,
      crawl: null,
      contentScores: null
    };

    // Parse different input formats
    if (input.gapAnalysisFile) {
      data.gaps = JSON.parse(fs.readFileSync(input.gapAnalysisFile, 'utf-8'));
    }
    if (input.keywordsFile) {
      data.keywords = JSON.parse(fs.readFileSync(input.keywordsFile, 'utf-8'));
    }
    if (input.crawlFile) {
      data.crawl = JSON.parse(fs.readFileSync(input.crawlFile, 'utf-8'));
    }
    if (input.contentScoresFile) {
      data.contentScores = JSON.parse(fs.readFileSync(input.contentScoresFile, 'utf-8'));
    }

    return data;
  }

  detectContentType(keyword) {
    if (!keyword) return this.contentTypes['blog-post'];
    const lower = keyword.toLowerCase();

    if (lower.includes('how to') || lower.includes('how do')) {
      return this.contentTypes['how-to'];
    }
    if (lower.includes('what is') || lower.includes('what are')) {
      return this.contentTypes['what-is'];
    }
    if (lower.includes('vs') || lower.includes('versus') || lower.includes('comparison')) {
      return this.contentTypes['comparison'];
    }
    if (lower.match(/\d+ (ways|tips|steps|best|top)/)) {
      return this.contentTypes['list'];
    }
    if (lower.includes('guide') || lower.includes('complete')) {
      return this.contentTypes['guide'];
    }

    return this.contentTypes['guide']; // Default
  }

  generateTitle(topic, keyword) {
    if (!keyword) return this.capitalizeWords(topic);

    const kw = keyword.keyword || keyword;
    const lower = kw.toLowerCase();

    if (lower.includes('how to')) {
      return `${this.capitalizeWords(kw)}: Complete Guide`;
    }
    if (lower.includes('what is')) {
      return `${this.capitalizeWords(kw)}: Definition & Examples`;
    }
    if (lower.match(/\d+ (ways|tips|steps)/)) {
      return this.capitalizeWords(kw);
    }

    return `${this.capitalizeWords(kw)}: Complete Guide`;
  }

  extractTopic(keyword) {
    // Remove question words and extract core topic
    if (!keyword) return '';
    return keyword
      .replace(/^(how to|what is|what are|why|when|where)\s+/i, '')
      .replace(/\?/g, '')
      .trim();
  }

  findRelatedKeywords(topic, keywords) {
    if (!keywords) return [];

    return keywords.keywords
      ?.filter(kw => kw.keyword.toLowerCase().includes(topic.toLowerCase()))
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 5) || [];
  }

  findExistingContent(keyword, crawl) {
    if (!crawl) return null;

    return crawl.pages?.find(p =>
      p.title?.toLowerCase().includes(keyword.toLowerCase()) ||
      p.url?.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, '-'))
    );
  }

  calculateUpgradeOpportunity(upgrades) {
    const avgImpact = upgrades.reduce((sum, u) => sum + u.impact, 0) / upgrades.length;
    return Math.min(Math.round(avgImpact), 10);
  }

  groupByTopic(pages) {
    // Simple topic grouping based on URL and title similarity
    const groups = [];
    const used = new Set();

    pages.forEach(page => {
      if (used.has(page.url)) return;

      const topic = this.extractTopicFromUrl(page.url);
      const related = pages.filter(p =>
        !used.has(p.url) &&
        (this.isRelated(topic, p.url) || this.isRelated(topic, p.title))
      );

      if (related.length >= 2) {
        groups.push({ topic, pages: related });
        related.forEach(p => used.add(p.url));
      }
    });

    return groups;
  }

  extractTopicFromUrl(url) {
    const path = url.split('/').filter(p => p && p !== 'http:' && p !== 'https:').pop() || '';
    return path.replace(/[-_]/g, ' ').replace(/\.\w+$/, '');
  }

  isRelated(topic1, topic2) {
    if (!topic1 || !topic2) return false;
    const words1 = topic1.toLowerCase().split(/\s+/);
    const words2 = topic2.toLowerCase().split(/\s+/);
    const common = words1.filter(w => words2.includes(w) && w.length > 3);
    return common.length >= 2;
  }

  suggestAnchorText(keyword, title) {
    // Generate natural anchor text
    if (title.length < 60) return title;
    return `Learn about ${keyword}`;
  }

  extractNumberFromKeyword(keyword) {
    const match = keyword.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  getSerpFeatureFormat(feature) {
    const formats = {
      'featured_snippet': 'concise paragraph or numbered list',
      'people_also_ask': 'Q&A format with direct answers',
      'knowledge_panel': 'structured data with schema',
      'local_pack': 'location-based optimization',
      'videos': 'video content with transcript',
      'images': 'high-quality images with alt text',
      'shopping': 'product schema',
      'news': 'timely content with dates'
    };
    return formats[feature] || 'optimized format';
  }

  capitalizeWords(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO Content Recommender - Generate content improvement recommendations

Usage:
  node seo-content-recommender.js --gap-analysis <file> [options]
  node seo-content-recommender.js --keywords <file> [options]
  node seo-content-recommender.js --crawl <file> --keywords <file>

Options:
  --gap-analysis <file>     Gap analysis JSON file from Phase 2
  --keywords <file>         Keyword research JSON file
  --crawl <file>            Site crawl JSON file
  --content-scores <file>   Content scores JSON file
  --output <file>           Save results to JSON file
  --min-opportunity <n>     Minimum opportunity score (default: 5)
  --help                    Show this help message

Examples:
  node seo-content-recommender.js --gap-analysis ./gaps.json
  node seo-content-recommender.js --keywords ./keywords.json --crawl ./crawl.json
  node seo-content-recommender.js --gap-analysis ./gaps.json --output recs.json

Output:
  - Content recommendations with priority
  - Detailed content briefs for top recommendations
  - Estimated effort and impact
  - Suggested sections, keywords, and elements
    `);
    process.exit(0);
  }

  const input = {
    gapAnalysisFile: null,
    keywordsFile: null,
    crawlFile: null,
    contentScoresFile: null
  };

  let outputFile = null;
  let minOpportunity = 5;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gap-analysis' && args[i + 1]) {
      input.gapAnalysisFile = args[i + 1];
      i++;
    } else if (args[i] === '--keywords' && args[i + 1]) {
      input.keywordsFile = args[i + 1];
      i++;
    } else if (args[i] === '--crawl' && args[i + 1]) {
      input.crawlFile = args[i + 1];
      i++;
    } else if (args[i] === '--content-scores' && args[i + 1]) {
      input.contentScoresFile = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--min-opportunity' && args[i + 1]) {
      minOpportunity = parseInt(args[i + 1]);
      i++;
    }
  }

  if (!input.gapAnalysisFile && !input.keywordsFile && !input.crawlFile) {
    console.error('❌ Error: Must provide at least one input file (--gap-analysis, --keywords, or --crawl)');
    process.exit(1);
  }

  const recommender = new SEOContentRecommender({ minOpportunityScore: minOpportunity });

  try {
    const result = await recommender.generateRecommendations(input);

    // Save to file if specified
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${outputFile}`);
    }

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('SEO CONTENT RECOMMENDATIONS');
    console.log('='.repeat(60));
    console.log(`\nTotal Recommendations: ${result.totalRecommendations}`);
    console.log(`  High Priority: ${result.highPriority}`);
    console.log(`  Medium Priority: ${result.mediumPriority}`);
    console.log(`  Low Priority: ${result.lowPriority}`);

    console.log(`\n📊 Summary:`);
    console.log(`  Quick Wins: ${result.summary.quickWins}`);
    console.log(`  Estimated Total Effort: ${result.summary.estimatedTotalEffort}`);
    console.log(`  Average Impact: ${result.summary.averageImpact}/10`);

    console.log(`\n📝 By Type:`);
    Object.entries(result.summary.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    if (result.recommendations.length > 0) {
      console.log(`\n🔝 Top 5 Recommendations:`);
      result.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec.title}`);
        console.log(`   Priority: ${rec.priority.toUpperCase()} (Score: ${rec.priorityScore})`);
        console.log(`   Type: ${rec.type}`);
        console.log(`   Effort: ${rec.estimatedEffort}h | Impact: ${rec.estimatedImpact}/10`);
        if (rec.targetKeyword) {
          console.log(`   Keyword: "${rec.targetKeyword}"`);
        }
      });
    }

    console.log('\n' + '='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SEOContentRecommender;
