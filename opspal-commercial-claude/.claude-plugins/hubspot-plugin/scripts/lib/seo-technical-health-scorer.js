#!/usr/bin/env node

/**
 * SEO Technical Health Scorer
 *
 * Calculates aggregate technical health score (0-100) for websites based on multiple
 * scoring dimensions with configurable weights. Generates prioritized issue lists
 * with impact scores and remediation recommendations.
 *
 * SCORING DIMENSIONS:
 * 1. Technical Health (30%): Load times, status codes, HTTPS, mobile-friendliness
 * 2. Content Quality (25%): Title tags, meta descriptions, heading hierarchy, word count
 * 3. Schema Coverage (15%): Structured data presence and validation
 * 4. Image Optimization (15%): Alt text coverage, file sizes, formats
 * 5. Link Health (15%): Broken links, redirect chains, internal linking
 *
 * SCORING METHODOLOGY:
 * - Each dimension scored 0-100
 * - Weighted average for overall score
 * - Issues detected and prioritized by impact
 * - Severity levels: Critical (0-30), Warning (31-60), Info (61-100)
 *
 * @module seo-technical-health-scorer
 */

const fs = require('fs');
const path = require('path');

class TechnicalHealthScorer {
  constructor(options = {}) {
    // Default weights (must sum to 1.0)
    this.weights = options.weights || {
      technical: 0.30,
      content: 0.25,
      schema: 0.15,
      images: 0.15,
      links: 0.15
    };

    // Validate weights
    const weightSum = Object.values(this.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      throw new Error(`Weights must sum to 1.0 (currently: ${weightSum.toFixed(2)})`);
    }

    // Thresholds
    this.thresholds = {
      critical: 30,   // 0-30: Critical issues
      warning: 60,    // 31-60: Needs improvement
      good: 80        // 61-80: Good, 81-100: Excellent
    };
  }

  /**
   * Calculate overall health score from crawl results
   *
   * @param {Object} options
   * @param {Object[]} options.crawlResults - Results from batch analyzer
   * @param {Object} options.linkAnalysis - Results from broken link detector (optional)
   * @param {Object} options.weights - Custom dimension weights (optional)
   * @returns {Promise<Object>} Health score and detailed breakdown
   */
  async calculateScore(options) {
    const {
      crawlResults,
      linkAnalysis = null,
      weights = this.weights
    } = options;

    if (!crawlResults || crawlResults.length === 0) {
      throw new Error('Crawl results are required');
    }

    console.log(`🧮 Calculating health score for ${crawlResults.length} pages...`);

    // Calculate dimension scores
    const technical = this.scoreTechnical(crawlResults);
    const content = this.scoreContent(crawlResults);
    const schema = this.scoreSchema(crawlResults);
    const images = this.scoreImages(crawlResults);
    const links = this.scoreLinks(crawlResults, linkAnalysis);

    // Calculate weighted overall score
    const overallScore = Math.round(
      technical.score * weights.technical +
      content.score * weights.content +
      schema.score * weights.schema +
      images.score * weights.images +
      links.score * weights.links
    );

    // Collect all issues
    const allIssues = [
      ...technical.issues,
      ...content.issues,
      ...schema.issues,
      ...images.issues,
      ...links.issues
    ];

    // Sort issues by impact (descending)
    const prioritizedIssues = allIssues.sort((a, b) => b.impact - a.impact);

    // Calculate health rating
    const rating = this.getHealthRating(overallScore);

    const result = {
      overallScore,
      rating,
      breakdown: {
        technical: {
          score: technical.score,
          weight: weights.technical,
          weightedScore: (technical.score * weights.technical).toFixed(1),
          details: technical.details
        },
        content: {
          score: content.score,
          weight: weights.content,
          weightedScore: (content.score * weights.content).toFixed(1),
          details: content.details
        },
        schema: {
          score: schema.score,
          weight: weights.schema,
          weightedScore: (schema.score * weights.schema).toFixed(1),
          details: schema.details
        },
        images: {
          score: images.score,
          weight: weights.images,
          weightedScore: (images.score * weights.images).toFixed(1),
          details: images.details
        },
        links: {
          score: links.score,
          weight: weights.links,
          weightedScore: (links.score * weights.links).toFixed(1),
          details: links.details
        }
      },
      issues: prioritizedIssues,
      summary: {
        totalIssues: allIssues.length,
        critical: allIssues.filter(i => i.severity === 'critical').length,
        warning: allIssues.filter(i => i.severity === 'warning').length,
        info: allIssues.filter(i => i.severity === 'info').length
      }
    };

    console.log(`✅ Overall Health Score: ${overallScore}/100 (${rating})`);

    return result;
  }

