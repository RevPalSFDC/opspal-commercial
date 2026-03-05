const fs = require('fs');
const path = require('path');
const os = require('os');

const TERMINAL_STATUSES = new Set(['Succeeded', 'SucceededPartial', 'Failed', 'Canceled', 'Error']);

function present(value) {
    return value !== undefined && value !== null;
}

function firstLine(text = '') {
    if (!text) {
        return '';
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return lines.length > 0 ? lines[0] : '';
}

function classify(line) {
    const normalized = line.toLowerCase();
    if (normalized.includes('locale') && normalized.includes('not enabled')) {
        return { code: 'LocaleDisabled', tip: 'Enable the locale in Translation Workbench.' };
    }
    if (normalized.includes('missing metadata type') || normalized.includes('unknown type')) {
        return { code: 'MissingParent', tip: 'Add parent metadata types to package.xml.' };
    }
    if (normalized.includes('invalid fullname') || normalized.includes('no such')) {
        return { code: 'InvalidApiName', tip: 'Check API names and namespace alignment.' };
    }
    if (normalized.includes('permission') || normalized.includes('insufficient access')) {
        return { code: 'Permission', tip: 'Verify field-level security, profiles, and perm sets.' };
    }
    return { code: 'GeneralDeployFailure', tip: 'Inspect the deploy report for component-level errors.' };
}

function buildManifest(members, apiVersion) {
    const sections = Object.entries(members || {})
        .filter(([, values]) => Array.isArray(values) && values.length > 0)
        .map(([typeName, values]) => {
            const unique = Array.from(new Set(values));
            const memberLines = unique.map(member => `        <members>${member}</members>`).join('\n');
            return `    <types>\n${memberLines}\n        <name>${typeName}</name>\n    </types>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${sections}\n    <version>${apiVersion}</version>\n</Package>`;
}

async function writeManifest(rootDir, members, apiVersion) {
    const manifestXml = buildManifest(members, apiVersion);
    const manifestPath = path.join(rootDir, 'package.xml');
    await fs.promises.writeFile(manifestPath, manifestXml, 'utf8');
    return manifestPath;
}

async function createTempDir(label, baseDir) {
    const parent = baseDir ? path.join(baseDir, '.mcp-temp') : os.tmpdir();
    await fs.promises.mkdir(parent, { recursive: true });
    const prefix = path.join(parent, `${label}-`);
    return fs.promises.mkdtemp(prefix);
}

async function ensureProjectScaffold(rootDir, apiVersion) {
    const projectFile = path.join(rootDir, 'sfdx-project.json');
    try {
        await fs.promises.access(projectFile);
        return projectFile;
    } catch (error) {
        const scaffold = {
            packageDirectories: [
                {
                    path: 'force-app',
                    default: true
                }
            ],
            namespace: '',
            sfdcLoginUrl: 'https://login.salesforce.com',
            sourceApiVersion: apiVersion
        };
        await fs.promises.writeFile(projectFile, JSON.stringify(scaffold, null, 2), 'utf8');
        return projectFile;
    }
}

function buildDeployArgs(options = {}) {
    const args = [];
    if (options.projectDir) {
        args.push(`--project-dir "${options.projectDir}"`);
    }
    if (options.manifestPath) {
        args.push(`--manifest "${options.manifestPath}"`);
    }
    if (options.sourceDir) {
        args.push(`--source-dir "${options.sourceDir}"`);
    }
    return args.join(' ');
}

async function projectDeployValidate(tool, {
    projectDir,
    manifestPath,
    sourceDir,
    alias,
    apiVersion,
    testLevel = 'NoTestRun'
}) {
    const args = buildDeployArgs({ projectDir, manifestPath, sourceDir });
    const orgFlag = alias ? ` --target-org ${alias}` : '';
    const command = `sf project deploy validate ${args}${orgFlag} --api-version ${apiVersion} --test-level ${testLevel} --wait 1 --json`;
    const result = await tool.executeCommand(command, { allowFailure: true });
    const parsed = tool.parseJSON(
        result.stdout,
        { operation: 'projectDeployValidate', alias, apiVersion },
        { allowStatus: true }
    );
    const line = firstLine(result.stderr || parsed?.result?.diagnostic || '');
    if (typeof parsed.status === 'number' && parsed.status !== 0) {
        const message = line || parsed.message || 'Deployment validation failed';
        const bucket = classify(message);
        throw tool.enhanceError(new Error(message), {
            stage: 'validate',
            status: parsed.status,
            orgAlias: alias,
            apiVersion,
            ...bucket
        });
    }
    if (/(missing metadata type|invalid fullname|no such|unknown type name|cannot find layout)/i.test(line)) {
        const bucket = classify(line);
        throw tool.enhanceError(new Error(line), {
            stage: 'validate',
            orgAlias: alias,
            apiVersion,
            ...bucket
        });
    }
    return parsed;
}

function extractDeploymentError(report) {
    if (!report) {
        return '';
    }
    const payload = report.result || report;
    if (payload.errorMessage) {
        return payload.errorMessage;
    }
    const details = payload.details || {};
    const failure = Array.isArray(details.componentFailures)
        ? details.componentFailures[0]
        : details.componentFailures;
    if (failure && (failure.problem || failure.problemDetail)) {
        return failure.problem || failure.problemDetail;
    }
    const testFailure = details.runTests && (Array.isArray(details.runTests.failures)
        ? details.runTests.failures[0]
        : details.runTests.failures);
    if (testFailure && testFailure.message) {
        return testFailure.message;
    }
    if (Array.isArray(payload.messages) && payload.messages.length > 0) {
        return payload.messages[0];
    }
    return payload.status || '';
}

async function projectDeployWithPoll(tool, {
    projectDir,
    manifestPath,
    sourceDir,
    alias,
    apiVersion,
    testLevel = 'NoTestRun',
    maxMs = 8 * 60 * 1000
}) {
    const args = buildDeployArgs({ projectDir, manifestPath, sourceDir });
    const orgFlag = alias ? ` --target-org ${alias}` : '';
    const startCommand = `sf project deploy start ${args}${orgFlag} --api-version ${apiVersion} --test-level ${testLevel} --wait 1 --async --json`;
    const startResult = await tool.executeCommand(startCommand, { allowFailure: true });
    const parsedStart = tool.parseJSON(
        startResult.stdout,
        { operation: 'projectDeployStart', alias, apiVersion },
        { allowStatus: true }
    );
    if (typeof parsedStart.status === 'number' && parsedStart.status !== 0) {
        const message = firstLine(startResult.stderr || parsedStart.message || 'Deployment start failed');
        const bucket = classify(message);
        throw tool.enhanceError(new Error(message), {
            stage: 'start',
            status: parsedStart.status,
            orgAlias: alias,
            apiVersion,
            ...bucket
        });
    }
    const jobId = parsedStart.result?.id || parsedStart.result?.jobId || parsedStart.id || parsedStart.jobId;
    let status = parsedStart.result?.status || parsedStart.status || 'Unknown';

    if (!jobId && status !== 'Succeeded') {
        throw tool.enhanceError(new Error('Deploy did not return a job id'), {
            stage: 'start',
            orgAlias: alias,
            apiVersion
        });
    }

    if (status === 'Succeeded') {
        return parsedStart;
    }

    const deadline = Date.now() + maxMs;
    let delay = 2000;
    let lastReport = parsedStart;

    while (Date.now() < deadline) {
        await sleep(delay);
        const reportCommand = `sf project deploy report --job-id ${jobId} --json`;
        const reportResult = await tool.executeCommand(reportCommand, { allowFailure: true });
        const parsedReport = tool.parseJSON(
            reportResult.stdout,
            {
                operation: 'projectDeployReport',
                alias,
                apiVersion,
                jobId
            },
            { allowStatus: true }
        );
        if (typeof parsedReport.status === 'number' && parsedReport.status !== 0) {
            const message = firstLine(reportResult.stderr || parsedReport.message || 'Deployment report failed');
            const bucket = classify(message);
            throw tool.enhanceError(new Error(message), {
                stage: 'report',
                status: parsedReport.status,
                orgAlias: alias,
                apiVersion,
                ...bucket
            });
        }

        status = parsedReport.result?.status || parsedReport.status || parsedReport.overallStatus || 'Unknown';
        lastReport = parsedReport;

        if (status === 'Succeeded') {
            return parsedReport;
        }

        if (status === 'SucceededPartial') {
            const line = firstLine(parsedReport.result?.details?.componentFailures?.[0]?.problem || reportResult.stderr || '');
            const bucket = classify(line);
            throw tool.enhanceError(new Error(line || 'Deploy succeeded with component failures'), {
                stage: 'deploy',
                status,
                jobId,
                orgAlias: alias,
                apiVersion,
                ...bucket
            });
        }

        if (TERMINAL_STATUSES.has(status)) {
            const detail = firstLine(parsedReport.result?.details?.errorMessage || parsedReport.result?.details?.componentFailures?.[0]?.problem || reportResult.stderr || status);
            const bucket = classify(detail);
            throw tool.enhanceError(new Error(detail || status), {
                stage: 'deploy',
                status,
                jobId,
                orgAlias: alias,
                apiVersion,
                ...bucket
            });
        }

        if (delay < 5000) {
            delay += 1000;
        }
    }

    const lastStatus = lastReport.result?.status || lastReport.status || 'Unknown';
    throw tool.enhanceError(new Error(`Timed out waiting for deploy ${jobId}. Last status: ${lastStatus}`), {
        stage: 'deploy',
        status: lastStatus,
        jobId,
        orgAlias: alias,
        apiVersion,
        code: 'Timeout'
    });
}

async function stageFile(sourcePath, targetRoot, relativePath) {
    const destination = path.join(targetRoot, relativePath);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(sourcePath, destination);
    return destination;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(fn, timeoutMs, label = 'operation') {
    if (typeof fn !== 'function') {
        throw new TypeError('withTimeout requires a function to execute');
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        Promise.resolve()
            .then(fn)
            .then(result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(result);
            })
            .catch(error => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
    });
}

module.exports = {
    present,
    firstLine,
    classify,
    buildManifest,
    writeManifest,
    createTempDir,
    ensureProjectScaffold,
    projectDeployValidate,
    projectDeployWithPoll,
    stageFile,
    sleep,
    extractDeploymentError,
    withTimeout
};
