/**
 * SHARING RULES TRIGGER TEMPLATE
 *
 * Purpose: Dynamic sharing rule management and programmatic record sharing
 * Use Case: Automatically share records when:
 *   - Record assigned to team → Share with team members
 *   - Partner relationship created → Share with partner users
 *   - Geographic territory match → Share with territory reps
 *   - Project collaboration → Share with stakeholders
 *   - Custom criteria met → Grant access dynamically
 *
 * Pattern: Apex-managed sharing for dynamic access control beyond org-wide defaults
 *
 * Sharing Types:
 *   - Team-based sharing (share with all team members)
 *   - Role-based sharing (share with specific roles)
 *   - Territory-based sharing (geographic assignment)
 *   - Collaboration sharing (multi-user projects)
 *   - Partner sharing (external users)
 *   - Conditional sharing (based on field values)
 *
 * Access Levels:
 *   - Read (view only)
 *   - Edit (view and modify)
 *   - All (full access)
 *
 * Business Benefits:
 *   - Flexible access control beyond standard sharing rules
 *   - Dynamic visibility based on business logic
 *   - Improved collaboration
 *   - Reduced manual sharing
 *   - Audit trail of sharing changes
 *
 * Considerations:
 *   - Sharing model (Private/Public Read/Write)
 *   - Performance (bulk sharing operations)
 *   - Sharing reason (custom vs manual)
 *   - Recalculation on changes
 *   - Clean up removed shares
 *   - Governor limits (10,000 shares per transaction)
 *
 * CUSTOMIZATION CHECKLIST:
 * [ ] Replace ObjectName with your actual object API name
 * [ ] Verify object has Private or Public Read Only sharing model
 * [ ] Create custom sharing reason (if needed)
 * [ ] Configure team/territory/role mappings
 * [ ] Set up sharing recalculation triggers
 * [ ] Test sharing with different user profiles
 * [ ] Implement sharing audit trail
 * [ ] Set up sharing cleanup for removed access
 */

// ============================================================================
// TRIGGER FILE
// ============================================================================
trigger ObjectNameSharingRulesTrigger on ObjectName (after insert, after update, after delete) {
    ObjectNameSharingRulesHandler.handleTrigger();
}

// ============================================================================
// HANDLER CLASS
// ============================================================================
public class ObjectNameSharingRulesHandler {

    // Recursion prevention
    private static Boolean isExecuting = false;

    public static void handleTrigger() {
        // Prevent recursion
        if (isExecuting) {
            return;
        }

        try {
            isExecuting = true;

            if (Trigger.isAfter) {
                if (Trigger.isInsert) {
                    applySharing(Trigger.new);
                } else if (Trigger.isUpdate) {
                    recalculateSharing(Trigger.new, Trigger.oldMap);
                } else if (Trigger.isDelete) {
                    // Sharing records deleted automatically with parent
                    // No action needed
                }
            }

        } finally {
            isExecuting = false;
        }
    }

    // ========================================================================
    // CONFIGURATION
    // ========================================================================

    // Custom sharing reason (must be created in metadata)
    // Format: ObjectName__Share.reason = ObjectName_Team__c
    private static final String TEAM_SHARING_REASON = 'Team__c';
    private static final String TERRITORY_SHARING_REASON = 'Territory__c';
    private static final String PARTNER_SHARING_REASON = 'Partner__c';
    private static final String COLLABORATION_SHARING_REASON = 'Collaboration__c';

    // Default access level for different sharing types
    private static final Map<String, String> ACCESS_LEVELS =
        new Map<String, String>{
            'Team' => 'Edit',
            'Territory' => 'Read',
            'Partner' => 'Read',
            'Collaboration' => 'Edit',
            'Manager' => 'All'
        };

    // ========================================================================
    // APPLY SHARING (INSERT)
    // ========================================================================