  /**
   * Score technical dimension
   *
   * @private
   * @param {Object[]} pages - Crawl results
   * @returns {Object} { score, issues, details }
   */
  scoreTechnical(pages) {
    const checks = {
      fastLoadTimes: 0,      // < 3 seconds
      noErrors: 0,           // No 4xx/5xx
      https: 0,              // All HTTPS
      hasViewport: 0,        // Mobile viewport tag
      hasCanonical: 0,       // Canonical tags
      goodCoreWebVitals: 0   // Good LCP estimate
    };

    const issues = [];

    for (const page of pages) {
      if (!page.technical) continue;

      const tech = page.technical;

      // Load time check (< 3 seconds = fast)
      if (tech.loadTime < 3000) {
        checks.fastLoadTimes++;
      } else if (tech.loadTime > 5000) {
        issues.push({
          category: 'technical',
          severity: 'warning',
          impact: 7,
          description: `Slow page load: ${page.url} (${(tech.loadTime / 1000).toFixed(1)}s)`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Optimize images, minify CSS/JS, enable compression, use CDN'
        });
      }

      // Status code check
      if (tech.statusCode >= 200 && tech.statusCode < 300) {
        checks.noErrors++;
      } else if (tech.statusCode >= 400) {
        issues.push({
          category: 'technical',
          severity: tech.statusCode >= 500 ? 'critical' : 'warning',
          impact: 9,
          description: `HTTP error ${tech.statusCode}: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Fix server error or broken page'
        });
      }

      // HTTPS check (assuming isHTTPS is boolean)
      if (page.url.startsWith('https://')) {
        checks.https++;
      }

      // Viewport tag
      if (tech.hasViewport) {
        checks.hasViewport++;
      }

      // Canonical tag
      if (tech.canonical) {
        checks.hasCanonical++;
      }

      // Core Web Vitals (estimated LCP)
      if (tech.estimatedLCP === 'Good') {
        checks.goodCoreWebVitals++;
      }
    }

    // Calculate percentages
    const total = pages.length;
    const percentages = {
      fastLoadTimes: (checks.fastLoadTimes / total) * 100,
      noErrors: (checks.noErrors / total) * 100,
      https: (checks.https / total) * 100,
      hasViewport: (checks.hasViewport / total) * 100,
      hasCanonical: (checks.hasCanonical / total) * 100,
      goodCoreWebVitals: (checks.goodCoreWebVitals / total) * 100
    };

    // Calculate score (average of all percentages)
    const score = Math.round(
      Object.values(percentages).reduce((sum, pct) => sum + pct, 0) / Object.keys(percentages).length
    );

    // Add aggregate issues
    if (percentages.fastLoadTimes < 80) {
      issues.push({
        category: 'technical',
        severity: 'warning',
        impact: 8,
        description: `Only ${percentages.fastLoadTimes.toFixed(0)}% of pages load in < 3 seconds`,
        affectedPages: total - checks.fastLoadTimes,
        pages: [],
        recommendation: 'Improve page speed across site - optimize images, enable caching, minify resources'
      });
    }

    if (percentages.https < 100) {
      issues.push({
        category: 'technical',
        severity: 'critical',
        impact: 10,
        description: `${(100 - percentages.https).toFixed(0)}% of pages not using HTTPS`,
        affectedPages: total - checks.https,
        pages: [],
        recommendation: 'Enable HTTPS for all pages - configure SSL certificate'
      });
    }

    if (percentages.hasViewport < 100) {
      issues.push({
        category: 'technical',
        severity: 'warning',
        impact: 7,
        description: `${(100 - percentages.hasViewport).toFixed(0)}% of pages missing viewport meta tag`,
        affectedPages: total - checks.hasViewport,
        pages: [],
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to all pages'
      });
    }

    return {
      score,
      issues,
      details: {
        checks,
        percentages
      }
    };
  }

  /**
   * Score content quality dimension
   *
   * @private
   * @param {Object[]} pages - Crawl results
   * @returns {Object} { score, issues, details }
   */
  scoreContent(pages) {
    const checks = {
      hasOptimalTitle: 0,           // 50-60 chars
      hasMetaDescription: 0,        // Has description
      hasOptimalMetaDesc: 0,        // 150-160 chars
      hasSingleH1: 0,               // Exactly one H1
      hasValidHeadingHierarchy: 0,  // Proper nesting
      isSubstantial: 0,             // >= 300 words
      hasOpenGraph: 0               // OG tags present
    };

    const issues = [];

    for (const page of pages) {
      if (!page.content) continue;

      const content = page.content;

      // Title check
      if (content.title.isOptimal) {
        checks.hasOptimalTitle++;
      } else if (content.title.length === 0) {
        issues.push({
          category: 'content',
          severity: 'critical',
          impact: 10,
          description: `Missing title tag: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Add descriptive title tag (50-60 characters)'
        });
      } else if (content.title.length > 60) {
        issues.push({
          category: 'content',
          severity: 'warning',
          impact: 6,
          description: `Title too long (${content.title.length} chars): ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Shorten title to 50-60 characters'
        });
      }

      // Meta description check
      if (content.metaDescription.exists) {
        checks.hasMetaDescription++;

        if (content.metaDescription.isOptimal) {
          checks.hasOptimalMetaDesc++;
        }
      } else {
        issues.push({
          category: 'content',
          severity: 'warning',
          impact: 7,
          description: `Missing meta description: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Add meta description (150-160 characters)'
        });
      }

      // H1 check
      if (content.headings.h1.hasOne) {
        checks.hasSingleH1++;
      } else if (content.headings.h1.count === 0) {
        issues.push({
          category: 'content',
          severity: 'warning',
          impact: 6,
          description: `Missing H1: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Add exactly one H1 heading per page'
        });
      } else if (content.headings.h1.count > 1) {
        issues.push({
          category: 'content',
          severity: 'info',
          impact: 4,
          description: `Multiple H1 tags (${content.headings.h1.count}): ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Use only one H1 per page for optimal SEO'
        });
      }

      // Heading hierarchy
      if (content.headings.hierarchy.isValid) {
        checks.hasValidHeadingHierarchy++;
      } else {
        issues.push({
          category: 'content',
          severity: 'info',
          impact: 3,
          description: `Heading hierarchy issues: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Fix heading hierarchy (don\'t skip levels: H2 → H4)'
        });
      }

      // Word count
      if (content.isSubstantial) {
        checks.isSubstantial++;
      } else {
        issues.push({
          category: 'content',
          severity: 'info',
          impact: 5,
          description: `Thin content (${content.wordCount} words): ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: 'Expand content to at least 300 words for better SEO'
        });
      }

      // Open Graph tags
      if (content.openGraphTags && content.openGraphTags.title) {
        checks.hasOpenGraph++;
      }
    }

    const total = pages.length;
    const percentages = {
      hasOptimalTitle: (checks.hasOptimalTitle / total) * 100,
      hasMetaDescription: (checks.hasMetaDescription / total) * 100,
      hasOptimalMetaDesc: (checks.hasOptimalMetaDesc / total) * 100,
      hasSingleH1: (checks.hasSingleH1 / total) * 100,
      hasValidHeadingHierarchy: (checks.hasValidHeadingHierarchy / total) * 100,
      isSubstantial: (checks.isSubstantial / total) * 100,
      hasOpenGraph: (checks.hasOpenGraph / total) * 100
    };

    const score = Math.round(
      Object.values(percentages).reduce((sum, pct) => sum + pct, 0) / Object.keys(percentages).length
    );

    return {
      score,
      issues,
      details: {
        checks,
        percentages
      }
    };
  }

