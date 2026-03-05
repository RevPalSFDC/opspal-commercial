#!/usr/bin/env node

/**
 * Google Slides Manager
 *
 * Manages Google Slides API operations for presentation generation and modification.
 *
 * Supports multiple modes:
 * - API mode: Uses Google Slides API (requires credentials)
 * - Manual mode: User creates/modifies presentation manually
 * - Dry-run mode: Simulates operations without making changes
 *
 * Features:
 * - Clone template presentations
 * - Create blank presentations
 * - Add/remove slides
 * - Replace text placeholders
 * - Replace images
 * - Batch API operations (max 100 requests per batch)
 * - Export to PDF
 * - Idempotent operations (safe to retry)
 */

const fs = require('fs');
const path = require('path');

class GoogleSlidesManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.mode = options.mode || 'auto'; // 'auto', 'api', 'manual'
    this.maxBatchSize = 100; // Google Slides API limit

    // Rate limiting configuration
    // Google Slides API: 60 write requests per minute per user
    this.rateLimitConfig = {
      requestsPerMinute: options.requestsPerMinute || 50, // Stay under 60 limit
      minDelayMs: options.minDelayMs || 1200, // 1.2 seconds between requests
      maxRetries: options.maxRetries || 3,
      retryDelayMs: options.retryDelayMs || 5000 // 5 seconds on rate limit
    };

    // Rate limiting state
    this._requestTimestamps = [];
    this._lastRequestTime = 0;

    // API clients (lazy loaded)
    this.slides = null;
    this.drive = null;

    this.log('GoogleSlidesManager initialized', {
      mode: this.mode,
      dryRun: this.dryRun,
      rateLimiting: this.rateLimitConfig
    });
  }

  /**
   * Rate-limited delay before making an API call
   * Ensures we don't exceed the requests per minute limit
   *
   * @private
   * @returns {Promise<void>}
   */
  async _rateLimitDelay() {
    const now = Date.now();

    // Clean up old timestamps (older than 1 minute)
    this._requestTimestamps = this._requestTimestamps.filter(
      ts => now - ts < 60000
    );

    // Check if we're at the limit
    if (this._requestTimestamps.length >= this.rateLimitConfig.requestsPerMinute) {
      // Wait until oldest request is older than 1 minute
      const oldestRequest = this._requestTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // +100ms buffer
      if (waitTime > 0) {
        this.log(`Rate limit: waiting ${waitTime}ms (${this._requestTimestamps.length} requests in last minute)`);
        await this._sleep(waitTime);
      }
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this._lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitConfig.minDelayMs) {
      const delay = this.rateLimitConfig.minDelayMs - timeSinceLastRequest;
      await this._sleep(delay);
    }

    // Record this request
    this._requestTimestamps.push(Date.now());
    this._lastRequestTime = Date.now();
  }

  /**
   * Execute an API call with rate limiting and retry on rate limit errors
   *
   * @private
   * @param {Function} apiCall - Async function that makes the API call
   * @param {string} operationName - Name of the operation for logging
   * @returns {Promise<any>} - Result of the API call
   */
  async _rateLimitedApiCall(apiCall, operationName = 'API call') {
    let lastError = null;

    for (let attempt = 1; attempt <= this.rateLimitConfig.maxRetries; attempt++) {
      // Wait for rate limit
      await this._rateLimitDelay();

      try {
        const result = await apiCall();
        return result;
      } catch (error) {
        lastError = error;

        // Check if it's a rate limit error (429 or quota exceeded)
        const isRateLimitError =
          error.code === 429 ||
          error.message?.includes('Quota exceeded') ||
          error.message?.includes('Rate Limit') ||
          error.message?.includes('rateLimitExceeded');

        if (isRateLimitError && attempt < this.rateLimitConfig.maxRetries) {
          const retryDelay = this.rateLimitConfig.retryDelayMs * attempt;
          this.log(`Rate limit hit on ${operationName}, attempt ${attempt}/${this.rateLimitConfig.maxRetries}. Waiting ${retryDelay}ms...`);

          // Clear request timestamps on rate limit to reset the window
          this._requestTimestamps = [];

          await this._sleep(retryDelay);
        } else if (!isRateLimitError) {
          // Non-rate-limit error, throw immediately
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep helper
   *
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize Google Slides and Drive API clients
   *
   * @private
   * @returns {Promise<void>}
   */
  async _initializeApiClient() {
    if (this.slides && this.drive) return; // Already initialized

    try {
      // Load Google APIs
      const { google } = require('googleapis');

      this.log('Initializing Google Slides and Drive API clients');

      // Define scopes (must match authorization scopes)
      const SCOPES = [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive'
      ];

      // Path to credentials and token
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

      // Load credentials
      const credentials = JSON.parse(fs.readFileSync(credentialsPath));
      const { client_secret, client_id, redirect_uris } = credentials.installed;

      // Create OAuth2 client
      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Load saved token
      const token = JSON.parse(fs.readFileSync(tokenPath));
      oAuth2Client.setCredentials(token);

      // Initialize API clients
      this.slides = google.slides({ version: 'v1', auth: oAuth2Client });
      this.drive = google.drive({ version: 'v3', auth: oAuth2Client });

      this.log('Google Slides and Drive API clients initialized');

    } catch (error) {
      this.log('Failed to initialize Google API clients', error.message);

      if (this.mode === 'api') {
        throw new Error(`Google API initialization failed: ${error.message}`);
      }

      // Fall back to manual mode
      console.warn('⚠️  Google APIs not available. Falling back to manual mode.');
      console.warn('   Install dependencies: npm install googleapis @google-cloud/local-auth');
      console.warn('   Or set mode to "manual" to provide presentation IDs directly.');
      this.mode = 'manual';
    }
  }

  /**
   * Clone a template presentation
   *
   * @param {string} templateId - Template presentation ID
   * @param {string} title - Title for the new presentation
   * @returns {Promise<{presentationId: string, url: string, title: string, created: boolean}>}
   */
  async cloneTemplate(templateId, title) {
    this.log('Cloning template', { templateId, title });

    // Manual mode
    if (this.mode === 'manual') {
      console.log('\n📄 Manual Template Cloning Required');
      console.log('─'.repeat(50));
      console.log(`1. Open template: https://docs.google.com/presentation/d/${templateId}`);
      console.log(`2. Click File → Make a copy`);
      console.log(`3. Rename to: "${title}"`);
      console.log(`4. Copy the new presentation ID from the URL`);
      console.log('─'.repeat(50));

      return {
        presentationId: 'MANUAL_CREATION_REQUIRED',
        url: 'MANUAL_CREATION_REQUIRED',
        title,
        created: false,
        manualRequired: true
      };
    }

    // Dry-run mode
    if (this.dryRun) {
      this.log('[DRY RUN] Would clone template', { templateId, title });
      return {
        presentationId: `DRYRUN_${Date.now()}`,
        url: `https://docs.google.com/presentation/d/DRYRUN_${Date.now()}`,
        title,
        created: false,
        dryRun: true
      };
    }

    // Initialize API
    await this._initializeApiClient();

    try {
      // Copy the file using Drive API
      const response = await this.drive.files.copy({
        fileId: templateId,
        requestBody: {
          name: title
        },
        fields: 'id, name, webViewLink'
      });

      const presentation = response.data;

      this.log('Template cloned', presentation);

      return {
        presentationId: presentation.id,
        url: presentation.webViewLink,
        title: presentation.name,
        created: true
      };

    } catch (error) {
      throw new Error(`Failed to clone template: ${error.message}`);
    }
  }

  /**
   * Create a blank presentation
   *
   * @param {string} title - Presentation title
   * @returns {Promise<{presentationId: string, url: string, title: string, created: boolean}>}
   */
  async createBlankPresentation(title) {
    this.log('Creating blank presentation', { title });

    // Manual mode
    if (this.mode === 'manual') {
      console.log('\n📄 Manual Presentation Creation Required');
      console.log('─'.repeat(50));
      console.log('1. Go to Google Slides: https://slides.google.com');
      console.log(`2. Create a new blank presentation`);
      console.log(`3. Rename to: "${title}"`);
      console.log(`4. Copy the presentation ID from the URL`);
      console.log('─'.repeat(50));

      return {
        presentationId: 'MANUAL_CREATION_REQUIRED',
        url: 'MANUAL_CREATION_REQUIRED',
        title,
        created: false,
        manualRequired: true
      };
    }

    // Dry-run mode
    if (this.dryRun) {
      this.log('[DRY RUN] Would create blank presentation', { title });
      return {
        presentationId: `DRYRUN_${Date.now()}`,
        url: `https://docs.google.com/presentation/d/DRYRUN_${Date.now()}`,
        title,
        created: false,
        dryRun: true
      };
    }

    // Initialize API
    await this._initializeApiClient();

    try {
      // Create presentation
      const response = await this.slides.presentations.create({
        requestBody: {
          title
        }
      });

      const presentation = response.data;

      this.log('Blank presentation created', presentation);

      return {
        presentationId: presentation.presentationId,
        url: `https://docs.google.com/presentation/d/${presentation.presentationId}`,
        title: presentation.title,
        created: true
      };

    } catch (error) {
      throw new Error(`Failed to create blank presentation: ${error.message}`);
    }
  }

  /**
   * Get presentation metadata
   *
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Object>} Presentation object
   */
  async getPresentation(presentationId) {
    this.log('Getting presentation', { presentationId });

    // Manual mode
    if (this.mode === 'manual') {
      return {
        presentationId,
        title: 'Manual mode (metadata not retrieved)',
        slides: [],
        manual: true
      };
    }

    // Initialize API
    await this._initializeApiClient();

    try {
      const response = await this.slides.presentations.get({
        presentationId
      });

      return response.data;

    } catch (error) {
      throw new Error(`Failed to get presentation: ${error.message}`);
    }
  }

  /**
   * Add a new slide to the presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} [layout='BLANK'] - Layout name (BLANK, TITLE, TITLE_AND_BODY, etc.) or layout object ID
   * @param {Object} [options={}] - Additional options
   * @param {number} [options.insertionIndex] - Where to insert (0 = beginning)
   * @param {string} [options.layoutObjectId] - Use template layout by ID (overrides layout param)
   * @returns {Promise<{slideId: string, insertionIndex: number}>}
   */
  async addSlide(presentationId, layout = 'BLANK', options = {}) {
    this.log('Adding slide', { presentationId, layout, options });

    if (this.dryRun) {
      this.log('[DRY RUN] Would add slide', { presentationId, layout });
      return {
        slideId: `DRYRUN_SLIDE_${Date.now()}`,
        insertionIndex: options.insertionIndex || 0,
        dryRun: true
      };
    }

    await this._initializeApiClient();

    try {
      // Use template layout ID if provided, otherwise use predefined layout
      const slideLayoutReference = options.layoutObjectId
        ? { layoutObjectId: options.layoutObjectId }
        : { predefinedLayout: layout };

      const requests = [{
        createSlide: {
          insertionIndex: options.insertionIndex,
          slideLayoutReference
        }
      }];

      const response = await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `addSlide(${presentationId})`
      );

      const slideId = response.data.replies[0].createSlide.objectId;

      this.log('Slide added', { slideId });

      return {
        slideId,
        insertionIndex: options.insertionIndex || 0
      };

    } catch (error) {
      throw new Error(`Failed to add slide: ${error.message}`);
    }
  }

  /**
   * Get all layouts available in a presentation
   *
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Array<{objectId: string, displayName: string}>>}
   */
  async getLayouts(presentationId) {
    this.log('Getting layouts', { presentationId });

    await this._initializeApiClient();

    try {
      const presentation = await this.getPresentation(presentationId);

      if (!presentation.layouts) {
        return [];
      }

      return presentation.layouts.map(layout => ({
        objectId: layout.objectId,
        displayName: layout.layoutProperties?.displayName || 'unnamed',
        masterObjectId: layout.layoutProperties?.masterObjectId
      }));

    } catch (error) {
      throw new Error(`Failed to get layouts: ${error.message}`);
    }
  }

  /**
   * Duplicate a slide within the presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} slideObjectId - Object ID of slide to duplicate
   * @param {number} [insertionIndex] - Where to insert the copy
   * @returns {Promise<{slideId: string}>}
   */
  async duplicateSlide(presentationId, slideObjectId, insertionIndex = 0) {
    this.log('Duplicating slide', { presentationId, slideObjectId, insertionIndex });

    if (this.dryRun) {
      this.log('[DRY RUN] Would duplicate slide', { presentationId, slideObjectId });
      return { slideId: `DRYRUN_SLIDE_${Date.now()}`, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const requests = [{
        duplicateObject: {
          objectId: slideObjectId
        }
      }];

      const response = await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `duplicateSlide(${slideObjectId})`
      );

      const newSlideId = response.data.replies[0].duplicateObject.objectId;

      // Move the duplicated slide to the desired position
      if (insertionIndex !== undefined) {
        await this._rateLimitedApiCall(
          () => this.slides.presentations.batchUpdate({
            presentationId,
            requestBody: {
              requests: [{
                updateSlidesPosition: {
                  slideObjectIds: [newSlideId],
                  insertionIndex: insertionIndex
                }
              }]
            }
          }),
          `moveSlide(${newSlideId})`
        );
      }

      this.log('Slide duplicated', { newSlideId });

      return { slideId: newSlideId };

    } catch (error) {
      throw new Error(`Failed to duplicate slide: ${error.message}`);
    }
  }

  /**
   * Delete a slide from the presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} slideId - Slide object ID
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteSlide(presentationId, slideId) {
    this.log('Deleting slide', { presentationId, slideId });

    if (this.dryRun) {
      this.log('[DRY RUN] Would delete slide', { presentationId, slideId });
      return { deleted: false, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const requests = [{
        deleteObject: {
          objectId: slideId
        }
      }];

      await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `deleteSlide(${slideId})`
      );

      this.log('Slide deleted', { slideId });

      return { deleted: true };

    } catch (error) {
      throw new Error(`Failed to delete slide: ${error.message}`);
    }
  }

  /**
   * Replace all occurrences of text in the presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} findText - Text to find (can include {{ }} placeholders)
   * @param {string} replaceText - Replacement text
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<{replacementsMade: number}>}
   */
  async replaceText(presentationId, findText, replaceText, options = {}) {
    this.log('Replacing text', { presentationId, findText, replaceText });

    if (this.dryRun) {
      this.log('[DRY RUN] Would replace text', { findText, replaceText });
      return { replacementsMade: 0, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const requests = [{
        replaceAllText: {
          containsText: {
            text: findText,
            matchCase: options.matchCase !== false // Default true
          },
          replaceText
        }
      }];

      const response = await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `replaceText(${findText.substring(0, 20)})`
      );

      const replacements = response.data.replies[0].replaceAllText?.occurrencesChanged || 0;

      this.log('Text replaced', { replacements });

      return { replacementsMade: replacements };

    } catch (error) {
      throw new Error(`Failed to replace text: ${error.message}`);
    }
  }

  /**
   * Replace multiple text patterns in a presentation
   *
   * @param {string} presentationId - Presentation ID
   * @param {Object[]} replacements - Array of { find, replace } objects
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<{totalReplacements: number, results: Object[]}>}
   */
  async replaceTextInPresentation(presentationId, replacements, options = {}) {
    this.log('Batch replacing text', { presentationId, count: replacements.length });

    if (this.dryRun) {
      this.log('[DRY RUN] Would batch replace text', { replacements });
      return { totalReplacements: 0, dryRun: true, results: [] };
    }

    await this._initializeApiClient();

    const results = [];
    let totalReplacements = 0;

    // Process replacements in batches to respect rate limits
    for (const replacement of replacements) {
      if (!replacement.find || !replacement.replace) continue;

      try {
        const result = await this.replaceText(
          presentationId,
          replacement.find,
          replacement.replace,
          options
        );
        results.push({ ...replacement, success: true, count: result.replacementsMade });
        totalReplacements += result.replacementsMade;
      } catch (error) {
        results.push({ ...replacement, success: false, error: error.message });
        this.log('Replacement failed', { find: replacement.find, error: error.message });
      }
    }

    this.log('Batch replace complete', { totalReplacements });
    return { totalReplacements, results };
  }

  /**
   * Replace text on specific slide(s) only
   *
   * @param {string} presentationId - Presentation ID
   * @param {string|string[]} slideIds - Single slide ID or array of slide IDs
   * @param {string} findText - Text to find
   * @param {string} replaceText - Replacement text
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<{replacementsMade: number}>}
   */
  async replaceTextOnSlide(presentationId, slideIds, findText, replaceText, options = {}) {
    const pageObjectIds = Array.isArray(slideIds) ? slideIds : [slideIds];
    this.log('Replacing text on specific slides', { presentationId, slideIds: pageObjectIds, findText, replaceText });

    if (this.dryRun) {
      this.log('[DRY RUN] Would replace text on slides', { slideIds: pageObjectIds, findText, replaceText });
      return { replacementsMade: 0, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const requests = [{
        replaceAllText: {
          containsText: {
            text: findText,
            matchCase: options.matchCase !== false
          },
          replaceText,
          pageObjectIds  // Target specific slides only
        }
      }];

      const response = await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `replaceTextOnSlide(${findText.substring(0, 20)})`
      );

      const replacements = response.data.replies[0].replaceAllText?.occurrencesChanged || 0;

      this.log('Text replaced on slides', { replacements, slideIds: pageObjectIds });

      return { replacementsMade: replacements };

    } catch (error) {
      throw new Error(`Failed to replace text on slides: ${error.message}`);
    }
  }

  /**
   * Replace placeholder shapes with images
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} token - Placeholder token/text (e.g., "{{logo}}")
   * @param {string} imageUrl - Image URL (must be publicly accessible)
   * @returns {Promise<{replacementsMade: number}>}
   */
  async replaceImage(presentationId, token, imageUrl) {
    this.log('Replacing image', { presentationId, token, imageUrl });

    if (this.dryRun) {
      this.log('[DRY RUN] Would replace image', { token, imageUrl });
      return { replacementsMade: 0, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const requests = [{
        replaceAllShapesWithImage: {
          imageUrl,
          replaceMethod: 'CENTER_INSIDE',
          containsText: {
            text: token,
            matchCase: false
          }
        }
      }];

      const response = await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `replaceImage(${token})`
      );

      const replacements = response.data.replies[0].replaceAllShapesWithImage?.occurrencesChanged || 0;

      this.log('Image replaced', { replacements });

      return { replacementsMade: replacements };

    } catch (error) {
      throw new Error(`Failed to replace image: ${error.message}`);
    }
  }

  /**
   * Execute batch update requests (splits into multiple batches if > 100 requests)
   *
   * @param {string} presentationId - Presentation ID
   * @param {Array<Object>} requests - Array of batchUpdate request objects
   * @returns {Promise<{batches: number, totalRequests: number, responses: Array}>}
   */
  async batchUpdate(presentationId, requests) {
    this.log('Executing batch update', { presentationId, requestCount: requests.length });

    if (this.dryRun) {
      this.log('[DRY RUN] Would execute batch update', { requests: requests.length });
      return { batches: 0, totalRequests: requests.length, dryRun: true };
    }

    await this._initializeApiClient();

    try {
      // Split into batches of maxBatchSize
      const batches = [];
      for (let i = 0; i < requests.length; i += this.maxBatchSize) {
        batches.push(requests.slice(i, i + this.maxBatchSize));
      }

      this.log(`Split into ${batches.length} batch(es)`);

      // Execute each batch with rate limiting
      const responses = [];
      for (let i = 0; i < batches.length; i++) {
        this.log(`Executing batch ${i + 1}/${batches.length}`);

        const response = await this._rateLimitedApiCall(
          () => this.slides.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: batches[i] }
          }),
          `batchUpdate(batch ${i + 1}/${batches.length})`
        );

        responses.push(response.data);
      }

      this.log('Batch update complete', { batches: batches.length, requests: requests.length });

      return {
        batches: batches.length,
        totalRequests: requests.length,
        responses
      };

    } catch (error) {
      throw new Error(`Failed to execute batch update: ${error.message}`);
    }
  }

  /**
   * Export presentation to PDF
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} [outputPath] - Optional output file path
   * @returns {Promise<{pdfUrl?: string, filePath?: string}>}
   */
  async exportToPDF(presentationId, outputPath = null) {
    this.log('Exporting to PDF', { presentationId, outputPath });

    if (this.mode === 'manual') {
      console.log('\n📄 Manual PDF Export Required');
      console.log('─'.repeat(50));
      console.log(`1. Open: https://docs.google.com/presentation/d/${presentationId}`);
      console.log(`2. Click File → Download → PDF Document (.pdf)`);
      console.log(`3. Save to your desired location`);
      console.log('─'.repeat(50));

      return { manualRequired: true };
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would export to PDF', { presentationId });
      return { dryRun: true };
    }

    await this._initializeApiClient();

    try {
      // Export via Drive API
      const response = await this.drive.files.export({
        fileId: presentationId,
        mimeType: 'application/pdf'
      }, {
        responseType: 'stream'
      });

      // If output path provided, save to file
      if (outputPath) {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        this.log('PDF saved to file', { outputPath });

        return { filePath: outputPath };
      }

      // Otherwise, return download URL
      const pdfUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;

      return { pdfUrl };

    } catch (error) {
      throw new Error(`Failed to export to PDF: ${error.message}`);
    }
  }

  /**
   * Export presentation to PPTX
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} [outputPath] - Optional output file path
   * @returns {Promise<{pptxUrl?: string, filePath?: string}>}
   */
  async exportToPPTX(presentationId, outputPath = null) {
    this.log('Exporting to PPTX', { presentationId, outputPath });

    if (this.mode === 'manual') {
      console.log('\nManual PPTX Export Required');
      console.log('-'.repeat(50));
      console.log(`1. Open: https://docs.google.com/presentation/d/${presentationId}`);
      console.log('2. Click File -> Download -> Microsoft PowerPoint (.pptx)');
      console.log('3. Save to your desired location');
      console.log('-'.repeat(50));

      return { manualRequired: true };
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would export to PPTX', { presentationId });
      return { dryRun: true };
    }

    await this._initializeApiClient();

    try {
      const response = await this.drive.files.export({
        fileId: presentationId,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      }, {
        responseType: 'stream'
      });

      if (outputPath) {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        this.log('PPTX saved to file', { outputPath });
        return { filePath: outputPath };
      }

      const pptxUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pptx`;
      return { pptxUrl };

    } catch (error) {
      throw new Error(`Failed to export to PPTX: ${error.message}`);
    }
  }

  /**
   * Retry a function with exponential backoff
   *
   * @private
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<*>}
   */
  async _retry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        // Rate limit error
        if (error.code === 429 && i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.warn(`⚠️  Rate limited. Retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
          await this._sleep(delay);
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message - Log message
   * @param {*} [data] - Optional data to log
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleSlidesManager] ${message}`, data !== null ? data : '');
    }
  }

  /**
   * Get all text elements from a specific slide
   *
   * @param {string} presentationId - Presentation ID
   * @param {number} slideIndex - Slide index (0-based)
   * @returns {Promise<Array<{objectId: string, text: string, type: string, index: number}>>}
   */
  async getSlideElements(presentationId, slideIndex) {
    await this._initializeApiClient();

    const presentation = await this.slides.presentations.get({ presentationId });
    const slide = presentation.data.slides[slideIndex];

    if (!slide) {
      throw new Error(`Slide at index ${slideIndex} not found`);
    }

    const elements = [];

    if (slide.pageElements) {
      slide.pageElements.forEach((el, idx) => {
        // Include all shapes (with or without text) for text population
        if (el.shape) {
          let text = '';
          let hasText = false;

          if (el.shape.text && el.shape.text.textElements) {
            text = el.shape.text.textElements
              .map(te => te.textRun?.content || '')
              .join('')
              .trim();
            hasText = text.length > 0;
          }

          elements.push({
            objectId: el.objectId,
            text,
            hasText,
            type: el.shape.shapeType || 'TEXT_BOX',
            placeholderType: el.shape.placeholder?.type || null,
            index: idx
          });
        }
      });
    }

    return elements;
  }

  /**
   * Replace ALL text in a specific element by objectId
   * Uses deleteText + insertText to completely replace content
   * Includes rate limiting to avoid API quota issues
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} elementObjectId - The objectId of the element to update
   * @param {string} newText - New text content
   * @returns {Promise<{success: boolean}>}
   */
  async replaceElementText(presentationId, elementObjectId, newText, hasExistingText = true, options = {}) {
    this.log('Replacing element text', { presentationId, elementObjectId, newText: newText.substring(0, 50), hasExistingText });

    if (this.dryRun) {
      this.log('[DRY RUN] Would replace element text', { elementObjectId, newText });
      return { success: true, dryRun: true };
    }

    await this._initializeApiClient();

    // Build requests - only delete if there's existing text
    const requests = [];

    if (hasExistingText) {
      // First, delete all existing text from the element
      requests.push({
        deleteText: {
          objectId: elementObjectId,
          textRange: {
            type: 'ALL'
          }
        }
      });
    }

    // Then, insert the new text
    requests.push({
      insertText: {
        objectId: elementObjectId,
        insertionIndex: 0,
        text: newText
      }
    });

    // Apply styling to make text visible
    // Use explicit RGB colors (not theme colors) since predefined layouts use Google's theme, not template's
    if (options.applyThemeStyle !== false) {
      const fontSize = options.fontSize || 14;
      requests.push({
        updateTextStyle: {
          objectId: elementObjectId,
          textRange: { type: 'ALL' },
          style: {
            foregroundColor: {
              opaqueColor: {
                // Use explicit dark gray RGB - works on any layout
                rgbColor: {
                  red: 0.2,    // ~51 RGB
                  green: 0.2,
                  blue: 0.2
                }
              }
            },
            fontFamily: 'Montserrat',
            fontSize: {
              magnitude: fontSize,
              unit: 'PT'
            },
            bold: options.bold || false
          },
          fields: 'foregroundColor,fontFamily,fontSize,bold'
        }
      });
    }

    // Note: TEXT_AUTOFIT removed - unreliable via API (Google Issue #191389037)
    // Instead, use proper truncation logic in content generation

    try {
      // Use rate-limited API call
      await this._rateLimitedApiCall(
        () => this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests }
        }),
        `replaceElementText(${elementObjectId})`
      );

      this.log('Element text replaced', { elementObjectId });

      return { success: true };

    } catch (error) {
      // If deleteText fails because element is empty, just try insert + style
      if (error.message.includes('empty') || error.message.includes('Invalid')) {
        try {
          const insertRequests = [{
            insertText: {
              objectId: elementObjectId,
              insertionIndex: 0,
              text: newText
            }
          }];

          // Add styling with explicit RGB colors
          if (options.applyThemeStyle !== false) {
            const fontSize = options.fontSize || 14;
            insertRequests.push({
              updateTextStyle: {
                objectId: elementObjectId,
                textRange: { type: 'ALL' },
                style: {
                  foregroundColor: {
                    opaqueColor: {
                      rgbColor: {
                        red: 0.2,
                        green: 0.2,
                        blue: 0.2
                      }
                    }
                  },
                  fontFamily: 'Montserrat',
                  fontSize: {
                    magnitude: fontSize,
                    unit: 'PT'
                  },
                  bold: options.bold || false
                },
                fields: 'foregroundColor,fontFamily,fontSize,bold'
              }
            });
          }

          await this._rateLimitedApiCall(
            () => this.slides.presentations.batchUpdate({
              presentationId,
              requestBody: { requests: insertRequests }
            }),
            `insertText(${elementObjectId})`
          );
          return { success: true };
        } catch (insertError) {
          throw new Error(`Failed to insert text: ${insertError.message}`);
        }
      }
      throw new Error(`Failed to replace element text: ${error.message}`);
    }
  }

  /**
   * Populate multiple elements on a slide by index
   * Fetches current element structure and updates by position
   *
   * @param {string} presentationId - Presentation ID
   * @param {number} slideIndex - Slide index (0-based)
   * @param {Array<{index: number, text: string, fontSize?: number, bold?: boolean}>} updates - Array of {index, text, fontSize?, bold?} updates
   * @returns {Promise<{updated: number}>}
   */
  async populateSlideElements(presentationId, slideIndex, updates) {
    this.log('Populating slide elements', { presentationId, slideIndex, updateCount: updates.length });

    // Get current elements with text content info
    const elements = await this.getSlideElements(presentationId, slideIndex);

    let updated = 0;

    for (const update of updates) {
      const element = elements[update.index];
      if (element) {
        // Check if element has existing text content
        const hasExistingText = element.hasText || false;
        // Pass font size and bold options if provided
        const options = {};
        if (update.fontSize) options.fontSize = update.fontSize;
        if (update.bold) options.bold = update.bold;
        await this.replaceElementText(presentationId, element.objectId, update.text, hasExistingText, options);
        updated++;
      } else {
        this.log(`Warning: No element at index ${update.index} on slide ${slideIndex}`);
      }
    }

    return { updated };
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: node google-slides-manager.js <command> [options]

Commands:
  clone <templateId> <title>    Clone a template presentation
  create <title>                Create blank presentation
  add-slide <presentationId>    Add a slide to presentation
  replace <presentationId> <find> <replace>    Replace text
  export <presentationId> <outputPath>         Export to PDF
  export-pptx <presentationId> <outputPath>    Export to PPTX

Options:
  --mode <mode>           Mode: 'auto', 'api', 'manual' (default: auto)
  --dry-run               Simulate without making changes
  --verbose               Enable verbose logging

Examples:
  # Clone template
  node google-slides-manager.js clone 1aBcDeF "My New Presentation" --verbose

  # Create blank
  node google-slides-manager.js create "Q4 Report" --mode api

  # Replace text
  node google-slides-manager.js replace ABC123 "{{title}}" "Q4 Results"

  # Export to PDF
  node google-slides-manager.js export ABC123 ./output.pdf

  # Export to PPTX
  node google-slides-manager.js export-pptx ABC123 ./output.pptx
    `);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const manager = new GoogleSlidesManager({
    verbose: options.verbose || false,
    dryRun: options['dry-run'] || false,
    mode: options.mode || 'auto'
  });

  (async () => {
    try {
      switch (command) {
        case 'clone':
          const cloneResult = await manager.cloneTemplate(args[1], args[2]);
          console.log(JSON.stringify(cloneResult, null, 2));
          break;

        case 'create':
          const createResult = await manager.createBlankPresentation(args[1]);
          console.log(JSON.stringify(createResult, null, 2));
          break;

        case 'add-slide':
          const addResult = await manager.addSlide(args[1], args[2] || 'BLANK');
          console.log(JSON.stringify(addResult, null, 2));
          break;

        case 'replace':
          const replaceResult = await manager.replaceText(args[1], args[2], args[3]);
          console.log(JSON.stringify(replaceResult, null, 2));
          break;

        case 'export':
          const exportResult = await manager.exportToPDF(args[1], args[2]);
          console.log(JSON.stringify(exportResult, null, 2));
          break;

        case 'export-pptx':
          const pptxExportResult = await manager.exportToPPTX(args[1], args[2]);
          console.log(JSON.stringify(pptxExportResult, null, 2));
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = GoogleSlidesManager;
