import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {streamText} from 'ai';
import {NextRequest} from 'next/server';
import {loadModelCatalog} from '../lib/ai/provider-catalog';
import {getProviderForModel} from '../lib/ai/provider-manager';
import {createProviderFetch, isPublicProviderIP, validateProviderURL} from '../lib/ai/provider-transport';
import {assertNoSecrets, redactSecretValue, scanSecretContent} from '../lib/security/secret-content';
import {POST as generate} from '../app/api/generate-ai-code-stream/route';
import {POST as analyze} from '../app/api/analyze-edit-intent/route';

const before={...process.env};
afterEach(()=>{
  for(const key of Object.keys(process.env)) if(!(key in before)) delete process.env[key];
  Object.assign(process.env,before);
});
async function fixture(t: {after:(callback:()=>unknown)=>void}, handler:(req:IncomingMessage,res:ServerResponse)=>void) {
  const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const port=(server.address() as {port:number}).port;
  const url=`http://127.0.0.1:${port}/v1`;
  process.env.NODE_ENV='development';
  delete process.env.OPEN_LOVABLE_APP_ORIGIN;delete process.env.OPEN_LOVABLE_PASSWORD;delete process.env.AI_GATEWAY_API_KEY;
  process.env.OPEN_LOVABLE_GATEWAY_URL=url;
  process.env.OPEN_LOVABLE_GATEWAY_API_KEY='fixture-gateway-key';
  process.env.OPEN_LOVABLE_GATEWAY_MODELS=JSON.stringify(['org/coder:latest']);
  return url;
}
function sendText(res:ServerResponse,text:string) {
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const chunk={id:'fixture',object:'chat.completion.chunk',created:1,model:'org/coder:latest',choices:[{index:0,delta:{content:text},finish_reason:null}]};
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end(`data: ${JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
}

test('gateway SDK preserves namespaces, credential isolation and actual streamed text',async t=>{
  const requests:Array<{path?:string;model?:string;auth?:string}>=[];
  await fixture(t,(req,res)=>{
    let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{
      requests.push({path:req.url,model:JSON.parse(data).model,auth:req.headers.authorization});sendText(res,'Ready');
    });
  });
  process.env.AI_GATEWAY_API_KEY='unrelated-fixture-key';
  const selected=await getProviderForModel('gateway/org/coder:latest');
  const result=streamText({model:selected.model,prompt:'Hello',maxRetries:0});
  assert.equal(await result.text,'Ready');
  assert.deepEqual(requests,[{path:'/v1/chat/completions',model:'org/coder:latest',auth:'Bearer fixture-gateway-key'}]);
});

test('catalog discovery never reports a successful generation or exposes the configured key',async t=>{
  await fixture(t,(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'org/coder:latest'}]}));});
  delete process.env.OPEN_LOVABLE_GATEWAY_MODELS;
  const catalog=await loadModelCatalog();
  assert.equal(catalog.gateway.status,'discovered');
  assert.equal(catalog.models.at(-1)?.id,'gateway/org/coder:latest');
  assert.equal(catalog.models.at(-1)?.capabilityStatus,'unknown');
  assert.equal(JSON.stringify(catalog).includes('fixture-gateway-key'),false);
});

test('malformed catalogs fail closed without manufacturing available models',async t=>{
  await fixture(t,(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{}]}));});
  delete process.env.OPEN_LOVABLE_GATEWAY_MODELS;
  const catalog=await loadModelCatalog();
  assert.equal(catalog.gateway.status,'unavailable');
  assert.equal(catalog.models.some(model=>model.provider==='gateway'),false);
});

test('provider transport blocks credential content before issuing an HTTP request',async t=>{
  let calls=0;
  const url=await fixture(t,(_req,res)=>{calls++;res.end('{}');});
  const secret='ghp_'+'t'.repeat(36);
  const fetcher=createProviderFetch(url,{allowLoopback:true});
  await assert.rejects(()=>fetcher(`${url}/chat/completions`,{method:'POST',body:JSON.stringify({messages:[{role:'user',content:secret}]})}),/credential/i);
  assert.equal(calls,0);
});

test('redirects and oversized provider responses are rejected',async t=>{
  let escaped=0;
  const url=await fixture(t,(req,res)=>{
    if(req.url==='/outside'){escaped++;res.end('{}');return;}
    if(req.url?.endsWith('/large')){res.end('x'.repeat(1024));return;}
    res.writeHead(302,{Location:'/outside'});res.end();
  });
  const fetcher=createProviderFetch(url,{allowLoopback:true,maxBytes:128});
  await assert.rejects(()=>fetcher(`${url}/models`),/connection/i);
  assert.equal(escaped,0);
  const response=await fetcher(`${url}/large`);
  await assert.rejects(()=>response.text(),/limits/i);
  await assert.rejects(()=>fetcher(url.replace('/v1','/outside')),/origin or path/);
});

test('private addresses, IPv4-mapped IPv6 and non-HTTPS public URLs are refused',()=>{
  for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','100.64.0.1','::ffff:127.0.0.1','::1','fc00::1','2001:db8::1']) assert.equal(isPublicProviderIP(ip),false,ip);
  assert.equal(isPublicProviderIP('8.8.8.8'),true);
  assert.throws(()=>validateProviderURL('http://example.com/v1',true));
  assert.throws(()=>validateProviderURL('https://10.0.0.1/v1',true));
  assert.throws(()=>validateProviderURL('https://user:pass@example.com/v1'));
  assert.throws(()=>validateProviderURL('http://127.0.0.1:11434/v1'));
  assert.equal(validateProviderURL('http://127.0.0.1:11434/v1',true).port,'11434');
});

test('redaction removes nested credentials without hiding token usage metrics',()=>{
  const value={headers:{authorization:'Bearer '+'f'.repeat(24)},usage:{total_tokens:12},message:'ghp_'+'r'.repeat(36)};
  const redacted=redactSecretValue(value) as typeof value;
  assert.equal(redacted.usage.total_tokens,12);
  assert.equal(redacted.headers.authorization,'[REDACTED]');
  assert.equal(redacted.message,'[REDACTED]');
  assert.throws(()=>assertNoSecrets(value),/credential/i);
  assert.deepEqual(scanSecretContent('const options = {...props};'),[]);
});

test('actual generation route uses the selected gateway and exposes provider failures, not success',async t=>{
  let fail=false;const ids:string[]=[];
  await fixture(t,(req,res)=>{
    let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
      ids.push(JSON.parse(raw).model);
      if(fail){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'fixture unauthorized',type:'authentication_error'}}));}
      else sendText(res,'<file path="src/App.jsx">export default function App(){return <main>Ready</main>}</file>');
    });
  });
  const request=()=>new NextRequest('http://127.0.0.1/api/generate-ai-code-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gateway/org/coder:latest',prompt:'Create a simple component'})});
  const response=await generate(request());
  const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(events.some(event=>event.type==='complete' && event.model==='gateway/org/coder:latest'),true);
  fail=true;
  const failed=await generate(request());
  const failures=(await failed.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(failures.some(event=>event.type==='error'),true);
  assert.equal(failures.some(event=>event.type==='complete'),false);
  assert.deepEqual(ids,['org/coder:latest','org/coder:latest']);
});

test('edit analysis uses the same explicit provider with structured JSON output',async t=>{
  let called='';
  await fixture(t,(req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
    called=JSON.parse(raw).model;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:called,choices:[{index:0,message:{role:'assistant',content:JSON.stringify({editType:'UPDATE_STYLE',reasoning:'Find label',searchTerms:['Ready'],fileTypesToSearch:['.jsx'],expectedMatches:1})},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
  });});
  const response=await analyze(new NextRequest('http://127.0.0.1/api/analyze-edit-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gateway/org/coder:latest',prompt:'Change label',manifest:{files:{'src/App.jsx':{componentInfo:{name:'App'}}}}})}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).searchPlan.editType,'UPDATE_STYLE');
  assert.equal(called,'org/coder:latest');
});


test('explicit localhost transport remains usable and cancellation is enforced',async t=>{
  const url=await fixture(t,(req,res)=>{
    if(req.url?.endsWith('/slow')) return;
    res.setHeader('Content-Type','application/json');res.end('{"ok":true}');
  });
  const localURL=url.replace('127.0.0.1','localhost');
  const fetcher=createProviderFetch(localURL,{allowLoopback:true,timeoutMs:100});
  assert.equal((await (await fetcher(`${localURL}/models`)).json()).ok,true);
  await assert.rejects(()=>fetcher(`${localURL}/slow`),/connection|abort/i);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>fetcher(`${localURL}/models`,{signal:controller.signal}),/connection|abort/i);
});

test('disabled or missing model configuration never causes a network fallback',async t=>{
  let calls=0;
  await fixture(t,(_req,res)=>{calls++;res.end('{}');});
  await assert.rejects(()=>getProviderForModel('gateway/unknown-model'),/catalog/);
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(()=>getProviderForModel('openai/gpt-5'),/credentials/);
  assert.equal(calls,0);
});


test('active provider streaming is not cut off by a total-duration idle budget',async t=>{
 const url=await fixture(t,(_req,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain'});res.write('start');
  let count=0;const timer=setInterval(()=>{res.write('x');if(++count===8){clearInterval(timer);res.end('end');}},200);
  res.on('close',()=>clearInterval(timer));
 });
 const fetcher=createProviderFetch(url,{allowLoopback:true,timeoutMs:750});
 const response=await fetcher(`${url}/stream`);
 assert.equal(await response.text(),'start'+'x'.repeat(8)+'end');
});


test('bounded scraped context larger than 32 KiB reaches the selected model without truncation',async t=>{
 let received=0;await fixture(t,(req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{received=JSON.stringify(JSON.parse(raw).messages).length;sendText(res,'<file path="src/App.jsx">export default function App(){return <h1>Ready</h1>}</file>');});});
 const response=await generate(new NextRequest('http://127.0.0.1/api/generate-ai-code-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gateway/org/coder:latest',prompt:'Reference site content: '+ 'descriptive website copy '.repeat(2000)})}));
 assert.equal(response.status,200);assert.match(await response.text(),/complete/);assert.ok(received>32768);
});


test('P02 generation logs metadata rather than the submitted source prompt',async t=>{
 const marker='PRIVATE_BUSINESS_REQUIREMENT_NOT_FOR_LOGS_82743';
 const observed:unknown[][]=[];t.mock.method(console,'log',(...args:unknown[])=>{observed.push(args);});
 await fixture(t,(req,res)=>{req.resume();req.on('end',()=>sendText(res,'<file path="src/App.jsx">export default function App(){return <h1>Ready</h1>}</file>'));});
 const result=await generate(new NextRequest('http://127.0.0.1/api/generate-ai-code-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gateway/org/coder:latest',prompt:marker})}));
 assert.equal(result.status,200);await result.text();assert.equal(JSON.stringify(observed).includes(marker),false);
});

test('P02 an idle provider and an overlong active response still fail within explicit budgets',async t=>{
 const url=await fixture(t,(req,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain'});res.write('start');
  if(req.url?.endsWith('/idle'))return;
  const timer=setInterval(()=>res.write('x'),50);res.on('close',()=>clearInterval(timer));
 });
 const idle=createProviderFetch(url,{allowLoopback:true,timeoutMs:150,maxDurationMs:3000});
 const stalled=await idle(`${url}/idle`);await assert.rejects(()=>stalled.text(),/stream|limit/i);
 const hard=createProviderFetch(url,{allowLoopback:true,timeoutMs:750,maxDurationMs:350});
 const active=await hard(`${url}/active`);await assert.rejects(()=>active.text(),/stream|limit/i);
});
