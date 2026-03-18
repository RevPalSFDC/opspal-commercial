'use strict';

const { createHmac, timingSafeEqual } = require('crypto');

const MAX_TIMESTAMP_AGE_MS = 300000; // 5 minutes

/**
 * Validates HubSpot webhook signature v3 (HMAC-SHA256).
 * v3 = HMAC-SHA256(clientSecret, METHOD + URI + body + timestamp)
 *
 * @param {object} opts
 * @param {string} opts.clientSecret
 * @param {string} opts.method       - HTTP method, uppercase (e.g. "POST")
 * @param {string} opts.uri          - Full request URI including query string
 * @param {string|Buffer} opts.body  - Raw request body (string or Buffer)
 * @param {string|number} opts.timestamp - Unix epoch ms from X-HubSpot-Signature-Timestamp
 * @param {string} opts.signature    - Value of X-HubSpot-Signature-v3 header (base64)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSignatureV3({ clientSecret, method, uri, body, timestamp, signature }) {
  if (!clientSecret) return { valid: false, error: 'clientSecret is required' };
  if (!signature)    return { valid: false, error: 'signature is required' };
  if (!timestamp)    return { valid: false, error: 'timestamp is required' };

  const ts = Number(timestamp);
  if (isNaN(ts)) return { valid: false, error: 'timestamp must be numeric' };

  const age = Date.now() - ts;
  if (age > MAX_TIMESTAMP_AGE_MS || age < 0) {
    return { valid: false, error: `timestamp out of acceptable range (age: ${age}ms)` };
  }

  const rawBody  = Buffer.isBuffer(body) ? body.toString('utf8') : (body || '');
  const message  = `${(method || '').toUpperCase()}${uri || ''}${rawBody}${ts}`;
  const expected = createHmac('sha256', clientSecret).update(message).digest('base64');

  try {
    const sigBuf = Buffer.from(signature, 'base64');
    const expBuf = Buffer.from(expected, 'base64');
    if (sigBuf.length !== expBuf.length) return { valid: false, error: 'signature mismatch' };
    const valid = timingSafeEqual(sigBuf, expBuf);
    return valid ? { valid: true } : { valid: false, error: 'signature mismatch' };
  } catch {
    return { valid: false, error: 'signature comparison failed' };
  }
}

/**
 * Validates HubSpot webhook signature v2 (HMAC-SHA256).
 * v2 = HMAC-SHA256(clientSecret, URI + body)
 *
 * @param {object} opts
 * @param {string} opts.clientSecret
 * @param {string} opts.uri          - Full request URI including query string
 * @param {string|Buffer} opts.body  - Raw request body
 * @param {string} opts.signature    - Value of X-HubSpot-Signature header (hex)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSignatureV2({ clientSecret, uri, body, signature }) {
  if (!clientSecret) return { valid: false, error: 'clientSecret is required' };
  if (!signature)    return { valid: false, error: 'signature is required' };

  const rawBody  = Buffer.isBuffer(body) ? body.toString('utf8') : (body || '');
  const message  = `${uri || ''}${rawBody}`;
  const expected = createHmac('sha256', clientSecret).update(message).digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return { valid: false, error: 'signature mismatch' };
    const valid = timingSafeEqual(sigBuf, expBuf);
    return valid ? { valid: true } : { valid: false, error: 'signature mismatch' };
  } catch {
    return { valid: false, error: 'signature comparison failed' };
  }
}

/**
 * Auto-detect signature version from request headers and validate.
 *
 * @param {object} opts
 * @param {string}  opts.clientSecret
 * @param {object}  opts.request         - Request-like object with headers, method, url/uri, body
 * @param {number}  [opts.version]       - Force a specific version (1|2|3); auto-detected if omitted
 * @returns {{ valid: boolean, version?: number, error?: string }}
 */
function validateSignature({ clientSecret, request, version } = {}) {
  if (!clientSecret) return { valid: false, error: 'clientSecret is required' };
  if (!request)      return { valid: false, error: 'request is required' };

  const headers   = request.headers || {};
  const getHeader = (name) => headers[name] || headers[name.toLowerCase()];

  const sigV3        = getHeader('x-hubspot-signature-v3');
  const sigLegacy    = getHeader('x-hubspot-signature');
  const tsHeader     = getHeader('x-hubspot-request-timestamp') || getHeader('x-hubspot-signature-timestamp');
  const detectedVer  = version || (sigV3 ? 3 : sigLegacy ? 2 : null);

  if (!detectedVer) return { valid: false, error: 'no HubSpot signature header found' };

  const uri  = request.uri || request.url || '';
  const body = request.body || '';

  if (detectedVer === 3) {
    const result = validateSignatureV3({
      clientSecret,
      method:    request.method || 'POST',
      uri,
      body,
      timestamp: tsHeader,
      signature: sigV3,
    });
    return { ...result, version: 3 };
  }

  if (detectedVer === 2) {
    const result = validateSignatureV2({ clientSecret, uri, body, signature: sigLegacy });
    return { ...result, version: 2 };
  }

  return { valid: false, error: `unsupported signature version: ${detectedVer}` };
}

/**
 * Returns an Express-compatible middleware that validates HubSpot webhook signatures.
 * Rejects requests with 401 if the signature is missing, expired, or invalid.
 *
 * IMPORTANT: Mount this middleware BEFORE any body-parser middleware, or ensure
 * `req.rawBody` (Buffer/string) is populated for accurate signature verification.
 *
 * @param {string} clientSecret  - HubSpot app client secret
 * @param {object} [options]
 * @param {number} [options.version]           - Force signature version (default: auto)
 * @param {boolean} [options.requireTimestamp] - Reject if timestamp header absent (default: true for v3)
 * @returns {function} Express middleware (req, res, next)
 */
function createMiddleware(clientSecret, options = {}) {
  if (!clientSecret) throw new Error('clientSecret is required for webhook middleware');

  return function hubspotSignatureMiddleware(req, res, next) {
    const body = req.rawBody || req.body || '';

    const result = validateSignature({
      clientSecret,
      request: {
        headers: req.headers,
        method:  req.method,
        uri:     `${req.protocol}://${req.get('host')}${req.originalUrl}`,
        body,
      },
      version: options.version,
    });

    if (!result.valid) {
      return res.status(401).json({
        error:   'Webhook signature validation failed',
        message: result.error || 'Invalid signature',
      });
    }

    next();
  };
}

module.exports = {
  MAX_TIMESTAMP_AGE_MS,
  validateSignatureV3,
  validateSignatureV2,
  validateSignature,
  createMiddleware,
};
