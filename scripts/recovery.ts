import {lstatSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {ProjectError} from '../lib/projects/store';
import {DatabaseSync} from 'node:sqlite';
import {assertSafeDataAncestors} from '../lib/security/data-paths';
import {createRecoveryBundle,restoreRecoveryBundle,verifyRecoveryBundle} from '../lib/projects/recovery';

/** Operator-only local command. Never called by the model or an unauthenticated route. */
async function main():Promise<void>{
 const [mode,...args]=process.argv.slice(2),options=new Map<string,string>();
 if(!['create','restore','verify'].includes(mode)||args.length%2)throw new Error('Usage');
 for(let i=0;i<args.length;i+=2){if(!['--data-dir','--bundle','--destination','--key-file'].includes(args[i])||options.has(args[i])||!args[i+1])throw new Error('Usage');options.set(args[i],args[i+1]);}
 const required=mode==='create'?['--data-dir','--destination','--key-file']:mode==='restore'?['--bundle','--destination','--key-file']:['--bundle','--key-file'];
 if(options.size!==required.length||required.some(name=>!options.has(name)))throw new Error('Usage');
 const keyPath=resolve(options.get('--key-file')!);assertSafeDataAncestors(keyPath);const stat=lstatSync(keyPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==32)throw new Error('Key file must be a private regular 32-byte master key');
 const key=readFileSync(keyPath);
 try{
  if(mode==='create'){
   const path=join(resolve(options.get('--data-dir')!),'state.sqlite3');assertSafeDataAncestors(path);
   if(!lstatSync(path).isFile())throw new Error('Source database is missing');
   const db=new DatabaseSync(path,{readOnly:true});
   try{const report=await createRecoveryBundle({db},key,options.get('--destination')!);console.log(JSON.stringify({success:true,operation:'backup-created',schemaVersion:report.schemaVersion,databaseDigest:report.databaseDigest,keyIncluded:false}));}
   finally{db.close();}
  }else if(mode==='verify'){
   const report=await verifyRecoveryBundle(options.get('--bundle')!,key);
   console.log(JSON.stringify({success:true,operation:'backup-verified',schemaVersion:report.schemaVersion,databaseDigest:report.databaseDigest}));
  }else{
   const report=await restoreRecoveryBundle(options.get('--bundle')!,key,options.get('--destination')!);
   console.log(JSON.stringify({success:true,operation:'restored-to-new-directory',schemaVersion:report.schemaVersion,databaseDigest:report.databaseDigest,restoredDatabaseDigest:report.restoredDatabaseDigest,sessionsInvalidated:report.sessionsInvalidated,invitationsInvalidated:report.invitationsInvalidated}));
  }
 }finally{key.fill(0);}
}
main().catch(error=>{
 console.error(error instanceof ProjectError?error.message:'Recovery failed. Check mode, required arguments, private key, paths and permissions. No existing target is overwritten.');
 console.error('Create: npm run recovery -- create --data-dir <source> --destination <new-backup-directory> --key-file <master-key-file>');
 console.error('Restore: npm run recovery -- restore --bundle <backup> --destination <new-data-directory> --key-file <master-key-file>');
 console.error('Verify: npm run recovery -- verify --bundle <backup> --key-file <master-key-file>');
 process.exitCode=1;
});