    /**
     * Apply sharing rules when records are created
     */
    public static void applySharing(List<ObjectName> records) {
        List<ObjectName__Share> sharesToInsert = new List<ObjectName__Share>();

        for (ObjectName record : records) {
            // Skip if sharing disabled for this record
            if (record.DisableAutomaticSharing__c == true) {
                continue;
            }

            // Team-based sharing
            if (record.TeamId__c != null) {
                sharesToInsert.addAll(shareWithTeam(record));
            }

            // Territory-based sharing
            if (record.TerritoryId__c != null) {
                sharesToInsert.addAll(shareWithTerritory(record));
            }

            // Partner-based sharing
            if (record.PartnerId__c != null) {
                sharesToInsert.addAll(shareWithPartner(record));
            }

            // Role-based sharing
            if (record.RequiresExecutiveVisibility__c == true) {
                sharesToInsert.addAll(shareWithExecutives(record));
            }

            // Share with manager
            if (record.OwnerId != null) {
                sharesToInsert.addAll(shareWithManager(record));
            }

            // Collaboration sharing (multi-user projects)
            if (record.CollaboratorIds__c != null) {
                sharesToInsert.addAll(shareWithCollaborators(record));
            }
        }

        // Insert shares (single DML)
        if (!sharesToInsert.isEmpty()) {
            Database.SaveResult[] results = Database.insert(sharesToInsert, false);

            // Log failures
            for (Integer i = 0; i < results.size(); i++) {
                if (!results[i].isSuccess()) {
                    System.debug('Failed to create share: ' +
                        results[i].getErrors()[0].getMessage());
                }
            }
        }
    }

    // ========================================================================
    // RECALCULATE SHARING (UPDATE)
    // ========================================================================

    /**
     * Recalculate sharing when relevant fields change
     */
    public static void recalculateSharing(List<ObjectName> newRecords,
                                          Map<Id, ObjectName> oldMap) {
        Set<Id> recordsToRecalculate = new Set<Id>();

        for (ObjectName newRecord : newRecords) {
            ObjectName oldRecord = oldMap.get(newRecord.Id);

            // Check if sharing-relevant fields changed
            if (newRecord.TeamId__c != oldRecord.TeamId__c ||
                newRecord.TerritoryId__c != oldRecord.TerritoryId__c ||
                newRecord.PartnerId__c != oldRecord.PartnerId__c ||
                newRecord.CollaboratorIds__c != oldRecord.CollaboratorIds__c ||
                newRecord.RequiresExecutiveVisibility__c !=
                    oldRecord.RequiresExecutiveVisibility__c) {

                recordsToRecalculate.add(newRecord.Id);
            }
        }

        if (!recordsToRecalculate.isEmpty()) {
            // Delete existing Apex-managed shares
            deleteApexManagedShares(recordsToRecalculate);

            // Reapply sharing
            List<ObjectName> recordsToReshare = [
                SELECT Id, TeamId__c, TerritoryId__c, PartnerId__c,
                       CollaboratorIds__c, RequiresExecutiveVisibility__c,
                       OwnerId, DisableAutomaticSharing__c
                FROM ObjectName
                WHERE Id IN :recordsToRecalculate
            ];

            applySharing(recordsToReshare);
        }
    }

    // ========================================================================
    // TEAM SHARING
    // ========================================================================

