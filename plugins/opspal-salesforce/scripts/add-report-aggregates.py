#!/usr/bin/env python3
import xml.etree.ElementTree as ET
from pathlib import Path

REPORTS = {
    'CA_All_Future_Renewals_by_M_uB5.report-meta.xml': [
        {
            'calculatedFormula': 'Opportunity.Expected_Renewal__c:SUM',
            'datatype': 'currency',
            'developerName': 'FORMULA_EXPECTED_RENEWAL',
            'masterLabel': 'Expected Renewal Value',
            'scale': '2',
        },
    ],
    'CA_FYTD_Closed_Won_Renewals_dkI.report-meta.xml': [
        {
            'calculatedFormula': 'Opportunity.Booked_ARR__c:SUM',
            'datatype': 'currency',
            'developerName': 'FORMULA_BOOKED_ARR',
            'masterLabel': 'Total Booked ARR',
            'scale': '2',
        },
    ],
    'CA_YTD_Net_Growth_ARR_apj.report-meta.xml': [
        {
            'calculatedFormula': 'Opportunity.Incremental_Value__c:SUM',
            'datatype': 'currency',
            'developerName': 'FORMULA_INCREMENTAL_VALUE',
            'masterLabel': 'Net Growth ARR',
            'scale': '2',
        },
    ],
}

BASE_DIR = Path('/tmp/dashboard-migration/force-app/main/default/reports/CA_Reports')
NS = {'sf': 'http://soap.sforce.com/2006/04/metadata'}
ET.register_namespace('', NS['sf'])

FIELDS = [
    ('calculatedFormula', None),
    ('datatype', None),
    ('developerName', None),
    ('downGroupingContext', 'GRAND_SUMMARY'),
    ('isActive', 'true'),
    ('isCrossBlock', 'false'),
    ('masterLabel', None),
    ('scale', None),
]

for filename, aggregates in REPORTS.items():
    file_path = BASE_DIR / filename
    if not file_path.exists():
        print(f"Skipping missing file {filename}")
        continue

    tree = ET.parse(file_path)
    root = tree.getroot()

    # Find existing aggregates
    aggregates_nodes = root.findall('sf:aggregates', NS)

    def matches(node, formula):
        formula_node = node.find('sf:calculatedFormula', NS)
        if formula_node is not None and (formula_node.text or '').upper() == formula.upper():
            return True
        return False

    for aggregate in aggregates:
        existing = None
        for node in aggregates_nodes:
            if matches(node, aggregate['calculatedFormula']):
                existing = node
                break
        if existing is None:
            existing = ET.SubElement(root, f"{{{NS['sf']}}}aggregates")
            aggregates_nodes.append(existing)

        for field, default in FIELDS:
            value = aggregate.get(field, default)
            elem = existing.find(f'sf:{field}', NS)
            if value is None and elem is None:
                elem = ET.SubElement(existing, f"{{{NS['sf']}}}{field}")
                elem.text = aggregate[field]
            elif value is None and elem is not None:
                elem.text = aggregate[field]
            elif value is not None:
                if elem is None:
                    elem = ET.SubElement(existing, f"{{{NS['sf']}}}{field}")
                elem.text = value

    tree.write(file_path, encoding='utf-8', xml_declaration=True)
    print(f"Updated {filename}")
