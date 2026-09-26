import {postgresOperationError} from '../lib/persistence/operator-errors';
import {Pool} from 'pg';
import {lstatSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {postgresConfiguration} from '../lib/persistence/postgres-config';
import {migratePostgres} from '../lib/persistence/postgres-schema';
import {importSqliteSnapshot} from '../lib/persistence/import-sqlite';
import {assertSafeDataAncestors} from '../lib/security/data-paths';
/** Administrative local CLI. It does not read a project prompt and is never exposed as an agent tool. */
async function main():Promise<void>{
 const [operation,...args]=process.argv.slice(2);const options=new Map<string,string>();
 if(!['migrate','import'].includes(operation)||args.length%2)throw new Error('Invalid operation');
 for(let i=0;i<args.length;i+=2){if(options.has(args[i])||!['--runtime-role','--source-db','--key-file','--allow-loopback','--confirm-empty-target'].includes(args[i]))throw new Error('Invalid options');options.set(args[i],args[i+1]);}
 const connection=process.env.OPEN_LOVABLE_POSTGRES_ADMIN_URL;if(!connection)throw new Error('Configure the separate operator PostgreSQL connection');
 const allowLoopback=options.get('--allow-loopback')==='true';if(options.has('--allow-loopback')&&!allowLoopback)throw new Error('Invalid loopback authorization');
 const pool=new Pool(postgresConfiguration(connection,{allowLoopback}));
 try{
  if(operation==='migrate'){
   if(!options.get('--runtime-role')||options.size!==(allowLoopback?2:1))throw new Error('Migration requires an existing nonprivileged runtime role');
   await migratePostgres(pool,{runtimeRole:options.get('--runtime-role')!});console.log(JSON.stringify({success:true,operation:'schema-migrated',applicationActivated:false}));
  }else{
   if(!options.get('--source-db')||!options.get('--key-file')||options.get('--confirm-empty-target')!=='true'||options.size!==(allowLoopback?4:3))throw new Error('Import requires source, key file and explicit empty-target confirmation');
   const path=resolve(options.get('--key-file')!);assertSafeDataAncestors(path);const stat=lstatSync(path);if(!stat.isFile()||stat.size!==32)throw new Error('Invalid master key file');
   const key=readFileSync(path);try{const report=await importSqliteSnapshot(options.get('--source-db')!,key,pool);console.log(JSON.stringify({success:true,...report}));}finally{key.fill(0);}
  }
 }finally{await pool.end();}
}
main().catch(error=>{console.error(postgresOperationError(error));process.exitCode=1;});
