#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TARGET = path.join(
  os.homedir(),
  '.claude',
  'local',
  'node_modules',
  '@anthropic-ai',
  'claude-code',
  'cli.js'
);

const PATCH_MARKER = '/* OPSPAL_TASK_SCOPE_RUNTIME_PATCH */';
const BACKUP_SUFFIX = '.opspal-task-scope.bak';

const HELPER_INSERTION = [
  'function Rl(){zN6.clear(),rh8=!1}',
  PATCH_MARKER,
  'let opspalTaskScopeCache=null;',
  'function opspalTaskScopeFile(){let A=process.env.CLAUDE_TASK_SCOPE_FILE;if(typeof A==="string"&&A.length>0)return A;let q=process.env.HOME||process.env.USERPROFILE||"";return q?`${q}/.claude/session-context/task-scope.json`:null}',
  'function opspalNormalizePath(A){return typeof A==="string"?A.replace(/\\\\/g,"/"):A}',
  'function opspalPathsRelated(A,q){if(!A||!q)return!0;let K=opspalNormalizePath(A),_=opspalNormalizePath(q);return K===_||K.startsWith(_+"/")||_.startsWith(K+"/")}',
  'async function opspalReadTaskScope(A){let q=opspalTaskScopeFile();if(!q)return null;let K=Date.now();if(opspalTaskScopeCache&&opspalTaskScopeCache.path===q&&K-opspalTaskScopeCache.checkedAt<1000)return opspalTaskScopeCache.value;try{let _=JSON.parse(await w8().readFile(q,{encoding:"utf-8"})),Y=Date.parse(_.timestamp||""),z=Number(process.env.CLAUDE_TASK_SCOPE_MAX_AGE_MS||1800000);if(!Array.isArray(_.selectedPlugins)||_.selectedPlugins.length===0||!Number.isFinite(Y)||K-Y>z||!opspalPathsRelated(A||R9(),_.cwd||_.projectRoot||null))return opspalTaskScopeCache={path:q,checkedAt:K,value:null},null;return opspalTaskScopeCache={path:q,checkedAt:K,value:_},_}catch{return opspalTaskScopeCache={path:q,checkedAt:K,value:null},null}}',
  'function opspalPromptTokens(A){return String(A||"").toLowerCase().split(/[^a-z0-9:-]+/).filter((q)=>q.length>=3)}',
  'function opspalInferPlugins(A){let q=String(A||"").toLowerCase(),K=new Set(["opspal-core"]),_=0,Y=(z,w)=>{w.test(q)&&(K.add(z),_++)};return Y("opspal-salesforce",/salesforce|sfdc|apex|soql|flow|validation rule|quick action|lwc|territory|cpq|force-app/),Y("opspal-hubspot",/hubspot|portal|cms|deal|sales hub|marketing hub|service hub/),Y("opspal-marketo",/marketo|mql|smart campaign|engagement program|lead score/),Y("opspal-okrs",/\\bokrs?\\b|objective|key result|initiative/),Y("opspal-gtm-planning",/\\bgtm\\b|go-to-market|quota|arr|mrr|capacity|market size/),Y("opspal-data-hygiene",/dedup|duplicate|merge|data quality|cleanup|data hygiene/),Y("opspal-mcp-client",/benchmark|scorecard|compute|scoring/),Y("opspal-ai-consult",/ai strategy|consult(ing)?/),Y("opspal-monday",/\\bmonday\\b|kanban|board/),/cross-platform|integrat|sync|between|across systems/.test(q)&&(/hubspot|portal|deal/.test(q)&&K.add("opspal-hubspot"),/salesforce|sfdc|apex|flow|soql|lwc/.test(q)&&K.add("opspal-salesforce"),/marketo|mql/.test(q)&&K.add("opspal-marketo")),_>0?K:null}',
  'function opspalPluginName(A){return A&&typeof A.name==="string"?A.name.split(":")[0]:null}',
  'function opspalAllowedPromptNames(A){let q=new Set;if(!A||!A.selectedAssets)return q;for(let[K,_]of Object.entries(A.selectedAssets)){for(let Y of _.skills||[])Y&&typeof Y.name==="string"&&q.add(`${K}:${Y.name}`);for(let Y of _.commands||[])Y&&typeof Y.name==="string"&&q.add(`${K}:${Y.name}`)}if(Array.isArray(A.runtimePromptNames))for(let K of A.runtimePromptNames)typeof K==="string"&&q.add(K);return q}',
  'function opspalScorePrompt(A,q){let K=((A.name||"")+" "+(A.description||"")+" "+(A.whenToUse||"")).toLowerCase(),_=0;for(let Y of q)Y&&K.includes(Y)&&(_+=Y.includes(":")?60:Y.length>6?15:10);return _}',
  'async function opspalFilterEnabledPlugins(A,q){let K=await opspalReadTaskScope(q);if(!K)return A;let _=new Set([...(K.selectedPlugins||[]),"opspal-core"]),Y=A.filter((z)=>_.has(z.name));return Y.length===0||Y.length===A.length?A:(V(`Task scope plugin filter retained ${Y.length}/${A.length} enabled plugins`),Y)}',
  'async function opspalFilterPromptsForTask(A,q,K){let _=await opspalReadTaskScope(q),Y=_?new Set([...(_.selectedPlugins||[]),"opspal-core"]):opspalInferPlugins(K),z=opspalAllowedPromptNames(_),w=opspalPromptTokens(K);if((!Y||Y.size===0)&&z.size===0)return A;let O=[],$=[];for(let j of A){let J=opspalPluginName(j);if(j.source!=="plugin"){O.push(j);continue}if(Y&&J&&!Y.has(J))continue;$.push(j)}if(z.size>0){let j=$.filter((J)=>z.has(J.name));j.length>0&&($=j)}let H=[];if(w.length>0){let j=$.map((J)=>({prompt:J,score:opspalScorePrompt(J,w)})).filter((J)=>J.score>0);if(j.length>0){j.sort((J,M)=>M.score-J.score);let M=Number(process.env.CLAUDE_TASK_SCOPE_MAX_PROMPTS||24),X=new Map;for(let D of j){let P=opspalPluginName(D.prompt)||"plugin",W=X.get(P)||0,f=P==="opspal-core"?8:12;if(H.length>=M||W>=f)continue;H.push(D.prompt),X.set(P,W+1)}}}if(H.length===0)H=$.slice(0,Number(process.env.CLAUDE_TASK_SCOPE_MAX_PROMPTS||24));let j=new Set(H.map((J)=>J.name)),M=[...O,...A.filter((J)=>j.has(J.name))];return M.length===0||M.length===A.length?A:(V(`Task scope prompt filter retained ${M.length}/${A.length} prompts${K?" for current request":""}`),M)}'
].join('');

