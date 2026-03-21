#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const {
  applyRuntimePatch,
  PATCH_MARKER
} = require(path.join(
  __dirname,
  '../../../../../scripts/patch-claude-code-task-scope-runtime.js'
));

const FIXTURE_SOURCE = [
  'function Rl(){zN6.clear(),rh8=!1}function Pe4(){rh8=!0}',
  'PY=z1(async()=>{let A=Zu(),[q,K]=await Promise.all([Ol_(),A.length>0?Hl_(A):Promise.resolve({plugins:[],errors:[]})]),_=ml1(),{plugins:Y,errors:z}=jl_({session:K.plugins,marketplace:q.plugins,builtin:[..._.enabled,..._.disabled],managedNames:DD4()}),w=[...q.errors,...K.errors,...z],{demoted:O,errors:$}=uwq(Y);for(let j of Y)if(O.has(j.source))j.enabled=!1;w.push(...$),V(`Found ${Y.length} plugins (${Y.filter((j)=>j.enabled).length} enabled, ${Y.filter((j)=>!j.enabled).length} disabled)`);let H=Y.filter((j)=>j.enabled);return Ml_(H),{enabled:H,disabled:Y.filter((j)=>!j.enabled),errors:w}})})',
  'Ch=z1(async(A)=>{return(await OW(A)).filter((K)=>K.type==="prompt"&&!K.disableModelInvocation&&K.source!=="builtin"&&(K.loadedFrom==="bundled"||K.loadedFrom==="skills"||K.loadedFrom==="commands_DEPRECATED"||K.hasUserSpecifiedDescription||K.whenToUse))}),az6=z1(async(A)=>A)',
  'async function ki_(A,q,K,_,Y,z){return[GY("skill_listing",()=>Kn_($))]}',
  'async function Kn_(A){if(!A.options.tools.some((O)=>j3(O,Hj)))return[];let q=R9(),K=await Ch(q);if(rh8){rh8=!1;for(let O of K)zN6.add(O.name);return[]}let _=K.filter((O)=>!zN6.has(O.name));return _}'
].join('');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] patch-claude-code-task-scope-runtime.js\n');

  const results = [];

  results.push(await runTest('Injects task-scope helper and runtime filters', async () => {
    const patched = applyRuntimePatch(FIXTURE_SOURCE);

    assert(patched.includes(PATCH_MARKER), 'Should inject the runtime patch marker');
    assert(patched.includes('await opspalFilterEnabledPlugins(H,R9())'), 'Should filter enabled plugins');
    assert(patched.includes('return await opspalFilterPromptsForTask(q,A,null)'), 'Should filter prompt listings via Ch');
    assert(patched.includes('GY("skill_listing",()=>Kn_($,A))'), 'Should pass current prompt text into the skill listing path');
    assert(patched.includes('async function Kn_(A,B){'), 'Should update Kn_ to accept the prompt text');
    assert(patched.includes('K=await opspalFilterPromptsForTask(K,q,B);'), 'Should filter attached prompts for the current request');
  }));

  results.push(await runTest('Is idempotent on already patched runtime source', async () => {
    const once = applyRuntimePatch(FIXTURE_SOURCE);
    const twice = applyRuntimePatch(once);

    assert.strictEqual(twice, once, 'Applying the patch twice should not change the source again');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
