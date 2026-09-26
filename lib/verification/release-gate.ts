import {assertReport,type VerificationReport,type VerificationCheck} from './evidence';
import {ProjectError} from '../projects/store';

export interface ReleaseGateResult {ready:boolean;revisionDigest:string;checks:number;artifacts:number;errors:number;reason?:string;}

export function evaluateReleaseGate(report:VerificationReport,expectedRevisionDigest:string):ReleaseGateResult {
 try{assertReport(report);}catch{throw new ProjectError('Verification report integrity failed.',409);}
 if(report.revisionDigest!==expectedRevisionDigest)throw new ProjectError('Verification report targets a different revision.',409);
 const required:VerificationCheck['kind'][]=['render','flow','accessibility','network'];
 const kinds=new Set(report.checks.map(check=>check.kind));
 const missing=[...required].filter(kind=>!kinds.has(kind));
 const failed=report.checks.filter(check=>!check.passed);
 if(missing.length||failed.length||report.observedErrors.length){
  return {ready:false,revisionDigest:report.revisionDigest,checks:report.checks.length,artifacts:report.artifacts.length,errors:report.observedErrors.length,reason:`Release evidence incomplete${missing.length?`; missing ${missing.join(',')}`:''}${failed.length?`; failed ${failed.map(check=>check.id).join(',')}`:''}${report.observedErrors.length?'; observed browser errors':''}`};
 }
 return {ready:true,revisionDigest:report.revisionDigest,checks:report.checks.length,artifacts:report.artifacts.length,errors:0};
}

export function requireReleaseReady(report:VerificationReport,expectedRevisionDigest:string):ReleaseGateResult {
 const result=evaluateReleaseGate(report,expectedRevisionDigest);
 if(!result.ready)throw new ProjectError(result.reason||'Independent verification did not pass release gate.',409);
 return result;
}
