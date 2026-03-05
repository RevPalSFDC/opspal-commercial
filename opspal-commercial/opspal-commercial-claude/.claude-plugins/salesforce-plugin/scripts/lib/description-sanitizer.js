#!/usr/bin/env node

/**
 * Description Sanitizer
 *
 * Sanitizes and summarizes descriptions extracted from Salesforce automation metadata.
 * Filters out code blocks, credentials, and sensitive data while preserving meaningful content.
 *
 * Features:
 * - Code block detection and removal (if/for/while, variable assignments)
 * - Credential pattern detection (Authorization headers, API keys, tokens)
 * - Sensitive data filtering (emails, URLs with tokens, IDs)
 * - Smart truncation to first sentence or 200 chars
 * - Key phrase extraction from verbose JavaDoc
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

class DescriptionSanitizer {
    constructor(options = {}) {
        this.maxLength = options.maxLength || 200;
        this.verbose = options.verbose || false;

        // Sensitive pattern detection
        this.codePatterns = [
            /\bif\s*\(/gi,
            /\bfor\s*\(/gi,
            /\bwhile\s*\(/gi,
            /\b(public|private|protected)\s+(class|void|static)/gi,
            /[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*[^;]+;/g, // Variable assignments
            /\{[^}]{20,}\}/g, // Code blocks
            /\([^)]{30,}\)/g  // Long method signatures
        ];

        this.credentialPatterns = [
            /Authorization:\s*Bearer\s+[A-Za-z0-9_\-\.]+/gi,
            /Authorization:\s*Basic\s+[A-Za-z0-9+\/=]+/gi,
            /api[_-]?key[:=]\s*['"]?[A-Za-z0-9_\-\.]+['"]?/gi,
            /token[:=]\s*['"]?[A-Za-z0-9_\-\.]+['"]?/gi,
            /password[:=]\s*['"]?[^'"]+['"]?/gi,
            /secret[:=]\s*['"]?[A-Za-z0-9_\-\.]+['"]?/gi,
            /access[_-]?token[:=]\s*['"]?[A-Za-z0-9_\-\.]+['"]?/gi
        ];

        this.sensitiveDataPatterns = [
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
            /https?:\/\/[^\s]+\?[^\s]*token[^\s]*/gi, // URLs with tokens
            /\b[0-9A-Za-z]{15,18}\b/g, // Salesforce IDs (15 or 18 chars)
            /\b\d{3}-\d{2}-\d{4}\b/g, // SSN patterns
            /\b\d{16}\b/g // Credit card patterns
        ];

        // Key phrase extraction patterns
        this.keyPhrasePatterns = [
            /^([^.!?]+[.!?])/,  // First sentence
            /(?:this|the)\s+(?:class|trigger|flow|workflow)\s+([^.!?]+)/i,
            /(?:handles?|manages?|processes?|performs?)\s+([^.!?]+)/i,
            /(?:used|responsible)\s+(?:for|to)\s+([^.!?]+)/i
        ];
    }

    /**
     * Sanitize description text
     * @param {string} description - Raw description text
     * @param {string} automationType - Type of automation (for context)
     * @returns {string} Sanitized description
     */
    sanitize(description, automationType = 'Unknown') {
        if (!description || typeof description !== 'string') {
            return null;
        }

        // Step 1: Check for code blocks and credentials
        const hasCodeBlocks = this.containsCodeBlocks(description);
        const hasCredentials = this.containsCredentials(description);
        const hasSensitiveData = this.containsSensitiveData(description);

        if (this.verbose) {
            console.log(`[${automationType}] Sanitization checks:`);
            console.log(`  - Code blocks: ${hasCodeBlocks}`);
            console.log(`  - Credentials: ${hasCredentials}`);
            console.log(`  - Sensitive data: ${hasSensitiveData}`);
        }

        // Step 2: If description contains dangerous patterns, extract key phrase only
        if (hasCodeBlocks || hasCredentials || hasSensitiveData) {
            const keyPhrase = this.extractKeyPhrase(description);
            if (keyPhrase) {
                if (this.verbose) {
                    console.log(`  → Extracted key phrase: "${keyPhrase}"`);
                }
                return this.truncate(keyPhrase, this.maxLength);
            }

            // If no key phrase found, return safe fallback
            return `${automationType} automation`;
        }

        // Step 3: If description is clean but verbose, summarize
        if (description.length > this.maxLength) {
            const summary = this.summarize(description);
            if (this.verbose) {
                console.log(`  → Summarized from ${description.length} to ${summary.length} chars`);
            }
            return summary;
        }

        // Step 4: Description is clean and concise, return as-is
        return description;
    }

    /**
     * Check if text contains code blocks
     * @param {string} text - Text to check
     * @returns {boolean} True if code blocks detected
     */
    containsCodeBlocks(text) {
        return this.codePatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check if text contains credentials
     * @param {string} text - Text to check
     * @returns {boolean} True if credentials detected
     */
    containsCredentials(text) {
        return this.credentialPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Check if text contains sensitive data
     * @param {string} text - Text to check
     * @returns {boolean} True if sensitive data detected
     */
    containsSensitiveData(text) {
        return this.sensitiveDataPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Extract key phrase from text using pattern matching
     * @param {string} text - Text to extract from
     * @returns {string|null} Key phrase or null
     */
    extractKeyPhrase(text) {
        // Try each pattern in order of preference
        for (const pattern of this.keyPhrasePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                // Clean up the matched phrase
                let phrase = match[1].trim();

                // Remove any remaining code patterns
                phrase = phrase.replace(/\{[^}]*\}/g, '');
                phrase = phrase.replace(/\([^)]{20,}\)/g, '');

                // If phrase is still meaningful after cleaning
                if (phrase.length > 10 && !this.containsCodeBlocks(phrase)) {
                    return phrase;
                }
            }
        }

        // Fallback: try to get first clean sentence
        const sentences = text.split(/[.!?]+/);
        for (const sentence of sentences) {
            const clean = sentence.trim();
            if (clean.length > 10 &&
                !this.containsCodeBlocks(clean) &&
                !this.containsCredentials(clean) &&
                !this.containsSensitiveData(clean)) {
                return clean;
            }
        }

        return null;
    }

    /**
     * Summarize long description
     * @param {string} text - Text to summarize
     * @returns {string} Summarized text
     */
    summarize(text) {
        // Strategy 1: Extract first sentence if it's meaningful
        const firstSentenceMatch = text.match(/^([^.!?]+[.!?])/);
        if (firstSentenceMatch) {
            const firstSentence = firstSentenceMatch[1].trim();
            if (firstSentence.length <= this.maxLength && firstSentence.length > 20) {
                return firstSentence;
            }
        }

        // Strategy 2: Try to extract key phrase
        const keyPhrase = this.extractKeyPhrase(text);
        if (keyPhrase && keyPhrase.length <= this.maxLength) {
            return keyPhrase;
        }

        // Strategy 3: Truncate to maxLength and add ellipsis
        return this.truncate(text, this.maxLength);
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }

        // Try to truncate at sentence boundary
        const truncated = text.substring(0, maxLength);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentenceEnd > maxLength * 0.5) {
            // If we can preserve >50% of maxLength and end at sentence boundary
            return truncated.substring(0, lastSentenceEnd + 1).trim();
        }

        // Otherwise truncate at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.75) {
            return truncated.substring(0, lastSpace).trim() + '...';
        }

        // Fallback: hard truncate
        return truncated.trim() + '...';
    }

    /**
     * Sanitize multiple descriptions
     * @param {Array<Object>} automations - Array of automation objects with description property
     * @param {string} descriptionField - Field name containing description (default: 'description')
     * @returns {Array<Object>} Automations with sanitized descriptions
     */
    sanitizeAll(automations, descriptionField = 'description') {
        if (!Array.isArray(automations)) {
            return [];
        }

        return automations.map(automation => {
            if (automation[descriptionField]) {
                const sanitized = this.sanitize(
                    automation[descriptionField],
                    automation.automationType || automation.type || 'Unknown'
                );

                return {
                    ...automation,
                    [descriptionField]: sanitized,
                    [`${descriptionField}_original_length`]: automation[descriptionField]?.length || 0,
                    [`${descriptionField}_sanitized`]: sanitized !== automation[descriptionField]
                };
            }
            return automation;
        });
    }
}

module.exports = DescriptionSanitizer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node description-sanitizer.js <description> [--verbose]');
        console.log('');
        console.log('Sanitizes description text by removing code blocks, credentials, and sensitive data.');
        console.log('');
        console.log('Options:');
        console.log('  --verbose - Show detailed sanitization information');
        console.log('');
        console.log('Example:');
        console.log('  node description-sanitizer.js "This class handles user authentication. if (user != null) { ... }" --verbose');
        process.exit(1);
    }

    const description = args[0];
    const verbose = args.includes('--verbose');

    const sanitizer = new DescriptionSanitizer({ verbose });
    const result = sanitizer.sanitize(description, 'ApexClass');

    console.log('\n=== Description Sanitization Result ===\n');
    console.log(`Original length: ${description.length} characters`);
    console.log(`Sanitized length: ${result?.length || 0} characters`);
    console.log('');
    console.log('Original:');
    console.log(description);
    console.log('');
    console.log('Sanitized:');
    console.log(result || '(none)');
    console.log('');
}
