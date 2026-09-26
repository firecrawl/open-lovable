import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {studioEnvironment,startStudioProcesses} from './studio-supervisor.mjs';

async function main(){
 const args=process.argv.slice(2);const development=args.includes('--dev');
 let hostname='127.0.0.1',port=process.env.PORT||'3000';
 for(let i=0;i<args.length;i++){
  if(args[i]==='--dev')continue;
  if(args[i]==='--hostname'&&args[i+1])hostname=args[++i];
  else if(args[i]==='--port'&&args[i+1])port=args[++i];
  else throw new Error('Usage: start-studio [--dev] [--hostname host] [--port port]');
 }
 if(!/^[a-z0-9.:[\]-]+$/i.test(hostname)||!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('Invalid Studio bind address');
 const root=process.cwd(),env=studioEnvironment(root,development);
 const worker=development?{command:process.execPath,args:['--import','tsx','workers/agent-worker.ts']}:{command:process.execPath,args:['.open-lovable-build/agent-worker.cjs']};
 if(!development&&!existsSync(join(root,'.open-lovable-build/agent-worker.cjs')))throw new Error('Worker build is missing. Run npm run build before starting.');
 const web={command:process.execPath,args:['node_modules/next/dist/bin/next',development?'dev':'start',...(development?['--turbopack']:[]),'--hostname',hostname,'--port',port]};
 const studio=await startStudioProcesses({worker,web,env});
 const shutdown=()=>void studio.stop(0);process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
 process.on('message',message=>{if(message?.type==='shutdown')shutdown();});
 process.exitCode=await studio.exited;
}
void main().catch(()=>{console.error('Studio failed to start. Check the worker build, private data directory and operator configuration. No secrets were logged.');process.exitCode=1;});
