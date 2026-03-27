#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function getCheckpointDir(baseDir, orgAlias) {
  return path.join(baseDir, 'instances', orgAlias, 'checkpoints');
}

function getCheckpointPath(baseDir, orgAlias, operationId) {
  return path.join(getCheckpointDir(baseDir, orgAlias), `${operationId}.json`);
}

class MultiPhaseCheckpoint {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
  }

  create(orgAlias, operationId, phases = [], metadata = {}) {
    const checkpointDir = getCheckpointDir(this.baseDir, orgAlias);
    ensureDir(checkpointDir);

    const checkpoint = {
      orgAlias,
      operationId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'pending',
      metadata,
      phases: phases.map((phase, index) => ({
        name: phase,
        order: index,
        status: index === 0 ? 'ready' : 'pending',
        completedAt: null
      })),
      rollback: []
    };

    fs.writeFileSync(getCheckpointPath(this.baseDir, orgAlias, operationId), JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  load(orgAlias, operationId) {
    const checkpointPath = getCheckpointPath(this.baseDir, orgAlias, operationId);
    if (!fs.existsSync(checkpointPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  }

  save(checkpoint) {
    checkpoint.updatedAt = nowIso();
    fs.writeFileSync(
      getCheckpointPath(this.baseDir, checkpoint.orgAlias, checkpoint.operationId),
      JSON.stringify(checkpoint, null, 2)
    );
    return checkpoint;
  }

  getNext(orgAlias, operationId) {
    const checkpoint = this.load(orgAlias, operationId);
    if (!checkpoint) {
      return null;
    }
    return checkpoint.phases.find((phase) => phase.status === 'ready' || phase.status === 'in_progress') || null;
  }

  complete(orgAlias, operationId, phaseName, rollbackStep = null) {
    const checkpoint = this.load(orgAlias, operationId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for ${orgAlias}/${operationId}`);
    }

    const phase = checkpoint.phases.find((entry) => entry.name === phaseName);
    if (!phase) {
      throw new Error(`Unknown phase '${phaseName}'`);
    }

    phase.status = 'completed';
    phase.completedAt = nowIso();

    const nextPhase = checkpoint.phases.find((entry) => entry.status === 'pending');
    if (nextPhase) {
      nextPhase.status = 'ready';
      checkpoint.status = 'in_progress';
    } else {
      checkpoint.status = 'completed';
    }

    if (rollbackStep) {
      checkpoint.rollback.push({
        phase: phaseName,
        step: rollbackStep,
        recordedAt: nowIso()
      });
    }

    return this.save(checkpoint);
  }

  resume(orgAlias, operationId) {
    const checkpoint = this.load(orgAlias, operationId);
    if (!checkpoint) {
      return null;
    }

    if (checkpoint.status === 'completed') {
      return { checkpoint, nextPhase: null };
    }

    const nextPhase = this.getNext(orgAlias, operationId);
    return { checkpoint, nextPhase };
  }

  rollback(orgAlias, operationId, reason = 'manual_rollback') {
    const checkpoint = this.load(orgAlias, operationId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for ${orgAlias}/${operationId}`);
    }

    checkpoint.status = 'rolled_back';
    checkpoint.rollbackReason = reason;
    checkpoint.rolledBackAt = nowIso();

    return this.save(checkpoint);
  }
}

function parseJsonArg(raw, fallback = {}) {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

if (require.main === module) {
  const [command, orgAlias, operationId, arg3, arg4] = process.argv.slice(2);
  const manager = new MultiPhaseCheckpoint({ baseDir: process.cwd() });

  try {
    switch (command) {
      case 'create':
        console.log(JSON.stringify(manager.create(orgAlias, operationId, parseJsonArg(arg3, []), parseJsonArg(arg4, {}))));
        break;
      case 'complete':
        console.log(JSON.stringify(manager.complete(orgAlias, operationId, arg3, arg4 || null)));
        break;
      case 'next':
        console.log(JSON.stringify(manager.getNext(orgAlias, operationId)));
        break;
      case 'resume':
        console.log(JSON.stringify(manager.resume(orgAlias, operationId)));
        break;
      case 'rollback':
        console.log(JSON.stringify(manager.rollback(orgAlias, operationId, arg3 || 'manual_rollback')));
        break;
      default:
        console.error('Usage: node multi-phase-checkpoint.js <create|complete|next|resume|rollback> <org> <operation-id> [...]');
        process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  MultiPhaseCheckpoint,
  getCheckpointDir,
  getCheckpointPath
};
