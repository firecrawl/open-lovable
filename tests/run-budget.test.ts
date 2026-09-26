import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRunLimits} from '../lib/budgets/run-limits';

test('run limits enforce server ceilings, bounded input/output and explicit privacy without guessing locality',()=>{
 const defaults=resolveRunLimits(undefined,'build');assert.equal(defaults.maxOutputTokens,12000);assert.equal(defaults.maxModelCalls,1);assert.equal(defaults.maxRepairs,0);
 assert.equal(resolveRunLimits({maxModelCalls:0,maxOutputTokens:512},'build').maxModelCalls,0);
 for(const input of [{maxOutputTokens:12001},{maxModelCalls:2},{timeoutMs:600001},{maxOutputBytes:99999999},{maxRepairs:1},{privacy:'local-only'}])assert.throws(()=>resolveRunLimits(input,'build'));
});
test('lower deployment ceilings are applied and invalid operator limits fail closed',()=>{
 const before={tokens:process.env.OPEN_LOVABLE_MAX_OUTPUT_TOKENS,timeout:process.env.OPEN_LOVABLE_MAX_RUN_TIMEOUT_MS,calls:process.env.OPEN_LOVABLE_MAX_MODEL_CALLS};
 try{process.env.OPEN_LOVABLE_MAX_OUTPUT_TOKENS='2048';assert.equal(resolveRunLimits(undefined,'build').maxOutputTokens,2048);assert.throws(()=>resolveRunLimits({maxOutputTokens:4096},'build'));process.env.OPEN_LOVABLE_MAX_OUTPUT_TOKENS='not-a-number';assert.throws(()=>resolveRunLimits(undefined,'build'));}
 finally{for(const [key,value] of [['OPEN_LOVABLE_MAX_OUTPUT_TOKENS',before.tokens],['OPEN_LOVABLE_MAX_RUN_TIMEOUT_MS',before.timeout],['OPEN_LOVABLE_MAX_MODEL_CALLS',before.calls]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
