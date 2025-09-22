/**
 * CSV Splitter with Streaming Support
 * Handles large CSV files (>2M records) with memory-safe streaming
 * Enforces Salesforce Bulk API 2.0 limits (150MB per file)
 */

const fs = require('fs');
const path = require('path');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const readline = require('readline');
const { EventEmitter } = require('events');

class CsvSplitter extends EventEmitter {
    constructor(options = {}) {
        super();
        this.maxSizeMB = options.maxSizeMB || 150;
        this.maxSizeBytes = this.maxSizeMB * 1024 * 1024;
        this.maxRowsPerFile = options.maxRowsPerFile || 10000000; // 10M rows max
        this.outputDir = options.outputDir || './tmp/csv-splits';
        this.preserveHeader = options.preserveHeader !== false;
        this.compression = options.compression || false; // Enable gzip if needed
    }

    /**
     * Split CSV by file size with streaming (memory-safe)
     * @param {string} inputPath - Path to input CSV file
     * @param {Object} options - Split options
     * @yields {Object} Information about each split file
     */
    async *splitBySize(inputPath, options = {}) {
        const stats = await fs.promises.stat(inputPath);
        const totalSize = stats.size;

        this.emit('splitStart', {
            file: inputPath,
            totalSize,
            method: 'size',
            maxSizeMB: options.maxSizeMB || this.maxSizeMB
        });

        // Ensure output directory exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        const fileStream = fs.createReadStream(inputPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let currentFileNum = 1;
        let currentSize = 0;
        let currentRows = 0;
        let header = null;
        let currentWriter = null;
        let currentFilePath = null;
        const maxBytes = options.maxSizeBytes || this.maxSizeBytes;

        try {
            for await (const line of rl) {
                const lineSize = Buffer.byteLength(line + '\n', 'utf8');

                // Store header
                if (!header && this.preserveHeader) {
                    header = line;
                }

                // Check if we need a new file
                if (!currentWriter ||
                    (currentSize + lineSize > maxBytes && currentRows > 0)) {

                    // Close previous file if exists
                    if (currentWriter) {
                        currentWriter.end();

                        yield {
                            filePath: currentFilePath,
                            fileNumber: currentFileNum - 1,
                            rows: currentRows,
                            sizeBytes: currentSize,
                            sizeMB: (currentSize / 1024 / 1024).toFixed(2)
                        };

                        this.emit('fileSplit', {
                            file: currentFilePath,
                            rows: currentRows,
                            size: currentSize
                        });
                    }

                    // Create new file
                    currentFilePath = this._generateFilePath(inputPath, currentFileNum);
                    currentWriter = fs.createWriteStream(currentFilePath);
                    currentFileNum++;
                    currentSize = 0;
                    currentRows = 0;

                    // Write header to new file
                    if (header && this.preserveHeader) {
                        currentWriter.write(header + '\n');
                        currentSize += Buffer.byteLength(header + '\n', 'utf8');
                    }
                }

                // Write line to current file
                if (!header || line !== header) {
                    currentWriter.write(line + '\n');
                    currentSize += lineSize;
                    currentRows++;
                }

                // Emit progress
                if (currentRows % 10000 === 0) {
                    this.emit('progress', {
                        currentFile: currentFileNum - 1,
                        currentRows,
                        currentSize
                    });
                }
            }

            // Handle last file
            if (currentWriter) {
                currentWriter.end();

                yield {
                    filePath: currentFilePath,
                    fileNumber: currentFileNum - 1,
                    rows: currentRows,
                    sizeBytes: currentSize,
                    sizeMB: (currentSize / 1024 / 1024).toFixed(2)
                };

                this.emit('fileSplit', {
                    file: currentFilePath,
                    rows: currentRows,
                    size: currentSize
                });
            }

            this.emit('splitComplete', {
                totalFiles: currentFileNum - 1,
                inputFile: inputPath
            });

        } finally {
            rl.close();
            fileStream.destroy();
        }
    }

