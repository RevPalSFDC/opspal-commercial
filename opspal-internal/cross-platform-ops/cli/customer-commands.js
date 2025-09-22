#!/usr/bin/env node

/**
 * Customer Management Commands for xplat CLI
 *
 * Provides commands for switching between customers, viewing status, and managing contexts
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const { getInstance } = require('../lib/instance-context-manager');

/**
 * Customer command handler
 */
class CustomerCommands {
    constructor(program) {
        this.manager = getInstance();
        this.setupCommands(program);
    }

    /**
     * Setup all customer-related commands
     */
    setupCommands(program) {
        const customer = program
            .command('customer')
            .description('Manage customer instances and contexts');

        // Switch customer context
        customer
            .command('switch <customer> [environment]')
            .description('Switch to a different customer context')
            .action(async (customer, environment = 'production') => {
                await this.switchCustomer(customer, environment);
            });

        // List all customers
        customer
            .command('list')
            .description('List all configured customers')
            .option('-v, --verbose', 'Show detailed information')
            .action((options) => {
                this.listCustomers(options.verbose);
            });

        // Show current context
        customer
            .command('status')
            .description('Show current customer context and status')
            .action(() => {
                this.showStatus();
            });

        // Validate customer pairing
        customer
            .command('validate <customer> [environment]')
            .description('Validate customer instance pairing')
            .action(async (customer, environment = 'production') => {
                await this.validateCustomer(customer, environment);
            });

        // Show customer details
        customer
            .command('info <customer>')
            .description('Show detailed information for a customer')
            .action((customer) => {
                this.showCustomerInfo(customer);
            });

        // Find instances by criteria
        customer
            .command('find')
            .description('Find instances by criteria')
            .option('-p, --platform <platform>', 'Filter by platform (salesforce|hubspot)')
            .option('-s, --sync', 'Show only sync-enabled instances')
            .option('-e, --environment <env>', 'Filter by environment')
            .option('--active', 'Show only active customers')
            .action((options) => {
                this.findInstances(options);
            });

        // Show statistics
        customer
            .command('stats')
            .description('Show customer and instance statistics')
            .action(() => {
                this.showStatistics();
            });
    }

    /**
     * Switch to a different customer context
     */
    async switchCustomer(customerName, environment) {
        try {
            console.log(chalk.blue(`Switching to ${customerName} (${environment})...`));

            const context = await this.manager.switchContext(customerName, environment);

            console.log(chalk.green('✓ Context switched successfully'));
            console.log();
            console.log('Current Context:');
            console.log(`  Customer: ${chalk.bold(context.customerDisplayName)}`);
            console.log(`  Environment: ${chalk.bold(environment)}`);

            if (context.instances.salesforce) {
                console.log(`  Salesforce: ${chalk.cyan(context.instances.salesforce)}`);
            }
            if (context.instances.hubspot) {
                console.log(`  HubSpot: ${chalk.magenta(context.instances.hubspot)}`);
            }

            console.log(`  Sync Enabled: ${context.syncEnabled ? chalk.green('Yes') : chalk.gray('No')}`);

        } catch (error) {
            console.error(chalk.red(`✗ Failed to switch context: ${error.message}`));
            process.exit(1);
        }
    }

    /**
     * List all customers
     */
    listCustomers(verbose = false) {
        const customers = this.manager.getCustomers();
        const currentContext = this.manager.getCurrentContext();

        if (customers.length === 0) {
            console.log(chalk.yellow('No customers configured'));
            return;
        }

        const table = new Table({
            head: verbose
                ? ['Customer', 'Name', 'Status', 'Salesforce', 'HubSpot', 'Environments', 'Current']
                : ['Customer', 'Name', 'Status', 'Platforms', 'Current'],
            style: { head: ['cyan'] }
        });

        customers.forEach(customer => {
            const isCurrent = currentContext && currentContext.customer === customer.id;
            const marker = isCurrent ? chalk.green('●') : '';

            if (verbose) {
                table.push([
                    customer.id,
                    customer.name,
                    this.formatStatus(customer.status),
                    customer.hasSalesforce ? chalk.green('✓') : chalk.gray('✗'),
                    customer.hasHubspot ? chalk.green('✓') : chalk.gray('✗'),
                    customer.environments.join(', '),
                    marker
                ]);
            } else {
                const platforms = [];
                if (customer.hasSalesforce) platforms.push('SF');
                if (customer.hasHubspot) platforms.push('HS');

                table.push([
                    customer.id,
                    customer.name,
                    this.formatStatus(customer.status),
                    platforms.join(', ') || chalk.gray('None'),
                    marker
                ]);
            }
        });

        console.log(table.toString());
        console.log();
        console.log(`Total customers: ${chalk.bold(customers.length)}`);
    }