  /**
   * Score schema markup dimension
   *
   * @private
   * @param {Object[]} pages - Crawl results
   * @returns {Object} { score, issues, details }
   */
  scoreSchema(pages) {
    const checks = {
      hasSchema: 0,
      hasValidSchema: 0,
      hasArticleSchema: 0,
      hasOrganizationSchema: 0
    };

    const issues = [];
    let articlePages = 0;

    for (const page of pages) {
      if (!page.schema) continue;

      // Check if page looks like article (blog post)
      const isArticle = page.url.includes('/blog/') || page.url.includes('/post/') || page.url.includes('/article/');
      if (isArticle) articlePages++;

      if (page.schema.hasSchema) {
        checks.hasSchema++;

        // Check for valid schemas
        const validSchemas = page.schema.schemas?.filter(s => s.hasRequiredFields) || [];
        if (validSchemas.length > 0) {
          checks.hasValidSchema++;
        }

        // Check for specific schema types
        const hasArticle = page.schema.schemas?.some(s => s.type === 'Article' || s.type === 'BlogPosting');
        if (hasArticle) {
          checks.hasArticleSchema++;
        }

        const hasOrg = page.schema.schemas?.some(s => s.type === 'Organization');
        if (hasOrg) {
          checks.hasOrganizationSchema++;
        }

      } else {
        issues.push({
          category: 'schema',
          severity: isArticle ? 'warning' : 'info',
          impact: isArticle ? 6 : 3,
          description: `Missing schema markup: ${page.url}`,
          affectedPages: 1,
          pages: [page.url],
          recommendation: isArticle ? 'Add Article schema for better search visibility' : 'Consider adding schema markup'
        });
      }
    }

    const total = pages.length;
    const coverage = (checks.hasSchema / total) * 100;

    // Score based on coverage and validity
    const score = Math.round(
      (coverage * 0.7) + // 70% weight on having schema
      ((checks.hasValidSchema / total) * 100 * 0.3) // 30% weight on validity
    );

    if (coverage < 50) {
      issues.push({
        category: 'schema',
        severity: 'warning',
        impact: 7,
        description: `Only ${coverage.toFixed(0)}% of pages have schema markup`,
        affectedPages: total - checks.hasSchema,
        pages: [],
        recommendation: 'Add JSON-LD schema to important pages (Article, Organization, WebPage)'
      });
    }

    return {
      score,
      issues,
      details: {
        checks,
        coverage: coverage.toFixed(1) + '%',
        articlePages,
        articleCoverage: articlePages > 0 ? ((checks.hasArticleSchema / articlePages) * 100).toFixed(1) + '%' : 'N/A'
      }
    };
  }