    /**
     * Split CSV by row count with streaming
     * @param {string} inputPath - Path to input CSV file
     * @param {Object} options - Split options
     * @yields {Object} Information about each split file
     */
    async *splitByRows(inputPath, options = {}) {
        const stats = await fs.promises.stat(inputPath);
        const totalSize = stats.size;
        const maxRows = options.maxRows || 10000;

        this.emit('splitStart', {
            file: inputPath,
            totalSize,
            method: 'rows',
            maxRows
        });

        // Ensure output directory exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        const fileStream = fs.createReadStream(inputPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let currentFileNum = 1;
        let currentRows = 0;
        let header = null;
        let currentWriter = null;
        let currentFilePath = null;
        let currentSize = 0;
        let totalRows = 0;

        try {
            for await (const line of rl) {
                // Store header
                if (!header && this.preserveHeader) {
                    header = line;
                }

                // Check if we need a new file
                if (!currentWriter ||
                    (currentRows >= maxRows && !(!header || line === header))) {

                    // Close previous file if exists
                    if (currentWriter) {
                        currentWriter.end();

                        yield {
                            filePath: currentFilePath,
                            fileNumber: currentFileNum - 1,
                            rows: currentRows,
                            sizeBytes: currentSize,
                            sizeMB: (currentSize / 1024 / 1024).toFixed(2)
                        };

                        this.emit('fileSplit', {
                            file: currentFilePath,
                            rows: currentRows,
                            size: currentSize
                        });
                    }

                    // Create new file
                    currentFilePath = this._generateFilePath(inputPath, currentFileNum);
                    currentWriter = fs.createWriteStream(currentFilePath);
                    currentFileNum++;
                    currentRows = 0;
                    currentSize = 0;

                    // Write header to new file
                    if (header && this.preserveHeader) {
                        const headerLine = header + '\n';
                        currentWriter.write(headerLine);
                        currentSize += Buffer.byteLength(headerLine, 'utf8');
                    }
                }

                // Write line to current file (skip duplicate headers)
                if (!header || line !== header) {
                    const dataLine = line + '\n';
                    currentWriter.write(dataLine);
                    currentSize += Buffer.byteLength(dataLine, 'utf8');
                    currentRows++;
                    totalRows++;
                }

                // Emit progress
                if (totalRows % 10000 === 0) {
                    this.emit('progress', {
                        currentFile: currentFileNum - 1,
                        currentRows,
                        totalRows,
                        currentSize
                    });
                }
            }

            // Handle last file
            if (currentWriter) {
                currentWriter.end();

                yield {
                    filePath: currentFilePath,
                    fileNumber: currentFileNum - 1,
                    rows: currentRows,
                    sizeBytes: currentSize,
                    sizeMB: (currentSize / 1024 / 1024).toFixed(2)
                };

                this.emit('fileSplit', {
                    file: currentFilePath,
                    rows: currentRows,
                    size: currentSize
                });
            }

            this.emit('splitComplete', {
                totalFiles: currentFileNum - 1,
                totalRows,
                inputFile: inputPath
            });

        } finally {
            rl.close();
            fileStream.destroy();
        }
    }

