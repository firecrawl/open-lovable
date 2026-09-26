import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=join(process.cwd(),'tests','roadmap');
const files=(await readdir(root,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.test.mjs')).map(entry=>join(root,entry.name)).sort();
if(files.length===0){console.error('No roadmap MJS tests found');process.exit(1);}
const result=spawnSync(process.execPath,['--test-concurrency=1',...files],{stdio:'inherit',shell:false});
if(result.error)throw result.error;
process.exit(result.status??1);