    /**
     * Show current status
     */
    showStatus() {
        const context = this.manager.getCurrentContext();

        if (!context) {
            console.log(chalk.yellow('No active customer context'));
            console.log('Use: xplat customer switch <customer> [environment]');
            return;
        }

        console.log(chalk.blue.bold('Current Customer Context'));
        console.log('=' .repeat(50));
        console.log();
        console.log(`Customer: ${chalk.bold(context.customerDisplayName)}`);
        console.log(`Environment: ${chalk.bold(context.environment)}`);
        console.log(`Activated: ${new Date(context.activatedAt).toLocaleString()}`);
        console.log();

        console.log(chalk.blue('Instances:'));
        if (context.instances.salesforce) {
            console.log(`  Salesforce: ${chalk.cyan(context.instances.salesforce)}`);
        } else {
            console.log(`  Salesforce: ${chalk.gray('Not configured')}`);
        }

        if (context.instances.hubspot) {
            console.log(`  HubSpot: ${chalk.magenta(context.instances.hubspot)}`);
        } else {
            console.log(`  HubSpot: ${chalk.gray('Not configured')}`);
        }

        console.log();
        console.log(chalk.blue('Configuration:'));
        console.log(`  Sync Enabled: ${context.syncEnabled ? chalk.green('Yes') : chalk.gray('No')}`);
        console.log(`  Primary: ${context.pairing.primary ? chalk.green('Yes') : chalk.gray('No')}`);

        if (context.configurations && Object.keys(context.configurations).length > 0) {
            console.log();
            console.log(chalk.blue('Features:'));
            Object.entries(context.configurations).forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                console.log(`  ${label}: ${value ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
            });
        }

        if (context.envFiles && Object.keys(context.envFiles).length > 0) {
            console.log();
            console.log(chalk.blue('Environment Files:'));
            Object.entries(context.envFiles).forEach(([type, path]) => {
                console.log(`  ${type}: ${chalk.gray(path)}`);
            });
        }
    }

    /**
     * Validate customer configuration
     */
    async validateCustomer(customerName, environment) {
        console.log(chalk.blue(`Validating ${customerName} (${environment})...`));
        console.log();

        try {
            const validation = await this.manager.validatePairing(customerName, environment);

            if (validation.valid) {
                console.log(chalk.green.bold('✓ All validations passed'));
            } else {
                console.log(chalk.red.bold('✗ Validation failed'));
            }

            console.log();

            // Show individual check results
            if (validation.checks) {
                Object.entries(validation.checks).forEach(([platform, check]) => {
                    if (check.valid) {
                        console.log(chalk.green(`✓ ${platform}: Valid`));
                        if (check.orgId) {
                            console.log(`    Org ID: ${check.orgId}`);
                        }
                        if (check.username) {
                            console.log(`    Username: ${check.username}`);
                        }
                        if (check.portalId) {
                            console.log(`    Portal ID: ${check.portalId}`);
                        }
                    } else {
                        console.log(chalk.red(`✗ ${platform}: ${check.error || 'Invalid'}`));
                    }
                });
            }

            if (!validation.valid) {
                process.exit(1);
            }

        } catch (error) {
            console.error(chalk.red(`✗ Validation error: ${error.message}`));
            process.exit(1);
        }
    }

    /**
     * Show customer information
     */
    showCustomerInfo(customerName) {
        const customer = this.manager.getCustomer(customerName);

        if (!customer) {
            console.error(chalk.red(`Customer '${customerName}' not found`));
            process.exit(1);
        }

        console.log(chalk.blue.bold(`Customer: ${customer.name}`));
        console.log('=' .repeat(50));
        console.log();

        console.log(`Status: ${this.formatStatus(customer.status)}`);
        console.log();

        // Salesforce instances
        if (customer.salesforce) {
            console.log(chalk.cyan('Salesforce Instances:'));
            Object.entries(customer.salesforce).forEach(([env, instance]) => {
                console.log(`  ${env}: ${instance}`);
            });
        } else {
            console.log(chalk.gray('No Salesforce instances configured'));
        }
        console.log();

        // HubSpot instances
        if (customer.hubspot) {
            console.log(chalk.magenta('HubSpot Instances:'));
            Object.entries(customer.hubspot).forEach(([env, instance]) => {
                console.log(`  ${env}: ${instance}`);
            });
        } else {
            console.log(chalk.gray('No HubSpot instances configured'));
        }
        console.log();

        // Pairings
        console.log(chalk.blue('Instance Pairings:'));
        const pairingTable = new Table({
            head: ['Environment', 'Salesforce', 'HubSpot', 'Sync', 'Primary'],
            style: { head: ['cyan'] }
        });

        Object.entries(customer.pairings).forEach(([env, pairing]) => {
            pairingTable.push([
                env,
                pairing.sf || chalk.gray('-'),
                pairing.hs || chalk.gray('-'),
                pairing.sync_enabled ? chalk.green('✓') : chalk.gray('✗'),
                pairing.primary ? chalk.green('✓') : chalk.gray('✗')
            ]);
        });

        console.log(pairingTable.toString());
        console.log();

        // Configurations
        if (customer.configurations) {
            console.log(chalk.blue('Configurations:'));
            Object.entries(customer.configurations).forEach(([key, value]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                console.log(`  ${label}: ${value ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
            });
        }
    }

