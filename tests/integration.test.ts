import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, join, relative, sep } from 'node:path';

async function* routeFiles(directory:string):AsyncGenerator<string> {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) yield* routeFiles(path);
    else if(entry.isFile() && entry.name==='route.ts') yield path;
  }
}

test('every exported API handler rejects unauthenticated production requests before side effects',async()=>{
  const original = {...process.env};
  Object.assign(process.env,{NODE_ENV:'production',OPEN_LOVABLE_APP_ORIGIN:'https://builder.example',OPEN_LOVABLE_PASSWORD:'test-password-with-at-least-thirty-two-characters'});
  try {
    let checked=0;
    const visited=new Set<string>();
    for await(const file of routeFiles('app/api')) {
      const path=relative('app/api',file).split(sep).join('/').replace(/\/route\.ts$/,'');
      visited.add(path);
      const route = await import(pathToFileURL(resolve(file)).href);
      for(const method of ['GET','POST','DELETE','PATCH','PUT','OPTIONS','HEAD']) {
        if(typeof route[method] !== 'function') continue;
        const response=await route[method](new Request(`https://builder.example/api/${path}`,{method,headers:{host:'builder.example'}}));
        assert.equal(response.status,401,`${method} /api/${path}`); checked++;
      }
    }
    assert.ok(visited.has('v1/runs') && visited.has('v1/runs/[runId]/events'),'Nested run handlers must also be checked');
    assert.ok(checked>=30,`Only ${checked} API handlers were checked`);
  } finally {
    for(const key of Object.keys(process.env)) if(!(key in original)) delete process.env[key];
    Object.assign(process.env,original);
  }
});
