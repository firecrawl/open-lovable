import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const moduleURL=new URL('../../scripts/verification/baseline.mjs',import.meta.url);
const BASE='5066bdd77aee4dd56d07be03bc5bc57b2a1c3977';
const ids=['install','lint','typecheck','tests','build','browser','audit','diff'];
async function setup(t){
 const mod=await import(moduleURL.href).catch(()=>({}));
 assert.equal(typeof mod.verifyBaseline,'function','P00 requires a fail-closed baseline verifier');
 const root=mkdtempSync(join(tmpdir(),'p00-gates-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'logs'));
 const gates=ids.map(id=>({id,command:`test-fixture ${id}`,exitCode:0,termination:'exited',artifacts:['stdout','stderr'].map(stream=>{
  const path=`logs/${id}.${stream}.log`,bytes=Buffer.from(`${id} ${stream}\n`);writeFileSync(join(root,path),bytes);
  return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 })}));
 return {verify:mod.verifyBaseline,root,evidence:{schemaVersion:1,sourceHead:BASE,gates}};
}
test('P00-A: complete gates and actual log hashes pass',async t=>{const {verify,root,evidence}=await setup(t);assert.deepEqual(verify(evidence,root,BASE),{passed:true,issues:[]});});
test('P00-B: outer process success cannot mask a real failed child',async t=>{
 const {verify,root,evidence}=await setup(t);
 const wrapper=spawnSync(process.execPath,['-e',`const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['-e','console.error("deliberate failure");process.exit(7)']);console.log(JSON.stringify({exitCode:r.status}));process.exit(0)`],{encoding:'utf8'});
 assert.equal(wrapper.status,0);evidence.gates[0].exitCode=JSON.parse(wrapper.stdout).exitCode;assert.equal(evidence.gates[0].exitCode,7);evidence.allPassed=true;
 const result=verify(evidence,root,BASE);assert.equal(result.passed,false);assert.ok(result.issues.some(issue=>issue.includes('install')));
});
test('P00: missing and duplicate gates fail closed',async t=>{const {verify,root,evidence}=await setup(t);evidence.gates.pop();assert.equal(verify(evidence,root,BASE).passed,false);evidence.gates.push(evidence.gates[0]);assert.equal(verify(evidence,root,BASE).passed,false);});
test('P00: timeout and lost exit code are failures',async t=>{const {verify,root,evidence}=await setup(t);evidence.gates[0].termination='timeout';assert.equal(verify(evidence,root,BASE).passed,false);evidence.gates[0].termination='exited';evidence.gates[0].exitCode=null;assert.equal(verify(evidence,root,BASE).passed,false);});
test('P00: changed or missing logs invalidate evidence',async t=>{const {verify,root,evidence}=await setup(t);const path=join(root,evidence.gates[0].artifacts[0].path);writeFileSync(path,'changed');assert.equal(verify(evidence,root,BASE).passed,false);rmSync(path);assert.equal(verify(evidence,root,BASE).passed,false);});
test('P00: evidence from another commit cannot certify the head',async t=>{const {verify,root,evidence}=await setup(t);assert.equal(verify(evidence,root,'a'.repeat(40)).passed,false);evidence.sourceHead='main';assert.equal(verify(evidence,root,BASE).passed,false);});
test('P00: malformed manifests and escaping paths are rejected',async t=>{
 const {verify,root,evidence}=await setup(t);for(const input of [null,{}, {schemaVersion:1,sourceHead:BASE,gates:[]}])assert.equal(verify(input,root,BASE).passed,false);
 for(const path of ['../external.log','/etc/passwd','C:\\outside.log','logs/../other.log']){evidence.gates[0].artifacts[0].path=path;assert.equal(verify(evidence,root,BASE).passed,false);}
});
test('P00: CLI returns failure despite a declared allPassed flag',async t=>{
 const {root,evidence}=await setup(t);evidence.gates[0].exitCode=9;evidence.allPassed=true;const report=join(root,'manifest.json');writeFileSync(report,JSON.stringify(evidence));
 const result=spawnSync(process.execPath,[fileURLToPath(moduleURL),report,root,BASE],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).passed,false);
});
