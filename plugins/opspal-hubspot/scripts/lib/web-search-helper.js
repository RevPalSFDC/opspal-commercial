#!/usr/bin/env node

/**
 * Web Search Helper for Government Contact Classification
 *
 * Performs web searches to verify individual persons and extract
 * person-specific organizational context.
 *
 * Search Strategy:
 * 1. Primary: "{firstName} {lastName}" {emailDomain} government
 * 2. Fallback: "{firstName} {lastName}" {emailDomain}
 * 3. Extract: Job title, department, organization, role description
 *
 * Data Extraction:
 * - Government employee directories (city, county, state, federal)
 * - Official government websites (.gov domains)
 * - LinkedIn profiles (government employees)
 * - Press releases and news articles
 * - Staff/contact pages
 *
 * Confidence Scoring:
 * - Official .gov source: High confidence (85-95%)
 * - LinkedIn verified: Medium confidence (70-80%)
 * - News/press release: Medium confidence (65-75%)
 * - Multiple sources: Boost confidence +10-15%
 */

const SEARCH_RATE_LIMIT = 1000; // 1 request per second
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const TIMEOUT = 10000; // 10 seconds

class WebSearchHelper {
  constructor(options = {}) {
    this.rateLimit = options.rateLimit || SEARCH_RATE_LIMIT;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
    this.timeout = options.timeout || TIMEOUT;
    this.lastRequestTime = 0;
    this.stats = {
      totalSearches: 0,
      successful: 0,
      failed: 0,
      cached: 0
    };
    this.cache = new Map();
    this.enableCache = options.enableCache !== false;
  }

  /**
   * Search for a specific person in government
   *
   * @param {Object} person - Person data
   * @param {string} person.firstName - First name
   * @param {string} person.lastName - Last name
   * @param {string} person.email - Email address
   * @param {string} person.emailDomain - Email domain
   * @returns {Object} Search results with extracted data
   */
  async searchPerson(person) {
    const { firstName, lastName, emailDomain } = person;

    if (!firstName || !lastName || !emailDomain) {
      return this.emptyResult('Missing required fields');
    }

    // Check cache
    const cacheKey = `${firstName}_${lastName}_${emailDomain}`;
    if (this.enableCache && this.cache.has(cacheKey)) {
      this.stats.cached++;
      return this.cache.get(cacheKey);
    }

    // Rate limiting
    await this.enforceRateLimit();

    // Build search query
    const primaryQuery = `"${firstName} ${lastName}" ${emailDomain} government`;
    const fallbackQuery = `"${firstName} ${lastName}" ${emailDomain}`;

    this.stats.totalSearches++;

    try {
      // Try primary query first
      let results = await this.performSearch(primaryQuery);

      // If no relevant results, try fallback
      if (!results.hasRelevantInfo) {
        results = await this.performSearch(fallbackQuery);
      }

      // Extract structured data from results
      const extractedData = this.extractPersonData(results, person);

      // Cache result
      if (this.enableCache) {
        this.cache.set(cacheKey, extractedData);
      }

      if (extractedData.hasRelevantInfo) {
        this.stats.successful++;
      } else {
        this.stats.failed++;
      }

      return extractedData;
    } catch (error) {
      console.error(`Web search failed for ${firstName} ${lastName}:`, error.message);
      this.stats.failed++;
      return this.emptyResult(`Search error: ${error.message}`);
    }
  }

  /**
   * Perform the actual web search
   *
   * Supports multiple search providers (configured via environment):
   * 1. Google Custom Search API (default) - Set GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID
   * 2. Bing Web Search API - Set BING_SEARCH_API_KEY
   * 3. DuckDuckGo (free, limited) - No API key required
   * 4. Fallback: Returns empty results (allows other methods to work)
   *
   * @param {string} query - Search query
   * @returns {Object} Raw search results
   */
  async performSearch(query) {
    // Try Google Custom Search API first
    if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) {
      try {
        return await this.performGoogleSearch(query);
      } catch (error) {
        console.warn(`Google Search failed: ${error.message}, trying fallback...`);
      }
    }

    // Try Bing Web Search API
    if (process.env.BING_SEARCH_API_KEY) {
      try {
        return await this.performBingSearch(query);
      } catch (error) {
        console.warn(`Bing Search failed: ${error.message}, trying fallback...`);
      }
    }

    // Try DuckDuckGo (free but limited)
    if (process.env.ENABLE_DUCKDUCKGO === 'true') {
      try {
        return await this.performDuckDuckGoSearch(query);
      } catch (error) {
        console.warn(`DuckDuckGo Search failed: ${error.message}`);
      }
    }

