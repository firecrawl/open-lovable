import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admissionDigest,evaluateAdmission} from '../../lib/admission/policy';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const candidate=()=>({id:'roadmap-component',sourceURL:'https://github.com/example/roadmap-component',revision:'a'.repeat(40),licensePath:'LICENSE',licenseDigest:hash('MIT'),paths:['src/index.ts'],artifactDigests:{'src/index.ts':hash('export const value=1;')},dependencyDigests:[],purpose:'tested component',requiredPermissions:['project:read'],maintenanceStatus:'active' as const});
const approval=(manifest:ReturnType<typeof candidate>)=>({manifestDigest:admissionDigest(manifest),reviewer:'reviewer',decision:'allowed' as const,expiresAt:'2030-01-01T00:00:00Z',evidenceDigest:'b'.repeat(64),restrictedPathsReviewed:[]});
test('P50 allows an exact reviewed immutable permissive artifact',()=>{const manifest=candidate();assert.equal(evaluateAdmission(manifest,[approval(manifest)],new Date('2026-01-01')).status,'allowed');});
test('P50 denies changed revision, restricted path or missing license evidence',()=>{const manifest=candidate();const reviewed=approval(manifest);assert.notEqual(evaluateAdmission({...manifest,revision:'c'.repeat(40)},[reviewed],new Date('2026-01-01')).status,'allowed');const restricted={...manifest,paths:['src/pro/index.ts'],artifactDigests:{'src/pro/index.ts':hash('pro')}};assert.notEqual(evaluateAdmission(restricted,[approval(restricted)],new Date('2026-01-01')).status,'allowed');assert.notEqual(evaluateAdmission({...manifest,licenseDigest:''},[reviewed],new Date('2026-01-01')).status,'allowed');});