function replaceOnce(text, search, replace, label) {
  if (!text.includes(search)) {
    throw new Error(`Unable to find ${label}`);
  }

  return text.replace(search, replace);
}

function applyRuntimePatch(source) {
  if (source.includes(PATCH_MARKER)) {
    return source;
  }

  let patched = source;

  patched = replaceOnce(
    patched,
    'function Rl(){zN6.clear(),rh8=!1}',
    HELPER_INSERTION,
    'task-scope helper insertion point'
  );

  patched = replaceOnce(
    patched,
    'let H=Y.filter((j)=>j.enabled);return Ml_(H),{enabled:H,disabled:Y.filter((j)=>!j.enabled),errors:w}})})',
    'let H=Y.filter((j)=>j.enabled);H=await opspalFilterEnabledPlugins(H,R9());return Ml_(H),{enabled:H,disabled:Y.filter((j)=>!j.enabled),errors:w}})})',
    'enabled plugin filter hook'
  );

  patched = replaceOnce(
    patched,
    'Ch=z1(async(A)=>{return(await OW(A)).filter((K)=>K.type==="prompt"&&!K.disableModelInvocation&&K.source!=="builtin"&&(K.loadedFrom==="bundled"||K.loadedFrom==="skills"||K.loadedFrom==="commands_DEPRECATED"||K.hasUserSpecifiedDescription||K.whenToUse))}),',
    'Ch=z1(async(A)=>{let q=(await OW(A)).filter((K)=>K.type==="prompt"&&!K.disableModelInvocation&&K.source!=="builtin"&&(K.loadedFrom==="bundled"||K.loadedFrom==="skills"||K.loadedFrom==="commands_DEPRECATED"||K.hasUserSpecifiedDescription||K.whenToUse));return await opspalFilterPromptsForTask(q,A,null)}),',
    'state-based prompt filter hook'
  );

  patched = replaceOnce(
    patched,
    'GY("skill_listing",()=>Kn_($))',
    'GY("skill_listing",()=>Kn_($,A))',
    'skill listing call site'
  );

  patched = replaceOnce(
    patched,
    'async function Kn_(A){if(!A.options.tools.some((O)=>j3(O,Hj)))return[];let q=R9(),K=await Ch(q);',
    'async function Kn_(A,B){if(!A.options.tools.some((O)=>j3(O,Hj)))return[];let q=R9(),K=await Ch(q);K=await opspalFilterPromptsForTask(K,q,B);',
    'prompt-aware skill attachment filter hook'
  );

  return patched;
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    args[key] = true;
  }

  return args;
}

function patchFile(targetPath) {
  const original = fs.readFileSync(targetPath, 'utf8');
  const patched = applyRuntimePatch(original);

  if (patched === original) {
    return { changed: false };
  }

  const backupPath = `${targetPath}${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, original, 'utf8');
  }

  fs.writeFileSync(targetPath, patched, 'utf8');
  return { changed: true, backupPath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetPath = args._[0] || DEFAULT_TARGET;

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Target runtime not found: ${targetPath}`);
  }

  if (args.check) {
    const source = fs.readFileSync(targetPath, 'utf8');
    process.stdout.write(JSON.stringify({
      targetPath,
      patched: source.includes(PATCH_MARKER)
    }, null, 2) + '\n');
    return;
  }

  const result = patchFile(targetPath);
  process.stdout.write(JSON.stringify({
    targetPath,
    changed: result.changed,
    backupPath: result.backupPath || null
  }, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[patch-claude-code-task-scope-runtime] ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  applyRuntimePatch,
  BACKUP_SUFFIX,
  DEFAULT_TARGET,
  PATCH_MARKER
};
