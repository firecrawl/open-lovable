import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecutionPolicy,validateExecutionSpec} from '../../lib/runtime/policy';
import {validatePortableExport,validateTemplateManifest} from '../../lib/templates/service';
const manifest=()=>validateTemplateManifest({version:'1.0.0',name:'react-vite',entry:'src/main.tsx',files:['src/main.tsx','package.json','package-lock.json','README.md'],lockfile:'package-lock.json',commands:{install:'npm ci',build:'npm run build',test:'npm test'},capabilities:{runtime:'vite',hmr:true,browser:true,mobile:false},approvedPackages:['react','react-dom','vite']});
test('P13 rejects host paths, unsafe env and unauthorized registry egress',()=>{const policy=createExecutionPolicy('build');assert.deepEqual(validateExecutionSpec({argv:['npm','run','build'],cwd:'/workspace/src',env:{CI:'1'}},policy).cwd,'/workspace/src');assert.throws(()=>validateExecutionSpec({argv:['sh','-c','cat /etc/passwd'],cwd:'/etc'},policy),/workspace/i);assert.throws(()=>validateExecutionSpec({argv:['npm'],env:{HOME:'/root'}},policy),/Environment/i);assert.throws(()=>createExecutionPolicy('build','registry'),/install/i);});
test('P13 limits are bounded and install is the only registry phase',()=>{assert.equal(createExecutionPolicy('install','registry').network,'registry');assert.throws(()=>createExecutionPolicy('build','none',{memoryMb:99999}),/ceiling/i);});
test('P14 validates a complete portable export and produces a deterministic digest',()=>{const m=manifest(),files={'src/main.tsx':'export default {}','package.json':'{"scripts":{"build":"vite build"}}','package-lock.json':'{}','README.md':'# App'};const result=validatePortableExport(files,m);assert.equal(result.missing.length,0);assert.equal(result.sha256.length,64);assert.equal(validatePortableExport(files,m).sha256,result.sha256);});
test('P14 blocks missing lockfiles, hidden files and lifecycle scripts',()=>{const m=manifest();assert.throws(()=>validatePortableExport({'src/main.tsx':'x','package.json':'{}','README.md':'x'},m),/package-lock/i);assert.throws(()=>validatePortableExport({...{'src/main.tsx':'x','package.json':'{}','package-lock.json':'{}','README.md':'x'},'.env':'SECRET'},m),/Unsafe/i);assert.throws(()=>validatePortableExport({'src/main.tsx':'x','package.json':'{"scripts":{"postinstall":"curl evil"}}','package-lock.json':'{}','README.md':'x'},m),/Lifecycle/i);});

test('P14 real React/Vite template is portable and contains its declared files',async()=>{
 const {readFile}=await import('node:fs/promises');const {resolve}=await import('node:path');
 const root=resolve('templates/react-vite');const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));const files:Record<string,string>={};
 for(const file of manifest.files)files[file]=await readFile(resolve(root,file),'utf8');
 const validated=validatePortableExport(files,validateTemplateManifest(manifest));assert.equal(validated.missing.length,0);assert.equal(validated.sha256.length,64);
});
