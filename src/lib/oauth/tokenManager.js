'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { AgentError } = require('../errors');

// Simple encrypted file cache (optional)
function encrypt(text, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64, key) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

class TokenManager {
  constructor({
    clientId,
    clientSecret,
    refreshToken,
    tokenURL = 'https://api.hubapi.com/oauth/v1/token',
    skewSeconds = 300,
    cacheProvider,
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.tokenURL = tokenURL;
    this.skewSeconds = skewSeconds;
    this.cache = cacheProvider || null;
    this.current = null; // { access_token, expires_at }
  }

  _now() { return Math.floor(Date.now() / 1000); }

  async getAccessToken() {
    if (this.current && this.current.expires_at - this.skewSeconds > this._now()) {
      return this.current.access_token;
    }
    if (this.cache && !this.current) {
      const cached = await this.cache.get('hubspot_token');
      if (cached) {
        try {
          this.current = JSON.parse(cached);
        } catch (_) {}
      }
    }
    if (!this.current || this.current.expires_at - this.skewSeconds <= this._now()) {
      await this.refresh();
    }
    return this.current.access_token;
  }

  async refresh() {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('refresh_token', this.refreshToken);
      const res = await axios.post(this.tokenURL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });
      const body = res.data;
      const ttl = body.expires_in || 1800;
      this.current = {
        access_token: body.access_token,
        expires_at: this._now() + ttl,
      };
      if (this.cache) {
        await this.cache.set('hubspot_token', JSON.stringify(this.current), ttl - 60);
      }
      return this.current.access_token;
    } catch (err) {
      throw new AgentError('OAUTH_REFRESH_FAILED', 'Failed to refresh HubSpot OAuth token', {
        status: err.response && err.response.status,
        data: err.response && err.response.data,
        hint: 'Check client/secret/refresh token and app install scopes.',
      });
    }
  }
}

class FileCache {
  constructor(path, encKeyB64) {
    this.path = path;
    this.key = encKeyB64 ? Buffer.from(encKeyB64, 'base64') : null;
  }
  async get() {
    const fs = require('fs');
    if (!fs.existsSync(this.path)) return null;
    const raw = fs.readFileSync(this.path, 'utf8');
    if (!this.key) return raw;
    return decrypt(raw, this.key);
  }
  async set(_, value) {
    const fs = require('fs');
    const dir = require('path').dirname(this.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out = this.key ? encrypt(value, this.key) : value;
    fs.writeFileSync(this.path, out, 'utf8');
  }
}

module.exports = { TokenManager, FileCache };

