/**
 * Retry Handler with Exponential Backoff and Jitter
 * Categorizes errors and implements smart retry strategies
 */

class RetryHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.backoffBase = options.backoffBase || 1000;
        this.maxBackoff = options.maxBackoff || 30000;
        this.jitter = options.jitter !== false;
        
        // Categorized error handling
        this.retryableErrors = new Set([
            'UNABLE_TO_LOCK_ROW',
            'REQUEST_TIMEOUT',
            'CONCURRENT_REQUEST_LIMIT_EXCEEDED',
            'SERVER_UNAVAILABLE',
            'REQUEST_LIMIT_EXCEEDED',
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'ECONNREFUSED',
            'CONCURRENT_BATCH_SAVE_ERRORS'
        ]);
        
        this.fatalErrors = new Set([
            'INVALID_FIELD',
            'INVALID_TYPE',
            'MALFORMED_ID',
            'INVALID_CROSS_REFERENCE_KEY',
            'INVALID_SESSION_ID',
            'INSUFFICIENT_ACCESS',
            'PERMISSION_DENIED'
        ]);
    }

    /**
     * Execute function with smart retry logic
     */
    async executeWithRetry(fn, context = {}) {
        let lastError;
        let attempt = 0;
        
        while (attempt <= this.maxRetries) {
            try {
                // Execute the function
                const result = await fn();
                
                // Success - return result
                if (attempt > 0) {
                    console.log(`✓ Succeeded after ${attempt} retries`);
                }
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Check if error is fatal (non-retryable)
                if (this.isFatalError(error)) {
                    console.error(`✗ Fatal error (no retry): ${error.message}`);
                    throw error;
                }
                
                // Check if error is retryable
                if (!this.isRetryableError(error) && attempt < this.maxRetries) {
                    console.warn(`⚠ Unknown error type, attempting retry: ${error.message}`);
                }
                
                // Check if we've exhausted retries
                if (attempt >= this.maxRetries) {
                    console.error(`✗ Max retries (${this.maxRetries}) exhausted`);
                    throw error;
                }
                
                // Calculate backoff with jitter
                const backoffMs = this.calculateBackoff(attempt);
                
                console.log(`⟳ Retry ${attempt + 1}/${this.maxRetries} after ${backoffMs}ms - ${error.message}`);
                
                // Wait before retry
                await this.sleep(backoffMs);
                attempt++;
            }
        }
        
        throw lastError;
    }

    /**
     * Calculate exponential backoff with optional jitter
     */
    calculateBackoff(attempt) {
        // Exponential backoff: base * 2^attempt
        let backoff = Math.min(
            this.backoffBase * Math.pow(2, attempt),
            this.maxBackoff
        );
        
        // Add jitter to prevent thundering herd
        if (this.jitter) {
            // Random jitter between 0-50% of backoff
            const jitterAmount = backoff * 0.5 * Math.random();
            backoff = backoff - (backoff * 0.25) + jitterAmount;
        }
        
        return Math.round(backoff);
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const errorMessage = error.message || '';
        const errorCode = error.code || '';
        
        // Check against known retryable errors
        for (const retryableError of this.retryableErrors) {
            if (errorMessage.includes(retryableError) || 
                errorCode === retryableError) {
                return true;
            }
        }
        
        // Check HTTP status codes
        if (error.statusCode) {
            // 5xx errors are typically retryable
            if (error.statusCode >= 500 && error.statusCode < 600) {
                return true;
            }
            // 429 Too Many Requests
            if (error.statusCode === 429) {
                return true;
            }
            // 408 Request Timeout
            if (error.statusCode === 408) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Check if error is fatal (non-retryable)
     */
    isFatalError(error) {
        const errorMessage = error.message || '';
        const errorCode = error.code || '';
        
        // Check against known fatal errors
        for (const fatalError of this.fatalErrors) {
            if (errorMessage.includes(fatalError) || 
                errorCode === fatalError) {
                return true;
            }
        }
        
        // Check HTTP status codes
        if (error.statusCode) {
            // 4xx errors (except 429) are typically fatal
            if (error.statusCode >= 400 && 
                error.statusCode < 500 && 
                error.statusCode !== 429 &&
                error.statusCode !== 408) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Categorize error for reporting
     */
    categorizeError(error) {
        if (this.isFatalError(error)) {
            return 'FATAL';
        }
        if (this.isRetryableError(error)) {
            return 'RETRYABLE';
        }
        return 'UNKNOWN';
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Bulk retry with different strategies per error type
     */
    async bulkRetry(items, processFn, options = {}) {
        const results = {
            successful: [],
            failed: [],
            retried: []
        };
        
        const maxConcurrent = options.maxConcurrent || 5;
        const batches = this.chunk(items, maxConcurrent);
        
        for (const batch of batches) {
            const promises = batch.map(async item => {
                try {
                    const result = await this.executeWithRetry(
                        () => processFn(item),
                        { item }
                    );
                    results.successful.push({ item, result });
                } catch (error) {
                    const category = this.categorizeError(error);
                    results.failed.push({ 
                        item, 
                        error: error.message,
                        category 
                    });
                }
            });
            
            await Promise.all(promises);
        }
        
        return results;
    }

    /**
     * Chunk array into batches
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = RetryHandler;