import {spawn} from 'node:child_process';
import {lstatSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'dotenv';

/** Load only conventional operator-owned config files. Explicit process variables always win. */
export function studioEnvironment(root,development,inherited=process.env){
 const env={...inherited,NODE_ENV:development?'development':'production'};
 const mode=development?'development':'production';
 for(const name of ['.env.'+mode+'.local','.env.local','.env.'+mode,'.env']){
  const path=join(root,name);let stat;
  try{stat=lstatSync(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Invalid Studio environment file');
  for(const [key,value] of Object.entries(parse(readFileSync(path))))if(env[key]===undefined)env[key]=value;
 }
 return env;
}
/** Own exactly two children; shutdown/failure never kills unrelated Node or server processes. */
export async function startStudioProcesses({worker,web,env,inheritOutput=true}){
 const children=[],exits=new Map();let stopping=false,finish;
 const exited=new Promise(resolve=>finish=resolve);
 const launch=spec=>{
  const child=spawn(spec.command,spec.args,{env,stdio:['ignore',inheritOutput?'inherit':'ignore',inheritOutput?'inherit':'ignore','ipc']});
  children.push(child);
  const done=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve(code??(signal?1:0)));child.once('error',()=>resolve(1));});
  exits.set(child,done);
  void done.then(code=>{if(!stopping)void stop(code||1);});return child;
 };
 const terminate=async child=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  if(child.connected)try{child.send({type:'shutdown'},()=>{});}catch{/* It may already have disconnected after exit. */}
  let timeout;
  await Promise.race([exits.get(child),new Promise(resolve=>timeout=setTimeout(resolve,1500))]);clearTimeout(timeout);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  await Promise.race([exits.get(child),new Promise(resolve=>timeout=setTimeout(resolve,4000))]);clearTimeout(timeout);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await exits.get(child);
 };
 async function stop(code=0){
  if(stopping)return exited;stopping=true;
  try{await Promise.all(children.map(terminate));}finally{finish(code);}
  return exited;
 }
 const agent=launch(worker);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(new Error('Worker startup timed out'));},35000);
   const message=value=>{if(value?.type==='worker.ready'){cleanup();resolve();}};
   const failed=()=>{cleanup();reject(new Error('Worker failed during startup'));};
   const cleanup=()=>{clearTimeout(timer);agent.off('message',message);agent.off('exit',failed);agent.off('error',failed);};
   agent.on('message',message);agent.once('exit',failed);agent.once('error',failed);
  });
  if(stopping)throw new Error('Worker stopped during startup');launch(web);
 }catch(error){await stop(1);throw error;}
 return {children,exited,stop};
}
