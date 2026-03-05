/**
 * Territory2ModelActivator
 *
 * REST endpoint for programmatic Territory2Model activation.
 * Provides validation and state transition capabilities that are
 * not available through standard REST API.
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @see docs/runbooks/territory-management/08-deployment-and-activation.md
 */
@RestResource(urlMapping='/territory/model/*')
global with sharing class Territory2ModelActivator {

    /**
     * Activate a Territory2Model
     *
     * POST /services/apexrest/territory/model/activate
     * Body: { "modelId": "0MCxxxxxxxxxx" }
     *
     * @return ActivationResult with success status and details
     */
    @HttpPost
    global static ActivationResult activateModel() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        ActivationResult result = new ActivationResult();
        result.timestamp = DateTime.now();

        try {
            // Parse request body
            Map<String, Object> requestBody = (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
            String modelId = (String) requestBody.get('modelId');

            if (String.isBlank(modelId)) {
                result.success = false;
                result.errorCode = 'MISSING_MODEL_ID';
                result.message = 'modelId is required in request body';
                res.statusCode = 400;
                return result;
            }

            // Validate and activate
            result = performActivation(modelId);

            if (result.success) {
                res.statusCode = 200;
            } else {
                res.statusCode = 400;
            }

        } catch (Exception e) {
            result.success = false;
            result.errorCode = 'UNEXPECTED_ERROR';
            result.message = e.getMessage();
            result.stackTrace = e.getStackTraceString();
            res.statusCode = 500;
        }

        return result;
    }

    /**
     * Get model status
     *
     * GET /services/apexrest/territory/model/{modelId}
     *
     * @return ModelStatus with current state and statistics
     */
    @HttpGet
    global static ModelStatus getModelStatus() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        ModelStatus status = new ModelStatus();
        status.timestamp = DateTime.now();

        try {
            // Extract model ID from URL
            String modelId = req.requestURI.substring(req.requestURI.lastIndexOf('/') + 1);

            if (String.isBlank(modelId) || modelId == 'model') {
                status.error = 'Model ID required in URL path';
                res.statusCode = 400;
                return status;
            }

            // Query model
            List<Territory2Model> models = [
                SELECT Id, Name, DeveloperName, State, Description,
                       CreatedDate, LastModifiedDate
                FROM Territory2Model
                WHERE Id = :modelId
                LIMIT 1
            ];

            if (models.isEmpty()) {
                status.error = 'Model not found';
                res.statusCode = 404;
                return status;
            }

            Territory2Model model = models[0];
            status.modelId = model.Id;
            status.modelName = model.Name;
            status.developerName = model.DeveloperName;
            status.state = model.State;
            status.description = model.Description;

            // Get statistics
            status.territoryCount = [
                SELECT COUNT() FROM Territory2
                WHERE Territory2ModelId = :modelId
            ];

            status.userAssignmentCount = [
                SELECT COUNT() FROM UserTerritory2Association
                WHERE Territory2Id IN (
                    SELECT Id FROM Territory2 WHERE Territory2ModelId = :modelId
                )
            ];

            status.accountAssignmentCount = [
                SELECT COUNT() FROM ObjectTerritory2Association
                WHERE Territory2Id IN (
                    SELECT Id FROM Territory2 WHERE Territory2ModelId = :modelId
                )
            ];

            res.statusCode = 200;

        } catch (Exception e) {
            status.error = e.getMessage();
            res.statusCode = 500;
        }

        return status;
    }

    /**
     * Archive a Territory2Model
     *
     * PUT /services/apexrest/territory/model/archive
     * Body: { "modelId": "0MCxxxxxxxxxx" }
     *
     * @return ActivationResult with success status
     */
    @HttpPut
    global static ActivationResult archiveModel() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        ActivationResult result = new ActivationResult();
        result.timestamp = DateTime.now();

        try {
            Map<String, Object> requestBody = (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
            String modelId = (String) requestBody.get('modelId');

            if (String.isBlank(modelId)) {
                result.success = false;
                result.errorCode = 'MISSING_MODEL_ID';
                result.message = 'modelId is required in request body';
                res.statusCode = 400;
                return result;
            }

            // Query model
            List<Territory2Model> models = [
                SELECT Id, Name, State FROM Territory2Model
                WHERE Id = :modelId
                LIMIT 1
            ];

            if (models.isEmpty()) {
                result.success = false;
                result.errorCode = 'MODEL_NOT_FOUND';
                result.message = 'Territory2Model not found';
                res.statusCode = 404;
                return result;
            }

            Territory2Model model = models[0];

            if (model.State != 'Active') {
                result.success = false;
                result.errorCode = 'INVALID_STATE';
                result.message = 'Model must be in Active state to archive. Current state: ' + model.State;
                res.statusCode = 400;
                return result;
            }

            // Archive
            model.State = 'Archived';
            update model;

            result.success = true;
            result.modelId = model.Id;
            result.modelName = model.Name;
            result.previousState = 'Active';
            result.newState = 'Archived';
            result.message = 'Model archived successfully';
            res.statusCode = 200;

        } catch (Exception e) {
            result.success = false;
            result.errorCode = 'UNEXPECTED_ERROR';
            result.message = e.getMessage();
            res.statusCode = 500;
        }

        return result;
    }

    /**
     * Perform model activation with validation
     */
    private static ActivationResult performActivation(String modelId) {
        ActivationResult result = new ActivationResult();
        result.validationChecks = new List<ValidationCheck>();

        // 1. Query model
        List<Territory2Model> models = [
            SELECT Id, Name, DeveloperName, State
            FROM Territory2Model
            WHERE Id = :modelId
            LIMIT 1
        ];

        if (models.isEmpty()) {
            result.success = false;
            result.errorCode = 'MODEL_NOT_FOUND';
            result.message = 'Territory2Model not found';
            return result;
        }

        Territory2Model model = models[0];
        result.modelId = model.Id;
        result.modelName = model.Name;
        result.previousState = model.State;

        // 2. Check current state
        ValidationCheck stateCheck = new ValidationCheck();
        stateCheck.name = 'Current State';
        if (model.State != 'Planning') {
            stateCheck.passed = false;
            stateCheck.message = 'Model must be in Planning state. Current: ' + model.State;
            result.validationChecks.add(stateCheck);
            result.success = false;
            result.errorCode = 'INVALID_STATE';
            result.message = stateCheck.message;
            return result;
        }
        stateCheck.passed = true;
        stateCheck.message = 'Model is in Planning state';
        result.validationChecks.add(stateCheck);

        // 3. Check no other active model
        ValidationCheck activeCheck = new ValidationCheck();
        activeCheck.name = 'No Active Model';
        List<Territory2Model> activeModels = [
            SELECT Id, Name FROM Territory2Model
            WHERE State = 'Active'
            LIMIT 1
        ];
        if (!activeModels.isEmpty()) {
            activeCheck.passed = false;
            activeCheck.message = 'Another model is already active: ' + activeModels[0].Name;
            result.validationChecks.add(activeCheck);
            result.success = false;
            result.errorCode = 'ACTIVE_MODEL_EXISTS';
            result.message = activeCheck.message;
            return result;
        }
        activeCheck.passed = true;
        activeCheck.message = 'No other model is currently active';
        result.validationChecks.add(activeCheck);

        // 4. Check has territories
        ValidationCheck territoryCheck = new ValidationCheck();
        territoryCheck.name = 'Has Territories';
        Integer territoryCount = [
            SELECT COUNT() FROM Territory2
            WHERE Territory2ModelId = :modelId
        ];
        if (territoryCount == 0) {
            territoryCheck.passed = false;
            territoryCheck.message = 'Model has no territories';
            result.validationChecks.add(territoryCheck);
            result.success = false;
            result.errorCode = 'NO_TERRITORIES';
            result.message = territoryCheck.message;
            return result;
        }
        territoryCheck.passed = true;
        territoryCheck.message = 'Model has ' + territoryCount + ' territories';
        result.validationChecks.add(territoryCheck);

        // 5. Check for orphaned territories
        ValidationCheck orphanCheck = new ValidationCheck();
        orphanCheck.name = 'No Orphaned Territories';
        Set<Id> validTerritoryIds = new Map<Id, Territory2>([
            SELECT Id FROM Territory2 WHERE Territory2ModelId = :modelId
        ]).keySet();

        Integer orphanCount = [
            SELECT COUNT() FROM Territory2
            WHERE Territory2ModelId = :modelId
            AND ParentTerritory2Id != null
            AND ParentTerritory2Id NOT IN :validTerritoryIds
        ];
        if (orphanCount > 0) {
            orphanCheck.passed = false;
            orphanCheck.message = orphanCount + ' orphaned territories found';
            result.validationChecks.add(orphanCheck);
            result.success = false;
            result.errorCode = 'ORPHANED_TERRITORIES';
            result.message = orphanCheck.message;
            return result;
        }
        orphanCheck.passed = true;
        orphanCheck.message = 'No orphaned territories';
        result.validationChecks.add(orphanCheck);

        // 6. All validations passed - activate
        try {
            model.State = 'Active';
            update model;

            result.success = true;
            result.newState = 'Active';
            result.message = 'Model activated successfully';

        } catch (DmlException e) {
            result.success = false;
            result.errorCode = 'ACTIVATION_FAILED';
            result.message = 'Failed to activate model: ' + e.getMessage();
        }

        return result;
    }

    /**
     * Result class for activation operations
     */
    global class ActivationResult {
        global Boolean success;
        global String errorCode;
        global String message;
        global String modelId;
        global String modelName;
        global String previousState;
        global String newState;
        global DateTime timestamp;
        global String stackTrace;
        global List<ValidationCheck> validationChecks;
    }

    /**
     * Validation check detail
     */
    global class ValidationCheck {
        global String name;
        global Boolean passed;
        global String message;
    }

    /**
     * Model status result
     */
    global class ModelStatus {
        global String modelId;
        global String modelName;
        global String developerName;
        global String state;
        global String description;
        global Integer territoryCount;
        global Integer userAssignmentCount;
        global Integer accountAssignmentCount;
        global DateTime timestamp;
        global String error;
    }
}
