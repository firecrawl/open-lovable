"use client";
import type { Project, ProjectRun } from './store';
export interface ProjectState {
 project:Project & {workspaceId?:string};
 permissions?:{write:boolean;manageConnections:boolean};
 profile?:'individual'|'supabase';
 revisions:Array<{id:string;version:number;label:string;sha256:string;created_at:string}>;
 runs:ProjectRun[];
 messages:Array<{id:string;role:string;content:string;created_at:string}>;
 documents:Array<{id:string;name:string;content:string;sha256:string}>;
}
export async function projectRequest<T>(body:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data;
}
export async function loadProject(id:string,signal?:AbortSignal):Promise<ProjectState>{
 const response=await fetch('/api/projects?id='+encodeURIComponent(id),{cache:'no-store',signal});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível abrir o projeto.');return data;
}
export function zipAsBase64(file:File):Promise<string>{
 if(file.size>12*1024*1024)return Promise.reject(new Error('O ZIP deve ter até 12 MiB.'));
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Não foi possível ler o ZIP.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
}
export async function readProjectEvents(response:Response,onEvent:(event:{type:string;state?:string;phase?:string;runID?:string;error?:string})=>void):Promise<void>{
 if(!response.ok){const data=await response.json();throw new Error(data.error||'Não foi possível iniciar a geração.');}
 if(!response.headers.get('content-type')?.includes('text/event-stream')){await response.json();return;}
 const reader=response.body?.getReader();if(!reader)throw new Error('Resposta de geração vazia.');
 const decoder=new TextDecoder();let pending='';
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>131072)throw new Error('Evento de geração excedeu o limite.');let boundary;while((boundary=pending.indexOf('\n'))>=0){const line=pending.slice(0,boundary);pending=pending.slice(boundary+1);if(line.startsWith('data: '))onEvent(JSON.parse(line.slice(6)));}}}
 finally{reader.releaseLock();}
}
