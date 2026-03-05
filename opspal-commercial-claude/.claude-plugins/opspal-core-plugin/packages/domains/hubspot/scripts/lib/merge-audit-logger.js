/**
 * Merge Audit Logger
 */

const fs = require('fs');
const path = require('path');

class MergeAuditLogger {
  constructor(options = {}) {
    this.portalName = options.portalName || 'default';
    this.logDir = path.join(__dirname, '../../instances', this.portalName, 'merge-audit');
    this.sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    this.operations = [];
    this.startTime = Date.now();
  }

  logBeforeState(op) {
    const entry = { timestamp: new Date().toISOString(), phase: 'before', master: op.masterId, duplicate: op.duplicateId };
    this.operations.push(entry);
    this._writeLog(entry, 'before');
    return entry;
  }

  logMigration(op) {
    const entry = { timestamp: new Date().toISOString(), phase: 'migration', masterId: op.masterId, contactsMoved: op.contactsMoved, dealsMoved: op.dealsMoved };
    this.operations.push(entry);
    this._writeLog(entry, 'migration');
    return entry;
  }

  generateSummary() {
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const summary = { sessionId: this.sessionId, duration: duration + 's', totalOps: this.operations.length };
    fs.writeFileSync(path.join(this.logDir, 'summary-' + this.sessionId + '.json'), JSON.stringify(summary, null, 2));
    return summary;
  }

  _writeLog(entry, phase) {
    fs.appendFileSync(path.join(this.logDir, this.sessionId + '-' + phase + '.jsonl'), JSON.stringify(entry) + '\n');
  }
}

module.exports = MergeAuditLogger;
