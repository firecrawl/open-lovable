// Contract fixture only. It does not claim to be an AI model or external integration.
import {createServer} from 'node:http';
const calls=new Map();
const server=createServer((request,response)=>{
  if(request.url==='/ready'){response.end('ready');return;}
  if(request.headers.authorization!=='Bearer browser-contract-fixture'){response.writeHead(401);response.end();return;}
  if(request.url?.startsWith('/stats?')){const marker=new URL(request.url,'http://127.0.0.1').searchParams.get('marker');response.setHeader('Content-Type','application/json');response.end(JSON.stringify({calls:calls.get(marker)||0}));return;}
  if(request.url==='/v1/models') {response.setHeader('Content-Type','application/json');response.end(JSON.stringify({data:[{id:'fixture/coder'}]}));return;}
  if(request.url!=='/v1/chat/completions'){response.writeHead(404);response.end();return;}
  let body='';request.on('data',chunk=>{body+=chunk;if(body.length>1000000)request.destroy();});
  request.on('end',async()=>{
    try {
      const input=JSON.parse(body);
      if(input.model!=='fixture/coder'){response.writeHead(400);response.end();return;}
      const marker=body.match(/DURABLE_BROWSER_CLOSE_[a-z0-9-]+/i)?.[0];if(marker)calls.set(marker,(calls.get(marker)||0)+1);
      response.writeHead(200,{'Content-Type':'text/event-stream'});
      if(marker)await new Promise(resolve=>setTimeout(resolve,4000));
      const planRequest=input.messages?.some(message=>message.role==='system'&&message.content.includes('PLAN ONLY mode'));
      const imageParts=input.messages?.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='image_url')||[];
      if(imageParts.some(part=>!part.image_url?.url?.startsWith('data:image/png;base64,'))){response.end('data: [DONE]\n\n');return;}
      const projectRequest=input.messages?.some(message=>message.role==='system'&&message.content.includes('editing a real React project'));
      const invalid=JSON.stringify(input.messages).includes('FIXTURE_INVALID');
      const text=planRequest ? 'Plano de teste: revisar estrutura, propor componentes e validar acessibilidade. Nenhum arquivo foi alterado.' : projectRequest ? (invalid ? '<file path="src/App.jsx">export default function ( BROKEN </file>' : '<file path="src/App.jsx">export default function App(){return <h1 className="p-8">Proposta compilada</h1>}</file>Proposta de teste.') : 'READY';
      const chunk={id:'browser-fixture',created:1,model:input.model,object:'chat.completion.chunk',choices:[{index:0,delta:{content:text},finish_reason:null}]};
      response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      response.end(`data: ${JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
    } catch {response.writeHead(400);response.end();}
  });
});
server.listen(3101,'127.0.0.1');