    /**
     * Share with team members
     */
    private static List<ObjectName__Share> shareWithTeam(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Get team members
        List<TeamMember__c> members = [
            SELECT UserId__c, AccessLevel__c
            FROM TeamMember__c
            WHERE TeamId__c = :record.TeamId__c
              AND IsActive__c = true
              AND UserId__c != :record.OwnerId // Don't share with owner
        ];

        for (TeamMember__c member : members) {
            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = member.UserId__c;
            share.AccessLevel = getAccessLevel('Team', member.AccessLevel__c);
            share.RowCause = Schema.ObjectName__Share.RowCause.Team__c;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // TERRITORY SHARING
    // ========================================================================

    /**
     * Share with territory users
     */
    private static List<ObjectName__Share> shareWithTerritory(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Get territory users
        List<UserTerritory2Association> territoryUsers = [
            SELECT UserId
            FROM UserTerritory2Association
            WHERE Territory2Id = :record.TerritoryId__c
              AND IsActive = true
              AND UserId != :record.OwnerId
        ];

        for (UserTerritory2Association territoryUser : territoryUsers) {
            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = territoryUser.UserId;
            share.AccessLevel = ACCESS_LEVELS.get('Territory');
            share.RowCause = Schema.ObjectName__Share.RowCause.Territory__c;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // PARTNER SHARING
    // ========================================================================

    /**
     * Share with partner users
     */
    private static List<ObjectName__Share> shareWithPartner(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Get partner account users
        List<User> partnerUsers = [
            SELECT Id
            FROM User
            WHERE AccountId = :record.PartnerId__c
              AND IsActive = true
              AND IsPortalEnabled = true
        ];

        for (User partnerUser : partnerUsers) {
            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = partnerUser.Id;
            share.AccessLevel = ACCESS_LEVELS.get('Partner');
            share.RowCause = Schema.ObjectName__Share.RowCause.Partner__c;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // ROLE-BASED SHARING
    // ========================================================================

    /**
     * Share with executives (role-based)
     */
    private static List<ObjectName__Share> shareWithExecutives(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Get executive users
        List<User> executives = [
            SELECT Id
            FROM User
            WHERE Profile.Name IN ('System Administrator', 'CEO', 'Executive')
              AND IsActive = true
              AND Id != :record.OwnerId
        ];

        for (User executive : executives) {
            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = executive.Id;
            share.AccessLevel = ACCESS_LEVELS.get('Manager');
            share.RowCause = Schema.ObjectName__Share.RowCause.Manual;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // MANAGER SHARING
    // ========================================================================

    /**
     * Share with owner's manager
     */
    private static List<ObjectName__Share> shareWithManager(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Get owner's manager
        User owner = [
            SELECT ManagerId
            FROM User
            WHERE Id = :record.OwnerId
        ];

        if (owner.ManagerId != null) {
            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = owner.ManagerId;
            share.AccessLevel = ACCESS_LEVELS.get('Manager');
            share.RowCause = Schema.ObjectName__Share.RowCause.Manual;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // COLLABORATION SHARING
    // ========================================================================

    /**
     * Share with collaborators
     */
    private static List<ObjectName__Share> shareWithCollaborators(ObjectName record) {
        List<ObjectName__Share> shares = new List<ObjectName__Share>();

        // Parse collaborator IDs (comma-separated)
        if (String.isBlank(record.CollaboratorIds__c)) {
            return shares;
        }

        List<String> collaboratorIds = record.CollaboratorIds__c.split(',');

        for (String collaboratorId : collaboratorIds) {
            Id userId = (Id)collaboratorId.trim();

            // Skip owner
            if (userId == record.OwnerId) {
                continue;
            }

            ObjectName__Share share = new ObjectName__Share();
            share.ParentId = record.Id;
            share.UserOrGroupId = userId;
            share.AccessLevel = ACCESS_LEVELS.get('Collaboration');
            share.RowCause = Schema.ObjectName__Share.RowCause.Collaboration__c;

            shares.add(share);
        }

        return shares;
    }

    // ========================================================================
    // PUBLIC GROUP SHARING
    // ========================================================================

    /**
     * Share with public group
     */
    public static void shareWithPublicGroup(Id recordId, String groupName,
                                           String accessLevel) {
        // Get group ID
        Group publicGroup = [
            SELECT Id
            FROM Group
            WHERE DeveloperName = :groupName
              AND Type = 'Regular'
            LIMIT 1
        ];

        ObjectName__Share share = new ObjectName__Share();
        share.ParentId = recordId;
        share.UserOrGroupId = publicGroup.Id;
        share.AccessLevel = accessLevel;
        share.RowCause = Schema.ObjectName__Share.RowCause.Manual;

        insert share;
    }

    /**
     * Share with queue
     */
    public static void shareWithQueue(Id recordId, String queueName,
                                     String accessLevel) {
        // Get queue ID
        Group queue = [
            SELECT Id
            FROM Group
            WHERE DeveloperName = :queueName
              AND Type = 'Queue'
            LIMIT 1
        ];

        ObjectName__Share share = new ObjectName__Share();
        share.ParentId = recordId;
        share.UserOrGroupId = queue.Id;
        share.AccessLevel = accessLevel;
        share.RowCause = Schema.ObjectName__Share.RowCause.Manual;

        insert share;
    }

    // ========================================================================
    // SHARING CLEANUP
    // ========================================================================

    /**
     * Delete Apex-managed shares for records
     */
    private static void deleteApexManagedShares(Set<Id> recordIds) {
        List<ObjectName__Share> sharesToDelete = [
            SELECT Id
            FROM ObjectName__Share
            WHERE ParentId IN :recordIds
              AND RowCause IN (
                  'Team__c',
                  'Territory__c',
                  'Partner__c',
                  'Collaboration__c',
                  'Manual'
              )
        ];

        if (!sharesToDelete.isEmpty()) {
            delete sharesToDelete;
        }
    }

    /**
     * Remove specific user's access
     */
    public static void removeUserAccess(Id recordId, Id userId) {
        List<ObjectName__Share> shares = [
            SELECT Id
            FROM ObjectName__Share
            WHERE ParentId = :recordId
              AND UserOrGroupId = :userId
              AND RowCause != 'Owner' // Don't delete owner access
        ];

        if (!shares.isEmpty()) {
            delete shares;
        }
    }

    /**
     * Remove all Apex-managed sharing for record
     */
    public static void removeAllApexSharing(Id recordId) {
        deleteApexManagedShares(new Set<Id>{recordId});
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Get access level with fallback
     */
    private static String getAccessLevel(String sharingType, String customLevel) {
        if (String.isNotBlank(customLevel)) {
            return customLevel;
        }

        return ACCESS_LEVELS.get(sharingType);
    }

    /**
     * Get all users with access to record
     */
    public static List<Id> getRecordAccessUsers(Id recordId) {
        List<Id> userIds = new List<Id>();

        List<ObjectName__Share> shares = [
            SELECT UserOrGroupId
            FROM ObjectName__Share
            WHERE ParentId = :recordId
        ];

        for (ObjectName__Share share : shares) {
            userIds.add(share.UserOrGroupId);
        }

        return userIds;
    }

    /**
     * Check if user has access to record
     */
    public static Boolean hasUserAccess(Id recordId, Id userId) {
        Integer shareCount = [
            SELECT COUNT()
            FROM ObjectName__Share
            WHERE ParentId = :recordId
              AND UserOrGroupId = :userId
        ];

        return shareCount > 0;
    }

    /**
     * Get user's access level
     */
    public static String getUserAccessLevel(Id recordId, Id userId) {
        List<ObjectName__Share> shares = [
            SELECT AccessLevel
            FROM ObjectName__Share
            WHERE ParentId = :recordId
              AND UserOrGroupId = :userId
            ORDER BY AccessLevel DESC
            LIMIT 1
        ];

        return shares.isEmpty() ? null : shares[0].AccessLevel;
    }
}

// ============================================================================
// TEST CLASS TEMPLATE
// ============================================================================
@isTest
private class ObjectNameSharingRulesHandlerTest {

    @testSetup
    static void setup() {
        // Create test users
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];

        User user1 = new User(
            FirstName = 'Test',
            LastName = 'User1',
            Email = 'user1@test.com',
            Username = 'user1@test.com.sharing',
            Alias = 'user1',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert user1;

        User user2 = new User(
            FirstName = 'Test',
            LastName = 'User2',
            Email = 'user2@test.com',
            Username = 'user2@test.com.sharing',
            Alias = 'user2',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        insert user2;
    }

    @isTest
    static void testTeamSharing() {
        User user1 = [SELECT Id FROM User WHERE Username = 'user1@test.com.sharing'];
        User user2 = [SELECT Id FROM User WHERE Username = 'user2@test.com.sharing'];

        // Create team
        Team__c team = new Team__c(Name = 'Test Team');
        insert team;

        // Add team member
        TeamMember__c member = new TeamMember__c(
            TeamId__c = team.Id,
            UserId__c = user2.Id,
            IsActive__c = true
        );
        insert member;

        // Create record with team
        System.runAs(user1) {
            Test.startTest();
            ObjectName record = new ObjectName(
                Name = 'Test Record',
                TeamId__c = team.Id,
                OwnerId = user1.Id
            );
            insert record;
            Test.stopTest();

            // Verify sharing
            List<ObjectName__Share> shares = [
                SELECT UserOrGroupId, AccessLevel
                FROM ObjectName__Share
                WHERE ParentId = :record.Id
                  AND UserOrGroupId = :user2.Id
            ];

            System.assertEquals(1, shares.size(), 'Should create team share');
        }
    }

    @isTest
    static void testRecalculateSharing() {
        User user1 = [SELECT Id FROM User WHERE Username = 'user1@test.com.sharing'];
        User user2 = [SELECT Id FROM User WHERE Username = 'user2@test.com.sharing'];

        // Create teams
        Team__c team1 = new Team__c(Name = 'Team 1');
        insert team1;

        Team__c team2 = new Team__c(Name = 'Team 2');
        insert team2;

        // Add members
        TeamMember__c member1 = new TeamMember__c(
            TeamId__c = team1.Id,
            UserId__c = user2.Id,
            IsActive__c = true
        );
        insert member1;

        // Create record
        System.runAs(user1) {
            ObjectName record = new ObjectName(
                Name = 'Test Record',
                TeamId__c = team1.Id,
                OwnerId = user1.Id
            );
            insert record;

            Test.startTest();
            // Change team
            record.TeamId__c = team2.Id;
            update record;
            Test.stopTest();

            // Verify old shares deleted and new shares created
            Integer shareCount = [
                SELECT COUNT()
                FROM ObjectName__Share
                WHERE ParentId = :record.Id
                  AND UserOrGroupId = :user2.Id
            ];

            System.assertEquals(0, shareCount,
                'Old team shares should be removed');
        }
    }
}

/**
 * REQUIRED CONFIGURATION:
 *
 * 1. Object Sharing Setting:
 *    - Set ObjectName sharing to "Private" or "Public Read Only"
 *    - Navigate to: Setup → Sharing Settings → ObjectName
 *
 * 2. Custom Sharing Reasons (if using):
 *    - Create in metadata: ObjectName__Share object
 *    - Add Apex Sharing Reasons:
 *      - Team__c
 *      - Territory__c
 *      - Partner__c
 *      - Collaboration__c
 *
 * 3. Required Fields:
 *    - ObjectName.TeamId__c (Lookup to Team__c)
 *    - ObjectName.TerritoryId__c (Text, 18)
 *    - ObjectName.PartnerId__c (Lookup to Account)
 *    - ObjectName.CollaboratorIds__c (Long Text Area)
 *    - ObjectName.RequiresExecutiveVisibility__c (Checkbox)
 *    - ObjectName.DisableAutomaticSharing__c (Checkbox)
 *
 * 4. Custom Objects (if using team sharing):
 *    - Team__c
 *      - Name (Text)
 *    - TeamMember__c
 *      - TeamId__c (Master-Detail to Team__c)
 *      - UserId__c (Lookup to User)
 *      - IsActive__c (Checkbox)
 *      - AccessLevel__c (Picklist: Read, Edit, All)
 */
