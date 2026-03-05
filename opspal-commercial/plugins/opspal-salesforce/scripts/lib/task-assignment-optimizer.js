#!/usr/bin/env node

/**
 * Task Assignment Optimizer
 *
 * Intelligently distributes tasks across team members based on:
 * - Current workload
 * - Account Team roles
 * - User availability
 * - Round-robin distribution
 * - Custom assignment rules
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TaskAssignmentOptimizer {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.defaultOwnerId = options.defaultOwnerId;
        this.maxTasksPerUser = options.maxTasksPerUser || 100;
        this.distributionStrategy = options.strategy || 'balanced'; // balanced, round-robin, workload, role-based
        this.cacheDir = options.cacheDir || path.join(os.tmpdir(), 'task-assignment-cache');
        this.enableLogging = options.enableLogging !== false;

        this.ensureCacheDir();
        this.userCache = new Map();
        this.teamCache = new Map();
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Optimize task assignments for a batch of tasks
     */
    async optimizeAssignments(tasks, options = {}) {
        console.log(`\n👥 Optimizing assignments for ${tasks.length} tasks...`);

        // Get unique related records (WhatId)
        const relatedRecordIds = this.getUniqueRelatedRecords(tasks);

        // Get potential assignees
        const assignees = await this.getPotentialAssignees(relatedRecordIds, options);

        if (assignees.length === 0) {
            console.log('⚠️ No eligible assignees found, using default owner');
            if (!this.defaultOwnerId) {
                throw new Error('No assignees available and no default owner specified');
            }
            return this.assignToDefault(tasks);
        }

        // Get current workload for each assignee
        const workloads = await this.getAssigneeWorkloads(assignees);

        // Distribute tasks based on strategy
        const assignments = await this.distributeTasks(tasks, assignees, workloads, options);

        // Generate summary
        const summary = this.generateAssignmentSummary(assignments);
        console.log('\n📊 Assignment Summary:');
        Object.entries(summary.byUser).forEach(([userId, count]) => {
            const user = assignees.find(a => a.Id === userId);
            console.log(`  ${user?.Name || userId}: ${count} tasks`);
        });

        return assignments;
    }

    /**
     * Get unique related record IDs from tasks
     */
    getUniqueRelatedRecords(tasks) {
        const recordIds = new Set();

        tasks.forEach(task => {
            if (task.WhatId) {
                recordIds.add(task.WhatId);
            }
        });

        return Array.from(recordIds);
    }

    /**
     * Get potential assignees based on various criteria
     */
    async getPotentialAssignees(relatedRecordIds, options = {}) {
        const assignees = new Set();

        // 1. Get Account Team members if dealing with Account-related tasks
        if (relatedRecordIds.length > 0 && options.useAccountTeams !== false) {
            const teamMembers = await this.getAccountTeamMembers(relatedRecordIds);
            teamMembers.forEach(member => assignees.add(JSON.stringify(member)));
        }

        // 2. Get Opportunity Team members if dealing with Opportunity-related tasks
        if (relatedRecordIds.length > 0 && options.useOpportunityTeams !== false) {
            const oppTeamMembers = await this.getOpportunityTeamMembers(relatedRecordIds);
            oppTeamMembers.forEach(member => assignees.add(JSON.stringify(member)));
        }

        // 3. Get active users from specified role or profile
        if (options.roleFilter || options.profileFilter) {
            const roleUsers = await this.getUsersByRoleOrProfile(options);
            roleUsers.forEach(user => assignees.add(JSON.stringify(user)));
        }

        // 4. Get explicitly specified users
        if (options.userIds && options.userIds.length > 0) {
            const specificUsers = await this.getUsersByIds(options.userIds);
            specificUsers.forEach(user => assignees.add(JSON.stringify(user)));
        }

        // Convert back from Set to array of unique users
        const uniqueAssignees = Array.from(assignees).map(json => JSON.parse(json));

        // If still no assignees, get the default team
        if (uniqueAssignees.length === 0 && options.useDefaultTeam !== false) {
            const defaultTeam = await this.getDefaultTeam();
            uniqueAssignees.push(...defaultTeam);
        }

        return uniqueAssignees;
    }

    /**
     * Get Account Team members for given account IDs
     */
    async getAccountTeamMembers(accountIds) {
        if (accountIds.length === 0) return [];

        console.log('🔍 Querying Account Team members...');

        try {
            const idList = accountIds.map(id => `'${id}'`).join(',');
            const query = `
                SELECT AccountId, UserId, User.Name, User.Email,
                       TeamMemberRole, User.IsActive
                FROM AccountTeamMember
                WHERE AccountId IN (${idList})
                AND User.IsActive = true
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                const members = result.result.records.map(record => ({
                    Id: record.UserId,
                    Name: record.User?.Name,
                    Email: record.User?.Email,
                    Role: record.TeamMemberRole,
                    Type: 'AccountTeam'
                }));

                console.log(`  Found ${members.length} Account Team members`);
                return members;
            }
        } catch (error) {
            console.warn('⚠️ Could not query Account Teams:', error.message);
        }

        return [];
    }

    /**
     * Get Opportunity Team members
     */
    async getOpportunityTeamMembers(opportunityIds) {
        if (opportunityIds.length === 0) return [];

        console.log('🔍 Querying Opportunity Team members...');

        try {
            const idList = opportunityIds.map(id => `'${id}'`).join(',');
            const query = `
                SELECT OpportunityId, UserId, User.Name, User.Email,
                       TeamMemberRole, User.IsActive
                FROM OpportunityTeamMember
                WHERE OpportunityId IN (${idList})
                AND User.IsActive = true
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                const members = result.result.records.map(record => ({
                    Id: record.UserId,
                    Name: record.User?.Name,
                    Email: record.User?.Email,
                    Role: record.TeamMemberRole,
                    Type: 'OpportunityTeam'
                }));

                console.log(`  Found ${members.length} Opportunity Team members`);
                return members;
            }
        } catch (error) {
            console.warn('⚠️ Could not query Opportunity Teams:', error.message);
        }

        return [];
    }

    /**
     * Get users by role or profile
     */
    async getUsersByRoleOrProfile(options) {
        console.log('🔍 Querying users by role/profile...');

        try {
            let conditions = ['IsActive = true'];

            if (options.roleFilter) {
                conditions.push(`UserRole.Name = '${options.roleFilter}'`);
            }

            if (options.profileFilter) {
                conditions.push(`Profile.Name = '${options.profileFilter}'`);
            }

            const query = `
                SELECT Id, Name, Email, UserRole.Name, Profile.Name
                FROM User
                WHERE ${conditions.join(' AND ')}
                LIMIT 50
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                const users = result.result.records.map(record => ({
                    Id: record.Id,
                    Name: record.Name,
                    Email: record.Email,
                    Role: record.UserRole?.Name,
                    Profile: record.Profile?.Name,
                    Type: 'RoleProfile'
                }));

                console.log(`  Found ${users.length} users matching criteria`);
                return users;
            }
        } catch (error) {
            console.warn('⚠️ Could not query users by role/profile:', error.message);
        }

        return [];
    }

    /**
     * Get users by specific IDs
     */
    async getUsersByIds(userIds) {
        if (userIds.length === 0) return [];

        try {
            const idList = userIds.map(id => `'${id}'`).join(',');
            const query = `
                SELECT Id, Name, Email, IsActive
                FROM User
                WHERE Id IN (${idList})
                AND IsActive = true
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                return result.result.records.map(record => ({
                    Id: record.Id,
                    Name: record.Name,
                    Email: record.Email,
                    Type: 'Specified'
                }));
            }
        } catch (error) {
            console.warn('⚠️ Could not query specified users:', error.message);
        }

        return [];
    }

    /**
     * Get default team (fallback option)
     */
    async getDefaultTeam() {
        console.log('🔍 Getting default team...');

        // If default owner specified, use it
        if (this.defaultOwnerId) {
            const users = await this.getUsersByIds([this.defaultOwnerId]);
            if (users.length > 0) {
                return users;
            }
        }

        // Otherwise, get current user as fallback
        try {
            const cmd = `sf org display --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.id) {
                // Extract user ID from org info (this is approximate)
                return [{
                    Id: result.result.id.substring(0, 15),
                    Name: 'Current User',
                    Type: 'Default'
                }];
            }
        } catch (error) {
            console.warn('⚠️ Could not determine default user');
        }

        return [];
    }

    /**
     * Get current workload for assignees
     */
    async getAssigneeWorkloads(assignees) {
        console.log('📊 Analyzing current workloads...');

        const workloads = new Map();

        // Get open task counts for each assignee
        const userIds = assignees.map(a => a.Id);
        const idList = userIds.map(id => `'${id}'`).join(',');

        try {
            const query = `
                SELECT OwnerId, COUNT(Id) taskCount
                FROM Task
                WHERE OwnerId IN (${idList})
                AND Status != 'Completed'
                AND Status != 'Deferred'
                GROUP BY OwnerId
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                result.result.records.forEach(record => {
                    workloads.set(record.OwnerId, record.taskCount);
                });
            }

            // Initialize zero workload for users without tasks
            assignees.forEach(assignee => {
                if (!workloads.has(assignee.Id)) {
                    workloads.set(assignee.Id, 0);
                }
            });

            // Log workload distribution
            if (this.enableLogging) {
                console.log('  Current workloads:');
                assignees.forEach(assignee => {
                    const count = workloads.get(assignee.Id) || 0;
                    console.log(`    ${assignee.Name}: ${count} open tasks`);
                });
            }

        } catch (error) {
            console.warn('⚠️ Could not query workloads, assuming equal distribution');
            assignees.forEach(assignee => {
                workloads.set(assignee.Id, 0);
            });
        }

        return workloads;
    }

    /**
     * Distribute tasks based on selected strategy
     */
    async distributeTasks(tasks, assignees, workloads, options = {}) {
        console.log(`\n🎯 Using ${this.distributionStrategy} distribution strategy`);

        switch (this.distributionStrategy) {
            case 'round-robin':
                return this.distributeRoundRobin(tasks, assignees);

            case 'workload':
                return this.distributeByWorkload(tasks, assignees, workloads);

            case 'role-based':
                return this.distributeByRole(tasks, assignees, options);

            case 'balanced':
            default:
                return this.distributeBalanced(tasks, assignees, workloads);
        }
    }

    /**
     * Round-robin distribution
     */
    distributeRoundRobin(tasks, assignees) {
        const assignments = [];
        let assigneeIndex = 0;

        tasks.forEach(task => {
            const assignee = assignees[assigneeIndex];
            assignments.push({
                ...task,
                OwnerId: assignee.Id,
                AssignedTo: assignee.Name,
                AssignmentMethod: 'round-robin'
            });

            assigneeIndex = (assigneeIndex + 1) % assignees.length;
        });

        return assignments;
    }

    /**
     * Workload-based distribution (assign to least busy)
     */
    distributeByWorkload(tasks, assignees, workloads) {
        const assignments = [];
        const currentWorkloads = new Map(workloads);

        tasks.forEach(task => {
            // Find assignee with lowest workload
            let minWorkload = Infinity;
            let selectedAssignee = assignees[0];

            assignees.forEach(assignee => {
                const workload = currentWorkloads.get(assignee.Id) || 0;
                if (workload < minWorkload) {
                    minWorkload = workload;
                    selectedAssignee = assignee;
                }
            });

            assignments.push({
                ...task,
                OwnerId: selectedAssignee.Id,
                AssignedTo: selectedAssignee.Name,
                AssignmentMethod: 'workload-based'
            });

            // Update workload
            currentWorkloads.set(selectedAssignee.Id, minWorkload + 1);
        });

        return assignments;
    }

    /**
     * Role-based distribution
     */
    distributeByRole(tasks, assignees, options) {
        const assignments = [];
        const rolePreferences = options.rolePreferences || {};

        // Group assignees by role
        const assigneesByRole = new Map();
        assignees.forEach(assignee => {
            const role = assignee.Role || 'Default';
            if (!assigneesByRole.has(role)) {
                assigneesByRole.set(role, []);
            }
            assigneesByRole.get(role).push(assignee);
        });

        // Assign tasks based on role preferences
        tasks.forEach(task => {
            let selectedAssignee = null;

            // Check if task has a preferred role
            const preferredRole = this.determinePreferredRole(task, rolePreferences);
            if (preferredRole && assigneesByRole.has(preferredRole)) {
                const roleAssignees = assigneesByRole.get(preferredRole);
                selectedAssignee = roleAssignees[Math.floor(Math.random() * roleAssignees.length)];
            }

            // Fallback to any available assignee
            if (!selectedAssignee) {
                selectedAssignee = assignees[Math.floor(Math.random() * assignees.length)];
            }

            assignments.push({
                ...task,
                OwnerId: selectedAssignee.Id,
                AssignedTo: selectedAssignee.Name,
                AssignedRole: selectedAssignee.Role,
                AssignmentMethod: 'role-based'
            });
        });

        return assignments;
    }

    /**
     * Balanced distribution (combination of workload and round-robin)
     */
    distributeBalanced(tasks, assignees, workloads) {
        const assignments = [];
        const currentWorkloads = new Map(workloads);

        // Calculate average workload
        let totalWorkload = 0;
        currentWorkloads.forEach(count => totalWorkload += count);
        const avgWorkload = totalWorkload / assignees.length;

        // Target workload for each assignee
        const targetWorkload = avgWorkload + Math.ceil(tasks.length / assignees.length);

        tasks.forEach(task => {
            // Find assignees below target workload
            const eligibleAssignees = assignees.filter(assignee => {
                const workload = currentWorkloads.get(assignee.Id) || 0;
                return workload < targetWorkload || workload < this.maxTasksPerUser;
            });

            // If all are at target, use the one with lowest workload
            const availableAssignees = eligibleAssignees.length > 0 ? eligibleAssignees : assignees;

            // Select assignee with lowest workload from available pool
            let selectedAssignee = availableAssignees[0];
            let minWorkload = currentWorkloads.get(selectedAssignee.Id) || 0;

            availableAssignees.forEach(assignee => {
                const workload = currentWorkloads.get(assignee.Id) || 0;
                if (workload < minWorkload) {
                    minWorkload = workload;
                    selectedAssignee = assignee;
                }
            });

            assignments.push({
                ...task,
                OwnerId: selectedAssignee.Id,
                AssignedTo: selectedAssignee.Name,
                AssignmentMethod: 'balanced'
            });

            // Update workload
            currentWorkloads.set(selectedAssignee.Id, minWorkload + 1);
        });

        return assignments;
    }

    /**
     * Determine preferred role for a task
     */
    determinePreferredRole(task, rolePreferences) {
        // Check task subject for keywords
        const subject = (task.Subject || '').toLowerCase();

        for (const [keyword, role] of Object.entries(rolePreferences)) {
            if (subject.includes(keyword.toLowerCase())) {
                return role;
            }
        }

        // Check task type
        if (task.Type && rolePreferences[task.Type]) {
            return rolePreferences[task.Type];
        }

        return null;
    }

    /**
     * Assign all tasks to default owner
     */
    assignToDefault(tasks) {
        return tasks.map(task => ({
            ...task,
            OwnerId: this.defaultOwnerId,
            AssignmentMethod: 'default'
        }));
    }

    /**
     * Generate assignment summary
     */
    generateAssignmentSummary(assignments) {
        const summary = {
            total: assignments.length,
            byUser: {},
            byMethod: {},
            byRole: {}
        };

        assignments.forEach(assignment => {
            // Count by user
            if (!summary.byUser[assignment.OwnerId]) {
                summary.byUser[assignment.OwnerId] = 0;
            }
            summary.byUser[assignment.OwnerId]++;

            // Count by method
            if (!summary.byMethod[assignment.AssignmentMethod]) {
                summary.byMethod[assignment.AssignmentMethod] = 0;
            }
            summary.byMethod[assignment.AssignmentMethod]++;

            // Count by role (if applicable)
            if (assignment.AssignedRole) {
                if (!summary.byRole[assignment.AssignedRole]) {
                    summary.byRole[assignment.AssignedRole] = 0;
                }
                summary.byRole[assignment.AssignedRole]++;
            }
        });

        return summary;
    }
}

// CLI interface for testing
if (require.main === module) {
    const optimizer = new TaskAssignmentOptimizer(process.argv[2] || 'myorg');

    console.log(`
Task Assignment Optimizer initialized.
Use this module to intelligently distribute tasks across team members.

Features:
- Account/Opportunity Team based assignment
- Workload balancing
- Round-robin distribution
- Role-based assignment
- Custom assignment rules

Example usage in code:
  const optimizer = new TaskAssignmentOptimizer('myorg');
  const assignments = await optimizer.optimizeAssignments(tasks, {
    useAccountTeams: true,
    strategy: 'balanced'
  });
    `);
}

module.exports = TaskAssignmentOptimizer;