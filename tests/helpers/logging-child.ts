import {createServer} from 'node:http';
import {once} from 'node:events';
import {NextRequest} from 'next/server';
import {POST} from '../../app/api/generate-ai-code-stream/route';
const marker='PRIVATE_GENERATED_SOURCE_92743';
const server=createServer((req,res)=>{req.resume();req.on('end',()=>{
 const chunk={id:'logging-fixture',object:'chat.completion.chunk',created:1,model:'fixture/coder',choices:[{index:0,delta:{content:`<file path="src/App.jsx">export default function App(){return <h1>${marker}</h1>}</file>`},finish_reason:null}]};
 res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify(chunk)+'\n\n');
 res.end('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
});});
server.listen(0,'127.0.0.1');await once(server,'listening');
try{
 process.env.NODE_ENV='development';delete process.env.OPEN_LOVABLE_APP_ORIGIN;delete process.env.OPEN_LOVABLE_PASSWORD;delete process.env.AI_GATEWAY_API_KEY;
 process.env.OPEN_LOVABLE_GATEWAY_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 process.env.OPEN_LOVABLE_GATEWAY_API_KEY='fixture-log-key';process.env.OPEN_LOVABLE_GATEWAY_MODELS='["fixture/coder"]';
 const result=await POST(new NextRequest('http://127.0.0.1/api/generate-ai-code-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gateway/fixture/coder',prompt:'Make a heading'})}));
 const body=await result.text();if(result.status!==200||!body.includes('complete'))throw new Error('Fixture generation failed');
}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
