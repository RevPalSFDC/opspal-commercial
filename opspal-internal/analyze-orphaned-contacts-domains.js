#!/usr/bin/env node

/**
 * Analyze orphaned contacts with professional email domains
 * and attempt to match them to existing Accounts
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Common free email domains to exclude
const FREE_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'yandex.com', 'zoho.com',
    'gmx.com', 'me.com', 'mac.com', 'live.com', 'msn.com', 'rocketmail.com',
    'att.net', 'sbcglobal.net', 'verizon.net', 'comcast.net', 'cox.net',
    'charter.net', 'earthlink.net', 'optonline.net', 'roadrunner.com',
    'yahoo.ca', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.com.au',
    'gmail.co.uk', 'googlemail.com', 'bellsouth.net', 'inbox.com',
    'mail.ru', 'qq.com', '163.com', '126.com', 'sina.com', 'yeah.net'
];

// Education domains that might be professional
const EDU_DOMAINS = ['edu', 'ac.uk', 'edu.au', 'edu.ca'];

function isFreeDomain(email) {
    if (!email) return true;
    const domain = email.toLowerCase().split('@')[1];
    if (!domain) return true;

    // Check if it's a free email provider
    if (FREE_DOMAINS.includes(domain)) return true;

    // Check if it's an educational domain (might want to keep these)
    const isEdu = EDU_DOMAINS.some(edu => domain.endsWith(edu));

    return false; // Not free, could be professional
}

function extractDomain(email) {
    if (!email) return null;
    const parts = email.toLowerCase().split('@');
    return parts[1] || null;
}

function extractBaseDomain(domain) {
    if (!domain) return null;
    // Remove common subdomains
    const cleaned = domain.replace(/^(www\.|mail\.|email\.|smtp\.|mx\.|portal\.)/, '');
    // Get the main domain (e.g., company.com from sub.company.com)
    const parts = cleaned.split('.');
    if (parts.length >= 2) {
        return parts.slice(-2).join('.');
    }
    return cleaned;
}

async function getOrphanedContactsWithProfessionalEmails() {
    console.log('Fetching orphaned contacts with professional email domains...');
    console.log('='.repeat(70));

    // Query orphaned contacts with emails
    const contactQuery = `
    SELECT Id, Name, FirstName, LastName, Email,
           Clean_Status__c, Delete_Reason__c,
           CreatedDate, LastActivityDate
    FROM Contact
    WHERE Clean_Status__c IN ('Delete', 'Archive', 'Review')
      AND (Account.Number_of_Units__c = null OR Account.Number_of_Units__c = 0)
      AND (Account.ALN_of_Units__c = null OR Account.ALN_of_Units__c = 0)
      AND (Account.RCA_of_Units__c = null OR Account.RCA_of_Units__c = 0)
      AND AccountId = null
      AND Email != null
    ORDER BY Email
    `.replace(/\n\s+/g, ' ').trim();

    try {
        const result = execSync(
            `sf data query --query "${contactQuery}" --target-org rentable-production --json`,
            { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
        );

        const contacts = JSON.parse(result).result.records;
        console.log(`Total orphaned contacts with emails: ${contacts.length}`);

        // Filter for professional domains
        const professionalContacts = contacts.filter(c => !isFreeDomain(c.Email));
        console.log(`Contacts with professional domains: ${professionalContacts.length}`);

        // Group by domain
        const domainGroups = {};
        professionalContacts.forEach(contact => {
            const domain = extractDomain(contact.Email);
            const baseDomain = extractBaseDomain(domain);

            if (!domainGroups[baseDomain]) {
                domainGroups[baseDomain] = {
                    domain: baseDomain,
                    fullDomains: new Set(),
                    contacts: []
                };
            }

            domainGroups[baseDomain].fullDomains.add(domain);
            domainGroups[baseDomain].contacts.push(contact);
        });

        return domainGroups;

    } catch (error) {
        console.error('Error fetching contacts:', error.message);
        return {};
    }
}

async function getAccountsWithWebsites() {
    console.log('\nFetching Accounts with websites...');

    const accountQuery = `
    SELECT Id, Name, Website, BillingCity, BillingState,
           Number_of_Units__c, ALN_of_Units__c, RCA_of_Units__c
    FROM Account
    WHERE Website != null
    AND (Number_of_Units__c > 0 OR ALN_of_Units__c > 0 OR RCA_of_Units__c > 0)
    `.replace(/\n\s+/g, ' ').trim();

    try {
        const result = execSync(
            `sf data query --query "${accountQuery}" --target-org rentable-production --json`,
            { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
        );

        const accounts = JSON.parse(result).result.records;
        console.log(`Total accounts with websites: ${accounts.length}`);

        // Create domain to account mapping
        const domainToAccounts = {};
        accounts.forEach(account => {
            if (account.Website) {
                // Clean the website URL
                let website = account.Website.toLowerCase();
                website = website.replace(/^(https?:\/\/)?(www\.)?/, '');
                website = website.replace(/\/.*$/, ''); // Remove path

                const baseDomain = extractBaseDomain(website);

                if (!domainToAccounts[baseDomain]) {
                    domainToAccounts[baseDomain] = [];
                }
                domainToAccounts[baseDomain].push(account);
            }
        });

        return domainToAccounts;

    } catch (error) {
        console.error('Error fetching accounts:', error.message);
        return {};
    }
}

async function findMatches(domainGroups, domainToAccounts) {
    console.log('\n' + '='.repeat(70));
    console.log('FINDING DOMAIN MATCHES');
    console.log('='.repeat(70));

    const matches = {
        highConfidence: [],
        mediumConfidence: [],
        lowConfidence: []
    };

    Object.keys(domainGroups).forEach(domain => {
        const contactGroup = domainGroups[domain];
        const matchingAccounts = domainToAccounts[domain];

        if (matchingAccounts && matchingAccounts.length > 0) {
            // We have a domain match!
            const matchData = {
                domain: domain,
                contacts: contactGroup.contacts,
                accounts: matchingAccounts,
                confidence: 'high'
            };

            // Determine confidence level
            if (matchingAccounts.length === 1) {
                // Single account match - high confidence
                matchData.confidence = 'high';
                matches.highConfidence.push(matchData);
            } else if (matchingAccounts.length <= 3) {
                // Multiple but few accounts - medium confidence
                matchData.confidence = 'medium';
                matches.mediumConfidence.push(matchData);
            } else {
                // Many accounts with same domain - low confidence
                matchData.confidence = 'low';
                matches.lowConfidence.push(matchData);
            }
        }
    });

    return matches;
}

async function displayResults(matches, domainGroups) {
    console.log('\n' + '='.repeat(70));
    console.log('HIGH CONFIDENCE MATCHES (Single Account Match)');
    console.log('='.repeat(70));

    if (matches.highConfidence.length === 0) {
        console.log('No high confidence matches found.');
    } else {
        matches.highConfidence.slice(0, 10).forEach((match, i) => {
            console.log(`\n${i + 1}. Domain: ${match.domain}`);
            console.log(`   Account: ${match.accounts[0].Name} (${match.accounts[0].Id})`);
            console.log(`   Account Website: ${match.accounts[0].Website}`);
            console.log(`   Orphaned Contacts (${match.contacts.length}):`);
            match.contacts.slice(0, 3).forEach(c => {
                console.log(`     - ${c.Name || 'No Name'} <${c.Email}> (${c.Id})`);
                console.log(`       Status: ${c.Clean_Status__c}, Created: ${c.CreatedDate.split('T')[0]}`);
            });
            if (match.contacts.length > 3) {
                console.log(`     ... and ${match.contacts.length - 3} more contacts`);
            }
        });
    }

    console.log('\n' + '='.repeat(70));
    console.log('MEDIUM CONFIDENCE MATCHES (2-3 Account Matches)');
    console.log('='.repeat(70));

    if (matches.mediumConfidence.length === 0) {
        console.log('No medium confidence matches found.');
    } else {
        matches.mediumConfidence.slice(0, 5).forEach((match, i) => {
            console.log(`\n${i + 1}. Domain: ${match.domain}`);
            console.log(`   Matching Accounts (${match.accounts.length}):`);
            match.accounts.forEach(a => {
                console.log(`     - ${a.Name} (${a.Id})`);
            });
            console.log(`   Orphaned Contacts: ${match.contacts.length}`);
        });
    }

    // Summary statistics
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY STATISTICS');
    console.log('='.repeat(70));

    const totalContactsWithMatches =
        matches.highConfidence.reduce((sum, m) => sum + m.contacts.length, 0) +
        matches.mediumConfidence.reduce((sum, m) => sum + m.contacts.length, 0) +
        matches.lowConfidence.reduce((sum, m) => sum + m.contacts.length, 0);

    console.log(`High Confidence Matches: ${matches.highConfidence.length} domains`);
    console.log(`  Contacts to review: ${matches.highConfidence.reduce((sum, m) => sum + m.contacts.length, 0)}`);
    console.log(`Medium Confidence Matches: ${matches.mediumConfidence.length} domains`);
    console.log(`  Contacts to review: ${matches.mediumConfidence.reduce((sum, m) => sum + m.contacts.length, 0)}`);
    console.log(`Low Confidence Matches: ${matches.lowConfidence.length} domains`);
    console.log(`  Contacts to review: ${matches.lowConfidence.reduce((sum, m) => sum + m.contacts.length, 0)}`);
    console.log(`\nTotal Contacts with Potential Account Matches: ${totalContactsWithMatches}`);

    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        matches: matches,
        statistics: {
            totalContactsAnalyzed: Object.values(domainGroups).reduce((sum, g) => sum + g.contacts.length, 0),
            totalContactsWithMatches: totalContactsWithMatches,
            highConfidenceMatches: matches.highConfidence.length,
            mediumConfidenceMatches: matches.mediumConfidence.length,
            lowConfidenceMatches: matches.lowConfidence.length
        }
    };

    const outputFile = `orphaned-contact-matches-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\nDetailed results saved to: ${outputFile}`);

    return results;
}

async function generateUpdateScript(matches) {
    console.log('\n' + '='.repeat(70));
    console.log('GENERATING UPDATE SCRIPT');
    console.log('='.repeat(70));

    const updates = [];

    // Process high confidence matches
    matches.highConfidence.forEach(match => {
        match.contacts.forEach(contact => {
            updates.push({
                contactId: contact.Id,
                contactName: contact.Name,
                contactEmail: contact.Email,
                suggestedAccountId: match.accounts[0].Id,
                suggestedAccountName: match.accounts[0].Name,
                confidence: 'HIGH',
                action: 'UPDATE_TO_REVIEW'
            });
        });
    });

    // Save update script
    const scriptContent = `#!/usr/bin/env node
/**
 * Update orphaned contacts with high-confidence Account matches
 * Generated: ${new Date().toISOString()}
 */

