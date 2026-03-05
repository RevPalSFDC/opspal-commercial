#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

const reports = [
  {
    label: 'CA_All_Future_Renewals_by_M_uB5',
    aggregates: [
      {
        calculatedFormula: 'Opportunity.Expected_Renewal__c:SUM',
        datatype: 'currency',
        developerName: 'FORMULA_EXPECTED_RENEWAL',
        masterLabel: 'Expected Renewal Value',
        scale: 2,
      },
    ],
  },
  {
    label: 'CA_FYTD_Closed_Won_Renewals_dkI',
    aggregates: [
      {
        calculatedFormula: 'Opportunity.Booked_ARR__c:SUM',
        datatype: 'currency',
        developerName: 'FORMULA_BOOKED_ARR',
        masterLabel: 'Total Booked ARR',
        scale: 2,
      },
    ],
  },
  {
    label: 'CA_YTD_Net_Growth_ARR_apj',
    aggregates: [
      {
        calculatedFormula: 'Opportunity.Incremental_Value__c:SUM',
        datatype: 'currency',
        developerName: 'FORMULA_INCREMENTAL_VALUE',
        masterLabel: 'Net Growth ARR',
        scale: 2,
      },
    ],
  },
];

const targetDir = path.join(os.tmpdir(), 'dashboard-migration', 'force-app', 'main', 'default', 'reports', 'CA_Reports');

const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
const builder = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: true });

function ensureArray(node) {
  if (!node) return [];
  return Array.isArray(node) ? node : [node];
}

function createAggregateNode(aggregate) {
  return {
    Report: undefined,
    aggregates: [
      { '#text': aggregate.calculatedFormula, '#name': 'calculatedFormula' },
      { '#text': aggregate.datatype, '#name': 'datatype' },
      { '#text': aggregate.developerName, '#name': 'developerName' },
      { '#text': 'GRAND_SUMMARY', '#name': 'downGroupingContext' },
      { '#text': 'true', '#name': 'isActive' },
      { '#text': 'false', '#name': 'isCrossBlock' },
      { '#text': aggregate.masterLabel, '#name': 'masterLabel' },
      { '#text': aggregate.scale.toString(), '#name': 'scale' },
    ],
  };
}

function upsertAggregates(reportNode, aggregates) {
  const nodes = reportNode.find((n) => n['Report'])['Report'];
  let aggregatesNodes = nodes.filter((n) => n['aggregates']);

  if (aggregatesNodes.length === 0) {
    aggregatesNodes = [];
    nodes.splice(1, 0, ...aggregates.map((aggregate) => ({ aggregates: createAggregateNode(aggregate).aggregates })));
    return;
  }

  for (const aggregate of aggregates) {
    const match = aggregatesNodes.find((node) => {
      const items = node['aggregates'];
      const devNameItem = items.find((item) => item['developerName']);
      const formulaItem = items.find((item) => item['calculatedFormula']);
      const devName = devNameItem ? devNameItem['developerName']['#text'] || devNameItem['developerName'] : '';
      const formula = formulaItem ? formulaItem['calculatedFormula']['#text'] || formulaItem['calculatedFormula'] : '';
      return devName.toUpperCase() === aggregate.developerName.toUpperCase() || formula.toUpperCase() === aggregate.calculatedFormula.toUpperCase();
    });

    const newNode = { aggregates: createAggregateNode(aggregate).aggregates };

    if (match) {
      const index = nodes.indexOf(match);
      nodes[index] = newNode;
    } else {
      nodes.splice(nodes.indexOf(aggregatesNodes[aggregatesNodes.length - 1]) + 1, 0, newNode);
    }
  }
}

function main() {
  for (const report of reports) {
    const fileName = `${report.label}.report-meta.xml`;
    const filePath = path.join(targetDir, fileName);

    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing report: ${fileName}`);
      continue;
    }

    const xml = fs.readFileSync(filePath, 'utf-8');
    const parsed = parser.parse(xml);

    upsertAggregates(parsed, report.aggregates);
    const output = builder.build(parsed);
    fs.writeFileSync(filePath, `${output}\n`);
    console.log(`Updated aggregates for ${fileName}`);
  }
}

main();
