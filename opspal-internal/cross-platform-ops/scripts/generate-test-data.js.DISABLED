#!/usr/bin/env node

/**
 * Test Data Generator for HubSpot Bulk Operations
 * Generates realistic CSV files for testing bulk imports
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { stringify } = require('csv-stringify');

class TestDataGenerator {
    constructor() {
        this.firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Mary'];
        this.lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        this.companies = ['Acme Corp', 'Global Tech', 'Digital Solutions', 'Cloud Systems', 'Data Corp', 'Tech Innovators'];
        this.domains = ['example.com', 'test.org', 'demo.net', 'sample.io', 'trial.co'];
        this.lifecycleStages = ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'];
        this.leadSources = ['organic', 'paid', 'social', 'email', 'direct', 'referral', 'other'];
    }

    /**
     * Generate contacts CSV
     */
    async generateContacts(count, outputPath, options = {}) {
        console.log(chalk.blue(`📝 Generating ${count.toLocaleString()} contacts...`));

        const startTime = Date.now();
        const writeStream = fs.createWriteStream(outputPath);
        const stringifier = stringify({
            header: true,
            columns: options.columns || [
                'email',
                'firstname',
                'lastname',
                'company',
                'phone',
                'lifecyclestage',
                'lead_source',
                'website',
                'city',
                'state',
                'country',
                'createdate'
            ]
        });

        stringifier.pipe(writeStream);

        // Generate in batches for memory efficiency
        const batchSize = 10000;
        let generated = 0;

        while (generated < count) {
            const batch = Math.min(batchSize, count - generated);

            for (let i = 0; i < batch; i++) {
                const record = this.generateContactRecord(generated + i, options);
                stringifier.write(record);
            }

            generated += batch;

            // Progress update
            if (generated % 100000 === 0) {
                const percentage = Math.round((generated / count) * 100);
                console.log(chalk.gray(`  Progress: ${percentage}% (${generated.toLocaleString()}/${count.toLocaleString()})`));
            }
        }

        stringifier.end();

        return new Promise((resolve) => {
            writeStream.on('finish', () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                const stats = fs.statSync(outputPath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

                resolve({
                    path: outputPath,
                    records: count,
                    size: sizeMB,
                    duration
                });
            });
        });
    }

    /**
     * Generate companies CSV
     */
    async generateCompanies(count, outputPath, options = {}) {
        console.log(chalk.blue(`🏢 Generating ${count.toLocaleString()} companies...`));

        const startTime = Date.now();
        const writeStream = fs.createWriteStream(outputPath);
        const stringifier = stringify({
            header: true,
            columns: options.columns || [
                'name',
                'domain',
                'industry',
                'numberofemployees',
                'annualrevenue',
                'city',
                'state',
                'country',
                'phone',
                'website',
                'description',
                'createdate'
            ]
        });

        stringifier.pipe(writeStream);

        for (let i = 0; i < count; i++) {
            const record = this.generateCompanyRecord(i, options);
            stringifier.write(record);

            // Progress update
            if ((i + 1) % 10000 === 0) {
                const percentage = Math.round(((i + 1) / count) * 100);
                console.log(chalk.gray(`  Progress: ${percentage}%`));
            }
        }

        stringifier.end();

        return new Promise((resolve) => {
            writeStream.on('finish', () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                const stats = fs.statSync(outputPath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

                resolve({
                    path: outputPath,
                    records: count,
                    size: sizeMB,
                    duration
                });
            });
        });
    }

    /**
     * Generate contact record
     */
    generateContactRecord(index, options = {}) {
        const firstName = this.randomItem(this.firstNames);
        const lastName = this.randomItem(this.lastNames);
        const company = this.randomItem(this.companies);
        const domain = this.randomItem(this.domains);

        const record = {
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${index}@${domain}`,
            firstname: firstName,
            lastname: lastName,
            company: company,
            phone: this.generatePhone(),
            lifecyclestage: this.randomItem(this.lifecycleStages),
            lead_source: this.randomItem(this.leadSources),
            website: `https://www.${domain}`,
            city: this.randomItem(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix']),
            state: this.randomItem(['NY', 'CA', 'IL', 'TX', 'AZ']),
            country: 'United States',
            createdate: this.generateDate()
        };

        // Add duplicates if requested
        if (options.duplicateRate && Math.random() < options.duplicateRate) {
            record.email = `duplicate.${Math.floor(Math.random() * 100)}@${domain}`;
        }

        // Add invalid data if requested
        if (options.errorRate && Math.random() < options.errorRate) {
            if (Math.random() < 0.5) {
                record.email = 'invalid-email';
            } else {
                record.phone = 'invalid-phone';
            }
        }

        return record;
    }

    /**
     * Generate company record
     */
    generateCompanyRecord(index, options = {}) {
        const companyBase = this.randomItem(this.companies);
        const domain = this.randomItem(this.domains);

        return {
            name: `${companyBase} ${index}`,
            domain: `company${index}.${domain}`,
            industry: this.randomItem(['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing']),
            numberofemployees: Math.floor(Math.random() * 10000) + 10,
            annualrevenue: Math.floor(Math.random() * 100000000) + 100000,
            city: this.randomItem(['New York', 'San Francisco', 'Austin', 'Boston', 'Seattle']),
            state: this.randomItem(['NY', 'CA', 'TX', 'MA', 'WA']),
            country: 'United States',
            phone: this.generatePhone(),
            website: `https://www.company${index}.${domain}`,
            description: `Leading provider of ${this.randomItem(['software', 'services', 'solutions', 'products'])}`,
            createdate: this.generateDate()
        };
    }

    // Helper methods
    randomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    generatePhone() {
        return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;
    }

    generateDate() {
        const start = new Date(2020, 0, 1);
        const end = new Date();
        const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return date.toISOString().split('T')[0];
    }
}

