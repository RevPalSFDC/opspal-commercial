'use strict';

const axios = require('axios');
const { TokenManager, FileCache } = require('../lib/oauth/tokenManager');
const { AgentError } = require('../lib/errors');

function buildTokenManagerFromEnv(env = process.env) {
  const clientId = env.HUBSPOT_CLIENT_ID;
  const clientSecret = env.HUBSPOT_CLIENT_SECRET;
  const refreshToken = env.HUBSPOT_REFRESH_TOKEN;
  const cacheFile = env.TOKEN_CACHE_FILE || '.cache/hubspot_token.json';
  const encKey = env.TOKEN_CACHE_KEY; // base64, optional

  if (!clientId || !clientSecret || !refreshToken) {
    throw new AgentError('CONFIG_MISSING', 'Missing OAuth env vars HUBSPOT_CLIENT_ID/SECRET/REFRESH_TOKEN');
  }
  const cache = new FileCache(cacheFile, encKey);
  return new TokenManager({ clientId, clientSecret, refreshToken, cacheProvider: cache });
}

async function createHubSpotClient({ baseURL, tokenManager } = {}) {
  const tm = tokenManager || buildTokenManagerFromEnv();
  const instance = axios.create({
    baseURL: baseURL || 'https://api.hubapi.com',
    timeout: 20000,
  });

  instance.interceptors.request.use(async (config) => {
    const token = await tm.getAccessToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  instance.interceptors.response.use(
    (res) => res,
    async (error) => {
      const status = error.response && error.response.status;
      if (status === 401 || status === 403) {
        try {
          await tm.refresh();
          const cfg = error.config;
          cfg._retry = (cfg._retry || 0) + 1;
          if (cfg._retry <= 1) return instance(cfg);
        } catch (_) { /* fallthrough */ }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

module.exports = { createHubSpotClient, buildTokenManagerFromEnv };