    /**
     * Find instances by criteria
     */
    findInstances(options) {
        const criteria = {};

        if (options.platform) criteria.platform = options.platform;
        if (options.sync) criteria.syncEnabled = true;
        if (options.environment) criteria.environment = options.environment;
        if (options.active) criteria.status = 'active';

        const instances = this.manager.findInstances(criteria);

        if (instances.length === 0) {
            console.log(chalk.yellow('No instances match the specified criteria'));
            return;
        }

        const table = new Table({
            head: ['Customer', 'Environment', 'Salesforce', 'HubSpot', 'Sync', 'Primary'],
            style: { head: ['cyan'] }
        });

        instances.forEach(instance => {
            table.push([
                instance.customerName,
                instance.environment,
                instance.salesforce || chalk.gray('-'),
                instance.hubspot || chalk.gray('-'),
                instance.syncEnabled ? chalk.green('✓') : chalk.gray('✗'),
                instance.primary ? chalk.green('✓') : chalk.gray('✗')
            ]);
        });

        console.log(table.toString());
        console.log();
        console.log(`Found ${chalk.bold(instances.length)} instance(s)`);
    }

    /**
     * Show statistics
     */
    showStatistics() {
        const stats = this.manager.getStatistics();

        if (!stats) {
            console.log(chalk.yellow('No statistics available'));
            return;
        }

        console.log(chalk.blue.bold('Customer & Instance Statistics'));
        console.log('=' .repeat(50));
        console.log();

        console.log(chalk.blue('Customers:'));
        console.log(`  Total: ${chalk.bold(stats.totalCustomers)}`);
        console.log(`  Active: ${chalk.green(stats.activeCustomers)}`);
        console.log(`  Inactive: ${chalk.gray(stats.totalCustomers - stats.activeCustomers)}`);
        console.log();

        console.log(chalk.blue('Platform Usage:'));
        console.log(`  Salesforce Only: ${stats.byPlatform.salesforceOnly}`);
        console.log(`  HubSpot Only: ${stats.byPlatform.hubspotOnly}`);
        console.log(`  Both Platforms: ${stats.byPlatform.both}`);
        console.log();

        console.log(chalk.blue('Environment Distribution:'));
        Object.entries(stats.byEnvironment).forEach(([env, count]) => {
            console.log(`  ${env}: ${count}`);
        });
        console.log();

        console.log(chalk.blue('Features:'));
        console.log(`  Sync Enabled: ${stats.syncEnabled} pairing(s)`);
    }

    /**
     * Format status with colors
     */
    formatStatus(status) {
        switch (status) {
            case 'active':
                return chalk.green(status);
            case 'maintenance':
                return chalk.yellow(status);
            case 'inactive':
                return chalk.gray(status);
            default:
                return status;
        }
    }
}

module.exports = CustomerCommands;