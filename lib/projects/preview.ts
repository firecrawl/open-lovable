import { build, type Plugin, type Loader } from 'esbuild';
import { readFile, realpath } from 'node:fs/promises';
import { posix, join, resolve, relative, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { ProjectError, validateSnapshot, type ProjectSnapshot } from './store';
import {buildSourceMap,instrumentJsx,type SourceMap} from '../visual/source-map';

export const previewPackages=['react','react-dom','lucide-react','react-icons','framer-motion','motion','clsx','classnames','tailwind-merge','lodash-es'] as const;
const extensions=['','.tsx','.jsx','.ts','.js','.css','.json','/index.tsx','/index.jsx','/index.ts','/index.js'];
function allowedPackage(specifier:string):boolean {
 if(specifier.split('/').some(part=>part==='.'||part==='..')||specifier.includes('\\'))return false;
 return previewPackages.some(name=>specifier===name||specifier.startsWith(name+'/'));
}
function lookup(snapshot:ProjectSnapshot,path:string):string {
 for(const extension of extensions)if(Object.hasOwn(snapshot.files,path+extension)||Object.hasOwn(snapshot.assets,path+extension))return path+extension;
 throw new ProjectError('Preview import not found: '+path);
}

/** Compiles virtual files only. Project npm scripts/configs are never evaluated on the host. */
export async function compileProject(input:unknown,channel:string=randomUUID(),instrument=false):Promise<{html:string;sha256:string;entry:string;warnings:string[];sourceMap?:SourceMap}> {
 let snapshot=validateSnapshot(input);let sourceMap:SourceMap|undefined;
 if(instrument){const revisionDigest=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');sourceMap=buildSourceMap(snapshot.files,revisionDigest,channel);snapshot=validateSnapshot({...snapshot,files:instrumentJsx(snapshot.files,sourceMap)});}
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(channel))throw new ProjectError('Invalid preview channel');
 const app=['src/App.tsx','src/App.jsx','src/App.ts','src/App.js','App.tsx','App.jsx'].find(path=>Object.hasOwn(snapshot.files,path));
 const main=['src/main.tsx','src/main.jsx','src/index.tsx','src/index.jsx'].find(path=>Object.hasOwn(snapshot.files,path));
 if(!main&&!app)throw new ProjectError('React preview requires src/App.jsx, src/App.tsx or src/main.tsx. Keep unsupported full-stack projects in a configured external sandbox.');
 const boot=main?`import ${JSON.stringify('/'+main)};`:`import React from 'react';import {createRoot} from 'react-dom/client';import App from ${JSON.stringify('/'+app)};createRoot(document.getElementById('root')).render(React.createElement(App));`;
 const packageRoot=await realpath(join(process.cwd(),'node_modules'));
 const plugin:Plugin={name:'isolated-virtual-project',setup(builder){
  builder.onResolve({filter:/.*/},async args=>{
   if(args.pluginData?.installedResolution)return undefined;
   if(args.path==='__project_boot__')return {path:args.path,namespace:'project'};
   if(args.namespace==='project') {
    if(args.path.startsWith('.')||args.path.startsWith('/')||args.path.startsWith('@/')) {
     const target=args.path.startsWith('@/')?'src/'+args.path.slice(2):args.path.startsWith('/')?args.path.slice(1):posix.normalize(posix.join(posix.dirname(args.importer),args.path));
     if(target==='..'||target.startsWith('../')||target.includes('\\'))throw new Error('Preview import escapes the project');
     return {path:lookup(snapshot,target),namespace:'project'};
    }
    if(!allowedPackage(args.path))throw new Error('Dependency is not available in isolated preview: '+args.path+'. Use an authorized external sandbox for other packages.');
    // Let esbuild resolve its installed package with browser export conditions.
    // The recursive call skips only this resolver; onLoad still checks realpath containment.
    const resolved=await builder.resolve(args.path,{resolveDir:process.cwd(),kind:args.kind,pluginData:{installedResolution:true}});
    if(resolved.errors.length)return {errors:resolved.errors};
    if(resolved.external||resolved.namespace!=='file')throw new Error('Preview dependency must resolve to an installed file');
    return {path:resolved.path,namespace:'file'};
   }
   // esbuild handles dependencies' relative resolution, but every file read is checked below.
   if(args.path.startsWith('node:'))throw new Error('Node built-ins cannot run in browser preview');
   return undefined;
  });
  builder.onLoad({filter:/.*/,namespace:'project'},args=>{
   if(args.path==='__project_boot__')return {contents:boot,loader:'jsx'};
   if(Object.hasOwn(snapshot.assets,args.path)) {
    const mime=args.path.endsWith('.png')?'image/png':args.path.match(/\.jpe?g$/i)?'image/jpeg':args.path.endsWith('.webp')?'image/webp':args.path.endsWith('.gif')?'image/gif':args.path.endsWith('.woff2')?'font/woff2':'application/octet-stream';
    return {contents:'export default '+JSON.stringify('data:'+mime+';base64,'+snapshot.assets[args.path]),loader:'js'};
   }
   const content=snapshot.files[args.path];
   const extension=posix.extname(args.path).slice(1);
   if(extension==='svg')return {contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(content).toString('base64')),loader:'js'};
   if(!['js','jsx','ts','tsx','css','json'].includes(extension))throw new Error('Unsupported preview source: '+args.path);
   return {contents:content,loader:extension==='js'?'jsx':extension as Loader};
  });
  builder.onLoad({filter:/.*/,namespace:'file'},async args=>{
   const canonical=await realpath(args.path);const rel=relative(packageRoot,canonical);
   if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Compiler dependency escaped installed packages');
   const extension=posix.extname(canonical.replace(/\\/g,'/')).slice(1);
   if(!['js','mjs','cjs','jsx','ts','tsx','json','css'].includes(extension))throw new Error('Unsupported installed dependency source');
   const bytes=await readFile(canonical);
   if(bytes.length>8*1024*1024)throw new Error('Installed dependency exceeds preview budget');
   return {contents:bytes,loader:['mjs','cjs'].includes(extension)?'js':extension as Loader,resolveDir:resolve(canonical,'..')};
  });
 }};
 let result;
 try {
  result=await build({entryPoints:['__project_boot__'],plugins:[plugin],bundle:true,write:false,outdir:'virtual-output',platform:'browser',format:'iife',jsx:'automatic',target:'es2020',minify:true,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},sourcemap:false});
 }catch(error) {
  const detail=error as {errors?:Array<{text:string;location?:{file:string;line:number}}>};
  throw new ProjectError('Preview compilation failed: '+(detail.errors?.slice(0,4).map(item=>(item.location?item.location.file+':'+item.location.line+' ':'')+item.text).join('; ')||'Invalid source'));
 }
 const js=result.outputFiles.find(file=>file.path.endsWith('.js'))?.text;
 if(!js)throw new ProjectError('Compiler produced no JavaScript');
 let css=result.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');
 // Only a fixed application-owned Tailwind configuration is used. Never import tailwind.config from the project.
 const raw=Object.entries(snapshot.files).filter(([name])=>/\.[jt]sx?$/.test(name)).map(([,text])=>text).join('\n');
 if(raw.length>2*1024*1024)throw new ProjectError('Preview source exceeds 2 MiB compilation budget');
 const generated=await postcss([tailwindcss({content:[{raw,extension:'tsx'}],theme:{extend:{}},plugins:[]})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined});
 css=generated.css+'\n'+css;
 if(js.length+css.length>12*1024*1024)throw new ProjectError('Compiled preview exceeds 12 MiB');
 const safeJS=js.replace(/<\/script/gi,'<\\/script');
 const safeCSS=css.replace(/<\/style/gi,'<\\/style');
 const mapScript=`const sourceMapData=${JSON.stringify(sourceMap||null)};`;
 const report=`const channel=${JSON.stringify(channel)};const targetOrigin=(()=>{try{const candidate=document.referrer?new URL(document.referrer).origin:location.origin;return candidate&&candidate!=='null'&&/^https?:\\/\\//.test(candidate)?candidate:'*'}catch{return'*'}})();const report=(type,detail)=>parent.postMessage({source:'open-lovable-preview',channel,type,detail},targetOrigin);${mapScript}addEventListener('error',event=>report('error',String(event.message).slice(0,500)));addEventListener('unhandledrejection',event=>report('error',String(event.reason).slice(0,500)));addEventListener('click',event=>{const node=event.target instanceof Element?event.target.closest('[data-open-lovable-element]'):null;const id=node?.getAttribute('data-open-lovable-element');const match=id&&sourceMapData?.elements.find((element)=>element.elementId===id);if(match)report('select',match)});addEventListener('load',()=>setTimeout(()=>{const root=document.getElementById('root');report(root&&root.childElementCount?'rendered':'empty',root?root.innerText.slice(0,200):'Root absent')},100));`;
 const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${safeCSS}</style><script>${report}</script></head><body><div id="root"></div><script>${safeJS}</script></body></html>`;
 return {html,sha256:createHash('sha256').update(html).digest('hex'),entry:main||app!,warnings:result.warnings.map(warning=>warning.text).slice(0,10),...(sourceMap?{sourceMap}: {})};
}