  /**
   * Score image optimization dimension
   *
   * @private
   * @param {Object[]} pages - Crawl results
   * @returns {Object} { score, issues, details }
   */
  scoreImages(pages) {
    let totalImages = 0;
    let imagesWithAlt = 0;
    let imagesWithLazyLoad = 0;

    const issues = [];

    for (const page of pages) {
      if (!page.images) continue;

      totalImages += page.images.total;
      imagesWithAlt += (page.images.total - page.images.missingAlt);
      imagesWithLazyLoad += page.images.lazyLoading || 0;

      if (page.images.missingAlt > 0) {
        const altCoverage = parseFloat(page.images.altCoverage);

        if (altCoverage < 50) {
          issues.push({
            category: 'images',
            severity: 'warning',
            impact: 7,
            description: `Poor alt text coverage (${page.images.altCoverage}): ${page.url}`,
            affectedPages: 1,
            pages: [page.url],
            recommendation: 'Add descriptive alt text to all images for accessibility and SEO'
          });
        }
      }
    }

    const altCoverage = totalImages > 0 ? (imagesWithAlt / totalImages) * 100 : 100;
    const lazyLoadCoverage = totalImages > 0 ? (imagesWithLazyLoad / totalImages) * 100 : 0;

    // Score: 70% alt text, 30% lazy loading
    const score = Math.round(
      (altCoverage * 0.7) +
      (lazyLoadCoverage * 0.3)
    );

    if (altCoverage < 90) {
      issues.push({
        category: 'images',
        severity: 'warning',
        impact: 8,
        description: `${(100 - altCoverage).toFixed(0)}% of images missing alt text across site`,
        affectedPages: totalImages - imagesWithAlt,
        pages: [],
        recommendation: 'Add descriptive alt text to all images site-wide'
      });
    }

    return {
      score,
      issues,
      details: {
        totalImages,
        altCoverage: altCoverage.toFixed(1) + '%',
        lazyLoadCoverage: lazyLoadCoverage.toFixed(1) + '%'
      }
    };
  }

