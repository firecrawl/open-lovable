import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDomainEvent,domainEventSchema} from '../../lib/audit/events';
import {createTraceContext,traceFromRequest,traceHeaders} from '../../lib/observability/tracing';
const ids={workspaceId:randomUUID(),projectId:randomUUID(),runId:randomUUID()};

test('P07-A creates a correlated domain event without exposing secrets',()=>{
 const event=createDomainEvent({sequence:1,...ids,type:'tool.completed',payload:{tool:'read_file',apiKey:'hidden',nested:{password:'hidden',ok:true}}});
 assert.equal(event.payload.apiKey,'[REDACTED]');assert.deepEqual(event.payload.nested,{password:'[REDACTED]',ok:true});assert.equal(domainEventSchema.parse(event).runId,ids.runId);
});

test('P07-B correlation is stable when valid and replaced when forged',()=>{
 const request=new Request('http://127.0.0.1',{headers:{'x-request-id':randomUUID(),'x-trace-id':'a'.repeat(32)}});const trace=traceFromRequest(request);assert.equal(traceHeaders(trace)['X-Trace-ID'],'a'.repeat(32));
 const forged=createTraceContext({requestId:'not-a-uuid',traceId:'not-trace'});assert.match(forged.requestId,/^[0-9a-f-]{36}$/);assert.match(forged.traceId,/^[a-f0-9]{32}$/);
 assert.throws(()=>domainEventSchema.parse({...createDomainEvent({sequence:1,...ids,type:'x',payload:{}}),workspaceId:randomUUID(),sequence:0}),/too_small|positive/i);
});
