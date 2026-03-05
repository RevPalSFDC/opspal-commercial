/**
 * supervisor-executor.test.js
 *
 * Tests for SupervisorExecutor - executes plans with parallelization,
 * timeouts, fallbacks, and circuit breakers.
 */

const SupervisorExecutor = require('../supervisor-executor');
const { CircuitBreaker, defaultAgentInvoker } = require('../supervisor-executor');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ maxFailures: 3 });
  });

  describe('constructor', () => {
    it('should create with default maxFailures', () => {
      const defaultBreaker = new CircuitBreaker();
      expect(defaultBreaker.maxFailures).toBe(3);
    });

    it('should create with custom maxFailures', () => {
      const customBreaker = new CircuitBreaker({ maxFailures: 5 });
      expect(customBreaker.maxFailures).toBe(5);
    });

    it('should start in closed state', () => {
      expect(breaker.state).toBe('closed');
    });
  });

  describe('recordSuccess', () => {
    it('should reset consecutive failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      expect(breaker.consecutiveFailures).toBe(0);
    });

    it('should transition from half-open to closed', () => {
      breaker.state = 'half-open';
      breaker.recordSuccess();
      expect(breaker.state).toBe('closed');
    });
  });

  describe('recordFailure', () => {
    it('should increment consecutive failures', () => {
      breaker.recordFailure();
      expect(breaker.consecutiveFailures).toBe(1);
    });

    it('should open circuit after max failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.state).toBe('open');
    });
  });

  describe('isOpen', () => {
    it('should return false when closed', () => {
      expect(breaker.isOpen()).toBe(false);
    });

    it('should return true when open', () => {
      breaker.state = 'open';
      expect(breaker.isOpen()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return status object', () => {
      breaker.recordFailure();
      const status = breaker.getStatus();

      expect(status.state).toBe('closed');
      expect(status.consecutiveFailures).toBe(1);
      expect(status.maxFailures).toBe(3);
    });
  });
});

