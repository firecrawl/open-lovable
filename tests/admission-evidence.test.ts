import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
async function functions(){const m=await import('../lib/admission/policy') as Record<string,any>;assert.equal(typeof m.verifyReviewEvidence,'function');assert.equal(typeof m.reviewEvidenceDigest,'function');return m;}
test('admission checks real review evidence without depending on platform line endings',async t=>{
 const {verifyReviewEvidence,reviewEvidenceDigest}=await functions();const root=mkdtempSync(join(tmpdir(),'admission-evidence-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'docs','admission'),{recursive:true});
 const evidence={package:'pg',version:'8.23.0',review:'synthetic test'},path='docs/admission/test-review.json';
 const approval={evidencePath:path,evidenceDigest:reviewEvidenceDigest(evidence),evidenceFormat:'canonical-json-v1'};
 writeFileSync(join(root,path),JSON.stringify(evidence,null,2).replaceAll('\n','\r\n'));assert.deepEqual(verifyReviewEvidence(approval,root),[]);
 writeFileSync(join(root,path),JSON.stringify({...evidence,version:'9.0.0'}));assert.ok(verifyReviewEvidence(approval,root).length);
 assert.ok(verifyReviewEvidence({...approval,evidencePath:'../outside.json'},root).length);
 assert.ok(verifyReviewEvidence({...approval,evidencePath:'docs/admission/missing.json'},root).length);
});
