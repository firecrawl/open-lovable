import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionManifestSchema} from '../lib/admission/manifest';
import {ProjectError} from '../lib/projects/store';
const digest='a'.repeat(64),integrity='sha512-'+Buffer.alloc(64,7).toString('base64');
const sample={id:'npm-review',sourceKind:'npm',packageName:'pg',revision:'8.23.0',integrity,sourceURL:'https://registry.npmjs.org/pg/-/pg-8.23.0.tgz',licensePath:'LICENSE',licenseDigest:digest,paths:['package.json'],artifactDigests:{'package.json':digest},dependencyDigests:[],purpose:'Synthetic admission identity test',requiredPermissions:[],maintenanceStatus:'active'};
test('npm tarball identity must match the declared package, scope and exact version',()=>{
 assert.equal(admissionManifestSchema.safeParse(sample).success,true);
 assert.equal(admissionManifestSchema.safeParse({...sample,packageName:'@types/pg',revision:'8.23.1',sourceURL:'https://registry.npmjs.org/@types/pg/-/pg-8.23.1.tgz'}).success,true);
 for(const sourceURL of ['https://registry.npmjs.org/other/-/other-1.0.0.tgz','https://registry.npmjs.org/pg/-/pg-8.24.0.tgz','https://registry.npmjs.org:8443/pg/-/pg-8.23.0.tgz'])assert.equal(admissionManifestSchema.safeParse({...sample,sourceURL}).success,false);
});
test('operator database errors explain known failures without exposing driver credentials',async()=>{
 const m=await import('../lib/persistence/operator-errors').catch(()=>({})) as Record<string,unknown>;
 assert.equal(typeof m.postgresOperationError,'function');const format=m.postgresOperationError as (error:unknown)=>string;
 assert.match(format(new ProjectError('Import target must be empty',409)),/Import target must be empty.*409/);
 const result=format(new Error('postgres://user:private-password@db/internal'));
 assert.equal(result.includes('private-password'),false);assert.match(result,/PostgreSQL operation failed/);
});
