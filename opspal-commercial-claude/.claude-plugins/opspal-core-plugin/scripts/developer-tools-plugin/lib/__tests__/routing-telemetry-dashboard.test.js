/**
 * routing-telemetry-dashboard.test.js
 *
 * Tests for TelemetryDashboard class
 */

const fs = require('fs');
const path = require('path');

// Create a mock DataAccessError class
class MockDataAccessError extends Error {
  constructor(source, message, context) {
    super(message);
    this.source = source;
    this.context = context;
  }
}

jest.mock('fs');

// Mock the cross-platform-plugin dependency using literal path
jest.mock('../../../../cross-platform-plugin/scripts/lib/data-access-error', () => ({
  DataAccessError: MockDataAccessError
}), { virtual: true });

const TelemetryDashboard = require('../routing-telemetry-dashboard');

describe('TelemetryDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no log files exist
    fs.existsSync.mockReturnValue(false);
  });

  describe('constructor', () => {
    it('should create instance with empty arrays when no logs exist', () => {
      const dashboard = new TelemetryDashboard();

      expect(dashboard.decisions).toEqual([]);
      expect(dashboard.reportService).toEqual([]);
      expect(dashboard.matchMergeService).toEqual([]);
    });

    it('should load existing log files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"decision":"service","concern":"reports"}\n{"decision":"local","concern":"data"}');

      const dashboard = new TelemetryDashboard();

      expect(dashboard.decisions.length).toBe(2);
    });
  });

  describe('loadLog', () => {
    it('should return empty array for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const result = dashboard.loadLog('/nonexistent/path.jsonl');

      expect(result).toEqual([]);
    });

    it('should parse JSONL content correctly', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"id":1}\n{"id":2}\n{"id":3}');

      const dashboard = new TelemetryDashboard();
      const result = dashboard.loadLog('/test/log.jsonl');

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('should skip invalid JSON lines', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"id":1}\ninvalid json\n{"id":2}');

      const dashboard = new TelemetryDashboard();
      const result = dashboard.loadLog('/test/log.jsonl');

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should skip empty lines', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"id":1}\n\n\n{"id":2}\n');

      const dashboard = new TelemetryDashboard();
      const result = dashboard.loadLog('/test/log.jsonl');

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should throw DataAccessError on file read failure', () => {
      // First let constructor succeed
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      // Now set up for failure
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => dashboard.loadLog('/test/protected.jsonl')).toThrow('Permission denied');
    });
  });

  describe('percentile', () => {
    let dashboard;

    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      dashboard = new TelemetryDashboard();
    });

    it('should return null for empty array', () => {
      expect(dashboard.percentile([], 0.95)).toBeNull();
    });

    it('should calculate p95 correctly', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const p95 = dashboard.percentile(data, 0.95);

      expect(p95).toBe(19);
    });

    it('should calculate p99 correctly', () => {
      const data = Array.from({ length: 100 }, (_, i) => i + 1);
      const p99 = dashboard.percentile(data, 0.99);

      expect(p99).toBe(99);
    });

    it('should handle unsorted input', () => {
      const data = [5, 1, 3, 2, 4];
      const p50 = dashboard.percentile(data, 0.5);

      expect(p50).toBe(3);
    });

    it('should handle single element', () => {
      expect(dashboard.percentile([42], 0.95)).toBe(42);
    });
  });

  describe('checkSLA', () => {
    let dashboard;

    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      dashboard = new TelemetryDashboard();
    });

    it('should return no_data for empty log', () => {
      const result = dashboard.checkSLA([], 2500, 0.98);

      expect(result.compliant).toBeNull();
      expect(result.reason).toBe('no_data');
    });

    it('should return compliant when SLA is met', () => {
      const log = [
        { latency_ms: 100, success: true },
        { latency_ms: 200, success: true },
        { latency_ms: 300, success: true },
        { latency_ms: 400, success: true },
        { latency_ms: 500, success: true }
      ];

      const result = dashboard.checkSLA(log, 2500, 0.98);

      expect(result.compliant).toBe(true);
      expect(result.success_rate).toBe(1);
    });

    it('should return non-compliant when latency exceeds SLA', () => {
      const log = [
        { latency_ms: 3000, success: true },
        { latency_ms: 3000, success: true },
        { latency_ms: 3000, success: true }
      ];

      const result = dashboard.checkSLA(log, 2500, 0.98);

      expect(result.compliant).toBe(false);
    });

    it('should return non-compliant when success rate below target', () => {
      const log = [
        { latency_ms: 100, success: true },
        { latency_ms: 100, success: false },
        { latency_ms: 100, success: false }
      ];

      const result = dashboard.checkSLA(log, 2500, 0.98);

      expect(result.compliant).toBe(false);
      expect(result.success_rate).toBeCloseTo(0.333, 2);
    });
  });

  describe('generateSummary', () => {
    it('should generate summary with zero data', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const summary = dashboard.generateSummary();

      expect(summary.total_routing_decisions).toBe(0);
      expect(summary.service_adoption_rate).toBe(0);
      expect(summary.total_service_calls).toBe(0);
    });

    it('should calculate adoption rate correctly', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      dashboard.decisions = [
        { decision: 'service', concern: 'reports' },
        { decision: 'service', concern: 'reports' },
        { decision: 'local', concern: 'data' }
      ];

      const summary = dashboard.generateSummary();

      expect(summary.total_routing_decisions).toBe(3);
      expect(summary.service_adoption_rate).toBeCloseTo(0.667, 2);
    });

    it('should include SLA compliance status', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      dashboard.reportService = [
        { latency_ms: 100, success: true }
      ];

      const summary = dashboard.generateSummary();

      expect(summary.sla_compliance.report_service).toBeDefined();
      expect(summary.sla_compliance.match_merge).toBeDefined();
    });
  });

  describe('showAdoptionMetrics', () => {
    it('should handle zero decisions', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showAdoptionMetrics();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Adoption Metrics'));
      consoleSpy.mockRestore();
    });

    it('should calculate correct percentages', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [
        { decision: 'service' },
        { decision: 'local' }
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showAdoptionMetrics();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('50.0%'));
      consoleSpy.mockRestore();
    });
  });

  describe('showRoutingDecisions', () => {
    it('should group decisions by concern', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [
        { decision: 'service', concern: 'reports' },
        { decision: 'local', concern: 'reports' },
        { decision: 'service', concern: 'data' }
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showRoutingDecisions();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('reports:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('data:'));
      consoleSpy.mockRestore();
    });
  });

  describe('showServicePerformance', () => {
    it('should show no data message when logs are empty', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showServicePerformance();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No data'));
      consoleSpy.mockRestore();
    });

    it('should show performance metrics when data exists', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.reportService = [
        { latency_ms: 100, success: true },
        { latency_ms: 200, success: true }
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showServicePerformance();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('p95 latency'));
      consoleSpy.mockRestore();
    });
  });

  describe('showConfidenceDistribution', () => {
    it('should show no data message when confidence data missing', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showConfidenceDistribution();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No confidence data'));
      consoleSpy.mockRestore();
    });

    it('should bin confidence values correctly', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [
        { routing_confidence: 0.1 },
        { routing_confidence: 0.5 },
        { routing_confidence: 0.95 }
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showConfidenceDistribution();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Average confidence'));
      consoleSpy.mockRestore();
    });
  });

  describe('showBypassReasons', () => {
    it('should show 100% adoption message when no local decisions', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [{ decision: 'service' }];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showBypassReasons();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('100% service adoption'));
      consoleSpy.mockRestore();
    });

    it('should aggregate bypass reasons', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [
        { decision: 'local', why: 'offline mode' },
        { decision: 'local', why: 'offline mode' },
        { decision: 'local', why: 'timeout' }
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showBypassReasons();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('offline mode'));
      consoleSpy.mockRestore();
    });

    it('should handle missing why field', () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();
      dashboard.decisions = [{ decision: 'local' }];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      dashboard.showBypassReasons();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown'));
      consoleSpy.mockRestore();
    });
  });

  describe('analyze', () => {
    it('should call all show methods', async () => {
      fs.existsSync.mockReturnValue(false);
      const dashboard = new TelemetryDashboard();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await dashboard.analyze();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Routing Telemetry Dashboard'));
      consoleSpy.mockRestore();
    });
  });
});
