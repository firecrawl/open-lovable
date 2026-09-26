import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const license='Synthetic license fixture, reviewed only for this test.';
function candidate(){return {id:'example-component',sourceURL:'https://github.com/example/component',revision:'a'.repeat(40),licensePath:'LICENSE',licenseDigest:hash(license),paths:['src/index.ts'],artifactDigests:{'src/index.ts':hash('export const value=1;')},dependencyDigests:[],purpose:'hosted-service',requiredPermissions:['project:read'],maintenanceStatus:'active'};}
async function policy(){const m=await import('../lib/admission/policy').catch(()=>({})) as Record<string,any>;assert.equal(typeof m.evaluateAdmission,'function','reviewed provenance gate must be implemented');assert.equal(typeof m.admissionDigest,'function');return m;}
function approval(digest:string){return {manifestDigest:digest,reviewer:'test-reviewer',decision:'allowed',expiresAt:'2030-01-01T00:00:00Z',evidenceDigest:'b'.repeat(64),restrictedPathsReviewed:[]};}
const now=new Date('2026-09-23T00:00:00Z');

test('P50 only an exact reviewed manifest can be admitted; matching a product name is insufficient',async()=>{
 const {evaluateAdmission,admissionDigest}=await policy();const manifest=candidate(),decision=approval(admissionDigest(manifest));
 assert.equal(evaluateAdmission(manifest,[],now).status,'conditional');
 assert.equal(evaluateAdmission(manifest,[decision],now).status,'allowed');
 for(const change of [{revision:'c'.repeat(40)},{licenseDigest:'d'.repeat(64)},{dependencyDigests:['e'.repeat(64)]},{paths:['src/pro/index.ts'],artifactDigests:{'src/pro/index.ts':hash('export const value=1;')}},{requiredPermissions:['host:write']}]){
  const result=evaluateAdmission({...manifest,...change},[decision],now);assert.notEqual(result.status,'allowed');assert.equal(result.approvedDigest,undefined);
 }
});
test('P50 unknown versions, absent licenses, traversal, expired decisions and restricted paths fail closed',async()=>{
 const {evaluateAdmission,admissionDigest}=await policy();const manifest=candidate();
 for(const change of [{revision:'main'},{licenseDigest:''},{sourceURL:'https://user:secret@example.com/repo'},{paths:['../outside.ts']},{maintenanceStatus:'unknown'}])assert.notEqual(evaluateAdmission({...manifest,...change},[approval(admissionDigest(manifest))],now).status,'allowed');
 assert.notEqual(evaluateAdmission(manifest,[{...approval(admissionDigest(manifest)),expiresAt:'2025-01-01T00:00:00Z'}],now).status,'allowed');
 const pro={...manifest,paths:['src/pro/feature.ts'],artifactDigests:{'src/pro/feature.ts':hash('pro')}};
 assert.notEqual(evaluateAdmission(pro,[approval(admissionDigest(pro))],now).status,'allowed');
});
test('P50 actual candidate bytes and license must match; links and modified files cannot inherit approval',async t=>{
 const {verifyAdmissionFiles}=await policy();assert.equal(typeof verifyAdmissionFiles,'function');
 const root=mkdtempSync(join(tmpdir(),'admission-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'src'));writeFileSync(join(root,'LICENSE'),license);writeFileSync(join(root,'src/index.ts'),'export const value=1;');
 const manifest=candidate();assert.deepEqual(verifyAdmissionFiles(manifest,root),[]);
 writeFileSync(join(root,'src/index.ts'),'export const value=2;');assert.ok(verifyAdmissionFiles(manifest,root).length);
 const target=join(root,'other');mkdirSync(target);writeFileSync(join(target,'index.ts'),'export const value=1;');
 const linked=join(root,'linked');symlinkSync(target,linked,process.platform==='win32'?'junction':'dir');
 assert.ok(verifyAdmissionFiles({...manifest,paths:['linked/index.ts'],artifactDigests:{'linked/index.ts':hash('export const value=1;')}},root).length);
});
