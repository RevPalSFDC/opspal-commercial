#!/usr/bin/env node
'use strict';

/**
 * SOP Subsystem — Public API
 *
 * @module sop
 * @version 1.0.0
 */

module.exports = {
  SopRuntime: require('./sop-runtime').SopRuntime,
  SopRegistry: require('./sop-registry').SopRegistry,
  SopEvaluator: require('./sop-evaluator').SopEvaluator,
  SopContextResolver: require('./sop-context-resolver').SopContextResolver,
  SopMappingResolver: require('./sop-mapping-resolver').SopMappingResolver,
  SopAudit: require('./sop-audit').SopAudit,
  SopReplay: require('./sop-replay').SopReplay,
  executors: require('./sop-executors')
};
