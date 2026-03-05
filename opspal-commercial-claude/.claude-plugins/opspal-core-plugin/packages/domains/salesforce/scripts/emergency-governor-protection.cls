/**
 * Emergency Governor Limit Protection Class
 * Deploy immediately to prevent system crashes during automation chaos
 * 
 * @author Automation Remediation Team
 * @date 2025-09-10
 * @version 1.0
 */
public class EmergencyGovernorProtection {
    
    // Emergency mode flag - set to true during crisis
    public static Boolean emergencyMode = true;
    
    // Conservative limits during emergency
    public static Integer maxDMLStatements = 50;
    public static Integer maxSOQLQueries = 50;
    public static Integer maxCPUTime = 5000; // 5 seconds
    public static Integer maxHeapSize = 3000000; // 3 MB
    
    // Tracking
    private static Map<String, Integer> operationCounts = new Map<String, Integer>();
    private static Set<String> blockedOperations = new Set<String>();
    
    /**
     * Check limits before any major operation
     * Call this at the start of triggers and complex operations
     */
    public static void checkLimits() {
        if (!emergencyMode) return;
        
        // Check DML limits
        if (Limits.getDMLStatements() > maxDMLStatements) {
            logAndThrowError('DML limit protection triggered. Current: ' + 
                Limits.getDMLStatements() + ', Max: ' + maxDMLStatements);
        }
        
        // Check SOQL limits
        if (Limits.getQueries() > maxSOQLQueries) {
            logAndThrowError('SOQL limit protection triggered. Current: ' + 
                Limits.getQueries() + ', Max: ' + maxSOQLQueries);
        }
        
        // Check CPU time
        if (Limits.getCpuTime() > maxCPUTime) {
            logAndThrowError('CPU time limit protection triggered. Current: ' + 
                Limits.getCpuTime() + 'ms, Max: ' + maxCPUTime + 'ms');
        }
        
        // Check heap size
        if (Limits.getHeapSize() > maxHeapSize) {
            logAndThrowError('Heap size limit protection triggered. Current: ' + 
                Limits.getHeapSize() + ', Max: ' + maxHeapSize);
        }
    }
    
    /**
     * Check if operation should be allowed
     * Prevents automation storms
     */
    public static Boolean shouldAllowOperation(String operationName) {
        if (!emergencyMode) return true;
        
        // Check if operation is blocked
        if (blockedOperations.contains(operationName)) {
            System.debug('Operation blocked by emergency protection: ' + operationName);
            return false;
        }
        
        // Track operation count
        Integer count = operationCounts.get(operationName);
        if (count == null) {
            count = 0;
        }
        count++;
        operationCounts.put(operationName, count);
        
        // Block if operation running too many times (loop detection)
        if (count > 5) {
            blockedOperations.add(operationName);
            System.debug('Operation blocked due to excessive calls: ' + operationName);
            return false;
        }
        
        return true;
    }
    
    /**
     * Get current system health metrics
     */
    public static SystemHealth getCurrentHealth() {
        SystemHealth health = new SystemHealth();
        
        health.dmlUsed = Limits.getDMLStatements();
        health.dmlLimit = Limits.getLimitDMLStatements();
        health.dmlPercentage = (health.dmlUsed * 100) / health.dmlLimit;
        
        health.soqlUsed = Limits.getQueries();
        health.soqlLimit = Limits.getLimitQueries();
        health.soqlPercentage = (health.soqlUsed * 100) / health.soqlLimit;
        
        health.cpuUsed = Limits.getCpuTime();
        health.cpuLimit = Limits.getLimitCpuTime();
        health.cpuPercentage = (health.cpuUsed * 100) / Math.max(health.cpuLimit, 1);
        
        health.heapUsed = Limits.getHeapSize();
        health.heapLimit = Limits.getLimitHeapSize();
        health.heapPercentage = (health.heapUsed * 100) / health.heapLimit;
        
        // Set health status
        Integer maxPercentage = Math.max(
            Math.max(health.dmlPercentage, health.soqlPercentage),
            Math.max(health.cpuPercentage, health.heapPercentage)
        );
        
        if (maxPercentage > 80) {
            health.status = 'CRITICAL';
        } else if (maxPercentage > 60) {
            health.status = 'WARNING';
        } else {
            health.status = 'HEALTHY';
        }
        
        return health;
    }
    
