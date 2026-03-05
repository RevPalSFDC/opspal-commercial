#!/usr/bin/env node

/**
 * Fireflies Webhook Handler
 *
 * HMAC SHA-256 webhook verification and event routing for Fireflies.ai.
 * Verifies the x-hub-signature header, provides replay protection via
 * a fingerprint TTL cache, and dispatches to registered event handlers.
 *
 * Key differences from Gong webhook handler:
 *   - Gong uses JWT (RS256) bearer token verification
 *   - Fireflies uses HMAC SHA-256 via x-hub-signature header
 *   - Fireflies shared secret is configured in the Fireflies dashboard (16-32 chars)
 *   - Currently documented event type: transcription.complete
 *
 * @module fireflies-webhook-handler
 * @version 1.0.0
 */

const crypto = require('crypto');

// Replay cache: fingerprint -> timestamp (module-level, shared across instances)
const _replayCache = new Map();
const REPLAY_TTL_MS = 10 * 60 * 1000; // 10 minutes

class FirefliesWebhookHandler {
  /**
   * @param {Object} options
   * @param {string} options.secret - HMAC shared secret from Fireflies dashboard (16-32 chars)
   * @param {boolean} [options.verbose] - Enable verbose logging
   * @param {boolean} [options.replayProtection] - Replay protection (default: true)
   */
  constructor(options = {}) {
    if (!options.secret) {
      throw new Error('FirefliesWebhookHandler requires a secret for HMAC verification');
    }
    this.secret = options.secret;
    this.verbose = options.verbose || false;
    this.replayProtection = options.replayProtection !== false;

    // Event handlers: eventType -> [handler, ...]
    this._handlers = new Map();
  }

  /**
   * Register a handler for a specific Fireflies event type.
   * @param {string} eventType - e.g., 'transcription.complete'
   * @param {Function} handler - Async function(payload) => any
   */
  on(eventType, handler) {
    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, []);
    }
    this._handlers.get(eventType).push(handler);
  }

  /**
   * Verify the HMAC signature and process an incoming Fireflies webhook event.
   * @param {Object} headers - HTTP request headers (keys lowercased or as-received)
   * @param {string|Buffer} body - Raw request body (must be the exact bytes sent by Fireflies)
   * @returns {Promise<Object>} Processing result
   */
  async handleEvent(headers, body) {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body || '', 'utf8');

    // Step 1: Extract and verify HMAC signature
    const signatureHeader =
      headers['x-hub-signature'] ||
      headers['X-Hub-Signature'] ||
      headers['x-hub-signature-256'] ||
      headers['X-Hub-Signature-256'];

    if (!signatureHeader) {
      return { success: false, error: 'Missing x-hub-signature header' };
    }

    const signatureValid = this.verifySignature(rawBody, signatureHeader);
    if (!signatureValid) {
      return { success: false, error: 'HMAC signature verification failed - payload may be tampered' };
    }

    // Step 2: Replay protection via body fingerprint
    if (this.replayProtection) {
      const fingerprint = this._computeFingerprint(rawBody);
      if (this._isReplay(fingerprint)) {
        return { success: false, error: 'Replay detected - duplicate webhook payload' };
      }
      this._recordFingerprint(fingerprint);
    }

    // Step 3: Parse payload and extract event type
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      return { success: false, error: `Failed to parse webhook payload: ${err.message}` };
    }

    // Fireflies payload shape: { meetingId, eventType, clientReferenceId? }
    const eventType = payload.eventType || payload.event_type || 'unknown';

    if (this.verbose) {
      console.error(`[fireflies-webhook] Processing event: ${eventType} (meetingId: ${payload.meetingId || 'n/a'})`);
    }

    // Step 4: Dispatch to registered handlers
    const handlers = this._handlers.get(eventType) || [];

    if (handlers.length === 0 && this.verbose) {
      console.error(`[fireflies-webhook] No handlers registered for event type: ${eventType}`);
    }

    const results = [];
    for (const handler of handlers) {
      try {
        const result = await handler(payload);
        results.push({ handler: handler.name || 'anonymous', success: true, result });
      } catch (err) {
        results.push({ handler: handler.name || 'anonymous', success: false, error: err.message });
      }
    }

    return {
      success: true,
      eventType,
      meetingId: payload.meetingId || null,
      clientReferenceId: payload.clientReferenceId || null,
      handlersExecuted: results.length,
      results
    };
  }

  /**
   * Verify the HMAC SHA-256 signature of a webhook payload.
   * Computes HMAC SHA-256 of the raw payload body using the shared secret,
   * then does a constant-time comparison against the x-hub-signature header value.
   *
   * Fireflies sends the signature as:
   *   x-hub-signature: sha256=<hex-digest>
   * or sometimes just the raw hex without prefix.
   *
   * @param {string|Buffer} payload - Raw request body (exact bytes)
   * @param {string} signature - Value of x-hub-signature header
   * @returns {boolean} True if signature is valid
   */
  verifySignature(payload, signature) {
    try {
      const rawBody = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');

      // Strip optional "sha256=" prefix
      const sigHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;

      // Compute expected HMAC
      const expectedHmac = crypto
        .createHmac('sha256', this.secret)
        .update(rawBody)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      const expectedBuf = Buffer.from(expectedHmac, 'hex');
      const receivedBuf = Buffer.from(sigHex, 'hex');

      if (expectedBuf.length !== receivedBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, receivedBuf);
    } catch (err) {
      if (this.verbose) {
        console.error(`[fireflies-webhook] Signature verification error: ${err.message}`);
      }
      return false;
    }
  }

  // ── Private Helpers ──

  _computeFingerprint(body) {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    return crypto.createHash('sha256').update(rawBody).digest('hex');
  }

  _isReplay(fingerprint) {
    this._cleanupReplayCache();
    return _replayCache.has(fingerprint);
  }

  _recordFingerprint(fingerprint) {
    _replayCache.set(fingerprint, Date.now());
  }

  _cleanupReplayCache() {
    const cutoff = Date.now() - REPLAY_TTL_MS;
    for (const [key, timestamp] of _replayCache) {
      if (timestamp < cutoff) _replayCache.delete(key);
    }
  }

  /**
   * Return the set of currently documented Fireflies webhook event types.
   * @returns {Object} Map of event type to description
   */
  static getSupportedEvents() {
    return {
      'transcription.complete': 'Transcription and AI summary are ready for a meeting'
    };
  }
}

module.exports = { FirefliesWebhookHandler };