    /**
     * Smart split that considers both size and row limits
     * @param {string} inputPath - Path to input CSV file
     * @param {Object} options - Split options
     * @yields {Object} Information about each split file
     */
    async *smartSplit(inputPath, options = {}) {
        const maxSizeBytes = options.maxSizeBytes || this.maxSizeBytes;
        const maxRows = options.maxRows || this.maxRowsPerFile;

        const stats = await fs.promises.stat(inputPath);
        const totalSize = stats.size;

        this.emit('splitStart', {
            file: inputPath,
            totalSize,
            method: 'smart',
            maxSizeBytes,
            maxRows
        });

        // Ensure output directory exists
        await fs.promises.mkdir(this.outputDir, { recursive: true });

        const fileStream = fs.createReadStream(inputPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let currentFileNum = 1;
        let currentSize = 0;
        let currentRows = 0;
        let header = null;
        let currentWriter = null;
        let currentFilePath = null;
        let totalRows = 0;

        try {
            for await (const line of rl) {
                const lineSize = Buffer.byteLength(line + '\n', 'utf8');

                // Store header
                if (!header && this.preserveHeader) {
                    header = line;
                }

                // Check if we need a new file (size OR row limit)
                const needNewFile = !currentWriter ||
                    (currentSize + lineSize > maxSizeBytes && currentRows > 0) ||
                    (currentRows >= maxRows && !(!header || line === header));

                if (needNewFile) {
                    // Close previous file if exists
                    if (currentWriter) {
                        currentWriter.end();

                        yield {
                            filePath: currentFilePath,
                            fileNumber: currentFileNum - 1,
                            rows: currentRows,
                            sizeBytes: currentSize,
                            sizeMB: (currentSize / 1024 / 1024).toFixed(2),
                            reason: currentSize + lineSize > maxSizeBytes ? 'size_limit' : 'row_limit'
                        };

                        this.emit('fileSplit', {
                            file: currentFilePath,
                            rows: currentRows,
                            size: currentSize
                        });
                    }

                    // Create new file
                    currentFilePath = this._generateFilePath(inputPath, currentFileNum);
                    currentWriter = fs.createWriteStream(currentFilePath);
                    currentFileNum++;
                    currentRows = 0;
                    currentSize = 0;

                    // Write header to new file
                    if (header && this.preserveHeader) {
                        currentWriter.write(header + '\n');
                        currentSize += Buffer.byteLength(header + '\n', 'utf8');
                    }
                }

                // Write line to current file (skip duplicate headers)
                if (!header || line !== header) {
                    currentWriter.write(line + '\n');
                    currentSize += lineSize;
                    currentRows++;
                    totalRows++;
                }

                // Emit progress
                if (totalRows % 10000 === 0) {
                    this.emit('progress', {
                        currentFile: currentFileNum - 1,
                        currentRows,
                        totalRows,
                        currentSize
                    });
                }
            }

            // Handle last file
            if (currentWriter) {
                currentWriter.end();

                yield {
                    filePath: currentFilePath,
                    fileNumber: currentFileNum - 1,
                    rows: currentRows,
                    sizeBytes: currentSize,
                    sizeMB: (currentSize / 1024 / 1024).toFixed(2),
                    reason: 'end_of_file'
                };

                this.emit('fileSplit', {
                    file: currentFilePath,
                    rows: currentRows,
                    size: currentSize
                });
            }

            this.emit('splitComplete', {
                totalFiles: currentFileNum - 1,
                totalRows,
                inputFile: inputPath
            });

        } finally {
            rl.close();
            fileStream.destroy();
        }
    }

    /**
     * Estimate how many split files will be created
     * @param {string} inputPath - Path to input CSV file
     * @param {Object} options - Estimation options
     * @returns {Promise<Object>} Estimation results
     */
    async estimateSplits(inputPath, options = {}) {
        const stats = await fs.promises.stat(inputPath);
        const totalSize = stats.size;
        const maxSizeBytes = options.maxSizeBytes || this.maxSizeBytes;
        const maxRows = options.maxRows || this.maxRowsPerFile;

        // Count lines for accurate estimation
        let lineCount = 0;
        let headerSize = 0;

        const fileStream = fs.createReadStream(inputPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let firstLine = true;
        for await (const line of rl) {
            if (firstLine && this.preserveHeader) {
                headerSize = Buffer.byteLength(line + '\n', 'utf8');
                firstLine = false;
            }
            lineCount++;
        }

        rl.close();
        fileStream.destroy();

        const dataRows = this.preserveHeader ? lineCount - 1 : lineCount;
        const avgLineSize = totalSize / lineCount;

        // Calculate estimates
        const filesBySize = Math.ceil(totalSize / maxSizeBytes);
        const filesByRows = Math.ceil(dataRows / maxRows);
        const estimatedFiles = Math.max(filesBySize, filesByRows);

        return {
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            totalRows: lineCount,
            dataRows,
            avgLineSizeBytes: Math.round(avgLineSize),
            estimatedFiles,
            filesBySize,
            filesByRows,
            estimatedRowsPerFile: Math.ceil(dataRows / estimatedFiles),
            estimatedSizePerFileMB: (totalSize / estimatedFiles / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Clean up split files
     * @param {string} pattern - File pattern to clean
     */
    async cleanup(pattern = '*.csv') {
        const glob = require('glob');
        const files = glob.sync(path.join(this.outputDir, pattern));

        for (const file of files) {
            await fs.promises.unlink(file);
        }

        this.emit('cleanup', { filesRemoved: files.length });
        return files.length;
    }

    // Private helper methods

    _generateFilePath(originalPath, fileNumber) {
        const basename = path.basename(originalPath, path.extname(originalPath));
        const ext = path.extname(originalPath);
        const timestamp = Date.now();
        return path.join(
            this.outputDir,
            `${basename}_part${String(fileNumber).padStart(3, '0')}_${timestamp}${ext}`
        );
    }

    /**
     * Sort CSV by specified columns to reduce locking (e.g., by AccountId)
     * @param {string} inputPath - Input CSV path
     * @param {Array<string>} sortColumns - Columns to sort by
     * @param {string} outputPath - Output path for sorted file
     */
    async sortCSV(inputPath, sortColumns, outputPath) {
        // This would require loading data into memory or using external sort
        // For very large files, consider using external sort utilities
        throw new Error('External sort implementation required for very large files');
    }
}

module.exports = CsvSplitter;