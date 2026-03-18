const pipelineModule = require('../parallel-deployment-pipeline');

const ParallelDeploymentPipeline = pipelineModule.ParallelDeploymentPipeline || pipelineModule;

describe('ParallelDeploymentPipeline', () => {
  test('normalizes object targets to object roots', () => {
    const pipeline = new ParallelDeploymentPipeline('test-org', { verbose: false });
    const deployTarget = pipeline.resolveDeployTarget(
      '/tmp/force-app/main/default/objects/Account/fields/Test__c.field-meta.xml'
    );

    expect(deployTarget).toBe('/tmp/force-app/main/default/objects/Account');
    expect(pipeline.getMetadataTypePriority(deployTarget)).toBe(1);
  });

  test('orders object roots before flows and layouts', () => {
    const pipeline = new ParallelDeploymentPipeline('test-org', { verbose: false });
    const tiers = pipeline.orderByDependency([
      {
        file: '/tmp/force-app/main/default/flows/Test.flow-meta.xml',
        deployTarget: '/tmp/force-app/main/default/flows',
        sourceFiles: ['/tmp/force-app/main/default/flows/Test.flow-meta.xml']
      },
      {
        file: '/tmp/force-app/main/default/layouts/Account-Layout.layout-meta.xml',
        deployTarget: '/tmp/force-app/main/default/layouts',
        sourceFiles: ['/tmp/force-app/main/default/layouts/Account-Layout.layout-meta.xml']
      },
      {
        file: '/tmp/force-app/main/default/objects/Account/fields/Test__c.field-meta.xml',
        deployTarget: '/tmp/force-app/main/default/objects/Account',
        sourceFiles: ['/tmp/force-app/main/default/objects/Account/fields/Test__c.field-meta.xml']
      }
    ]);

    expect(tiers).toHaveLength(3);
    expect(tiers[0][0].deployTarget).toBe('/tmp/force-app/main/default/objects/Account');
    expect(tiers[1][0].deployTarget).toBe('/tmp/force-app/main/default/flows');
    expect(tiers[2][0].deployTarget).toBe('/tmp/force-app/main/default/layouts');
  });
});
