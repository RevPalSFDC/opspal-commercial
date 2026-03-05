/**
 * Territory2ModelActivatorTest
 *
 * Test class for Territory2ModelActivator REST endpoint.
 * Provides 75%+ code coverage for deployment.
 *
 * Note: Territory2 objects require Enterprise Territory Management to be enabled.
 * Tests use mocking patterns where direct DML is not possible.
 *
 * @author RevPal Engineering
 * @version 1.0.0
 */
@isTest
private class Territory2ModelActivatorTest {

    /**
     * Test activation with missing model ID
     */
    @isTest
    static void testActivateModel_MissingModelId() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/activate';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('{}');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.activateModel();
        Test.stopTest();

        // Verify
        System.assertEquals(false, result.success, 'Should fail with missing model ID');
        System.assertEquals('MISSING_MODEL_ID', result.errorCode, 'Should return MISSING_MODEL_ID error');
        System.assertEquals(400, res.statusCode, 'Should return 400 status');
    }

    /**
     * Test activation with non-existent model ID
     */
    @isTest
    static void testActivateModel_ModelNotFound() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/activate';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('{"modelId": "0MC000000000000AAA"}');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.activateModel();
        Test.stopTest();

        // Verify
        System.assertEquals(false, result.success, 'Should fail with non-existent model');
        System.assertEquals('MODEL_NOT_FOUND', result.errorCode, 'Should return MODEL_NOT_FOUND error');
    }

    /**
     * Test get model status with missing ID
     */
    @isTest
    static void testGetModelStatus_MissingId() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model';
        req.httpMethod = 'GET';

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ModelStatus status = Territory2ModelActivator.getModelStatus();
        Test.stopTest();

        // Verify
        System.assertNotEquals(null, status.error, 'Should return error for missing ID');
        System.assertEquals(400, res.statusCode, 'Should return 400 status');
    }

    /**
     * Test get model status with non-existent model
     */
    @isTest
    static void testGetModelStatus_NotFound() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/0MC000000000000AAA';
        req.httpMethod = 'GET';

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ModelStatus status = Territory2ModelActivator.getModelStatus();
        Test.stopTest();

        // Verify
        System.assertEquals('Model not found', status.error, 'Should return not found error');
        System.assertEquals(404, res.statusCode, 'Should return 404 status');
    }

    /**
     * Test archive with missing model ID
     */
    @isTest
    static void testArchiveModel_MissingModelId() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/archive';
        req.httpMethod = 'PUT';
        req.requestBody = Blob.valueOf('{}');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.archiveModel();
        Test.stopTest();

        // Verify
        System.assertEquals(false, result.success, 'Should fail with missing model ID');
        System.assertEquals('MISSING_MODEL_ID', result.errorCode, 'Should return MISSING_MODEL_ID error');
        System.assertEquals(400, res.statusCode, 'Should return 400 status');
    }

    /**
     * Test archive with non-existent model
     */
    @isTest
    static void testArchiveModel_ModelNotFound() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/archive';
        req.httpMethod = 'PUT';
        req.requestBody = Blob.valueOf('{"modelId": "0MC000000000000AAA"}');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.archiveModel();
        Test.stopTest();

        // Verify
        System.assertEquals(false, result.success, 'Should fail with non-existent model');
        System.assertEquals('MODEL_NOT_FOUND', result.errorCode, 'Should return MODEL_NOT_FOUND error');
        System.assertEquals(404, res.statusCode, 'Should return 404 status');
    }

    /**
     * Test result class instantiation
     */
    @isTest
    static void testResultClasses() {
        // Test ActivationResult
        Territory2ModelActivator.ActivationResult actResult = new Territory2ModelActivator.ActivationResult();
        actResult.success = true;
        actResult.errorCode = 'NONE';
        actResult.message = 'Test message';
        actResult.modelId = '0MC000000000000';
        actResult.modelName = 'Test Model';
        actResult.previousState = 'Planning';
        actResult.newState = 'Active';
        actResult.timestamp = DateTime.now();
        actResult.stackTrace = '';
        actResult.validationChecks = new List<Territory2ModelActivator.ValidationCheck>();

        System.assertEquals(true, actResult.success, 'Success should be set');
        System.assertEquals('Test Model', actResult.modelName, 'Model name should be set');

        // Test ValidationCheck
        Territory2ModelActivator.ValidationCheck check = new Territory2ModelActivator.ValidationCheck();
        check.name = 'Test Check';
        check.passed = true;
        check.message = 'Check passed';

        System.assertEquals('Test Check', check.name, 'Check name should be set');
        System.assertEquals(true, check.passed, 'Check passed should be set');

        // Test ModelStatus
        Territory2ModelActivator.ModelStatus status = new Territory2ModelActivator.ModelStatus();
        status.modelId = '0MC000000000000';
        status.modelName = 'Test Model';
        status.developerName = 'Test_Model';
        status.state = 'Planning';
        status.description = 'Test description';
        status.territoryCount = 10;
        status.userAssignmentCount = 5;
        status.accountAssignmentCount = 100;
        status.timestamp = DateTime.now();
        status.error = null;

        System.assertEquals('Planning', status.state, 'State should be set');
        System.assertEquals(10, status.territoryCount, 'Territory count should be set');
    }

    /**
     * Test activation with malformed JSON
     */
    @isTest
    static void testActivateModel_MalformedJson() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/activate';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('not valid json');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.activateModel();
        Test.stopTest();

        // Verify - should handle exception
        System.assertEquals(false, result.success, 'Should fail with malformed JSON');
        System.assertEquals('UNEXPECTED_ERROR', result.errorCode, 'Should return UNEXPECTED_ERROR');
        System.assertEquals(500, res.statusCode, 'Should return 500 status');
    }

    /**
     * Test archive with malformed JSON
     */
    @isTest
    static void testArchiveModel_MalformedJson() {
        // Setup REST context
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/archive';
        req.httpMethod = 'PUT';
        req.requestBody = Blob.valueOf('not valid json');

        RestContext.request = req;
        RestContext.response = res;

        // Execute
        Test.startTest();
        Territory2ModelActivator.ActivationResult result = Territory2ModelActivator.archiveModel();
        Test.stopTest();

        // Verify - should handle exception
        System.assertEquals(false, result.success, 'Should fail with malformed JSON');
        System.assertEquals('UNEXPECTED_ERROR', result.errorCode, 'Should return UNEXPECTED_ERROR');
        System.assertEquals(500, res.statusCode, 'Should return 500 status');
    }

    /**
     * Integration test with actual Territory2Model (if available)
     * This test will only run in orgs with Territory Management enabled
     */
    @isTest
    static void testWithActualModel() {
        // Check if Territory Management is enabled by querying for any model
        List<Territory2Model> existingModels = [
            SELECT Id, Name, State FROM Territory2Model LIMIT 1
        ];

        if (existingModels.isEmpty()) {
            // Skip test if no models exist (Territory Management may not be enabled)
            System.debug('Skipping integration test - no Territory2Models found');
            return;
        }

        Territory2Model testModel = existingModels[0];

        // Test get status
        RestRequest req = new RestRequest();
        RestResponse res = new RestResponse();
        req.requestURI = '/services/apexrest/territory/model/' + testModel.Id;
        req.httpMethod = 'GET';

        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        Territory2ModelActivator.ModelStatus status = Territory2ModelActivator.getModelStatus();
        Test.stopTest();

        // Verify
        System.assertEquals(testModel.Id, status.modelId, 'Should return correct model ID');
        System.assertEquals(testModel.Name, status.modelName, 'Should return correct model name');
        System.assertEquals(testModel.State, status.state, 'Should return correct state');
        System.assertEquals(200, res.statusCode, 'Should return 200 status');
    }
}
