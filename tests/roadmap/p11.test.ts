import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCapability,assertCapability} from '../../lib/ai/capability-probes';
import type {ModelOption} from '../../lib/ai/provider-catalog';
import {QuotaService} from '../../lib/quotas/service';
import {resolveRunLimits} from '../../lib/budgets/run-limits';

const option=(id:string,capabilities:string[],capabilityStatus:'declared'|'unknown'='declared',negativeCapabilities?:string[]):ModelOption=>({...({id,label:id,provider:'gateway',upstreamId:id,configured:true,source:'operator',capabilities,capabilityStatus}),...(negativeCapabilities?{negativeCapabilities}: {})} as ModelOption);

test('P11-A identifies a model without tools and offers alternatives without switching selection',()=>{
 const selected=option('gateway/text-only',['text','coding'],'declared',['tools']);
 const tools=option('gateway/tool-model',['text','coding','tools']);
 const evidence=assessCapability(selected,'tools',[selected,tools]);
 assert.equal(evidence.state,'unsupported');assert.deepEqual(evidence.alternatives,['gateway/tool-model']);assert.equal(evidence.requiresExplicitSelection,true);
 assert.throws(()=>assertCapability(selected,'tools',[selected,tools]),/no silent fallback/i);
});

test('P11-A keeps unknown capabilities visible instead of claiming support',()=>{
 const selected=option('gateway/unknown',['text'],'unknown');
 const evidence=assessCapability(selected,'tools',[selected]);
 assert.equal(evidence.state,'unknown');assert.equal(evidence.source,'unknown');assert.match(evidence.reason,/unknown|authorized probe/i);
});

test('P11-B rejects exhausted quota before a new call and does not invent cost',()=>{
 const quota=new QuotaService({maxBytes:100,maxArtifacts:10,retentionMs:1000});
 assert.throws(()=>quota.assertCanStore({source:100,references:0,candidates:0,logs:0,captures:0,research:0,release:0},'source',1),/quota/i);
 process.env.OPEN_LOVABLE_MAX_MODEL_CALLS='0';try{assert.equal(resolveRunLimits({},'build').maxModelCalls,0);}finally{delete process.env.OPEN_LOVABLE_MAX_MODEL_CALLS;}
});
