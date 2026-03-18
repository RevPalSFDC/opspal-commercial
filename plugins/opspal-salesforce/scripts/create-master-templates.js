const LucidAPI = require('./lib/lucid-sf-connector');

const masterTemplates = [
    {
        title: "[MASTER] Salesforce Architecture Template",
        product: "lucidchart",
        type: "architecture",
        description: "Master template for Salesforce system architecture with layers for Presentation, Business Logic, Data, and Integration"
    },
    {
        title: "[MASTER] Data Flow Template",
        product: "lucidchart",
        type: "data-flow",
        description: "Master template for system boundaries including Source, ETL, and Target"
    },
    {
        title: "[MASTER] Process Swimlane Template",
        product: "lucidchart",
        type: "swimlane",
        description: "Master template with 5 swimlanes: Customer, Sales Rep, Manager, System, Support"
    },
    {
        title: "[MASTER] Entity Relationship Diagram Template",
        product: "lucidchart",
        type: "erd",
        description: "Master template showing entities: Account, Contact, Opportunity with relationships"
    },
    {
        title: "[MASTER] Product Roadmap Template",
        product: "lucidspark",
        type: "roadmap",
        description: "Master template with timeline Q1-Q4 2025, phases and milestones"
    },
    {
        title: "[MASTER] Account Hierarchy Template",
        product: "lucidchart",
        type: "hierarchy",
        description: "Master template showing hierarchy levels: Global, Domestic, Parent, Child"
    },
    {
        title: "[MASTER] Contact Organization Chart Template",
        product: "lucidchart",
        type: "org-chart",
        description: "Master template with org levels: CEO, C-Suite, Directors, Managers"
    },
    {
        title: "[MASTER] Opportunity Pipeline Template",
        product: "lucidchart",
        type: "pipeline",
        description: "Master template showing Opportunity stages from Prospecting to Closed"
    }
];

async function createMasterTemplates() {
    const results = [];
    for (const template of masterTemplates) {
        try {
            const result = await LucidAPI.createDocument({
                title: template.title,
                product: template.product,
                description: template.description,
                tags: ["master-template", template.type]
            });
            results.push({
                title: template.title,
                docId: result.docId,
                editUrl: result.editUrl
            });
        } catch (error) {
            console.error(`Failed to create template: ${template.title}`, error);
        }
    }
    return results;
}

module.exports = { createMasterTemplates };