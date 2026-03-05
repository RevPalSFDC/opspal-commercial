/**
 * RetentionManager - Manage data retention policies for reflections
 *
 * Implements configurable per-org retention with archive and delete cycles.
 * Supports status-based overrides for different reflection types.
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

const { createClient } = require('@supabase/supabase-js');

class RetentionManager {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun !== false; // Default to dry run for safety

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('RetentionManager requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);

    // Default policies
    this.defaultPolicy = {
      retention_days: 365,
      archive_after_days: 90,
      delete_after_days: 730,
      status_overrides: {
        implemented: { archive_after_days: 365, delete_after_days: null },
        rejected: { archive_after_days: 30, delete_after_days: 180 }
      }
    };
  }

  /**
   * Get retention policy for an org
   * @param {string} org - Org identifier
   * @returns {object} Policy with retention settings
   */
  async getPolicy(org) {
    // First try exact org match
    const { data: orgPolicy, error: orgError } = await this.supabase
      .from('retention_policies')
      .select('*')
      .eq('org', org)
      .single();

    if (!orgError && orgPolicy) {
      return this._mergeWithDefaults(orgPolicy);
    }

    // Fall back to wildcard policy
    const { data: defaultPolicy, error: defaultError } = await this.supabase
      .from('retention_policies')
      .select('*')
      .eq('org', '*')
      .single();

    if (!defaultError && defaultPolicy) {
      return this._mergeWithDefaults(defaultPolicy);
    }

    // Use hardcoded defaults
    return this.defaultPolicy;
  }

  /**
   * Merge policy with defaults
   */
  _mergeWithDefaults(policy) {
    return {
      ...this.defaultPolicy,
      ...policy,
      status_overrides: {
        ...this.defaultPolicy.status_overrides,
        ...(policy.status_overrides || {})
      }
    };
  }

  /**
   * Set retention policy for an org
   * @param {string} org - Org identifier
   * @param {object} policy - Policy settings
   */
  async setPolicy(org, policy) {
    const validatedPolicy = this._validatePolicy(policy);

    const { error } = await this.supabase
      .from('retention_policies')
      .upsert({
        org,
        ...validatedPolicy,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'org'
      });

    if (error) {
      console.error('[RetentionManager] Failed to set policy:', error.message);
      throw error;
    }

    if (this.verbose) {
      console.log(`[RetentionManager] Policy set for org: ${org}`);
    }

    return validatedPolicy;
  }

  /**
   * Validate policy values
   */
  _validatePolicy(policy) {
    const validated = {};

    if (policy.retention_days !== undefined) {
      const days = parseInt(policy.retention_days);
      if (isNaN(days) || days < 1) {
        throw new Error('retention_days must be a positive integer');
      }
      validated.retention_days = days;
    }

    if (policy.archive_after_days !== undefined) {
      const days = parseInt(policy.archive_after_days);
      if (isNaN(days) || days < 1) {
        throw new Error('archive_after_days must be a positive integer');
      }
      validated.archive_after_days = days;
    }

    if (policy.delete_after_days !== undefined) {
      if (policy.delete_after_days === null) {
        validated.delete_after_days = null;
      } else {
        const days = parseInt(policy.delete_after_days);
        if (isNaN(days) || days < 1) {
          throw new Error('delete_after_days must be a positive integer or null');
        }
        validated.delete_after_days = days;
      }
    }

    if (policy.status_overrides !== undefined) {
      if (typeof policy.status_overrides !== 'object') {
        throw new Error('status_overrides must be an object');
      }
      validated.status_overrides = policy.status_overrides;
    }

    if (policy.notes !== undefined) {
      validated.notes = String(policy.notes);
    }

    return validated;
  }

  /**
   * Get retention report preview (what would be affected)
   * @param {string} org - Org identifier (or '*' for all)
   * @returns {object} Report with counts and samples
   */
  async getRetentionReport(org = '*') {
    const now = new Date();
    const report = {
      generated_at: now.toISOString(),
      org,
      archive: { count: 0, samples: [] },
      delete: { count: 0, samples: [] },
      total_reflections: 0,
      active_reflections: 0
    };

    // Get policy for this org
    const policy = org === '*'
      ? this.defaultPolicy
      : await this.getPolicy(org);

    // Calculate cutoff dates
    const archiveCutoff = new Date(now);
    archiveCutoff.setDate(archiveCutoff.getDate() - policy.archive_after_days);

    const deleteCutoff = policy.delete_after_days
      ? new Date(now.setDate(now.getDate() - policy.delete_after_days))
      : null;

    // Query base
    let baseQuery = this.supabase.from('reflections').select('id, org, summary, status, created_at, archived_at');

    if (org !== '*') {
      baseQuery = baseQuery.eq('org', org);
    }

    // Get total count
    const { count: totalCount } = await baseQuery
      .select('id', { count: 'exact', head: true });
    report.total_reflections = totalCount || 0;

    // Get active (non-archived) count
    const { count: activeCount } = await baseQuery
      .is('archived_at', null)
      .select('id', { count: 'exact', head: true });
    report.active_reflections = activeCount || 0;

    // Find reflections to archive
    const { data: toArchive, error: archiveError } = await this.supabase
      .from('reflections')
      .select('id, org, summary, status, created_at')
      .is('archived_at', null)
      .lt('created_at', archiveCutoff.toISOString())
      .order('created_at', { ascending: true })
      .limit(100);

    if (!archiveError && toArchive) {
      report.archive.count = toArchive.length;
      report.archive.samples = toArchive.slice(0, 5).map(r => ({
        id: r.id,
        org: r.org,
        summary: (r.summary || '').substring(0, 100),
        created_at: r.created_at
      }));
    }

    // Find reflections to delete (if delete policy exists)
    if (deleteCutoff) {
      const { data: toDelete, error: deleteError } = await this.supabase
        .from('reflections')
        .select('id, org, summary, status, created_at, archived_at')
        .lt('created_at', deleteCutoff.toISOString())
        .not('status', 'eq', 'implemented') // Never delete implemented
        .order('created_at', { ascending: true })
        .limit(100);

      if (!deleteError && toDelete) {
        report.delete.count = toDelete.length;
        report.delete.samples = toDelete.slice(0, 5).map(r => ({
          id: r.id,
          org: r.org,
          summary: (r.summary || '').substring(0, 100),
          created_at: r.created_at
        }));
      }
    }

    return report;
  }

  /**
   * Apply retention policies
   * @param {object} options - Options for applying policies
   * @returns {object} Results of policy application
   */
  async applyRetentionPolicies(options = {}) {
    const { org = '*', force = false } = options;
    const dryRun = options.dryRun !== undefined ? options.dryRun : this.dryRun;

    const results = {
      archived: 0,
      deleted: 0,
      errors: [],
      dry_run: dryRun
    };

    // Get all org policies
    const { data: policies, error: policyError } = await this.supabase
      .from('retention_policies')
      .select('*');

    if (policyError) {
      results.errors.push(`Failed to fetch policies: ${policyError.message}`);
      return results;
    }

    // Process each org with a policy
    const orgsToProcess = org === '*'
      ? [...new Set(policies.map(p => p.org))]
      : [org];

    for (const targetOrg of orgsToProcess) {
      const policy = await this.getPolicy(targetOrg);
      const orgResults = await this._applyPolicyToOrg(targetOrg, policy, dryRun);

      results.archived += orgResults.archived;
      results.deleted += orgResults.deleted;
      results.errors.push(...orgResults.errors);
    }

    if (this.verbose) {
      console.log(`[RetentionManager] Applied policies: ${results.archived} archived, ${results.deleted} deleted ${dryRun ? '(DRY RUN)' : ''}`);
    }

    return results;
  }

  /**
   * Apply policy to a specific org
   */
  async _applyPolicyToOrg(org, policy, dryRun) {
    const results = { archived: 0, deleted: 0, errors: [] };
    const now = new Date();

    // Calculate cutoff dates
    const archiveCutoff = new Date(now);
    archiveCutoff.setDate(archiveCutoff.getDate() - policy.archive_after_days);

    const deleteCutoff = policy.delete_after_days
      ? new Date(now)
      : null;
    if (deleteCutoff) {
      deleteCutoff.setDate(deleteCutoff.getDate() - policy.delete_after_days);
    }

    // Archive old reflections
    let archiveQuery = this.supabase
      .from('reflections')
      .select('id, status')
      .is('archived_at', null)
      .lt('created_at', archiveCutoff.toISOString());

    if (org !== '*') {
      archiveQuery = archiveQuery.eq('org', org);
    }

    const { data: toArchive, error: archiveQueryError } = await archiveQuery.limit(1000);

    if (archiveQueryError) {
      results.errors.push(`Archive query error: ${archiveQueryError.message}`);
    } else if (toArchive && toArchive.length > 0) {
      // Filter based on status overrides
      const idsToArchive = toArchive
        .filter(r => this._shouldProcess(r.status, policy, 'archive'))
        .map(r => r.id);

      if (idsToArchive.length > 0) {
        if (!dryRun) {
          const { error: archiveError } = await this.supabase
            .from('reflections')
            .update({ archived_at: new Date().toISOString() })
            .in('id', idsToArchive);

          if (archiveError) {
            results.errors.push(`Archive update error: ${archiveError.message}`);
          } else {
            results.archived = idsToArchive.length;
          }
        } else {
          results.archived = idsToArchive.length;
        }
      }
    }

    // Delete old reflections (if policy allows)
    if (deleteCutoff) {
      let deleteQuery = this.supabase
        .from('reflections')
        .select('id, status')
        .lt('created_at', deleteCutoff.toISOString());

      if (org !== '*') {
        deleteQuery = deleteQuery.eq('org', org);
      }

      const { data: toDelete, error: deleteQueryError } = await deleteQuery.limit(1000);

      if (deleteQueryError) {
        results.errors.push(`Delete query error: ${deleteQueryError.message}`);
      } else if (toDelete && toDelete.length > 0) {
        // Filter based on status overrides (never delete implemented)
        const idsToDelete = toDelete
          .filter(r => r.status !== 'implemented' && this._shouldProcess(r.status, policy, 'delete'))
          .map(r => r.id);

        if (idsToDelete.length > 0) {
          if (!dryRun) {
            const { error: deleteError } = await this.supabase
              .from('reflections')
              .delete()
              .in('id', idsToDelete);

            if (deleteError) {
              results.errors.push(`Delete error: ${deleteError.message}`);
            } else {
              results.deleted = idsToDelete.length;
            }
          } else {
            results.deleted = idsToDelete.length;
          }
        }
      }
    }

    return results;
  }

  /**
   * Check if a reflection should be processed based on status overrides
   */
  _shouldProcess(status, policy, operation) {
    if (!status || !policy.status_overrides) {
      return true;
    }

    const override = policy.status_overrides[status];
    if (!override) {
      return true;
    }

    if (operation === 'archive') {
      return override.archive_after_days !== null;
    }

    if (operation === 'delete') {
      return override.delete_after_days !== null;
    }

    return true;
  }

  /**
   * List all configured policies
   */
  async listPolicies() {
    const { data, error } = await this.supabase
      .from('retention_policies')
      .select('*')
      .order('org');

    if (error) {
      console.error('[RetentionManager] Failed to list policies:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Delete a policy
   */
  async deletePolicy(org) {
    if (org === '*') {
      throw new Error('Cannot delete the default wildcard policy');
    }

    const { error } = await this.supabase
      .from('retention_policies')
      .delete()
      .eq('org', org);

    if (error) {
      console.error('[RetentionManager] Failed to delete policy:', error.message);
      throw error;
    }

    return { deleted: true, org };
  }

  /**
   * Unarchive reflections (restore from archive)
   * @param {Array<string>} ids - Reflection IDs to unarchive
   */
  async unarchive(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids must be a non-empty array');
    }

    const { error } = await this.supabase
      .from('reflections')
      .update({ archived_at: null })
      .in('id', ids);

    if (error) {
      console.error('[RetentionManager] Failed to unarchive:', error.message);
      throw error;
    }

    return { unarchived: ids.length };
  }
}

module.exports = RetentionManager;

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    const manager = new RetentionManager({
      verbose: true,
      dryRun: !args.includes('--apply')
    });

    switch (command) {
      case 'report':
        const org = args[1] || '*';
        const report = await manager.getRetentionReport(org);
        console.log(JSON.stringify(report, null, 2));
        break;

      case 'apply':
        const applyOrg = args[1] || '*';
        const results = await manager.applyRetentionPolicies({ org: applyOrg });
        console.log(JSON.stringify(results, null, 2));
        break;

      case 'list':
        const policies = await manager.listPolicies();
        console.log(JSON.stringify(policies, null, 2));
        break;

      case 'set':
        if (!args[1]) {
          console.log('Usage: node retention-manager.js set <org> <archive_days> <delete_days>');
          process.exit(1);
        }
        const setOrg = args[1];
        const archiveDays = parseInt(args[2]) || 90;
        const deleteDays = args[3] === 'null' ? null : parseInt(args[3]) || 730;
        const policy = await manager.setPolicy(setOrg, {
          archive_after_days: archiveDays,
          delete_after_days: deleteDays
        });
        console.log('Policy set:', policy);
        break;

      default:
        console.log(`
RetentionManager CLI

Usage:
  node retention-manager.js report [org]              - Preview what would be archived/deleted
  node retention-manager.js apply [org] [--apply]     - Apply retention (dry run by default)
  node retention-manager.js list                      - List all policies
  node retention-manager.js set <org> <archive> <del> - Set policy for org

Examples:
  node retention-manager.js report eta-corp
  node retention-manager.js apply --apply
  node retention-manager.js set flex-production 60 365
  node retention-manager.js set eta-corp 90 null  # Never delete
        `);
    }
  })().catch(console.error);
}
