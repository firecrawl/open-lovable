import { isBase64 } from '@/lib/security/base64';
import { Unzip, UnzipInflate, zipSync, strToU8 } from 'fflate';
import { ProjectError, validateSnapshot, type ProjectSnapshot, SNAPSHOT_LIMIT } from './store';

const excludedPart=/^(?:node_modules|\.git|\.next|dist|build|__MACOSX|\.DS_Store|\.env(?:\..*)?|\.npmrc|\.netrc|\.ssh|\.aws|credentials\.json)$/i;
const binaries=/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i;

/** Reads ZIP entries as bounded data, never extracts them into the host filesystem. */
export function importProjectZip(encoded:string):{snapshot:ProjectSnapshot;excluded:string[]} {
 if(typeof encoded!=='string'||encoded.length>16*1024*1024||!isBase64(encoded))throw new ProjectError('Invalid ZIP (maximum 12 MiB compressed)');
 const input=Buffer.from(encoded,'base64');
 if(input.length<22||input[0]!==0x50||input[1]!==0x4b)throw new ProjectError('A ZIP archive is required');
 const entries=new Map<string,Uint8Array>();const excluded:string[]=[];let total=0,seen=0,completed=0;
 const unzip=new Unzip(file=>{
  if(++seen>1500)throw new ProjectError('ZIP has too many entries');
  const path=file.name;
  if(!path||path.length>512||path.startsWith('/')||path.includes('\\')||/[:\p{Cc}]/u.test(path)||path.split('/').some(part=>part==='..'||part==='.'))throw new ProjectError('Unsafe ZIP path');
  if(path.endsWith('/'))return;
  if(path.split('/').some(part=>excludedPart.test(part)&&part!=='.env.example')){excluded.push(path);return;}
  if(entries.has(path)||entries.size>=300)throw new ProjectError('Duplicate ZIP entry or too many files');
  if(file.originalSize!==undefined&&file.originalSize>2*1024*1024)throw new ProjectError('ZIP entry exceeds 2 MiB');
  entries.set(path,new Uint8Array());const chunks:Uint8Array[]=[];let size=0;
  file.ondata=(error,data,final)=>{
   if(error)throw new ProjectError('ZIP entry could not be decoded');
   size+=data.length;total+=data.length;
   if(size>2*1024*1024||total>SNAPSHOT_LIMIT)throw new ProjectError('ZIP exceeds uncompressed storage limits');
   chunks.push(data);
   if(final){const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}entries.set(path,result);completed++;}
  };
  file.start();
 });
 unzip.register(UnzipInflate);
 try {for(let offset=0;offset<input.length;offset+=4096)unzip.push(input.subarray(offset,offset+4096),offset+4096>=input.length);}
 catch(error){throw error instanceof ProjectError?error:new ProjectError('Invalid or unsupported ZIP archive');}
 if(!entries.size||completed!==entries.size)throw new ProjectError('ZIP is incomplete or contains no project files');
 const paths=[...entries.keys()];
 const common=paths[0].split('/')[0];
 const strip=paths.every(path=>path.startsWith(common+'/'))&&!['src','public','app','components','lib'].includes(common);
 const snapshot:ProjectSnapshot={files:Object.create(null),assets:Object.create(null)};
 for(const [original,bytes] of entries){
  const path=strip?original.slice(common.length+1):original;
  if(binaries.test(path))snapshot.assets[path]=Buffer.from(bytes).toString('base64');
  else {try{snapshot.files[path]=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ProjectError('Unsupported binary file: '+path);}}
 }
 return {snapshot:validateSnapshot(snapshot),excluded};
}

/** Exports the exact saved source and binary bytes. Secrets are checked again at the boundary. */
export function exportProjectZip(input:unknown):Uint8Array {
 const snapshot=validateSnapshot(input);const files:Record<string,Uint8Array>=Object.create(null);
 for(const [path,content] of Object.entries(snapshot.files))files[path]=strToU8(content);
 for(const [path,content] of Object.entries(snapshot.assets))files[path]=Buffer.from(content,'base64');
 return zipSync(files,{level:3});
}
