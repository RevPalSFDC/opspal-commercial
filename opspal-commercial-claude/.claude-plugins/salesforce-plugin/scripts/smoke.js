const fs = require('fs');
const path = require('path');

const QuickActionManager = require('./lib/quick-action-manager');
const DuplicateRuleManager = require('./lib/duplicate-rule-manager');
const TranslationManager = require('./lib/translation-manager');
const PicklistManager = require('./lib/picklist-manager');

const ORG = (() => {
    const flagIndex = process.argv.indexOf('--org');
    if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
        return process.argv[flagIndex + 1];
    }
    if (process.env.ORG_ALIAS) {
        return process.env.ORG_ALIAS;
    }
    throw new Error('Org alias not provided. Pass --org <alias> or set ORG_ALIAS env var.');
})();

const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts');

if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runStep(name, fn) {
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        const payload = { ok: true, step: name, durationMs: duration, result };
        fs.writeFileSync(path.join(ARTIFACT_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
        console.log(`[PASS] ${name} (${duration}ms)`);
        return true;
    } catch (error) {
        const duration = Date.now() - start;
        const payload = { ok: false, step: name, durationMs: duration, message: error.message, stack: error.stack, context: error.context };
        fs.writeFileSync(path.join(ARTIFACT_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
        console.error(`[FAIL] ${name}: ${error.message}`);
        return false;
    }
}

(async () => {
    const quickActionManager = new QuickActionManager({ stage: 'ci', org: ORG });
    const duplicateRuleManager = new DuplicateRuleManager({ stage: 'ci', org: ORG });
    const translationManager = new TranslationManager({ stage: 'ci', org: ORG });
    const picklistManager = new PicklistManager({ stage: 'ci', org: ORG });

    let success = true;

    success &= await runStep('quick-action-create', () =>
        quickActionManager.createQuickAction({
            objectName: 'Account',
            developerName: 'Account_Auto_Test',
            label: 'Account Auto Test',
            actionType: 'Update',
            fields: ['Name', 'Phone'],
            targetOrg: ORG
        })
    );

    success &= await runStep('quick-action-assign', () =>
        quickActionManager.assignQuickActionToLayout({
            objectName: 'Account',
            layoutName: 'Account Layout',
            actionName: 'Account_Auto_Test',
            targetOrg: ORG
        })
    );

    success &= await runStep('translation-en_US', () =>
        translationManager.ensureGlobalPicklistTranslation({
            locale: 'en_US',
            globalValueSet: 'Industry',
            value: 'Tech',
            translation: 'Tech',
            targetOrg: ORG
        })
    );

    success &= await runStep('translation-es', () =>
        translationManager.ensureGlobalPicklistTranslation({
            locale: 'es',
            globalValueSet: 'Industry',
            value: 'Tech',
            translation: 'Tecnología',
            targetOrg: ORG
        })
    );

    success &= await runStep('picklist-add', () =>
        picklistManager.addPicklistValues({
            objectName: 'Account',
            fieldApiName: 'Status__c',
            values: ['AutoSmoke'],
            activate: true,
            targetOrg: ORG
        })
    );

    success &= await runStep('picklist-remove', () =>
        picklistManager.removePicklistValues({
            objectName: 'Account',
            fieldApiName: 'Status__c',
            values: ['AutoSmoke'],
            targetOrg: ORG
        })
    );

    success &= await runStep('duplicate-rule-on', () =>
        duplicateRuleManager.toggleDuplicateRule({
            objectName: 'Account',
            ruleName: 'Account_Duplicate_Rule',
            active: true,
            targetOrg: ORG
        })
    );

    success &= await runStep('duplicate-rule-off', () =>
        duplicateRuleManager.toggleDuplicateRule({
            objectName: 'Account',
            ruleName: 'Account_Duplicate_Rule',
            active: false,
            targetOrg: ORG
        })
    );

    if (!success) {
        process.exitCode = 1;
    }
})();
