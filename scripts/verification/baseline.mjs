import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const REQUIRED_GATES=Object.freeze(['install','lint','typecheck','tests','build','browser','audit','diff']);
const SHA1=/^[a-f0-9]{40}$/,SHA256=/^[a-f0-9]{64}$/,MAX_LOG_BYTES=64*1024*1024;
/** Checks complete gate coverage, child exit codes and actual log digests.
 * Not a signature, security certificate or proof of live-provider integration.
 * The caller supplies the immutable commit it actually intends to verify.
 */
export function verifyBaseline(evidence,evidenceRoot,expectedHead){
 const issues=[];
 if(!evidence||typeof evidence!=='object'||evidence.schemaVersion!==1)return {passed:false,issues:['Invalid baseline schema']};
 if(!SHA1.test(String(expectedHead))||evidence.sourceHead!==expectedHead)issues.push('Baseline sourceHead does not match the expected immutable commit');
 const gates=evidence.gates;
 if(!Array.isArray(gates)||gates.length!==REQUIRED_GATES.length)issues.push('Baseline must contain every required gate exactly once');
 if(!Array.isArray(gates)||gates.length>64)return {passed:false,issues};
 let root;try{root=realpathSync(evidenceRoot);}catch{issues.push('Evidence directory is unavailable');}
 const seen=new Set();
 for(const gate of gates){
  if(!gate||typeof gate!=='object'||!REQUIRED_GATES.includes(gate.id)){issues.push('Unknown gate');continue;}
  if(seen.has(gate.id))issues.push(`Duplicate gate: ${gate.id}`);seen.add(gate.id);
  if(typeof gate.command!=='string'||!gate.command.trim())issues.push(`${gate.id}: command missing`);
  if(gate.exitCode!==0||gate.termination!=='exited')issues.push(`${gate.id}: unsuccessful exit or termination`);
  if(!Array.isArray(gate.artifacts)||gate.artifacts.length!==2){issues.push(`${gate.id}: stdout and stderr artifacts are required`);continue;}
  const streams=new Set();
  for(const artifact of gate.artifacts){
   if(!artifact||typeof artifact!=='object'){issues.push(`${gate.id}: invalid artifact`);continue;}
   const path=artifact.path;
   if(typeof path!=='string'||isAbsolute(path)||/[\\:\u0000-\u001f]/.test(path)||path.split('/').some(part=>!part||part==='.'||part==='..')){issues.push(`${gate.id}: unsafe artifact path`);continue;}
   const stream=path.endsWith('.stdout.log')?'stdout':path.endsWith('.stderr.log')?'stderr':null;
   if(!stream||streams.has(stream))issues.push(`${gate.id}: duplicate or invalid log stream`);if(stream)streams.add(stream);
   if(!Number.isSafeInteger(artifact.bytes)||artifact.bytes<0||artifact.bytes>MAX_LOG_BYTES||!SHA256.test(String(artifact.sha256))){issues.push(`${gate.id}: invalid artifact size or digest`);continue;}
   if(!root)continue;
   try{
    let cursor=root;for(const part of path.split('/')){cursor=resolve(cursor,part);if(lstatSync(cursor).isSymbolicLink())throw new Error('Artifact path contains a link');}
    const stat=lstatSync(cursor);if(!stat.isFile()||stat.size!==artifact.bytes||stat.size>MAX_LOG_BYTES)throw new Error('Artifact size changed');
    if(createHash('sha256').update(readFileSync(cursor)).digest('hex')!==artifact.sha256)throw new Error('Artifact digest changed');
   }catch{issues.push(`${gate.id}: missing, linked or changed ${stream??'artifact'} log`);}
  }
  if(streams.size!==2)issues.push(`${gate.id}: incomplete log streams`);
 }
 for(const id of REQUIRED_GATES)if(!seen.has(id))issues.push(`Missing gate: ${id}`);
 return {passed:issues.length===0,issues};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [manifest,root,expectedHead]=process.argv.slice(2);
  if(!manifest||!root||!expectedHead||process.argv.length!==5)throw new Error('Usage: node baseline.mjs manifest.json evidenceRoot expectedHead');
  if(lstatSync(manifest).size>2*1024*1024)throw new Error('Manifest exceeds 2 MiB');
  const result=verifyBaseline(JSON.parse(readFileSync(manifest,'utf8')),root,expectedHead);console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;
 }catch(error){console.error(error instanceof Error?error.message:'Invalid evidence');process.exitCode=1;}
}
