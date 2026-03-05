#!/usr/bin/env node

/**
 * Fireflies Action Item Tracker
 *
 * Extracts and tracks action items from Fireflies.ai transcripts.
 * Cross-references with CRM Task records to surface overdue and completed items.
 *
 * @module fireflies-action-tracker
 * @version 1.0.0
 */

const { FirefliesAPIClient } = require('./fireflies-api-client');

// Default estimated days until an action item is due (from meeting date)
const DEFAULT_DUE_DAYS = 7;

class FirefliesActionTracker {
  constructor(options = {}) {
    this.client = options.apiClient || new FirefliesAPIClient({ verbose: options.verbose });
    this.verbose = options.verbose || false;
  }

  /**
   * Extract action items from a single transcript.
   * Parses summary.action_items and attributes each item to a speaker by
   * scanning sentences near each action item string for name matches.
   * @param {string} transcriptId - Fireflies transcript ID
   * @returns {Promise<Array>} Array of action item objects
   */
  async extractActionItems(transcriptId) {
    const query = `
      query {
        transcript(id: "${transcriptId}") {
          id
          title
          dateString
          duration
          organizer_email
          participants
          meeting_link
          privacy
          sentences {
            index
            speaker_id
            speaker_name
            raw_text
            start_time
            end_time
          }
          summary {
            keywords
            action_items
            gist
            short_summary
            outline
          }
          meeting_attendance {
            name
            join_time
            leave_time
          }
          audio_url
          video_url
        }
      }
    `;

    const data = await this.client.query(query);
    const transcript = data && data.transcript;

    if (!transcript) {
      this._log(`No transcript found for ID: ${transcriptId}`);
      return [];
    }

    return this._parseActionItems(transcript);
  }

  /**
   * Extract action items from multiple transcripts within a date range.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string (YYYY-MM-DD)
   * @param {string} [options.toDate] - ISO date string (YYYY-MM-DD)
   * @param {number} [options.limit] - Max transcripts per page
   * @returns {Promise<Array>} Flat array of action items across all transcripts
   */
  async extractBulkActionItems(options = {}) {
    const pageSize = options.limit || 50;
    const allActionItems = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      // List transcripts (lightweight - no sentences)
      const listQuery = `
        query {
          transcripts(
            fromDate: ${options.fromDate ? `"${options.fromDate}"` : 'null'}
            toDate: ${options.toDate ? `"${options.toDate}"` : 'null'}
            limit: ${pageSize}
            skip: ${skip}
          ) {
            id
            title
            dateString
            duration
            organizer_email
            participants
            meeting_link
            summary {
              keywords
              action_items
              gist
              short_summary
              outline
            }
          }
        }
      `;

      const data = await this.client.query(listQuery);
      const page = (data && data.transcripts) ? data.transcripts : [];

      for (const transcript of page) {
        if (transcript.summary && Array.isArray(transcript.summary.action_items) && transcript.summary.action_items.length > 0) {
          // For bulk mode, we use list-level data (no sentence-level attribution)
          const items = this._parseActionItems(transcript, { skipSentenceAttribution: true });
          allActionItems.push(...items);
        }
      }

      if (page.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }

    this._log(`Extracted ${allActionItems.length} action items across transcripts`);
    return allActionItems;
  }

  /**
   * Group action items by assignee (speaker/owner).
   * @param {Array} actionItems - Array of action item objects
   * @returns {Object} Map of assignee -> action items array
   */
  groupByAssignee(actionItems) {
    const grouped = {};

    (actionItems || []).forEach(item => {
      const assignee = item.speaker || 'Unassigned';
      if (!grouped[assignee]) grouped[assignee] = [];
      grouped[assignee].push(item);
    });

    // Sort each group by dueDate ascending
    for (const assignee of Object.keys(grouped)) {
      grouped[assignee].sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    }

    return grouped;
  }

  /**
   * Cross-reference action items with CRM Task records to mark completion.
   * @param {Array} actionItems - Action items from Fireflies
   * @param {Array} crmTasks - CRM Task records { id, subject, status, activityDate }
   * @returns {Array} Action items with updated status fields
   */
  trackCompletion(actionItems, crmTasks) {
    const now = new Date();

    // Build a normalized text index of CRM tasks for fuzzy matching
    const taskIndex = (crmTasks || []).map(task => ({
      ...task,
      normalizedSubject: _normalizeText(task.subject || task.Subject || '')
    }));

    return (actionItems || []).map(item => {
      const normalizedItem = _normalizeText(item.text);

      // Look for a CRM task whose subject closely matches this action item
      const matchedTask = taskIndex.find(task =>
        _textSimilarity(normalizedItem, task.normalizedSubject) > 0.6
      );

      let status = item.status;

      if (matchedTask) {
        const taskStatus = (matchedTask.status || matchedTask.Status || '').toLowerCase();
        if (['completed', 'closed', 'done'].includes(taskStatus)) {
          status = 'completed';
        } else if (item.dueDate && new Date(item.dueDate) < now) {
          status = 'overdue';
        } else {
          status = 'open';
        }
      } else if (item.dueDate && new Date(item.dueDate) < now && status === 'open') {
        status = 'overdue';
      }

      return {
        ...item,
        status,
        matchedCRMTaskId: matchedTask ? (matchedTask.id || matchedTask.Id) : null
      };
    });
  }

