import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {assertSafeDataAncestors} from '../security/data-paths';
import {admissionManifestSchema,type AdoptionManifest,type AdmissionApproval,type AdmissionDecision} from './manifest';

function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
 return JSON.stringify(value);
}
function safePath(path:string):boolean {
 return /^[a-z0-9_./ ()\[\]@+-]+$/i.test(path)&&!path.startsWith('/')&&!path.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'||/^\.env(?:\.|$)/i.test(part));
}
/** Digest covers exact revision, artifacts, license, permissions and intended distribution. */
export function admissionDigest(manifest:AdoptionManifest):string{return createHash('sha256').update(canonical(manifest)).digest('hex');}

/** Approvals must come from the reviewed operator registry, never from an HTTP/model payload.
 * This verifies policy records, not legal compatibility by guessing from a license name.
 */
export function evaluateAdmission(input:unknown,approvals:readonly AdmissionApproval[]=[],now=new Date()):AdmissionDecision{
 const parsed=admissionManifestSchema.safeParse(input);
 if(!parsed.success)return {status:'denied',reasons:['Manifest is incomplete or not pinned to an immutable source revision']};
 const manifest=parsed.data;
 if(!safePath(manifest.licensePath)||manifest.paths.some(path=>!safePath(path))||new Set(manifest.paths.map(path=>path.toLowerCase())).size!==manifest.paths.length)return {status:'denied',reasons:['Paths must be unique relative source files without traversal']};
 if(Object.keys(manifest.artifactDigests).length!==manifest.paths.length||manifest.paths.some(path=>!Object.hasOwn(manifest.artifactDigests,path)))return {status:'denied',reasons:['Each selected file requires its exact checksum']};
 const digest=admissionDigest(manifest);const matches=approvals.filter(row=>row.manifestDigest===digest);
 if(matches.length!==1)return {status:'conditional',reasons:['An unambiguous reviewed admission for this exact manifest is required']};
 const approval=matches[0];
 if(approval.decision==='denied')return {status:'denied',reasons:['Admission was denied by the reviewer']};
 if(approval.decision!=='allowed'||!approval.reviewer?.trim()||!/^[a-f0-9]{64}$/.test(approval.evidenceDigest)||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=now.getTime())return {status:'conditional',reasons:['Review is incomplete or expired']};
 if(manifest.maintenanceStatus!=='active')return {status:'conditional',reasons:['Maintenance risk needs a new explicit decision before adoption']};
 const restricted=manifest.paths.filter(path=>/(^|\/)(pro|enterprise|commercial)(\/|$)/i.test(path)||/\.(?:woff2?|ttf|otf)$/i.test(path));
 if(restricted.some(path=>!approval.restrictedPathsReviewed?.includes(path)))return {status:'denied',reasons:['Restricted directories or font assets were not explicitly reviewed']};
 return {status:'allowed',approvedDigest:digest,reasons:[]};
}

/** Validate real files and the full license, not just a self-reported checksum in JSON. */
export function verifyAdmissionFiles(input:unknown,directory:string):string[]{
 const parsed=admissionManifestSchema.safeParse(input);if(!parsed.success)return ['Invalid artifact manifest'];
 const manifest=parsed.data,issues:string[]=[];let root:string;
 try{assertSafeDataAncestors(directory);root=realpathSync(directory);}catch{return ['Untrusted source directory'];}
 let total=0;
 for(const path of [...new Set([manifest.licensePath,...manifest.paths])]){
  if(!safePath(path)){issues.push('Unsafe source path');continue;}
  try{
   const absolute=resolve(join(root,path)),rel=relative(root,absolute);
   if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw new Error('Escaping path');
   assertSafeDataAncestors(absolute);const stat=lstatSync(absolute);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024)throw new Error('Invalid source file');
   total+=stat.size;if(total>100*1024*1024)throw new Error('Artifact budget exceeded');
   const actual=createHash('sha256').update(readFileSync(absolute)).digest('hex');
   const expected=path===manifest.licensePath?manifest.licenseDigest:manifest.artifactDigests[path];
   if(actual!==expected)issues.push('Checksum mismatch: '+path);
  }catch{issues.push('Source file is missing, linked, oversized or outside the admitted root: '+path);}
 }
 return issues;
}

/** Compare installed package identity to the version, source and integrity in the committed lockfile. */
export function verifyNpmLock(input:unknown,sourceDirectory:string,lock:unknown):string[]{
 const parsed=admissionManifestSchema.safeParse(input);if(!parsed.success)return ['Invalid artifact manifest'];
 const manifest=parsed.data;if(manifest.sourceKind!=='npm')return [];
 const expected='node_modules/'+manifest.packageName;
 if(sourceDirectory!==expected&&!sourceDirectory.endsWith('/'+expected))return ['Package source directory does not match its admitted name'];
 const packages=(lock as {packages?:Record<string,{version?:string;integrity?:string;resolved?:string}>})?.packages;
 const row=packages?.[sourceDirectory];
 return row&&row.version===manifest.revision&&row.integrity===manifest.integrity&&row.resolved===manifest.sourceURL?[]:['Package lock identity changed or is missing'];
}

/** Canonical JSON evidence remains stable across LF/CRLF checkout conversion, not content changes. */
export function reviewEvidenceDigest(value:unknown):string{return createHash('sha256').update(canonical(value)).digest('hex');}
/** A declaration of a digest is insufficient: the protected review artifact must actually match it. */
export function verifyReviewEvidence(input:unknown,root:string):string[]{
 try{
  const value=input as {evidencePath?:string;evidenceDigest?:string;evidenceFormat?:string};
  if(value?.evidenceFormat!=='canonical-json-v1'||typeof value.evidencePath!=='string'||!/^docs\/admission\/[a-zA-Z0-9._-]+\.json$/.test(value.evidencePath))return ['Missing or invalid review evidence reference'];
  const path=resolve(root,value.evidencePath);assertSafeDataAncestors(path);const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)return ['Invalid review evidence file'];
  return reviewEvidenceDigest(JSON.parse(readFileSync(path,'utf8')))===value.evidenceDigest?[]:['Review evidence content changed'];
 }catch{return ['Review evidence missing or unreadable'];}
}
