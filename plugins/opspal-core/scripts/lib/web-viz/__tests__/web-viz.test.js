/**
 * Web Visualization Generator Tests
 *
 * @module web-viz/__tests__/web-viz.test.js
 */

const path = require('path');

// Test helpers
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
};

// Test Suite
async function runTests() {
  console.log('\n🧪 Web Visualization Generator Tests\n');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  // Test 1: Module Loading
  console.log('\n📦 Test 1: Module Loading');
  try {
    const webViz = require('../index');
    assert(webViz.WebVizGenerator, 'WebVizGenerator class exported');
    assert(webViz.StateManager, 'StateManager class exported');
    assert(webViz.quickChart, 'quickChart helper exported');
    assert(webViz.quickTable, 'quickTable helper exported');
    passed++;
  } catch (error) {
    console.log(`  ❌ Module loading failed: ${error.message}`);
    failed++;
  }

  // Test 2: WebVizGenerator Instantiation
  console.log('\n📦 Test 2: WebVizGenerator Instantiation');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator({ theme: 'revpal' });
    assert(viz.options.theme === 'revpal', 'Theme option set correctly');
    passed++;
  } catch (error) {
    console.log(`  ❌ Instantiation failed: ${error.message}`);
    failed++;
  }

  // Test 3: DashboardBuilder Creation
  console.log('\n📦 Test 3: DashboardBuilder Creation');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');
    assert(dashboard.title === 'Test Dashboard', 'Dashboard title set');
    assert(dashboard.components instanceof Map, 'Components map created');
    assert(dashboard.stateManager !== null, 'StateManager attached');
    passed++;
  } catch (error) {
    console.log(`  ❌ Dashboard creation failed: ${error.message}`);
    failed++;
  }

  // Test 4: Adding Chart Component
  console.log('\n📦 Test 4: Adding Chart Component');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addChart('test-chart', {
      type: 'bar',
      title: 'Test Chart'
    });

    assert(dashboard.components.has('test-chart'), 'Chart component added');
    const chart = dashboard.getComponent('test-chart');
    assert(chart.config.type === 'bar', 'Chart type is bar');
    assert(chart.config.title === 'Test Chart', 'Chart title set');
    passed++;
  } catch (error) {
    console.log(`  ❌ Chart addition failed: ${error.message}`);
    failed++;
  }

  // Test 5: Adding Table Component
  console.log('\n📦 Test 5: Adding Table Component');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addTable('test-table', {
      title: 'Test Table',
      sortable: true,
      columns: [
        { field: 'name', header: 'Name' },
        { field: 'value', header: 'Value', type: 'number' }
      ]
    });

    assert(dashboard.components.has('test-table'), 'Table component added');
    const table = dashboard.getComponent('test-table');
    assert(table.config.sortable === true, 'Table is sortable');
    assert(table.config.columns.length === 2, 'Table has 2 columns');
    passed++;
  } catch (error) {
    console.log(`  ❌ Table addition failed: ${error.message}`);
    failed++;
  }

  // Test 6: Adding KPI Component
  console.log('\n📦 Test 6: Adding KPI Component');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addKPI('test-kpi', {
      title: 'Total Revenue',
      format: 'currency'
    });

    dashboard.setData('test-kpi', {
      value: 5000000,
      trend: 12.5
    });

    assert(dashboard.components.has('test-kpi'), 'KPI component added');
    const kpi = dashboard.getComponent('test-kpi');
    assert(kpi.data.value === 5000000, 'KPI value set');
    assert(kpi.data.trend === 12.5, 'KPI trend set');
    passed++;
  } catch (error) {
    console.log(`  ❌ KPI addition failed: ${error.message}`);
    failed++;
  }

  // Test 7: Adding Map Component
  console.log('\n📦 Test 7: Adding Map Component');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addMap('test-map', {
      title: 'Territory Map',
      mapType: 'markers',
      center: [39.8, -98.5],
      zoom: 4
    });

    assert(dashboard.components.has('test-map'), 'Map component added');
    const map = dashboard.getComponent('test-map');
    assert(map.config.mapType === 'markers', 'Map type is markers');
    assert(map.config.zoom === 4, 'Map zoom set');
    passed++;
  } catch (error) {
    console.log(`  ❌ Map addition failed: ${error.message}`);
    failed++;
  }

  // Test 8: Setting Data on Components
  console.log('\n📦 Test 8: Setting Data on Components');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addChart('revenue-chart', { type: 'bar', title: 'Revenue' });

    const chartData = {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [{
        label: 'Revenue',
        data: [100000, 150000, 200000, 250000]
      }]
    };

    dashboard.setData('revenue-chart', chartData, { type: 'mock', query: 'test' });

    const chart = dashboard.getComponent('revenue-chart');
    assert(chart.data.labels.length === 4, 'Chart has 4 labels');
    assert(chart.data.datasets[0].data[3] === 250000, 'Chart data correct');
    assert(chart.dataSource.type === 'mock', 'Data source metadata attached');
    passed++;
  } catch (error) {
    console.log(`  ❌ Data setting failed: ${error.message}`);
    failed++;
  }

  // Test 9: Component Serialization
  console.log('\n📦 Test 9: Component Serialization');
  try {
    const { WebVizGenerator } = require('../index');
    const viz = new WebVizGenerator();
    const dashboard = viz.dashboard('Test Dashboard');

    dashboard.addChart('chart1', { type: 'pie', title: 'Test Pie' });
    dashboard.setData('chart1', { labels: ['A', 'B'], datasets: [{ data: [30, 70] }] });

    const chart = dashboard.getComponent('chart1');
    const serialized = chart.serialize();

    assert(serialized.id === 'chart1', 'Serialized ID correct');
    assert(serialized.type === 'chart', 'Serialized type correct');
    assert(serialized.config.type === 'pie', 'Serialized config correct');
    assert(serialized.data.labels.length === 2, 'Serialized data correct');
    passed++;
  } catch (error) {
    console.log(`  ❌ Serialization failed: ${error.message}`);
    failed++;
  }

  // Test 10: FileAdapter CSV Parsing
  console.log('\n📦 Test 10: FileAdapter CSV Parsing');
  try {
    const FileAdapter = require('../adapters/FileAdapter');
    const adapter = new FileAdapter();

    // Test internal CSV parsing
    const csvContent = 'name,value,active\nTest 1,100,true\nTest 2,200,false';
    const parsed = adapter._parseCSV(csvContent, {});

    assert(parsed.length === 2, 'Parsed 2 records');
    assert(parsed[0].name === 'Test 1', 'First record name correct');
    assert(parsed[0].value === 100, 'Value converted to number');
    assert(parsed[0].active === true, 'Boolean converted correctly');
    passed++;
  } catch (error) {
    console.log(`  ❌ CSV parsing failed: ${error.message}`);
    failed++;
  }

  // Test 11: StateManager
  console.log('\n📦 Test 11: StateManager');
  try {
    const { StateManager } = require('../index');
    const sm = new StateManager({ baseDir: '/tmp/test-dashboards' });

    assert(sm.sessionId !== null, 'Session ID generated');
    assert(sm.state.sections instanceof Array, 'Sections array exists');
    assert(sm.state.conversationHistory instanceof Array, 'Conversation history exists');
    passed++;
  } catch (error) {
    console.log(`  ❌ StateManager failed: ${error.message}`);
    failed++;
  }

  // Test 12: HubSpot Adapter Transform
  console.log('\n📦 Test 12: HubSpot Adapter Transform');
  try {
    const HubSpotAdapter = require('../adapters/HubSpotAdapter');
    const adapter = new HubSpotAdapter({ portalId: '12345' });

    const mockResults = [
      { id: '1', properties: { dealname: 'Deal 1', amount: '10000' }, createdAt: '2025-01-01' },
      { id: '2', properties: { dealname: 'Deal 2', amount: '20000' }, createdAt: '2025-01-02' }
    ];

    const transformed = adapter.transformResults(mockResults);

    assert(transformed.data.length === 2, 'Transformed 2 records');
    assert(transformed.data[0].dealname === 'Deal 1', 'Properties extracted');
    assert(transformed.data[0].id === '1', 'ID included');
    assert(transformed.metadata.type === 'hubspot', 'Metadata type correct');
    passed++;
  } catch (error) {
    console.log(`  ❌ HubSpot transform failed: ${error.message}`);
    failed++;
  }

  // Test 13: Config Loading
  console.log('\n📦 Test 13: Config Loading');
  try {
    const { getDefaults } = require('../index');
    const defaults = getDefaults();

    assert(defaults.theme !== undefined, 'Theme defined');
    assert(defaults.cdn !== undefined, 'CDN config defined');
    assert(defaults.theme.colors !== undefined, 'Colors defined in theme');
    passed++;
  } catch (error) {
    console.log(`  ❌ Config loading failed: ${error.message}`);
    failed++;
  }

  // Test 14: HTML Generation Structure
  console.log('\n📦 Test 14: HTML Generation Structure');
  try {
    const StaticHtmlGenerator = require('../output/StaticHtmlGenerator');
    const generator = new StaticHtmlGenerator({ theme: 'revpal' });

    assert(generator.options.theme === 'revpal', 'Generator theme set');
    assert(typeof generator.generate === 'function', 'Generate method exists');
    passed++;
  } catch (error) {
    console.log(`  ❌ HTML generator failed: ${error.message}`);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }

  return { passed, failed };
}

// Jest wrapper - runs all tests in a single Jest test case
describe('Web Visualization Generator', () => {
  test('all components and functionality', async () => {
    const result = await runTests();
    expect(result.failed).toBe(0);
  });
});
