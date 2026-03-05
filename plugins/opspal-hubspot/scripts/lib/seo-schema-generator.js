#!/usr/bin/env node

/**
 * SEO Schema Generator
 *
 * Automatically generates JSON-LD schema markup for AI search optimization.
 *
 * Features:
 * - Organization schema with complete metadata
 * - WebSite schema with search action
 * - Person schema for authors and team members
 * - Article schema for blog posts
 * - BreadcrumbList schema from URL structure
 * - FAQPage schema from Q&A content
 * - Automatic data extraction from existing content
 * - Validation before output
 *
 * Usage:
 *   node seo-schema-generator.js https://example.com
 *   node seo-schema-generator.js https://example.com --types Organization,WebSite
 *   node seo-schema-generator.js ./crawl.json --format json --output schema.json
 *   node seo-schema-generator.js https://example.com/blog/post --type Article
 *
 * @version 1.0.0
 * @phase Phase 4.0 - AI Search Optimization
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class SEOSchemaGenerator {
  constructor() {
    this.schemaTypes = [
      'Organization',
      'WebSite',
      'Person',
      'Article',
      'BlogPosting',
      'BreadcrumbList',
      'FAQPage',
      'HowTo'
    ];

    this.socialPlatforms = {
      'linkedin.com': 'LinkedIn',
      'twitter.com': 'Twitter',
      'facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'youtube.com': 'YouTube',
      'github.com': 'GitHub'
    };
  }

  /**
   * Generate schema from URL
   */
  async generateFromURL(url, options = {}) {
    const results = {
      url,
      generatedAt: new Date().toISOString(),
      schemas: [],
      validation: [],
      warnings: []
    };

    try {
      // Fetch page content
      const content = await this.fetchURL(url);
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

      // Determine which schemas to generate
      const typesToGenerate = options.types
        ? options.types.split(',').map(t => t.trim())
        : this.detectSchemaTypes(url, content);

      // Generate schemas
      for (const type of typesToGenerate) {
        let schema = null;

        switch (type) {
          case 'Organization':
            schema = this.generateOrganizationSchema(baseUrl, content);
            break;
          case 'WebSite':
            schema = this.generateWebSiteSchema(baseUrl, content);
            break;
          case 'Person':
            schema = this.generatePersonSchema(url, content);
            break;
          case 'Article':
          case 'BlogPosting':
            schema = this.generateArticleSchema(url, content);
            break;
          case 'BreadcrumbList':
            schema = this.generateBreadcrumbSchema(url);
            break;
          case 'FAQPage':
            schema = this.generateFAQSchema(url, content);
            break;
          case 'HowTo':
            schema = this.generateHowToSchema(url, content);
            break;
        }

        if (schema) {
          // Validate schema
          const validation = this.validateSchema(schema);

          results.schemas.push({
            type,
            schema,
            validation: validation.isValid ? 'valid' : 'invalid',
            issues: validation.issues
          });

          if (!validation.isValid) {
            results.validation.push({
              type,
              issues: validation.issues
            });
          }
        } else {
          results.warnings.push({
            type,
            message: `Could not generate ${type} schema - insufficient data`
          });
        }
      }

      return results;

    } catch (error) {
      throw new Error(`Schema generation failed: ${error.message}`);
    }
  }

  /**
   * Generate schema from crawl JSON
   */
  async generateFromJSON(jsonPath, options = {}) {
    const results = {
      source: jsonPath,
      generatedAt: new Date().toISOString(),
      pages: []
    };

    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      // Process each page
      const pages = data.pages || [data];
      for (const page of pages) {
        const pageResults = await this.generateFromURL(page.url, options);
        results.pages.push(pageResults);
      }

      return results;

    } catch (error) {
      throw new Error(`JSON processing failed: ${error.message}`);
    }
  }

  /**
   * Detect which schema types to generate based on URL and content
   */
  detectSchemaTypes(url, content) {
    const types = [];
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.toLowerCase();

    // Organization and WebSite for homepage
    if (path === '/' || path === '') {
      types.push('Organization', 'WebSite');
    }

    // Article for blog posts
    if (path.includes('/blog/') || path.includes('/post/') ||
        path.includes('/article/') || path.includes('/news/')) {
      types.push('Article');
    }

    // Person for team/author pages
    if (path.includes('/team/') || path.includes('/author/') ||
        path.includes('/about/') || path.includes('/profile/')) {
      types.push('Person');
    }

    // FAQPage if content has Q&A patterns
    if (this.detectFAQContent(content)) {
      types.push('FAQPage');
    }

    // HowTo if content has step-by-step instructions
    if (this.detectHowToContent(content)) {
      types.push('HowTo');
    }

    // BreadcrumbList for pages with path depth > 1
    if (path.split('/').filter(p => p).length > 1) {
      types.push('BreadcrumbList');
    }

    // Default to Organization if nothing detected
    if (types.length === 0) {
      types.push('Organization');
    }

    return types;
  }

  /**
   * Generate Organization schema
   */
  generateOrganizationSchema(baseUrl, content) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      'url': baseUrl
    };

    // Extract organization name
    const nameMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (nameMatch) {
      const title = this.cleanText(nameMatch[1]);
      // Extract company name from title (before | or - or :)
      const nameParts = title.split(/[\|\-\:]/);
      schema.name = nameParts[0].trim();
    }

    // Extract description from meta tags
    const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) {
      schema.description = this.cleanText(descMatch[1]);
    }

    // Extract logo
    const logoMatch = content.match(/<img[^>]*(?:class=["'][^"']*logo[^"']*["']|alt=["'][^"']*logo[^"']*["'])[^>]*src=["']([^"']+)["']/i);
    if (logoMatch) {
      schema.logo = this.resolveUrl(baseUrl, logoMatch[1]);
    }

    // Extract social media links
    const sameAs = this.extractSocialLinks(content, baseUrl);
    if (sameAs.length > 0) {
      schema.sameAs = sameAs;
    }

    // Extract contact information
    const contactPoint = this.extractContactInfo(content);
    if (contactPoint) {
      schema.contactPoint = contactPoint;
    }

    // Extract address
    const address = this.extractAddress(content);
    if (address) {
      schema.address = address;
    }

    // Add founding date if found
    const foundingMatch = content.match(/(?:founded|established|since|est\.?)\s+(?:in\s+)?(\d{4})/i);
    if (foundingMatch) {
      schema.foundingDate = foundingMatch[1];
    }

    return schema;
  }

  /**
   * Generate WebSite schema
   */
  generateWebSiteSchema(baseUrl, content) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'url': baseUrl
    };

    // Extract site name from title or h1
    const nameMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (nameMatch) {
      const title = this.cleanText(nameMatch[1]);
      const nameParts = title.split(/[\|\-\:]/);
      schema.name = nameParts[0].trim();
    }

    // Add publisher (Organization reference)
    schema.publisher = {
      '@type': 'Organization',
      'name': schema.name
    };

    // Add search action if site has search
    const searchMatch = content.match(/action=["']([^"']*search[^"']*)["']/i) ||
                       content.match(/href=["']([^"']*search[^"']*)["']/i);

    if (searchMatch) {
      const searchUrl = this.resolveUrl(baseUrl, searchMatch[1]);
      schema.potentialAction = {
        '@type': 'SearchAction',
        'target': {
          '@type': 'EntryPoint',
          'urlTemplate': searchUrl.replace(/\?.*$/, '') + '?q={search_term_string}'
        },
        'query-input': 'required name=search_term_string'
      };
    }

    return schema;
  }

  /**
   * Generate Person schema
   */
  generatePersonSchema(url, content) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      'url': url
    };

    // Extract name from h1 or title
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      schema.name = this.cleanText(h1Match[1]);
    } else {
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        const title = this.cleanText(titleMatch[1]);
        schema.name = title.split(/[\|\-\:]/)[0].trim();
      }
    }

    // Extract job title
    const jobTitleMatch = content.match(/<(?:h2|h3|p)[^>]*>([^<]*(?:CEO|CTO|CFO|Director|Manager|Engineer|Developer|Designer|Consultant)[^<]*)<\/(?:h2|h3|p)>/i);
    if (jobTitleMatch) {
      schema.jobTitle = this.cleanText(jobTitleMatch[1]);
    }

    // Extract description/bio
    const bioMatch = content.match(/<p[^>]*class=["'][^"']*bio[^"']*["'][^>]*>([^<]+)<\/p>/i) ||
                     content.match(/<div[^>]*class=["'][^"']*bio[^"']*["'][^>]*>.*?<p>([^<]+)<\/p>/is);
    if (bioMatch) {
      schema.description = this.cleanText(bioMatch[1]);
    }

    // Extract image
    const imgMatch = content.match(/<img[^>]*(?:class=["'][^"']*(?:avatar|photo|headshot|profile)[^"']*["'])[^>]*src=["']([^"']+)["']/i);
    if (imgMatch) {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      schema.image = this.resolveUrl(baseUrl, imgMatch[1]);
    }

    // Extract social links
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    const sameAs = this.extractSocialLinks(content, baseUrl);
    if (sameAs.length > 0) {
      schema.sameAs = sameAs;
    }

    // Add worksFor if organization mentioned
    const orgMatch = content.match(/(?:at|with|for)\s+<a[^>]*>([^<]+)<\/a>/i);
    if (orgMatch) {
      schema.worksFor = {
        '@type': 'Organization',
        'name': this.cleanText(orgMatch[1])
      };
    }

    return schema;
  }

  /**
   * Generate Article schema
   */
  generateArticleSchema(url, content) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'url': url
    };

    // Extract headline from h1 or title
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      schema.headline = this.cleanText(h1Match[1]);
    } else {
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        schema.headline = this.cleanText(titleMatch[1]).split(/[\|\-\:]/)[0].trim();
      }
    }

    // Extract description
    const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) {
      schema.description = this.cleanText(descMatch[1]);
    }

    // Extract author
    const authorMatch = content.match(/(?:by|author:?)\s*<a[^>]*>([^<]+)<\/a>/i) ||
                       content.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i) ||
                       content.match(/<span[^>]*class=["'][^"']*author[^"']*["'][^>]*>([^<]+)<\/span>/i);

    if (authorMatch) {
      schema.author = {
        '@type': 'Person',
        'name': this.cleanText(authorMatch[1])
      };
    }

    // Extract publish date
    const datePublishedMatch = content.match(/<time[^>]*datetime=["']([^"']+)["']/i) ||
                              content.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i);

    if (datePublishedMatch) {
      schema.datePublished = datePublishedMatch[1].split('T')[0];
    }

    // Extract modified date
    const dateModifiedMatch = content.match(/<meta[^>]*property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i);

    if (dateModifiedMatch) {
      schema.dateModified = dateModifiedMatch[1].split('T')[0];
    }

    // Extract featured image
    const imageMatch = content.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                      content.match(/<img[^>]*(?:class=["'][^"']*featured[^"']*["'])[^>]*src=["']([^"']+)["']/i);

    if (imageMatch) {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      schema.image = this.resolveUrl(baseUrl, imageMatch[1]);
    }

    // Add publisher
    const parsedUrl = new URL(url);
    const orgName = parsedUrl.hostname.replace(/^www\./, '').split('.')[0];

    schema.publisher = {
      '@type': 'Organization',
      'name': orgName.charAt(0).toUpperCase() + orgName.slice(1)
    };

    // Add logo to publisher if found
    const logoMatch = content.match(/<img[^>]*(?:class=["'][^"']*logo[^"']*["'])[^>]*src=["']([^"']+)["']/i);
    if (logoMatch) {
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      schema.publisher.logo = {
        '@type': 'ImageObject',
        'url': this.resolveUrl(baseUrl, logoMatch[1])
      };
    }

    return schema;
  }

  /**
   * Generate BreadcrumbList schema from URL structure
   */
  generateBreadcrumbSchema(url) {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(p => p);

    if (pathParts.length === 0) {
      return null; // No breadcrumbs for homepage
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': []
    };

    // Add home
    schema.itemListElement.push({
      '@type': 'ListItem',
      'position': 1,
      'name': 'Home',
      'item': `${parsedUrl.protocol}//${parsedUrl.hostname}/`
    });

    // Add path segments
    let currentPath = '';
    pathParts.forEach((part, index) => {
      currentPath += '/' + part;
      schema.itemListElement.push({
        '@type': 'ListItem',
        'position': index + 2,
        'name': this.formatBreadcrumbName(part),
        'item': `${parsedUrl.protocol}//${parsedUrl.hostname}${currentPath}`
      });
    });

    return schema;
  }

  /**
   * Generate FAQPage schema from Q&A content
   */
  generateFAQSchema(url, content) {
    const questions = this.extractFAQQuestions(content);

    if (questions.length === 0) {
      return null;
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': questions.map(q => ({
        '@type': 'Question',
        'name': q.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': q.answer
        }
      }))
    };

    return schema;
  }

  /**
   * Generate HowTo schema from step-by-step content
   */
  generateHowToSchema(url, content) {
    const steps = this.extractHowToSteps(content);

    if (steps.length === 0) {
      return null;
    }

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      'name': this.extractTitle(content),
      'step': steps.map((step, index) => ({
        '@type': 'HowToStep',
        'position': index + 1,
        'name': step.name,
        'text': step.text
      }))
    };

    // Add description if available
    const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) {
      schema.description = this.cleanText(descMatch[1]);
    }

    return schema;
  }

  /**
   * Extract social media links
   */
  extractSocialLinks(content, baseUrl) {
    const links = [];
    const linkMatches = content.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);

    for (const match of linkMatches) {
      const href = match[1];

      // Check if it's a social media link
      for (const [domain, platform] of Object.entries(this.socialPlatforms)) {
        if (href.includes(domain)) {
          const fullUrl = this.resolveUrl(baseUrl, href);
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      }
    }

    return links;
  }

  /**
   * Extract contact information
   */
  extractContactInfo(content) {
    const contactPoint = {
      '@type': 'ContactPoint',
      'contactType': 'customer service'
    };

    // Extract email
    const emailMatch = content.match(/href=["']mailto:([^"']+)["']/i);
    if (emailMatch) {
      contactPoint.email = emailMatch[1];
    }

    // Extract phone
    const phoneMatch = content.match(/href=["']tel:([^"']+)["']/i) ||
                      content.match(/(?:phone|tel|call):?\s*([+\d\s\-\(\)]{10,})/i);
    if (phoneMatch) {
      contactPoint.telephone = phoneMatch[1].replace(/\s+/g, '');
    }

    // Only return if we found at least one contact method
    if (contactPoint.email || contactPoint.telephone) {
      return contactPoint;
    }

    return null;
  }

  /**
   * Extract address information
   */
  extractAddress(content) {
    // Look for address patterns
    const addressMatch = content.match(/<address[^>]*>([\s\S]*?)<\/address>/i);

    if (addressMatch) {
      const addressText = this.cleanText(addressMatch[1]);

      // Try to extract components
      const address = {
        '@type': 'PostalAddress'
      };

      // Extract country
      const countryMatch = addressText.match(/\b(USA|US|United States|UK|United Kingdom|Canada|Australia)\b/i);
      if (countryMatch) {
        address.addressCountry = countryMatch[1];
      }

      // Extract state/region
      const stateMatch = addressText.match(/\b([A-Z]{2})\b|\b(California|New York|Texas|Florida)\b/i);
      if (stateMatch) {
        address.addressRegion = stateMatch[1] || stateMatch[2];
      }

      // Extract city
      const cityMatch = addressText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*[A-Z]{2}/);
      if (cityMatch) {
        address.addressLocality = cityMatch[1];
      }

      return Object.keys(address).length > 1 ? address : null;
    }

    return null;
  }

  /**
   * Extract FAQ questions from content
   */
  extractFAQQuestions(content) {
    const questions = [];

    // Pattern 1: Q: ... A: ... format
    const qaPattern = /(?:<p>|^)\s*(?:Q:|Question:)\s*([^?]+\?)\s*(?:<\/p>)?[\s\S]*?(?:<p>|^)\s*(?:A:|Answer:)\s*([^<]+)(?:<\/p>|$)/gi;
    let match;

    while ((match = qaPattern.exec(content)) !== null) {
      questions.push({
        question: this.cleanText(match[1]),
        answer: this.cleanText(match[2])
      });
    }

    // Pattern 2: h3/h2 questions followed by paragraph answers
    const headingPattern = /<h[23][^>]*>([^?<]+\?)<\/h[23]>\s*<p>([^<]+)<\/p>/gi;

    while ((match = headingPattern.exec(content)) !== null) {
      const question = this.cleanText(match[1]);
      const answer = this.cleanText(match[2]);

      // Avoid duplicates
      if (!questions.some(q => q.question === question)) {
        questions.push({ question, answer });
      }
    }

    return questions;
  }

  /**
   * Extract how-to steps from content
   */
  extractHowToSteps(content) {
    const steps = [];

    // Pattern 1: Numbered list items
    const olPattern = /<ol[^>]*>([\s\S]*?)<\/ol>/i;
    const olMatch = content.match(olPattern);

    if (olMatch) {
      const liPattern = /<li[^>]*>(?:<strong>)?([^<]+)(?:<\/strong>)?(?::)?\s*([^<]*)<\/li>/gi;
      let match;

      while ((match = liPattern.exec(olMatch[1])) !== null) {
        steps.push({
          name: this.cleanText(match[1]),
          text: this.cleanText(match[2]) || this.cleanText(match[1])
        });
      }
    }

    // Pattern 2: Step 1, Step 2, etc.
    const stepPattern = /<h[23][^>]*>Step\s+\d+:?\s+([^<]+)<\/h[23]>\s*<p>([^<]+)<\/p>/gi;
    let match;

    while ((match = stepPattern.exec(content)) !== null) {
      const name = this.cleanText(match[1]);
      const text = this.cleanText(match[2]);

      // Avoid duplicates
      if (!steps.some(s => s.name === name)) {
        steps.push({ name, text });
      }
    }

    return steps;
  }

  /**
   * Detect if content has FAQ patterns
   */
  detectFAQContent(content) {
    return /(?:Q:|Question:).*?(?:A:|Answer:)/i.test(content) ||
           /<h[23][^>]*>[^?<]+\?<\/h[23]>/i.test(content);
  }

  /**
   * Detect if content has how-to patterns
   */
  detectHowToContent(content) {
    return /<ol[^>]*>.*?<li/is.test(content) ||
           /Step\s+\d+/i.test(content) ||
           /(?:how to|tutorial|guide)/i.test(content);
  }

  /**
   * Extract title from content
   */
  extractTitle(content) {
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      return this.cleanText(h1Match[1]);
    }

    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.cleanText(titleMatch[1]).split(/[\|\-\:]/)[0].trim();
    }

    return 'Untitled';
  }

  /**
   * Validate schema structure
   */
  validateSchema(schema) {
    const issues = [];
    let isValid = true;

    // Check required @context
    if (!schema['@context']) {
      issues.push({ severity: 'error', field: '@context', message: 'Missing @context' });
      isValid = false;
    }

    // Check required @type
    if (!schema['@type']) {
      issues.push({ severity: 'error', field: '@type', message: 'Missing @type' });
      isValid = false;
    }

    // Type-specific validation
    switch (schema['@type']) {
      case 'Organization':
        if (!schema.name) {
          issues.push({ severity: 'error', field: 'name', message: 'Organization missing name' });
          isValid = false;
        }
        if (!schema.url) {
          issues.push({ severity: 'warning', field: 'url', message: 'Organization missing url' });
        }
        if (!schema.logo) {
          issues.push({ severity: 'warning', field: 'logo', message: 'Organization missing logo' });
        }
        if (!schema.sameAs || schema.sameAs.length === 0) {
          issues.push({ severity: 'warning', field: 'sameAs', message: 'Organization missing social links' });
        }
        break;

      case 'WebSite':
        if (!schema.name) {
          issues.push({ severity: 'error', field: 'name', message: 'WebSite missing name' });
          isValid = false;
        }
        if (!schema.url) {
          issues.push({ severity: 'error', field: 'url', message: 'WebSite missing url' });
          isValid = false;
        }
        break;

      case 'Person':
        if (!schema.name) {
          issues.push({ severity: 'error', field: 'name', message: 'Person missing name' });
          isValid = false;
        }
        break;

      case 'Article':
      case 'BlogPosting':
        if (!schema.headline) {
          issues.push({ severity: 'error', field: 'headline', message: 'Article missing headline' });
          isValid = false;
        }
        if (!schema.author) {
          issues.push({ severity: 'warning', field: 'author', message: 'Article missing author' });
        }
        if (!schema.datePublished) {
          issues.push({ severity: 'warning', field: 'datePublished', message: 'Article missing datePublished' });
        }
        break;
    }

    return { isValid, issues };
  }

  /**
   * Format breadcrumb name from URL segment
   */
  formatBreadcrumbName(segment) {
    return segment
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(baseUrl, relativeUrl) {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    if (relativeUrl.startsWith('//')) {
      return 'https:' + relativeUrl;
    }

    if (relativeUrl.startsWith('/')) {
      return baseUrl + relativeUrl;
    }

    return baseUrl + '/' + relativeUrl;
  }

  /**
   * Clean text by removing HTML tags and extra whitespace
   */
  cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Fetch URL content
   */
  fetchURL(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const req = protocol.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return reject(new Error(`HTTP ${res.statusCode} - Please use the final URL (check redirects)`));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Format output for display
   */
  formatOutput(results, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    let output = '';
    output += '============================================================\n';
    output += 'SCHEMA GENERATION REPORT\n';
    output += '============================================================\n\n';
    output += `URL: ${results.url}\n`;
    output += `Generated: ${results.generatedAt}\n`;
    output += `Schemas Generated: ${results.schemas.length}\n\n`;

    for (const item of results.schemas) {
      output += `\n[${ item.validation.toUpperCase()}] ${item.type} Schema\n`;
      output += '-'.repeat(60) + '\n';
      output += JSON.stringify(item.schema, null, 2) + '\n';

      if (item.issues.length > 0) {
        output += '\nValidation Issues:\n';
        for (const issue of item.issues) {
          const icon = issue.severity === 'error' ? '🔴' : '⚠️';
          output += `  ${icon} [${issue.severity.toUpperCase()}] ${issue.field}: ${issue.message}\n`;
        }
      }
    }

    if (results.warnings.length > 0) {
      output += '\n⚠️  Warnings:\n';
      for (const warning of results.warnings) {
        output += `  - ${warning.type}: ${warning.message}\n`;
      }
    }

    if (results.validation.length > 0) {
      output += '\n🔍 Validation Summary:\n';
      for (const v of results.validation) {
        output += `  ${v.type}: ${v.issues.length} issues\n`;
      }
    } else {
      output += '\n✅ All schemas valid!\n';
    }

    return output;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
SEO Schema Generator - Automatically generate JSON-LD schema markup

Usage:
  node seo-schema-generator.js <url> [options]
  node seo-schema-generator.js <json-file> [options]

Options:
  --types <types>          Comma-separated list of schema types to generate
                          (Organization,WebSite,Person,Article,BreadcrumbList,FAQPage,HowTo)
  --format <format>       Output format: text or json (default: text)
  --output <file>         Write output to file
  --help                  Show this help

Examples:
  node seo-schema-generator.js https://example.com
  node seo-schema-generator.js https://example.com --types Organization,WebSite
  node seo-schema-generator.js ./crawl.json --format json --output schema.json
  node seo-schema-generator.js https://example.com/blog/post --types Article

Schema Types:
  Organization     - Company/brand information
  WebSite          - Website with search action
  Person           - Individual person (author, team member)
  Article          - Blog post or article
  BreadcrumbList   - Navigation breadcrumbs
  FAQPage          - FAQ questions and answers
  HowTo            - Step-by-step instructions
    `);
    process.exit(0);
  }

  const generator = new SEOSchemaGenerator();
  const input = args[0];

  const options = {
    types: null,
    format: 'text',
    output: null
  };

  // Parse options
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = value;
  }

  (async () => {
    try {
      let results;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        results = await generator.generateFromURL(input, options);
      } else if (input.endsWith('.json')) {
        results = await generator.generateFromJSON(input, options);
      } else {
        throw new Error('Input must be a URL or JSON file path');
      }

      const output = generator.formatOutput(results, options.format);

      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`✅ Schema generated successfully: ${options.output}`);
      } else {
        console.log(output);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = SEOSchemaGenerator;