describe('SupervisorExecutor', () => {
  let executor;
  let mockAgentInvoker;

  beforeEach(() => {
    executor = new SupervisorExecutor({
      timeout: 1000,
      retries: 1,
      backoffMs: 100
    });

    mockAgentInvoker = jest.fn().mockResolvedValue({
      agent: 'mock-agent',
      result: 'success'
    });

    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultExecutor = new SupervisorExecutor();
      expect(defaultExecutor.timeout).toBe(60000);
      expect(defaultExecutor.retries).toBe(1);
    });

    it('should accept custom options', () => {
      expect(executor.timeout).toBe(1000);
      expect(executor.backoffMs).toBe(100);
    });

    it('should allow zero retries', () => {
      const noRetryExecutor = new SupervisorExecutor({ retries: 0 });
      expect(noRetryExecutor.retries).toBe(0);
    });
  });

  describe('execute', () => {
    it('should throw for invalid plan structure', async () => {
      await expect(executor.execute(null, mockAgentInvoker))
        .rejects.toThrow('Invalid plan structure');

      await expect(executor.execute({}, mockAgentInvoker))
        .rejects.toThrow('Invalid plan structure');

      await expect(executor.execute({ PLAN: {} }, mockAgentInvoker))
        .rejects.toThrow('Invalid plan structure');
    });

    it('should execute valid plan', async () => {
      const plan = {
        PLAN: {
          parallel_groups: [
            {
              group_id: 'group-1',
              units: [
                { unit_id: 'unit-1', agent_or_tool: 'agent-a', inputs: {} }
              ]
            }
          ]
        }
      };

      const result = await executor.execute(plan, mockAgentInvoker);

      expect(result.success).toBe(true);
      expect(result.groups).toHaveLength(1);
      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should execute multiple groups sequentially', async () => {
      const plan = {
        PLAN: {
          parallel_groups: [
            { group_id: 'group-1', units: [{ unit_id: 'u1', agent_or_tool: 'a', inputs: {} }] },
            { group_id: 'group-2', units: [{ unit_id: 'u2', agent_or_tool: 'b', inputs: {} }] }
          ]
        }
      };

      const result = await executor.execute(plan, mockAgentInvoker);

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].group_id).toBe('group-1');
      expect(result.groups[1].group_id).toBe('group-2');
    });

    it('should trigger circuit breaker after multiple failures', async () => {
      const failingInvoker = jest.fn().mockRejectedValue(new Error('Failed'));
      const failExecutor = new SupervisorExecutor({
        timeout: 100,
        retries: 0,
        maxFailures: 2
      });

      const plan = {
        PLAN: {
          parallel_groups: [
            { group_id: 'g1', units: [{ unit_id: 'u1', agent_or_tool: 'a', inputs: {} }] },
            { group_id: 'g2', units: [{ unit_id: 'u2', agent_or_tool: 'b', inputs: {} }] },
            { group_id: 'g3', units: [{ unit_id: 'u3', agent_or_tool: 'c', inputs: {} }] }
          ]
        }
      };

      const result = await failExecutor.execute(plan, failingInvoker);

      expect(result.circuit_breaker_triggered).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  describe('_executeGroup', () => {
    it('should execute units in parallel', async () => {
      const group = {
        group_id: 'test-group',
        units: [
          { unit_id: 'u1', agent_or_tool: 'agent-1', inputs: {} },
          { unit_id: 'u2', agent_or_tool: 'agent-2', inputs: {} }
        ]
      };

      const result = await executor._executeGroup(group, mockAgentInvoker);

      expect(result.success).toBe(true);
      expect(result.units).toHaveLength(2);
      expect(mockAgentInvoker).toHaveBeenCalledTimes(2);
    });

    it('should mark group as failed if any unit fails', async () => {
      const partialFailInvoker = jest.fn()
        .mockResolvedValueOnce({ result: 'success' })
        .mockRejectedValueOnce(new Error('Failed'));

      const noRetryExecutor = new SupervisorExecutor({ timeout: 100, retries: 0 });

      const group = {
        group_id: 'test-group',
        units: [
          { unit_id: 'u1', agent_or_tool: 'a', inputs: {} },
          { unit_id: 'u2', agent_or_tool: 'b', inputs: {} }
        ]
      };

      const result = await noRetryExecutor._executeGroup(group, partialFailInvoker);

      expect(result.success).toBe(false);
    });
  });

  describe('_executeUnit', () => {
    it('should execute unit successfully', async () => {
      const unit = {
        unit_id: 'test-unit',
        agent_or_tool: 'test-agent',
        inputs: { key: 'value' }
      };

      const result = await executor._executeUnit(unit, mockAgentInvoker);

      expect(result.success).toBe(true);
      expect(result.agent_used).toBe('test-agent');
      expect(result.attempts).toBe(1);
    });

    it('should use fallback on primary failure', async () => {
      const failThenSucceed = jest.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce({ result: 'fallback success' });

      const unit = {
        unit_id: 'test-unit',
        agent_or_tool: 'primary-agent',
        inputs: {},
        fallbacks: [{ fallback: 'fallback-agent' }]
      };

      const result = await executor._executeUnit(unit, failThenSucceed);

      expect(result.success).toBe(true);
      expect(result.agent_used).toBe('fallback-agent');
      expect(result.attempts).toBe(2);
    });

    it('should retry after all fallbacks fail', async () => {
      const failThrice = jest.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('Fallback failed'))
        .mockResolvedValueOnce({ result: 'retry success' });

      const unit = {
        unit_id: 'test-unit',
        agent_or_tool: 'primary-agent',
        inputs: {},
        fallbacks: [{ fallback: 'fallback-agent' }]
      };

      const result = await executor._executeUnit(unit, failThrice);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should fail after all attempts exhausted', async () => {
      const alwaysFail = jest.fn().mockRejectedValue(new Error('Always fails'));
      const noRetryExecutor = new SupervisorExecutor({ timeout: 100, retries: 0 });

      const unit = {
        unit_id: 'test-unit',
        agent_or_tool: 'failing-agent',
        inputs: {}
      };

      const result = await noRetryExecutor._executeUnit(unit, alwaysFail);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Always fails');
    });
  });

  describe('_executeWithTimeout', () => {
    it('should execute within timeout', async () => {
      const quickInvoker = jest.fn().mockResolvedValue({ result: 'quick' });

      const result = await executor._executeWithTimeout('agent', {}, 1000, quickInvoker);

      expect(result.result).toBe('quick');
    });

    it('should reject on timeout', async () => {
      const slowInvoker = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ result: 'slow' }), 500))
      );

      await expect(executor._executeWithTimeout('agent', {}, 50, slowInvoker))
        .rejects.toThrow('Timeout');
    });

    it('should propagate agent errors', async () => {
      const errorInvoker = jest.fn().mockRejectedValue(new Error('Agent error'));

      await expect(executor._executeWithTimeout('agent', {}, 1000, errorInvoker))
        .rejects.toThrow('Agent error');
    });
  });

  describe('_sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await executor._sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('circuit breaker management', () => {
    it('should get circuit breaker status', () => {
      const status = executor.getCircuitBreakerStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('consecutiveFailures');
      expect(status).toHaveProperty('maxFailures');
    });

    it('should reset circuit breaker', () => {
      executor.circuitBreaker.recordFailure();
      executor.circuitBreaker.recordFailure();

      executor.resetCircuitBreaker();

      const status = executor.getCircuitBreakerStatus();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.state).toBe('closed');
    });
  });
});

describe('defaultAgentInvoker', () => {
  it('should return result with expected structure', async () => {
    // Mock Math.random to ensure success
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await defaultAgentInvoker('test-agent', [{ key: 'value' }]);

    expect(result.agent).toBe('test-agent');
    expect(result.result).toContain('Success');
    expect(result.timestamp).toBeDefined();

    mockRandom.mockRestore();
  });

  it('should sometimes fail (simulated)', async () => {
    // Mock Math.random to trigger failure path (fails when random > 0.15 is FALSE)
    // So we need a value <= 0.15 to cause failure
    const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.10);

    await expect(defaultAgentInvoker('test-agent', []))
      .rejects.toThrow('Simulated failure');

    mockRandom.mockRestore();
  });
});
