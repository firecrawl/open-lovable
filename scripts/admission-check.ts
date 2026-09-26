import type {AdmissionApproval} from '../lib/admission/manifest';
import {readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {evaluateAdmission,verifyAdmissionFiles,verifyNpmLock,verifyReviewEvidence} from '../lib/admission/policy';

try{
 const root=process.cwd();
 const registry=JSON.parse(readFileSync(resolve(root,'docs/admission/approvals.json'),'utf8'));
 const submissions=JSON.parse(readFileSync(resolve(root,'docs/admission/candidates.json'),'utf8'));
 if(registry.schemaVersion!==1||!Array.isArray(registry.approvals)||submissions.schemaVersion!==1||!Array.isArray(submissions.candidates))throw new Error('Invalid admission registry');
 const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
 const reports=[];
 for(const item of submissions.candidates){
  const decision=evaluateAdmission(item.manifest,registry.approvals);let artifacts:string[]=[];
  if(typeof item.sourceDirectory!=='string'||isAbsolute(item.sourceDirectory))artifacts=['Source directory must be relative'];
  else{
   const absolute=resolve(root,item.sourceDirectory),rel=relative(root,absolute);
   artifacts=!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)?['Source directory escaped repository']:verifyAdmissionFiles(item.manifest,absolute);
  }
  artifacts.push(...verifyNpmLock(item.manifest,item.sourceDirectory,lock));
  const approval=registry.approvals.find((row:AdmissionApproval)=>row.manifestDigest===decision.approvedDigest);
  artifacts.push(...verifyReviewEvidence(approval,root));
  reports.push({id:item.manifest?.id||'invalid',status:decision.status,issues:[...decision.reasons,...artifacts]});
 }
 const passed=reports.every(report=>report.status==='allowed'&&report.issues.length===0);
 console.log(JSON.stringify({passed,submittedCandidates:reports.length,reports,note:reports.length?'Only submitted artifacts and their referenced review records are verified; this is not independent security certification.':'No candidates does not retrospectively approve existing dependencies or the research catalog.'},null,2));
 if(!passed)process.exitCode=1;
}catch{console.error('Admission registry could not be verified; no candidates were admitted.');process.exitCode=1;}
