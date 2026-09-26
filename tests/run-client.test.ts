import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
async function reader(){const implementation=await import('../lib/runs/client').catch(()=>({})) as Record<string,any>;assert.equal(typeof implementation.readRunEvents,'function');return implementation.readRunEvents;}
const event=(runId:string,sequence:number)=>({eventId:randomUUID(),sequence,workspaceId:randomUUID(),projectId:randomUUID(),runId,requestId:randomUUID(),traceId:'a'.repeat(32),type:'run.queued',occurredAt:new Date().toISOString(),payload:{phase:'compiling'}});
function response(text:string){const bytes=new TextEncoder().encode(text);let offset=0;return new Response(new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(offset+7,bytes.length);c.enqueue(bytes.slice(offset,end));offset=end;}}),{headers:{'content-type':'text/event-stream'}});}
test('run observer preserves sequence across chunk boundaries and never issues an execution command',async()=>{
 const read=await reader(),id=randomUUID(),first=event(id,1),second=event(id,2),seen:unknown[]=[];
 const last=await read(response('id: 1\nevent: run\ndata: '+JSON.stringify(first)+'\n\n: heartbeat\n\nid: 2\nevent: run\ndata: '+JSON.stringify(second)+'\n\n'),id,0,(e:unknown)=>seen.push(e));
 assert.equal(last,2);assert.deepEqual(seen,[first,second]);
});
test('observer rejects cross-run, sequence gaps and incomplete events instead of certifying success',async()=>{
 const read=await reader(),id=randomUUID();
 for(const e of [event(randomUUID(),1),event(id,3)])await assert.rejects(()=>read(response('id: '+e.sequence+'\nevent: run\ndata: '+JSON.stringify(e)+'\n\n'),id,0,()=>{}));
 await assert.rejects(()=>read(response('data: {"unfinished":'),id,0,()=>{}));
 await assert.rejects(()=>read(new Response('{}',{status:403}),id,0,()=>{}));
});
test('stopping a browser observer cancels only its response reader',async()=>{
 const read=await reader(),id=randomUUID();let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event(id,1))+'\n\n'));},cancel(){cancelled=true;}});
 await assert.rejects(()=>read(new Response(body,{headers:{'content-type':'text/event-stream'}}),id,0,()=>{throw new Error('observer stopped');}),/observer stopped/);
 assert.equal(cancelled,true);
});