  /**
   * Score link health dimension
   *
   * @private
   * @param {Object[]} pages - Crawl results
   * @param {Object} linkAnalysis - Results from broken link detector
   * @returns {Object} { score, issues, details }
   */
  scoreLinks(pages, linkAnalysis) {
    const issues = [];
    let score = 100; // Start at 100, deduct for issues

    // If no link analysis provided, estimate from page data
    if (!linkAnalysis) {
      // Basic scoring from page link counts
      let totalInternal = 0;
      let totalExternal = 0;

      for (const page of pages) {
        if (page.links) {
          totalInternal += page.links.internal || 0;
          totalExternal += page.links.external || 0;
        }
      }

      const avgInternalPerPage = totalInternal / pages.length;

      // Deduct if internal linking is weak
      if (avgInternalPerPage < 3) {
        score -= 20;
        issues.push({
          category: 'links',
          severity: 'info',
          impact: 4,
          description: `Weak internal linking (avg ${avgInternalPerPage.toFixed(1)} links/page)`,
          affectedPages: pages.length,
          pages: [],
          recommendation: 'Add more contextual internal links between related pages'
        });
      }

      return {
        score: Math.max(score, 0),
        issues,
        details: {
          avgInternalPerPage: avgInternalPerPage.toFixed(1),
          avgExternalPerPage: (totalExternal / pages.length).toFixed(1)
        }
      };
    }

    // Use detailed link analysis
    const brokenRate = (linkAnalysis.internal.broken / linkAnalysis.internal.total) * 100;
    const redirectRate = (linkAnalysis.internal.redirects / linkAnalysis.internal.total) * 100;
    const orphanRate = (linkAnalysis.orphanPages / pages.length) * 100;

    // Deduct points for issues
    if (brokenRate > 0) {
      const deduction = Math.min(brokenRate * 2, 40); // Max 40 point deduction
      score -= deduction;

      issues.push({
        category: 'links',
        severity: brokenRate > 5 ? 'critical' : 'warning',
        impact: Math.min(Math.round(brokenRate * 2), 10),
        description: `${brokenRate.toFixed(1)}% of internal links are broken`,
        affectedPages: linkAnalysis.internal.broken,
        pages: [],
        recommendation: 'Fix or remove broken links to improve user experience and SEO'
      });
    }

    if (redirectRate > 5) {
      const deduction = Math.min(redirectRate, 20); // Max 20 point deduction
      score -= deduction;

      issues.push({
        category: 'links',
        severity: 'warning',
        impact: 5,
        description: `${redirectRate.toFixed(1)}% of internal links have redirect chains`,
        affectedPages: linkAnalysis.internal.redirects,
        pages: [],
        recommendation: 'Update links to point directly to final destinations'
      });
    }

    if (orphanRate > 10) {
      const deduction = Math.min(orphanRate, 20); // Max 20 point deduction
      score -= deduction;

      issues.push({
        category: 'links',
        severity: 'info',
        impact: 4,
        description: `${orphanRate.toFixed(1)}% of pages are orphans (no internal links)`,
        affectedPages: linkAnalysis.orphanPages,
        pages: [],
        recommendation: 'Add internal links to orphan pages or remove if not needed'
      });
    }

    return {
      score: Math.max(score, 0),
      issues,
      details: {
        brokenRate: brokenRate.toFixed(1) + '%',
        redirectRate: redirectRate.toFixed(1) + '%',
        orphanRate: orphanRate.toFixed(1) + '%'
      }
    };
  }