async function main() {
    program
        .name('generate-test-data')
        .description('Generate test CSV files for HubSpot bulk operations')
        .argument('<type>', 'Type of data (contacts or companies)')
        .argument('<count>', 'Number of records to generate')
        .option('-o, --output <path>', 'Output file path', './data/test-data.csv')
        .option('-d, --duplicate-rate <rate>', 'Percentage of duplicates (0-1)', parseFloat, 0)
        .option('-e, --error-rate <rate>', 'Percentage of invalid records (0-1)', parseFloat, 0)
        .option('-c, --columns <list>', 'Custom columns (comma-separated)')
        .parse(process.argv);

    const [type, countStr] = program.args;
    const count = parseInt(countStr);
    const options = program.opts();

    if (!type || !count) {
        console.error(chalk.red('❌ Type and count are required'));
        program.help();
    }

    if (isNaN(count) || count <= 0) {
        console.error(chalk.red('❌ Count must be a positive number'));
        process.exit(1);
    }

    // Parse custom columns
    if (options.columns) {
        options.columns = options.columns.split(',').map(c => c.trim());
    }

    const generator = new TestDataGenerator();

    console.log(chalk.bold('\n🎲 Test Data Generator\n'));
    console.log(`Type: ${type}`);
    console.log(`Count: ${count.toLocaleString()}`);
    console.log(`Output: ${options.output}`);
    if (options.duplicateRate) {
        console.log(`Duplicate Rate: ${(options.duplicateRate * 100).toFixed(1)}%`);
    }
    if (options.errorRate) {
        console.log(`Error Rate: ${(options.errorRate * 100).toFixed(1)}%`);
    }
    console.log('');

    try {
        let result;

        if (type === 'contacts') {
            result = await generator.generateContacts(count, options.output, options);
        } else if (type === 'companies') {
            result = await generator.generateCompanies(count, options.output, options);
        } else {
            throw new Error(`Unknown type: ${type}. Use 'contacts' or 'companies'`);
        }

        console.log(chalk.green(`\n✅ Generation complete!`));
        console.log(`  File: ${result.path}`);
        console.log(`  Records: ${result.records.toLocaleString()}`);
        console.log(`  Size: ${result.size} MB`);
        console.log(`  Duration: ${result.duration}s`);
        console.log(`  Speed: ${Math.round(result.records / result.duration).toLocaleString()} records/sec`);

        // Test command
        console.log(chalk.cyan('\n📤 To test import:'));
        console.log(`  import-${type} ${result.path} --name "test-${Date.now()}"`);

    } catch (error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = TestDataGenerator;