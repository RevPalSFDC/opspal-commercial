/**
 * Dashboard State Manager
 *
 * Manages page state for conversational dashboard updates.
 * Tracks sections, conversation history, and enables incremental updates.
 *
 * @module web-viz/StateManager
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StateManager {
  /**
   * Create a state manager for a dashboard session
   * @param {string} sessionId - Session identifier (auto-generated if not provided)
   * @param {Object} options - Configuration options
   */
  constructor(sessionId = null, options = {}) {
    this.sessionId = sessionId || this._generateSessionId();
    this.options = {
      stateDir: options.stateDir || path.join(process.cwd(), 'dashboards'),
      autoSave: options.autoSave !== false,
      ...options
    };

    this.state = this._initializeState();
    this.isDirty = false;
    this.lastSaved = null;
  }

  /**
   * Generate unique session ID
   * @private
   */
  _generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `session_${timestamp}_${random}`;
  }

  /**
   * Initialize empty state
   * @private
   */
  _initializeState() {
    return {
      version: '1.0.0',
      sessionId: this.sessionId,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),

      // Page metadata
      metadata: {
        title: 'Untitled Dashboard',
        description: '',
        theme: 'revpal',
        author: null
      },

      // Operating mode
      mode: 'static', // 'static' or 'dev-server'

      // Layout configuration
      layout: {
        type: 'grid',
        columns: 12,
        gap: '16px'
      },

      // Dashboard sections (components)
      sections: [],

      // Section order (array of section IDs)
      sectionOrder: [],

      // Global filters applied to all sections
      globalFilters: [],

      // Conversation history for context
      conversationHistory: []
    };
  }

  /**
   * Get session directory path
   * @returns {string} Directory path
   */
  getSessionDir() {
    return path.join(this.options.stateDir, this.sessionId);
  }

  /**
   * Get state file path
   * @returns {string} State file path
   */
  getStatePath() {
    return path.join(this.getSessionDir(), '.dashboard-state.json');
  }

  /**
   * Initialize a new session
   * @param {Object} metadata - Session metadata
   * @returns {Promise<StateManager>} this
   */
  async initialize(metadata = {}) {
    this.state.metadata = { ...this.state.metadata, ...metadata };
    this.state.created = new Date().toISOString();
    this.state.updated = new Date().toISOString();

    // Create session directory
    await fs.mkdir(this.getSessionDir(), { recursive: true });

    if (this.options.autoSave) {
      await this.save();
    }

    return this;
  }

  /**
   * Load existing session state
   * @param {string} sessionId - Session to load
   * @returns {Promise<StateManager>} this
   */
  async load(sessionId = null) {
    if (sessionId) {
      this.sessionId = sessionId;
    }

    const statePath = this.getStatePath();

    try {
      const content = await fs.readFile(statePath, 'utf-8');
      this.state = JSON.parse(content);
      this.isDirty = false;
      this.lastSaved = new Date();
      return this;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Session not found: ${this.sessionId}`);
      }
      throw error;
    }
  }

  /**
   * Save current state to disk
   * @returns {Promise<void>}
   */
  async save() {
    this.state.updated = new Date().toISOString();

    const statePath = this.getStatePath();
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(this.state, null, 2), 'utf-8');

    this.isDirty = false;
    this.lastSaved = new Date();
  }

  /**
   * Set dashboard metadata
   * @param {Object} metadata - Metadata to merge
   * @returns {StateManager} this
   */
  setMetadata(metadata) {
    this.state.metadata = { ...this.state.metadata, ...metadata };
    this._markDirty();
    return this;
  }

  /**
   * Set operating mode
   * @param {string} mode - 'static' or 'dev-server'
   * @returns {StateManager} this
   */
  setMode(mode) {
    if (!['static', 'dev-server'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    this.state.mode = mode;
    this._markDirty();
    return this;
  }

  /**
   * Add a section (component) to the dashboard
   * @param {Object} section - Section data (component.serialize())
   * @returns {StateManager} this
   */
  addSection(section) {
    // Remove existing section with same ID
    this.state.sections = this.state.sections.filter(s => s.id !== section.id);

    this.state.sections.push(section);

    // Add to order if not present
    if (!this.state.sectionOrder.includes(section.id)) {
      this.state.sectionOrder.push(section.id);
    }

    this._markDirty();
    return this;
  }

  /**
   * Update an existing section
   * @param {string} sectionId - Section ID to update
   * @param {Object} updates - Updates to merge
   * @returns {StateManager} this
   */
  updateSection(sectionId, updates) {
    const index = this.state.sections.findIndex(s => s.id === sectionId);
    if (index === -1) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    this.state.sections[index] = {
      ...this.state.sections[index],
      ...updates,
      updated: new Date().toISOString()
    };

    this._markDirty();
    return this;
  }

  /**
   * Remove a section from the dashboard
   * @param {string} sectionId - Section ID to remove
   * @returns {StateManager} this
   */
  removeSection(sectionId) {
    this.state.sections = this.state.sections.filter(s => s.id !== sectionId);
    this.state.sectionOrder = this.state.sectionOrder.filter(id => id !== sectionId);
    this._markDirty();
    return this;
  }

  /**
   * Reorder sections
   * @param {string[]} order - Array of section IDs in new order
   * @returns {StateManager} this
   */
  reorderSections(order) {
    // Validate all IDs exist
    const existingIds = new Set(this.state.sections.map(s => s.id));
    for (const id of order) {
      if (!existingIds.has(id)) {
        throw new Error(`Section not found: ${id}`);
      }
    }

    this.state.sectionOrder = order;
    this._markDirty();
    return this;
  }

  /**
   * Get a section by ID
   * @param {string} sectionId - Section ID
   * @returns {Object|null} Section data
   */
  getSection(sectionId) {
    return this.state.sections.find(s => s.id === sectionId) || null;
  }

  /**
   * Get all sections in display order
   * @returns {Object[]} Ordered sections
   */
  getSections() {
    const sectionsMap = new Map(this.state.sections.map(s => [s.id, s]));
    return this.state.sectionOrder
      .map(id => sectionsMap.get(id))
      .filter(Boolean);
  }

  /**
   * Add a global filter (applies to all sections)
   * @param {Object} filter - Filter { field, op, value }
   * @returns {StateManager} this
   */
  addGlobalFilter(filter) {
    this.state.globalFilters = this.state.globalFilters.filter(f => f.field !== filter.field);
    this.state.globalFilters.push(filter);
    this._markDirty();
    return this;
  }

  /**
   * Remove a global filter
   * @param {string} field - Field to remove filter for
   * @returns {StateManager} this
   */
  removeGlobalFilter(field) {
    this.state.globalFilters = this.state.globalFilters.filter(f => f.field !== field);
    this._markDirty();
    return this;
  }

  /**
   * Record a conversation turn
   * @param {Object} turn - Conversation turn data
   * @returns {StateManager} this
   */
  recordConversationTurn(turn) {
    const turnRecord = {
      turn: this.state.conversationHistory.length + 1,
      timestamp: new Date().toISOString(),
      ...turn
    };

    this.state.conversationHistory.push(turnRecord);
    this._markDirty();
    return this;
  }

  /**
   * Get conversation history
   * @param {number} limit - Max turns to return (0 = all)
   * @returns {Object[]} Conversation turns
   */
  getConversationHistory(limit = 0) {
    if (limit > 0) {
      return this.state.conversationHistory.slice(-limit);
    }
    return [...this.state.conversationHistory];
  }

  /**
   * Generate update payload for WebSocket broadcast
   * @param {string} updateType - Type of update
   * @param {Object} payload - Update data
   * @returns {Object} Update message
   */
  createUpdateMessage(updateType, payload) {
    return {
      type: updateType,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      payload
    };
  }

  /**
   * Get full state (for serialization)
   * @returns {Object} Complete state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get dashboard summary
   * @returns {Object} Summary statistics
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      title: this.state.metadata.title,
      mode: this.state.mode,
      sectionCount: this.state.sections.length,
      sectionTypes: this.state.sections.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      globalFilterCount: this.state.globalFilters.length,
      conversationTurns: this.state.conversationHistory.length,
      created: this.state.created,
      updated: this.state.updated
    };
  }

  /**
   * List section references (for displaying to user)
   * @returns {string[]} Section reference strings
   */
  listSectionRefs() {
    return this.getSections().map((s, i) => {
      const filters = s.filters?.length ? ` (${s.filters.length} filters)` : '';
      return `${i + 1}. [${s.id}] ${s.title || s.type}${filters}`;
    });
  }

  /**
   * Mark state as dirty (needs save)
   * @private
   */
  _markDirty() {
    this.isDirty = true;
    this.state.updated = new Date().toISOString();

    if (this.options.autoSave) {
      // Debounced auto-save (don't await)
      this._debouncedSave();
    }
  }

  /**
   * Debounced save (prevents excessive writes)
   * @private
   */
  _debouncedSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    this._saveTimeout = setTimeout(() => {
      this.save().catch(err => {
        console.error('Auto-save failed:', err.message);
      });
    }, 500);
  }

  /**
   * Check if state has been modified since last save
   * @returns {boolean}
   */
  hasUnsavedChanges() {
    return this.isDirty;
  }

  /**
   * List all available sessions
   * @param {string} stateDir - Directory to scan
   * @returns {Promise<Object[]>} Session summaries
   */
  static async listSessions(stateDir) {
    try {
      const entries = await fs.readdir(stateDir, { withFileTypes: true });
      const sessions = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session_')) {
          const statePath = path.join(stateDir, entry.name, '.dashboard-state.json');
          try {
            const content = await fs.readFile(statePath, 'utf-8');
            const state = JSON.parse(content);
            sessions.push({
              sessionId: state.sessionId,
              title: state.metadata?.title || 'Untitled',
              sectionCount: state.sections?.length || 0,
              created: state.created,
              updated: state.updated
            });
          } catch {
            // Skip invalid sessions
          }
        }
      }

      // Sort by updated date (newest first)
      sessions.sort((a, b) => new Date(b.updated) - new Date(a.updated));

      return sessions;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

module.exports = StateManager;
