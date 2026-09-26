"use client";
import {z} from 'zod';
import type {RunEvent,RunSummary,EnqueueRequest} from './types';
const eventSchema=z.object({eventId:z.string().uuid(),sequence:z.number().int().min(1),workspaceId:z.string().uuid(),projectId:z.string().uuid(),runId:z.string().uuid(),requestId:z.string().uuid(),traceId:z.string().regex(/^[a-f0-9]{32}$/),type:z.string().max(80),occurredAt:z.string().datetime(),payload:z.record(z.unknown())});
/** A browser observer cannot start, cancel or approve work. It only consumes a bounded journal. */
export async function readRunEvents(response:Response,runId:string,cursor:number,onEvent:(event:RunEvent)=>void):Promise<number>{
 if(!response.ok)throw new Error('N\u00e3o foi poss\u00edvel acompanhar a execu\u00e7\u00e3o ('+response.status+').');
 if(!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Resposta de eventos inv\u00e1lida.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Resposta de eventos vazia.');
 const decoder=new TextDecoder();let pending='',last=cursor;
 const accept=(block:string)=>{
  if(block.length>65536)throw new Error('Evento excedeu o limite.');
  const lines=block.split('\n'),data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
  if(!data)return;
  if(lines.some(line=>line.trim()==='event: error'))throw new Error('A observa\u00e7\u00e3o foi interrompida. Confira o acesso e reconecte.');
  const event=eventSchema.parse(JSON.parse(data)),identifier=lines.find(line=>line.startsWith('id:'))?.slice(3).trim();
  if(event.runId!==runId||(identifier!==undefined&&identifier!==String(event.sequence)))throw new Error('Evento pertence a outra execu\u00e7\u00e3o.');
  if(event.sequence<=last)return;
  if(event.sequence!==last+1)throw new Error('Sequ\u00eancia incompleta. Reabra o hist\u00f3rico.');
  onEvent(event);last=event.sequence;
 };
 try{
  while(true){const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});pending=pending.replace(/\r\n/g,'\n');
   let end:number;while((end=pending.indexOf('\n\n'))>=0){accept(pending.slice(0,end));pending=pending.slice(end+2);}
   if(pending.length>131072)throw new Error('Resposta de eventos excedeu o limite.');
   if(done){if(pending.trim())throw new Error('Resposta de eventos incompleta.');return last;}
  }
 }finally{try{await reader.cancel();}finally{reader.releaseLock();}}
}
export async function runRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal});
 const data=await response.json();if(!response.ok)throw new Error(typeof data.error==='string'?data.error.slice(0,1000):'N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o.');return data as T;
}
export const enqueueRun=(body:EnqueueRequest,signal?:AbortSignal)=>runRequest<{run:RunSummary}>('/api/v1/runs',body,signal);
export const loadRuns=(projectId:string,signal?:AbortSignal)=>runRequest<{runs:RunSummary[]}>('/api/v1/runs?projectId='+encodeURIComponent(projectId),undefined,signal);
