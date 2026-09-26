import {z} from 'zod';
export const digestSchema=z.string().regex(/^[a-f0-9]{64}$/);
const commonManifestSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
 sourceURL:z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash;},'An HTTPS source without credentials is required'),
 licensePath:z.string().min(1).max(300),licenseDigest:digestSchema,
 paths:z.array(z.string().min(1).max(300)).min(1).max(200),
 artifactDigests:z.record(digestSchema),dependencyDigests:z.array(digestSchema).max(1000),
 purpose:z.string().min(1).max(240),requiredPermissions:z.array(z.string().regex(/^[a-z0-9:_-]{1,100}$/)).max(100),
 maintenanceStatus:z.enum(['active','archived','unknown']),
}).strict();
/** Registry packages use an exact version plus SRI, never a made-up source-control revision. */
export const admissionManifestSchema=z.union([
 commonManifestSchema.extend({sourceKind:z.literal('git').optional(),revision:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),
 commonManifestSchema.extend({sourceKind:z.literal('npm'),revision:z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  packageName:z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
  integrity:z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
 }).strict().refine(value=>{
  const url=new URL(value.sourceURL),base=value.packageName.split('/').at(-1)!;
  return url.origin==='https://registry.npmjs.org'&&url.pathname==='/'+value.packageName+'/-/'+base+'-'+value.revision+'.tgz';
 },'Npm artifact URL must match its declared registry package and exact version'),
]);
export type AdoptionManifest=z.infer<typeof admissionManifestSchema>;
export interface AdmissionApproval {manifestDigest:string;reviewer:string;decision:'allowed'|'conditional'|'denied';expiresAt:string;evidenceDigest:string;evidencePath?:string;evidenceFormat?:'canonical-json-v1';restrictedPathsReviewed:readonly string[];}
export interface AdmissionDecision {status:'allowed'|'conditional'|'denied';approvedDigest?:string;reasons:string[];}