const { execSync } = require('child_process');

const updates = ${JSON.stringify(updates, null, 2)};

console.log('Updating ' + updates.length + ' contacts to Review status...');

// Update contacts to Review status
const highConfidenceIds = updates
    .filter(u => u.confidence === 'HIGH')
    .map(u => u.contactId);

if (highConfidenceIds.length > 0) {
    const updateQuery = \`
    UPDATE Contact
    SET Clean_Status__c = 'Review',
        Delete_Reason__c = 'Potential Account Match Found'
    WHERE Id IN ('\${highConfidenceIds.join("','")}')\`;

    // Note: This would need to be executed via Apex or Data Loader
    console.log('High confidence contacts to update:', highConfidenceIds.length);
    console.log('Sample IDs:', highConfidenceIds.slice(0, 5));
}

console.log('\\nReview these contacts manually to assign proper Accounts.');
`;

    const scriptFile = `update-orphaned-contacts-${new Date().toISOString().split('T')[0]}.js`;
    fs.writeFileSync(scriptFile, scriptContent);
    console.log(`Update script saved to: ${scriptFile}`);
    console.log(`High confidence contacts to flag for review: ${updates.filter(u => u.confidence === 'HIGH').length}`);
}

// Main execution
async function main() {
    try {
        // Get orphaned contacts with professional domains
        const domainGroups = await getOrphanedContactsWithProfessionalEmails();

        // Get accounts with websites
        const domainToAccounts = await getAccountsWithWebsites();

        // Find matches
        const matches = await findMatches(domainGroups, domainToAccounts);

        // Display results
        await displayResults(matches, domainGroups);

        // Generate update script
        await generateUpdateScript(matches);

    } catch (error) {
        console.error('Error in main:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { isFreeDomain, extractDomain, extractBaseDomain };