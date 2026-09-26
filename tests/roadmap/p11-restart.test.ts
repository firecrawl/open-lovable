import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../../lib/projects/store';
import {SqliteProjectRepository} from '../../lib/persistence/sqlite';
import {RunQueue} from '../../lib/runs/queue';
import {modelBindingDigest} from '../../lib/runs/model-binding';
import type {RunAuthority} from '../../lib/runs/types';

test('P11 restart requeues only pre-effect work and fences the old worker epoch',async t=>{
 const store=new ProjectStore(':memory:');t.after(()=>store.close());let now=1000;
 const repo=new SqliteProjectRepository(store),ctx=repo.individualContext('restart-user'),project=await repo.create(ctx,'Restart','gateway/model');
 const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'restart-user',allowLoopback:true,modelBinding:modelBindingDigest('gateway/model'),policyVersion:1};
 const queue=new RunQueue(store,()=>now),request={projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'restart-safe',model:'gateway/model',mode:'build' as const,imageIDs:[],confirmCost:true as const};
 const run=queue.enqueue(authority,request),oldWorker=queue.acquireWorker('old-worker')!,job=queue.claim(oldWorker)!;
 queue.fail(job,'worker shutdown',true);assert.equal(queue.get(authority,run.id).state,'QUEUED');
 now+=21000;const newWorker=queue.acquireWorker('new-worker')!;assert.notEqual(newWorker.epoch,oldWorker.epoch);const resumed=queue.claim(newWorker)!;assert.equal(resumed.inputDigest,job.inputDigest);assert.throws(()=>queue.assertLease(job),/lease|worker/i);
});

test('P11 restart marks a started request interrupted instead of replaying it',async t=>{
 const store=new ProjectStore(':memory:');t.after(()=>store.close());const repo=new SqliteProjectRepository(store),ctx=repo.individualContext('started-user'),project=await repo.create(ctx,'Started','gateway/model');
 const authority:RunAuthority={workspaceId:ctx.principal.workspaceId,actorId:ctx.principal.actorId,memberVersion:1,mode:'individual',sessionId:null,origin:'http://127.0.0.1:3100',settingsOwner:'started-user',allowLoopback:true,modelBinding:modelBindingDigest('gateway/model'),policyVersion:1};
 const queue=new RunQueue(store),run=queue.enqueue(authority,{projectId:project.id,baseVersion:1,requestKey:randomUUID(),prompt:'started',model:'gateway/model',mode:'build',imageIDs:[],confirmCost:true}),worker=queue.acquireWorker('started-worker')!,job=queue.claim(worker)!;
 queue.markModelStarted(job);queue.fail(job,'worker shutdown',true);assert.equal(queue.get(authority,run.id).state,'INTERRUPTED');assert.equal(store.getRun('started-user',project.id,run.id).candidate,null);
});
