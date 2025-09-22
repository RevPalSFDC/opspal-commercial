/**
 * DataAccessError - Custom Error Class for Data Access Failures
 *
 * Purpose: Enforces fail-fast behavior when real data cannot be accessed
 * This prevents the system from falling back to mock/fake/synthetic data
 */

class DataAccessError extends Error {
    constructor(source, reason, details = {}) {
        const message = `DATA ACCESS FAILURE: ${source} ${reason}. No mock or fabricated data used.`;
        super(message);

        this.name = 'DataAccessError';
        this.source = source;
        this.reason = reason;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.traceId = this.generateTraceId();

        // Log to STDERR with full context
        console.error(JSON.stringify({
            error: this.name,
            message: this.message,
            source: this.source,
            reason: this.reason,
            details: this.details,
            timestamp: this.timestamp,
            traceId: this.traceId,
            stack: this.stack
        }, null, 2));

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DataAccessError);
        }
    }

    generateTraceId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            source: this.source,
            reason: this.reason,
            details: this.details,
            timestamp: this.timestamp,
            traceId: this.traceId
        };
    }
}

/**
 * Helper function to validate data access and throw on failure
 */
function requireRealData(dataSource, data, context = {}) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new DataAccessError(
            dataSource,
            'No data returned',
            context
        );
    }

    // Check for common mock data patterns
    const mockPatterns = [
        /example\s*(corp|company|inc)/i,
        /test\s*\d+/i,
        /sample\s*data/i,
        /lorem\s*ipsum/i,
        /john\s*doe/i,
        /jane\s*smith/i,
        /^(Lead|Contact|Account)\s*\d+$/i,
        /00[A-Z]000000000000[A-Z0-9]{3}/  // Fake Salesforce IDs
    ];

    const dataStr = JSON.stringify(data);
    for (const pattern of mockPatterns) {
        if (pattern.test(dataStr)) {
            throw new DataAccessError(
                dataSource,
                'Detected mock/synthetic data pattern',
                {
                    pattern: pattern.toString(),
                    sample: dataStr.substring(0, 200),
                    ...context
                }
            );
        }
    }

    return data;
}

module.exports = {
    DataAccessError,
    requireRealData
};