  /**
   * Generate a follow-up report of action items within a date range.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string
   * @param {string} [options.toDate] - ISO date string
   * @param {Array}  [options.crmTasks] - Optional CRM tasks for completion tracking
   * @returns {Promise<Object>} Follow-up report
   */
  async generateFollowUpReport(options = {}) {
    let actionItems = await this.extractBulkActionItems(options);

    // Apply CRM cross-referencing if tasks provided
    if (options.crmTasks && options.crmTasks.length > 0) {
      actionItems = this.trackCompletion(actionItems, options.crmTasks);
    } else {
      // Apply date-based overdue classification without CRM data
      const now = new Date();
      actionItems = actionItems.map(item => ({
        ...item,
        status: item.dueDate && new Date(item.dueDate) < now ? 'overdue' : item.status
      }));
    }

    const overdue = actionItems.filter(i => i.status === 'overdue');
    const upcoming = actionItems.filter(i => i.status === 'open');
    const completed = actionItems.filter(i => i.status === 'completed');

    const completionRate = actionItems.length > 0
      ? Math.round((completed.length / actionItems.length) * 100)
      : 0;

    const byAssignee = this.groupByAssignee(actionItems);

    this._log(`Follow-up report: ${overdue.length} overdue, ${upcoming.length} open, ${completed.length} completed`);

    return {
      generatedAt: new Date().toISOString(),
      dateRange: {
        from: options.fromDate || null,
        to: options.toDate || null
      },
      overdue,
      upcoming,
      completed,
      completionRate,
      byAssignee
    };
  }

  // ── Private Helpers ──

  /**
   * Parse action items from a transcript object.
   * Attempts speaker attribution via sentence scanning when sentences are available.
   * @param {Object} transcript
   * @param {Object} [parseOptions]
   * @param {boolean} [parseOptions.skipSentenceAttribution] - Skip sentence scanning
   * @returns {Array}
   */
  _parseActionItems(transcript, parseOptions = {}) {
    const rawItems = transcript.summary && Array.isArray(transcript.summary.action_items)
      ? transcript.summary.action_items
      : [];

    if (rawItems.length === 0) return [];

    const sentences = (!parseOptions.skipSentenceAttribution && Array.isArray(transcript.sentences))
      ? transcript.sentences
      : [];

    const meetingDate = transcript.dateString ? new Date(transcript.dateString) : null;

    return rawItems.map((rawText, index) => {
      const text = typeof rawText === 'string' ? rawText.trim() : String(rawText).trim();
      if (!text) return null;

      // Attribute speaker by finding sentences that contain similar text
      const speaker = this._attributeSpeaker(text, sentences);

      // Estimate due date: meeting date + DEFAULT_DUE_DAYS
      const dueDate = meetingDate
        ? new Date(meetingDate.getTime() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : null;

      return {
        id: `${transcript.id}-action-${index}`,
        text,
        meetingId: transcript.id,
        meetingTitle: transcript.title || null,
        meetingDate: transcript.dateString || null,
        speaker,
        status: 'open',
        dueDate,
        matchedCRMTaskId: null
      };
    }).filter(Boolean);
  }

  /**
   * Attribute an action item to a speaker by scanning surrounding sentences.
   * @param {string} actionText - The action item text
   * @param {Array} sentences - Transcript sentences
   * @returns {string|null} Best-guess speaker name
   */
  _attributeSpeaker(actionText, sentences) {
    if (!sentences || sentences.length === 0) return null;

    const normalizedAction = _normalizeText(actionText);

    // Find sentences with the highest overlap to the action text
    let bestScore = 0;
    let bestSpeaker = null;

    sentences.forEach(sentence => {
      const normalizedSentence = _normalizeText(sentence.raw_text || '');
      const score = _textSimilarity(normalizedAction, normalizedSentence);
      if (score > bestScore) {
        bestScore = score;
        bestSpeaker = sentence.speaker_name || sentence.speaker_id || null;
      }
    });

    // Only attribute if there is a meaningful match
    return bestScore > 0.3 ? bestSpeaker : null;
  }

  _log(msg) {
    if (this.verbose) console.error(`[fireflies-action-tracker] ${msg}`);
  }
}

// ── Text Utilities (module-private) ──

function _normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute a simple word-overlap similarity ratio between two normalized strings.
 * Returns a value from 0 (no overlap) to 1 (identical word sets).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _textSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  return intersection / Math.max(wordsA.size, wordsB.size);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--transcript-id' && args[i + 1]) opts.transcriptId = args[++i];
    else if (arg === '--from' && args[i + 1]) opts.fromDate = args[++i];
    else if (arg === '--to' && args[i + 1]) opts.toDate = args[++i];
    else if (arg === '--mode' && args[i + 1]) opts.mode = args[++i];
    else if (arg === '--verbose' || arg === '-v') opts.verbose = true;
  }

  if (!opts.mode && !opts.transcriptId) {
    console.log('Fireflies Action Item Tracker');
    console.log('=============================');
    console.log('Usage: fireflies-action-tracker.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --transcript-id <id>   Extract action items from a single transcript');
    console.log('  --mode report          Generate follow-up report across date range');
    console.log('  --from <date>          Start date (YYYY-MM-DD)');
    console.log('  --to <date>            End date (YYYY-MM-DD)');
    console.log('  --verbose              Verbose output');
    process.exit(0);
  }

  const tracker = new FirefliesActionTracker({ verbose: opts.verbose });

  let promise;
  if (opts.transcriptId) {
    promise = tracker.extractActionItems(opts.transcriptId);
  } else if (opts.mode === 'report') {
    promise = tracker.generateFollowUpReport(opts);
  } else {
    console.error('Specify --transcript-id or --mode report');
    process.exit(1);
  }

  promise.then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { FirefliesActionTracker };