    /**
     * Emergency circuit breaker for runaway automations
     */
    public static void emergencyStop(String reason) {
        if (!emergencyMode) return;
        
        // Log the emergency stop
        System.debug(LoggingLevel.ERROR, 'EMERGENCY STOP TRIGGERED: ' + reason);
        
        // Create error record for tracking
        try {
            Automation_Error__c error = new Automation_Error__c(
                Error_Type__c = 'Emergency Stop',
                Error_Message__c = reason,
                Stack_Trace__c = getStackTrace(),
                Timestamp__c = DateTime.now()
            );
            
            // Use future method to avoid current transaction limits
            logErrorAsync(JSON.serialize(error));
        } catch (Exception e) {
            System.debug('Failed to log emergency stop: ' + e.getMessage());
        }
        
        // Throw exception to stop execution
        throw new EmergencyStopException('Emergency stop activated: ' + reason);
    }
    
    @future
    private static void logErrorAsync(String errorJson) {
        try {
            Automation_Error__c error = (Automation_Error__c)JSON.deserialize(
                errorJson, 
                Automation_Error__c.class
            );
            insert error;
        } catch (Exception e) {
            System.debug('Failed to log error async: ' + e.getMessage());
        }
    }
    
    private static void logAndThrowError(String message) {
        System.debug(LoggingLevel.ERROR, 'GOVERNOR LIMIT PROTECTION: ' + message);
        
        // Log current health
        SystemHealth health = getCurrentHealth();
        System.debug('Current System Health: ' + JSON.serialize(health));
        
        throw new GovernorLimitException(message);
    }
    
    private static String getStackTrace() {
        String trace = '';
        try {
            // Force an exception to get stack trace
            Integer i = 1 / 0;
        } catch (Exception e) {
            trace = e.getStackTraceString();
        }
        return trace;
    }
    
    /**
     * Custom exceptions
     */
    public class GovernorLimitException extends Exception {}
    public class EmergencyStopException extends Exception {}
    
    /**
     * System health metrics
     */
    public class SystemHealth {
        public Integer dmlUsed;
        public Integer dmlLimit;
        public Integer dmlPercentage;
        
        public Integer soqlUsed;
        public Integer soqlLimit;
        public Integer soqlPercentage;
        
        public Integer cpuUsed;
        public Integer cpuLimit;
        public Integer cpuPercentage;
        
        public Integer heapUsed;
        public Integer heapLimit;
        public Integer heapPercentage;
        
        public String status; // HEALTHY, WARNING, CRITICAL
    }
}

/**
 * Test class for Emergency Governor Protection
 */
@isTest
public class EmergencyGovernorProtectionTest {
    
    @isTest
    static void testLimitChecking() {
        // Enable emergency mode
        EmergencyGovernorProtection.emergencyMode = true;
        EmergencyGovernorProtection.maxSOQLQueries = 5;
        
        Test.startTest();
        
        // Perform queries up to limit
        for (Integer i = 0; i < 4; i++) {
            List<User> users = [SELECT Id FROM User LIMIT 1];
        }
        
        // Should not throw exception yet
        try {
            EmergencyGovernorProtection.checkLimits();
            System.assert(true, 'Should pass under limit');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception under limit');
        }
        
        Test.stopTest();
    }
    
    @isTest
    static void testOperationBlocking() {
        EmergencyGovernorProtection.emergencyMode = true;
        
        Test.startTest();
        
        // Should allow first few operations
        for (Integer i = 0; i < 5; i++) {
            Boolean allowed = EmergencyGovernorProtection.shouldAllowOperation('TestOp');
            System.assert(allowed, 'Should allow operation ' + i);
        }
        
        // Should block after threshold
        Boolean blocked = EmergencyGovernorProtection.shouldAllowOperation('TestOp');
        System.assert(!blocked, 'Should block operation after threshold');
        
        Test.stopTest();
    }
    
    @isTest
    static void testHealthMetrics() {
        Test.startTest();
        
        EmergencyGovernorProtection.SystemHealth health = 
            EmergencyGovernorProtection.getCurrentHealth();
        
        System.assertNotEquals(null, health, 'Should return health metrics');
        System.assert(health.dmlUsed >= 0, 'Should have DML metrics');
        System.assert(health.soqlUsed >= 0, 'Should have SOQL metrics');
        System.assertNotEquals(null, health.status, 'Should have status');
        
        Test.stopTest();
    }
}