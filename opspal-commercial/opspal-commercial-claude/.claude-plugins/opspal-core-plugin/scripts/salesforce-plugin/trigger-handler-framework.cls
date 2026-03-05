/**
 * Trigger Handler Framework
 * Base class for all trigger handlers to ensure consistent execution and recursion control
 * 
 * @author Automation Remediation Team
 * @date 2025-09-10
 * @version 2.0
 */
public virtual class TriggerHandler {
    
    // Static recursion prevention
    private static Set<String> bypassedHandlers = new Set<String>();
    private static Map<String, Integer> loopCountMap = new Map<String, Integer>();
    private static Map<String, Integer> loopMaxMap = new Map<String, Integer>();
    private static Set<String> executedHandlers = new Set<String>();
    
    // Instance variables
    protected Boolean isTriggerExecuting;
    protected Boolean isExecuting = false;
    
    // Trigger context variables
    @TestVisible
    protected Boolean isInsert = false;
    @TestVisible
    protected Boolean isUpdate = false;
    @TestVisible
    protected Boolean isDelete = false;
    @TestVisible
    protected Boolean isUndelete = false;
    @TestVisible
    protected Boolean isBefore = false;
    @TestVisible
    protected Boolean isAfter = false;
    
    // Constructor
    public TriggerHandler() {
        this.setMaxLoopCount(5);
        this.setTriggerContext();
    }
    
    /**
     * Main method to run trigger logic
     */
    public void run() {
        // Check emergency protection first
        if (EmergencyGovernorProtection.emergencyMode) {
            EmergencyGovernorProtection.checkLimits();
            
            String handlerName = getHandlerName();
            if (!EmergencyGovernorProtection.shouldAllowOperation(handlerName)) {
                System.debug('Handler blocked by emergency protection: ' + handlerName);
                return;
            }
        }
        
        if (!validateRun()) return;
        
        addToLoopCount();
        
        // Mark as executed
        executedHandlers.add(getHandlerName());
        
        try {
            // Route to correct handler method
            if (this.isBefore) {
                if (this.isInsert) {
                    this.beforeInsert();
                } else if (this.isUpdate) {
                    this.beforeUpdate();
                } else if (this.isDelete) {
                    this.beforeDelete();
                }
            } else { // After triggers
                if (this.isInsert) {
                    this.afterInsert();
                } else if (this.isUpdate) {
                    this.afterUpdate();
                } else if (this.isDelete) {
                    this.afterDelete();
                } else if (this.isUndelete) {
                    this.afterUndelete();
                }
            }
        } catch (Exception e) {
            // Log error and re-throw
            logError(e);
            throw e;
        }
    }
    
    /**
     * Virtual methods to be overridden in concrete handlers
     */
    protected virtual void beforeInsert() {}
    protected virtual void beforeUpdate() {}
    protected virtual void beforeDelete() {}
    protected virtual void afterInsert() {}
    protected virtual void afterUpdate() {}
    protected virtual void afterDelete() {}
    protected virtual void afterUndelete() {}
    
    /**
     * Method to handle bulk operations efficiently
     */
    protected void bulkBefore() {}
    protected void bulkAfter() {}
    
    /**
     * Recursion prevention methods
     */
    public static void bypass(String handlerName) {
        bypassedHandlers.add(handlerName);
    }
    
    public static void clearBypass(String handlerName) {
        bypassedHandlers.remove(handlerName);
    }
    
    public static Boolean isBypassed(String handlerName) {
        return bypassedHandlers.contains(handlerName);
    }
    
    public static void clearAllBypasses() {
        bypassedHandlers.clear();
    }
    
    /**
     * Loop count management
     */
    public void setMaxLoopCount(Integer max) {
        String handlerName = getHandlerName();
        if (max < 1) {
            max = 1;
        }
        loopMaxMap.put(handlerName, max);
    }
    
    public void clearMaxLoopCount() {
        loopMaxMap.remove(getHandlerName());
    }
    
    /**
     * Check if handler has already executed
     */
    public static Boolean hasExecuted(String handlerName) {
        return executedHandlers.contains(handlerName);
    }
    
    public static void resetExecution() {
        executedHandlers.clear();
        loopCountMap.clear();
    }
    
    /**
     * Protected helper methods
     */
    @TestVisible
    protected void setTriggerContext() {
        if (Trigger.isExecuting) {
            this.isTriggerExecuting = true;
            this.isInsert = Trigger.isInsert;
            this.isUpdate = Trigger.isUpdate;
            this.isDelete = Trigger.isDelete;
            this.isUndelete = Trigger.isUndelete;
            this.isBefore = Trigger.isBefore;
            this.isAfter = Trigger.isAfter;
        }
    }
    
    @TestVisible
    protected String getHandlerName() {
        return String.valueOf(this).substring(0, String.valueOf(this).indexOf(':'));
    }
    
    @TestVisible
    protected Boolean validateRun() {
        if (!this.isTriggerExecuting || this.isExecuting) {
            return false;
        }
        
        if (isBypassed(getHandlerName())) {
            return false;
        }
        
        if (hasExceededMaxLoopCount()) {
            return false;
        }
        
        return true;
    }
    
    @TestVisible
    protected void addToLoopCount() {
        String handlerName = getHandlerName();
        if (loopCountMap.containsKey(handlerName)) {
            loopCountMap.put(handlerName, loopCountMap.get(handlerName) + 1);
        } else {
            loopCountMap.put(handlerName, 1);
        }
    }
    
    @TestVisible
    protected Boolean hasExceededMaxLoopCount() {
        String handlerName = getHandlerName();
        if (loopCountMap.containsKey(handlerName)) {
            Integer max = loopMaxMap.get(handlerName);
            if (max != null && loopCountMap.get(handlerName) > max) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Error logging
     */
    protected void logError(Exception e) {
        System.debug(LoggingLevel.ERROR, 'Error in trigger handler: ' + getHandlerName());
        System.debug(LoggingLevel.ERROR, 'Error message: ' + e.getMessage());
        System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
        
        // Try to log to custom object
        try {
            Automation_Error__c error = new Automation_Error__c(
                Handler_Name__c = getHandlerName(),
                Error_Type__c = e.getTypeName(),
                Error_Message__c = e.getMessage(),
                Stack_Trace__c = e.getStackTraceString(),
                Timestamp__c = DateTime.now()
            );
            insert error;
        } catch (Exception logEx) {
            System.debug('Failed to log error to custom object: ' + logEx.getMessage());
        }
    }
    
    /**
     * Helper method to get record Ids
     */
    protected Set<Id> getRecordIds() {
        Set<Id> recordIds = new Set<Id>();
        
        if (Trigger.new != null) {
            for (SObject record : Trigger.new) {
                recordIds.add(record.Id);
            }
        }
        
        if (Trigger.old != null) {
            for (SObject record : Trigger.old) {
                recordIds.add(record.Id);
            }
        }
        
        return recordIds;
    }
}

/**
 * Test class for TriggerHandler
 */
@isTest
public class TriggerHandlerTest {
    
    private static final String HANDLER_NAME = 'TestHandler';
    
    // Test handler implementation
    private class TestHandler extends TriggerHandler {
        public Integer beforeInsertCount = 0;
        public Integer afterInsertCount = 0;
        public Integer beforeUpdateCount = 0;
        public Integer afterUpdateCount = 0;
        
        public override void beforeInsert() {
            beforeInsertCount++;
        }
        
        public override void afterInsert() {
            afterInsertCount++;
        }
        
        public override void beforeUpdate() {
            beforeUpdateCount++;
        }
        
        public override void afterUpdate() {
            afterUpdateCount++;
        }
    }
    
    @isTest
    static void testBypass() {
        TriggerHandler.bypass(HANDLER_NAME);
        System.assert(TriggerHandler.isBypassed(HANDLER_NAME), 'Handler should be bypassed');
        
        TriggerHandler.clearBypass(HANDLER_NAME);
        System.assert(!TriggerHandler.isBypassed(HANDLER_NAME), 'Handler should not be bypassed');
        
        TriggerHandler.bypass(HANDLER_NAME);
        TriggerHandler.clearAllBypasses();
        System.assert(!TriggerHandler.isBypassed(HANDLER_NAME), 'All bypasses should be cleared');
    }
    
    @isTest
    static void testMaxLoopCount() {
        TestHandler handler = new TestHandler();
        handler.setMaxLoopCount(2);
        
        // Simulate trigger context
        handler.isTriggerExecuting = true;
        handler.isInsert = true;
        handler.isBefore = true;
        
        // First execution
        handler.run();
        System.assertEquals(1, handler.beforeInsertCount, 'Should execute once');
        
        // Second execution
        handler.isExecuting = false;
        handler.run();
        System.assertEquals(2, handler.beforeInsertCount, 'Should execute twice');
        
        // Third execution should be blocked
        handler.isExecuting = false;
        handler.run();
        System.assertEquals(2, handler.beforeInsertCount, 'Should not execute third time');
    }
    
    @isTest
    static void testExecutionTracking() {
        System.assert(!TriggerHandler.hasExecuted(HANDLER_NAME), 'Should not have executed');
        
        TestHandler handler = new TestHandler();
        handler.isTriggerExecuting = true;
        handler.isInsert = true;
        handler.isAfter = true;
        
        handler.run();
        
        System.assert(TriggerHandler.hasExecuted(handler.getHandlerName()), 'Should have executed');
        
        TriggerHandler.resetExecution();
        System.assert(!TriggerHandler.hasExecuted(handler.getHandlerName()), 'Should be reset');
    }
    
    @isTest
    static void testTriggerContextRouting() {
        TestHandler handler = new TestHandler();
        handler.isTriggerExecuting = true;
        
        // Test before insert
        handler.isInsert = true;
        handler.isBefore = true;
        handler.isAfter = false;
        handler.run();
        System.assertEquals(1, handler.beforeInsertCount, 'Should call beforeInsert');
        
        // Reset for after insert
        TriggerHandler.resetExecution();
        handler.isExecuting = false;
        handler.isBefore = false;
        handler.isAfter = true;
        handler.run();
        System.assertEquals(1, handler.afterInsertCount, 'Should call afterInsert');
        
        // Reset for before update
        TriggerHandler.resetExecution();
        handler.isExecuting = false;
        handler.isInsert = false;
        handler.isUpdate = true;
        handler.isBefore = true;
        handler.isAfter = false;
        handler.run();
        System.assertEquals(1, handler.beforeUpdateCount, 'Should call beforeUpdate');
        
        // Reset for after update
        TriggerHandler.resetExecution();
        handler.isExecuting = false;
        handler.isBefore = false;
        handler.isAfter = true;
        handler.run();
        System.assertEquals(1, handler.afterUpdateCount, 'Should call afterUpdate');
    }
}