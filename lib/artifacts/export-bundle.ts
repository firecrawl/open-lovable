import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strFromU8} from 'fflate';
import {assertNoSecrets} from '../security/secret-content';
import type {ProjectSnapshot} from '../projects/store';

export interface ExportBundleSource {
  projectId:string;
  projectVersion:number;
  runId?:string;
  baseVersion?:number;
  source:'project'|'candidate';
}
export interface ExportBundleManifest extends ExportBundleSource {
  manifestVersion:1;
  createdAt:string;
  files:Array<{path:string;kind:'file'|'asset';bytes:number;sha256:string}>;
}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const safePath=(path:string)=>typeof path==='string'&&path.length>0&&!path.startsWith('/')&&!path.includes('..')&&!/[\\\p{Cc}]/u.test(path);

/** Builds a portable, source-only bundle. Environment values and private paths never enter the bundle. */
export function exportProjectBundle(snapshot:ProjectSnapshot,source:ExportBundleSource,createdAt=new Date().toISOString()):{bytes:Uint8Array;manifest:ExportBundleManifest} {
  const entries:Record<string,Uint8Array>=Object.create(null);
  const files:ExportBundleManifest['files']=[];
  for(const [path,content] of Object.entries(snapshot.files)) {
    if(!safePath(path))throw new Error('Invalid source path in export');
    assertNoSecrets(content);
    const bytes=Buffer.from(content,'utf8');
    entries[path]=bytes;
    files.push({path,kind:'file',bytes:bytes.byteLength,sha256:hash(bytes)});
  }
  for(const [path,encoded] of Object.entries(snapshot.assets)) {
    if(!safePath(path))throw new Error('Invalid asset path in export');
    const bytes=Buffer.from(encoded,'base64');
    entries[path]=bytes;
    files.push({path,kind:'asset',bytes:bytes.byteLength,sha256:hash(bytes)});
  }
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const manifest:ExportBundleManifest={manifestVersion:1,...source,createdAt,files};
  const manifestText=JSON.stringify(manifest,null,2)+'\n';
  assertNoSecrets(manifestText);
  entries['__open_lovable__/manifest.json']=Buffer.from(manifestText,'utf8');
  return {bytes:zipSync(entries,{level:3}),manifest};
}

export function validateExportBundleManifest(raw:unknown):ExportBundleManifest {
  if(!raw||typeof raw!=='object')throw new Error('Invalid export bundle manifest');
  const value=raw as ExportBundleManifest;
  if(value.manifestVersion!==1||!['project','candidate'].includes(value.source)||!Number.isSafeInteger(value.projectVersion)||value.projectVersion<1||!Array.isArray(value.files))throw new Error('Invalid export bundle manifest');
  if(value.files.some(file=>!safePath(file.path)||!['file','asset'].includes(file.kind)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256)))throw new Error('Invalid export bundle manifest');
  return value;
}

export function verifyExportBundle(snapshot:ProjectSnapshot,manifest:ExportBundleManifest):void {
  validateExportBundleManifest(manifest);
  const expected=new Set<string>();
  for(const [path,content] of Object.entries(snapshot.files))expected.add(`${path}:file:${hash(Buffer.from(content,'utf8'))}`);
  for(const [path,encoded] of Object.entries(snapshot.assets))expected.add(`${path}:asset:${hash(Buffer.from(encoded,'base64'))}`);
  const actual=new Set(manifest.files.map(file=>`${file.path}:${file.kind}:${file.sha256}`));
  if(expected.size!==actual.size||[...expected].some(item=>!actual.has(item)))throw new Error('Export bundle does not match the source snapshot');
}

export function verifyExportBundleBytes(bytes:Uint8Array,snapshot:ProjectSnapshot,manifest:ExportBundleManifest):void {
  if(bytes.byteLength<22)throw new Error('Export bundle is empty or truncated');
  const entries=unzipSync(bytes),embedded=entries['__open_lovable__/manifest.json'];
  if(!embedded||strFromU8(embedded)!==JSON.stringify(manifest,null,2)+'\n')throw new Error('Export bundle manifest is missing or divergent');
  verifyExportBundle(snapshot,manifest);
  const expected=[...Object.entries(snapshot.files).map(([path,content])=>[path,Buffer.from(content,'utf8')] as const),...Object.entries(snapshot.assets).map(([path,encoded])=>[path,Buffer.from(encoded,'base64')] as const)];
  for(const [path,data] of expected){const entry=entries[path];if(!entry||entry.byteLength!==data.byteLength||hash(entry)!==hash(data))throw new Error('Export bundle bytes do not match the source snapshot');}
}

export function exportBundleFileName(projectId:string,runId?:string):string {
  return `project-${projectId}${runId?`-candidate-${runId}`:''}.zip`;
}