    // No search provider configured - return empty results
    // This allows fallback to company records and pattern matching
    return {
      query: query,
      results: [],
      hasRelevantInfo: false,
      provider: 'none'
    };
  }

  /**
   * Google Custom Search API implementation
   */
  async performGoogleSearch(query) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Google Search returned ${response.status}`);
    }

    const data = await response.json();

    return {
      query: query,
      results: (data.items || []).map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink
      })),
      hasRelevantInfo: data.items && data.items.length > 0,
      provider: 'google',
      totalResults: data.searchInformation?.totalResults
    };
  }

  /**
   * Bing Web Search API implementation
   */
  async performBingSearch(query) {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    const endpoint = process.env.BING_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/search';

    const url = `${endpoint}?q=${encodeURIComponent(query)}&count=10`;
    const response = await this.fetchWithRetry(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Bing Search returned ${response.status}`);
    }

    const data = await response.json();

    return {
      query: query,
      results: (data.webPages?.value || []).map(item => ({
        title: item.name,
        link: item.url,
        snippet: item.snippet,
        displayLink: item.displayUrl
      })),
      hasRelevantInfo: data.webPages?.value && data.webPages.value.length > 0,
      provider: 'bing',
      totalResults: data.webPages?.totalEstimatedMatches
    };
  }

  /**
   * DuckDuckGo search implementation (free but limited)
   * Uses ddg-search npm package or direct API
   */
  async performDuckDuckGoSearch(query) {
    // DuckDuckGo Instant Answer API (limited but free)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`DuckDuckGo Search returned ${response.status}`);
    }

    const data = await response.json();

    // DuckDuckGo API returns structured data differently
    const results = [];

    // RelatedTopics contain relevant information
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 100),
            link: topic.FirstURL,
            snippet: topic.Text,
            displayLink: new URL(topic.FirstURL).hostname
          });
        }
      }
    }

    // Abstract provides main answer
    if (data.Abstract && data.AbstractURL) {
      results.unshift({
        title: data.Heading || 'Main Result',
        link: data.AbstractURL,
        snippet: data.Abstract,
        displayLink: new URL(data.AbstractURL).hostname
      });
    }

    return {
      query: query,
      results: results,
      hasRelevantInfo: results.length > 0,
      provider: 'duckduckgo',
      totalResults: results.length
    };
  }

  /**
   * Extract person-specific data from search results
   *
   * @param {Object} results - Raw search results
   * @param {Object} person - Original person data
   * @returns {Object} Extracted structured data
   */
  extractPersonData(results, person) {
    if (!results.hasRelevantInfo || !results.results.length) {
      return this.emptyResult('No relevant search results');
    }

    // Initialize extracted data
    const extracted = {
      hasRelevantInfo: false,
      confidence: 0,
      sources: [],
      title: null,
      organization: null,
      department: null,
      roleDescription: null,
      verifiedBy: []
    };

    // Parse each search result
    for (const result of results.results) {
      const snippet = (result.snippet || '').toLowerCase();
      const url = (result.link || '').toLowerCase();
      const title = (result.title || '').toLowerCase();

      // Check if result is from official .gov source
      const isGovSource = url.includes('.gov');
      const isLinkedIn = url.includes('linkedin.com');

      // Extract job title patterns
      const titlePatterns = [
        /(?:^|\s)(chief|director|manager|officer|deputy|assistant|coordinator|specialist|analyst)\s+(?:of\s+)?([a-z\s]+)/i,
        /(?:^|\s)(captain|lieutenant|sergeant|deputy|sheriff|police|fire)/i
      ];

      for (const pattern of titlePatterns) {
        const match = snippet.match(pattern);
        if (match && !extracted.title) {
          extracted.title = match[0].trim();
          break;
        }
      }

      // Extract organization/department patterns
      const orgPatterns = [
        /(?:works?\s+(?:at|for|with))\s+([a-z\s]+(?:department|office|agency|bureau|division))/i,
        /(?:^|\s)((?:department|office|agency|bureau|division)\s+of\s+[a-z\s]+)/i
      ];

      for (const pattern of orgPatterns) {
        const match = snippet.match(pattern);
        if (match && !extracted.organization) {
          extracted.organization = match[1].trim();
          break;
        }
      }

      // Track source quality
      if (isGovSource) {
        extracted.verifiedBy.push('official-gov-source');
        extracted.confidence = Math.max(extracted.confidence, 85);
      } else if (isLinkedIn) {
        extracted.verifiedBy.push('linkedin-profile');
        extracted.confidence = Math.max(extracted.confidence, 70);
      } else {
        extracted.verifiedBy.push('web-source');
        extracted.confidence = Math.max(extracted.confidence, 60);
      }

      extracted.sources.push({
        url: result.link,
        snippet: result.snippet,
        type: isGovSource ? 'gov' : (isLinkedIn ? 'linkedin' : 'web')
      });
    }

    // Determine if we have relevant info
    extracted.hasRelevantInfo = !!(extracted.title || extracted.organization);

    // Boost confidence for multiple sources
    if (extracted.sources.length > 1) {
      extracted.confidence = Math.min(extracted.confidence + 10, 95);
    }

    return extracted;
  }

  /**
   * Enforce rate limiting between requests
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimit) {
      const waitTime = this.rateLimit - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch with retry logic
   */
  async fetchWithRetry(url, options = {}) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        // Retry on 429 or 5xx
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.maxRetries) {
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            console.warn(`Search API returned ${response.status}, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(`Search API returned ${response.status}`);
      } catch (error) {
        if (attempt < this.maxRetries) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          console.warn(`Search failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Return empty result
   */
  emptyResult(reason) {
    return {
      hasRelevantInfo: false,
      confidence: 0,
      sources: [],
      title: null,
      organization: null,
      department: null,
      roleDescription: null,
      verifiedBy: [],
      reason: reason
    };
  }

  /**
   * Get search statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalSearches > 0
        ? ((this.stats.successful / this.stats.totalSearches) * 100).toFixed(1) + '%'
        : '0%',
      cacheSize: this.cache.size
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalSearches: 0,
      successful: 0,
      failed: 0,
      cached: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = WebSearchHelper;
