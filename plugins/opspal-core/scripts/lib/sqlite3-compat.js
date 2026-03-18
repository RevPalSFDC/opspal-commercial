#!/usr/bin/env node

/**
 * sqlite3 compatibility layer backed by better-sqlite3.
 *
 * Provides the subset of sqlite3 callback APIs used by OpsPal trackers:
 * - new Database(path, callback)
 * - serialize(fn)
 * - run(sql, [params], [callback])
 * - get(sql, [params], callback)
 * - all(sql, [params], callback)
 * - close([callback])
 */

'use strict';

const BetterSqlite3 = require('better-sqlite3');

function normalizeArgs(params, callback) {
  if (typeof params === 'function') {
    return { params: undefined, callback: params };
  }
  return { params, callback };
}

function runWithParams(stmt, params, method) {
  if (params === undefined) {
    return stmt[method]();
  }

  if (Array.isArray(params)) {
    return stmt[method](...params);
  }

  return stmt[method](params);
}

class Database {
  constructor(filePath, callback) {
    this.filePath = filePath;
    this._db = null;

    try {
      this._db = new BetterSqlite3(filePath);
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null));
      }
    } catch (error) {
      if (typeof callback === 'function') {
        process.nextTick(() => callback(error));
      } else {
        throw error;
      }
    }
  }

  serialize(fn) {
    if (typeof fn === 'function') fn();
    return this;
  }

  run(sql, params, callback) {
    const parsed = normalizeArgs(params, callback);

    try {
      const stmt = this._db.prepare(sql);
      const info = runWithParams(stmt, parsed.params, 'run');

      if (typeof parsed.callback === 'function') {
        parsed.callback.call(
          {
            lastID: Number(info.lastInsertRowid || 0),
            changes: Number(info.changes || 0)
          },
          null
        );
      }

      return this;
    } catch (error) {
      if (typeof parsed.callback === 'function') {
        parsed.callback(error);
        return this;
      }
      throw error;
    }
  }

  get(sql, params, callback) {
    const parsed = normalizeArgs(params, callback);

    try {
      const stmt = this._db.prepare(sql);
      const row = runWithParams(stmt, parsed.params, 'get');

      if (typeof parsed.callback === 'function') {
        parsed.callback(null, row);
        return this;
      }

      return row;
    } catch (error) {
      if (typeof parsed.callback === 'function') {
        parsed.callback(error);
        return this;
      }
      throw error;
    }
  }

  all(sql, params, callback) {
    const parsed = normalizeArgs(params, callback);

    try {
      const stmt = this._db.prepare(sql);
      const rows = runWithParams(stmt, parsed.params, 'all');

      if (typeof parsed.callback === 'function') {
        parsed.callback(null, rows || []);
        return this;
      }

      return rows || [];
    } catch (error) {
      if (typeof parsed.callback === 'function') {
        parsed.callback(error);
        return this;
      }
      throw error;
    }
  }

  close(callback) {
    try {
      if (this._db) {
        this._db.close();
      }

      if (typeof callback === 'function') callback(null);
      return this;
    } catch (error) {
      if (typeof callback === 'function') {
        callback(error);
        return this;
      }
      throw error;
    }
  }
}

function verbose() {
  return module.exports;
}

module.exports = {
  Database,
  verbose
};
