// Test-only process boundary: real shared inference, then persist output and await forced process loss.
import {RunQueue} from '../../lib/runs/queue';
import {projectStore} from '../../lib/projects/store';
import {requestFrozenModel} from '../../lib/projects/generation';
async function main(){
 const queue=new RunQueue(projectStore()),worker=queue.acquireWorker('checkpoint-test-process');
 if(!worker)throw new Error('Test worker lease unavailable');const job=queue.claim(worker);if(!job)throw new Error('Test run unavailable');
 const timer=setInterval(()=>{queue.heartbeatWorker(worker);queue.heartbeat(job);},1000);
 const result=await requestFrozenModel(job.run,job.input,AbortSignal.timeout(30000),{assertLive:()=>queue.assertLease(job),beforeModel:()=>queue.markModelStarted(job),status:payload=>queue.event(job,'run.progress',payload)});
 queue.recordModelResult(job,result.text,result.usage);process.send?.({type:'checkpoint.recorded'});
 // Parent owns and terminates this fixture after the checkpoint, never a production worker.
 void timer;
}
void main().catch(()=>{console.error('Checkpoint fixture failed');process.exitCode=1;process.exit(1);});
