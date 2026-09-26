import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {projectStore} from '../lib/projects/store';
import {safeLogger} from '../lib/security/secret-content';
import {RunQueue} from '../lib/runs/queue';
import {runWorkerOnce} from '../lib/runs/worker';
import {authMode} from '../lib/identity/config';
import type {WorkerLease} from '../lib/runs/types';

/** Local operator process. It has no public HTTP or arbitrary shell-execution interface. */
async function main():Promise<void>{
 if(process.argv.slice(2).some(arg=>arg!=='--once'))throw new Error('Usage: worker [--once]');
 const queue=new RunQueue(projectStore()),workerId=randomUUID();
 const stop=new AbortController(),shutdown=()=>stop.abort();process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
 const onMessage=(message:unknown)=>{if(message&&typeof message==='object'&&(message as {type?:unknown}).type==='shutdown')shutdown();};process.on('message',onMessage);
 let lease:WorkerLease|null=null,ticker:ReturnType<typeof setInterval>|undefined;
 try{
  // A crashed predecessor still owns its lease. Wait for expiry; never steal a live worker's lease.
  const deadline=performance.now()+22000;
  do{
   if(stop.signal.aborted)return;
   lease=queue.acquireWorker(workerId);if(lease)break;
   if(performance.now()>=deadline)throw new Error('Another worker holds the execution lease for this installation.');
   try{await delay(250,undefined,{signal:stop.signal});}catch(error){if(stop.signal.aborted)return;throw error;}
  }while(!lease);
  const active=lease;
  ticker=setInterval(()=>{if(!queue.heartbeatWorker(active))stop.abort();},3000);ticker.unref();
  console.log(JSON.stringify({event:'worker.ready',profile:authMode(),execution:'single-node-sqlite'}));process.send?.({type:'worker.ready'});
  do{
   const result=await runWorkerOnce(queue,active,stop.signal);
   if(result.worked)console.log(JSON.stringify({event:'worker.run-finished',...result}));
   if(process.argv.includes('--once'))break;
   try{await delay(500,undefined,{signal:stop.signal});}catch(error){if(!stop.signal.aborted)throw error;}
  }while(!stop.signal.aborted);
 }finally{
  if(ticker)clearInterval(ticker);if(lease)queue.releaseWorker(lease);queue.store.close();
  process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);process.off('message',onMessage);if(process.connected)process.disconnect();
 }
}
void main().catch(error=>{safeLogger.error('Agent worker stopped',error);process.exitCode=1;});
