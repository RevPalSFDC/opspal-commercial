#!/usr/bin/env node

/**
 * HubSpot Company Association Fetcher
 *
 * Queries associated Company records for contacts to extract
 * organizational context that may not be present in contact.company field
 *
 * Features:
 * - Caching to avoid repeat API calls
 * - Handles multiple company associations (returns primary)
 * - Extracts Company.name, Company.about, Company.industry
 * - Network retry logic for resilience
 */

const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;
const API_KEY = process.env.HUBSPOT_API_KEY;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

class HubSpotCompanyFetcher {
  constructor(options = {}) {
    this.cache = new Map();
    this.enableCache = options.enableCache !== false;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
  }

  /**
   * Fetch associated companies for a contact
   */
  async fetchAssociatedCompanies(contactId) {
    // Check cache
    if (this.enableCache && this.cache.has(contactId)) {
      return this.cache.get(contactId);
    }

    try {
      // Step 1: Get company associations
      const associationsUrl = `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/companies`;
      const associationsResponse = await this.retryFetch(associationsUrl);

      if (!associationsResponse.ok) {
        console.warn(`Failed to fetch associations for contact ${contactId}: ${associationsResponse.status}`);
        return [];
      }

      const associations = await associationsResponse.json();

      if (!associations.results || associations.results.length === 0) {
        // No associated companies
        this.cache.set(contactId, []);
        return [];
      }

      // Step 2: Fetch company details for associated companies
      const companyIds = associations.results.map(assoc => assoc.toObjectId);
      const companies = await this.fetchCompanyDetails(companyIds);

      // Cache result
      if (this.enableCache) {
        this.cache.set(contactId, companies);
      }

      return companies;
    } catch (error) {
      console.error(`Error fetching companies for contact ${contactId}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch details for multiple companies
   */
  async fetchCompanyDetails(companyIds) {
    if (companyIds.length === 0) return [];

    try {
      // Batch read for efficiency
      const batchUrl = `https://api.hubapi.com/crm/v3/objects/companies/batch/read`;
      const requestBody = {
        inputs: companyIds.map(id => ({ id })),
        properties: ['name', 'about', 'industry', 'domain', 'description']
      };

      const response = await this.retryFetch(batchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.warn(`Failed to fetch company details: ${response.status}`);
        return [];
      }

      const data = await response.json();

      return data.results.map(company => ({
        id: company.id,
        name: company.properties.name || '',
        about: company.properties.about || company.properties.description || '',
        industry: company.properties.industry || '',
        domain: company.properties.domain || ''
      }));
    } catch (error) {
      console.error('Error fetching company details:', error.message);
      return [];
    }
  }

  /**
   * Get primary company for a contact (first associated company)
   */
  async getPrimaryCompany(contactId) {
    const companies = await this.fetchAssociatedCompanies(contactId);
    return companies.length > 0 ? companies[0] : null;
  }

  /**
   * Get all company data formatted for classification
   */
  async getCompanyContext(contactId) {
    const companies = await this.fetchAssociatedCompanies(contactId);

    if (companies.length === 0) {
      return {
        hasCompany: false,
        companyName: null,
        companyAbout: null,
        companyIndustry: null,
        companyDomain: null
      };
    }

    // Use primary (first) company
    const primary = companies[0];

    return {
      hasCompany: true,
      companyName: primary.name,
      companyAbout: primary.about,
      companyIndustry: primary.industry,
      companyDomain: primary.domain,
      allCompanies: companies
    };
  }

  /**
   * Fetch with retry logic
   */
  async retryFetch(url, options = {}) {
    // Add API key to headers if not provided
    if (!options.headers) {
      options.headers = {};
    }
    if (!options.headers.Authorization) {
      options.headers.Authorization = `Bearer ${API_KEY}`;
    }
    if (!options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Return on success or non-retryable error
        if (response.ok || response.status === 404) {
          return response;
        }

        // Retry on 429 or 5xx
        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.maxRetries) {
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        return response;
      } catch (error) {
        if (attempt < this.maxRetries) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          console.warn(`Fetch failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.enableCache
    };
  }
}

module.exports = HubSpotCompanyFetcher;
