import {createHash} from 'node:crypto';
import {ProjectError,type ProjectSnapshot,validateSnapshot} from '../projects/store';
export interface LegacyImportManifest {sourceSandboxId:string;targetProjectId:string;filesHash:string;historyDisposition:'preserved'|'candidate-only';}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function buildLegacyImportManifest(sourceSandboxId:string,targetProjectId:string,snapshot:ProjectSnapshot,historyDisposition:LegacyImportManifest['historyDisposition']='preserved'):LegacyImportManifest {if(!sourceSandboxId||!targetProjectId)throw new ProjectError('Legacy import requires source and target identities.',400);const checked=validateSnapshot(snapshot);return {sourceSandboxId,targetProjectId,filesHash:hash(JSON.stringify(checked.files)),historyDisposition};}
export function verifyLegacyImportManifest(manifest:LegacyImportManifest,snapshot:ProjectSnapshot):void {const checked=validateSnapshot(snapshot);if(manifest.filesHash!==hash(JSON.stringify(checked.files)))throw new ProjectError('Legacy snapshot changed before migration.',409);}
