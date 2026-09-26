import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionDigest,evaluateAdmission} from '../lib/admission/policy';
const digest='a'.repeat(64),integrity='sha512-'+Buffer.alloc(64,7).toString('base64');
function manifest(){return {id:'npm-contract',sourceKind:'npm',packageName:'pg',sourceURL:'https://registry.npmjs.org/pg/-/pg-8.23.0.tgz',revision:'8.23.0',integrity,licensePath:'LICENSE',licenseDigest:digest,paths:['package.json'],artifactDigests:{'package.json':digest},dependencyDigests:[],purpose:'PostgreSQL driver contract',requiredPermissions:['network:database'],maintenanceStatus:'active'};}
test('npm admission pins package version and archive integrity without fabricating a Git SHA',()=>{
 const value=manifest();const approvals=[{manifestDigest:admissionDigest(value as any),reviewer:'synthetic-test-reviewer',decision:'allowed' as const,expiresAt:'2030-01-01T00:00:00Z',evidenceDigest:digest,restrictedPathsReviewed:[]}];
 assert.equal(evaluateAdmission(value,approvals).status,'allowed');
 for(const change of [{revision:'latest'},{revision:'^8.23.0'},{integrity:'not-an-integrity'},{packageName:'../evil'}])assert.equal(evaluateAdmission({...value,...change},approvals).status,'denied');
});
test('npm lock drift rejects an otherwise approved installed artifact',async()=>{
 const policy=await import('../lib/admission/policy') as Record<string,any>;
 assert.equal(typeof policy.verifyNpmLock,'function');const value=manifest(),path='node_modules/pg';
 const lock={packages:{[path]:{version:'8.23.0',integrity,resolved:value.sourceURL}}};
 assert.deepEqual(policy.verifyNpmLock(value,path,lock),[]);
 for(const altered of [{packages:{}},{packages:{[path]:{...lock.packages[path],version:'8.24.0'}}},{packages:{[path]:{...lock.packages[path],integrity:'changed'}}}])assert.ok(policy.verifyNpmLock(value,path,altered).length);
});
