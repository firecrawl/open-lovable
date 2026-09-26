import {lstatSync,readlinkSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

interface AliasMetadata {platform:string;path:string;target:string;linkUid:number;parentUid:number;parentMode:number;}
/** macOS ships these exact root-owned links; no user-defined alias is implicitly trusted. */
export function isTrustedSystemAlias(info:AliasMetadata):boolean {
 const aliases:Readonly<Record<string,string>>={'/var':'/private/var','/tmp':'/private/tmp','/etc':'/private/etc'};
 return info.platform==='darwin' && Object.hasOwn(aliases,info.path) && aliases[info.path]===info.target &&
  info.linkUid===0 && info.parentUid===0 && (info.parentMode&0o022)===0;
}

/** Check each existing ancestor before mkdir and again afterwards. Not a hostile-OS sandbox. */
export function assertSafeDataAncestors(path:string):void {
 let candidate=resolve(path);
 while(true){
  try{
   const stat=lstatSync(candidate);
   if(stat.isSymbolicLink()){
    const parent=lstatSync(dirname(candidate));
    const allowed=isTrustedSystemAlias({platform:process.platform,path:candidate,target:resolve(dirname(candidate),readlinkSync(candidate)),linkUid:stat.uid,parentUid:parent.uid,parentMode:parent.mode});
    if(!allowed)throw new Error('Data path cannot contain a symlink or junction');
   }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const parent=dirname(candidate);if(parent===candidate)break;candidate=parent;
 }
}