  /**
   * Get health rating from score
   *
   * @private
   * @param {number} score - Overall score (0-100)
   * @returns {string} Rating label
   */
  getHealthRating(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs Improvement';
    return 'Critical';
  }

  /**
   * Generate text report
   *
   * @param {Object} healthScore - Results from calculateScore()
   * @returns {string} Text report
   */
  generateTextReport(healthScore) {
    let report = `\n${'='.repeat(60)}\n`;
    report += `SEO TECHNICAL HEALTH REPORT\n`;
    report += `${'='.repeat(60)}\n\n`;

    report += `Overall Score: ${healthScore.overallScore}/100 (${healthScore.rating})\n\n`;

    report += `Dimension Breakdown:\n`;
    report += `${'─'.repeat(60)}\n`;

    for (const [dimension, data] of Object.entries(healthScore.breakdown)) {
      const bar = this.generateProgressBar(data.score, 20);
      report += `${dimension.charAt(0).toUpperCase() + dimension.slice(1).padEnd(15)} ${bar} ${data.score}/100 (weight: ${(data.weight * 100).toFixed(0)}%)\n`;
    }

    report += `\n${'─'.repeat(60)}\n`;
    report += `Issue Summary:\n`;
    report += `  Critical: ${healthScore.summary.critical}\n`;
    report += `  Warning:  ${healthScore.summary.warning}\n`;
    report += `  Info:     ${healthScore.summary.info}\n`;

    if (healthScore.issues.length > 0) {
      report += `\n${'─'.repeat(60)}\n`;
      report += `Top 10 Issues (by impact):\n`;
      report += `${'─'.repeat(60)}\n`;

      healthScore.issues.slice(0, 10).forEach((issue, i) => {
        const severityIcon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        report += `\n${i + 1}. ${severityIcon} [${issue.category.toUpperCase()}] ${issue.description}\n`;
        report += `   Impact: ${issue.impact}/10 | Affected: ${issue.affectedPages} page(s)\n`;
        report += `   Fix: ${issue.recommendation}\n`;
      });
    }

    report += `\n${'='.repeat(60)}\n`;

    return report;
  }

  /**
   * Generate progress bar
   *
   * @private
   * @param {number} score - Score (0-100)
   * @param {number} width - Bar width in characters
   * @returns {string} Progress bar
   */
  generateProgressBar(score, width) {
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node seo-technical-health-scorer.js <crawl-results-json> [link-analysis-json]

Example:
  node seo-technical-health-scorer.js ./crawl-results.json
  node seo-technical-health-scorer.js ./crawl-results.json ./link-analysis.json
    `);
    process.exit(1);
  }

  const crawlResultsPath = args[0];
  const linkAnalysisPath = args[1];

  if (!fs.existsSync(crawlResultsPath)) {
    console.error(`Error: Crawl results file not found: ${crawlResultsPath}`);
    process.exit(1);
  }

  const crawlResults = JSON.parse(fs.readFileSync(crawlResultsPath, 'utf8'));
  let linkAnalysis = null;

  if (linkAnalysisPath && fs.existsSync(linkAnalysisPath)) {
    linkAnalysis = JSON.parse(fs.readFileSync(linkAnalysisPath, 'utf8'));
  }

  (async () => {
    const scorer = new TechnicalHealthScorer();

    const healthScore = await scorer.calculateScore({
      crawlResults,
      linkAnalysis
    });

    // Generate and print report
    const report = scorer.generateTextReport(healthScore);
    console.log(report);

    // Save JSON results
    const outputPath = './health-score.json';
    fs.writeFileSync(outputPath, JSON.stringify(healthScore, null, 2));
    console.log(`\n📄 Full results saved to: ${outputPath}`);

  })().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = TechnicalHealthScorer;
