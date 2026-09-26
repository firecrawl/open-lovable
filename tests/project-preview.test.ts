import test from 'node:test';
import assert from 'node:assert/strict';
async function compiler() {
 const m=await import('../lib/projects/preview').catch(()=>({})) as Record<string,any>;
 assert.equal(typeof m.compileProject,'function','Real bounded React compilation must exist');return m.compileProject;
}
test('real JSX and CSS compile without running application code on the host',async()=>{
 const compile=await compiler();
 const result=await compile({files:{'src/App.jsx':"import './style.css'; globalThis.__projectHostTouched=true; export default function App(){return <button className='text-xl' onClick={()=>alert('ok')}>Ready</button>}",'src/style.css':'button { padding: 12px; }'},assets:{}},'test-channel');
 assert.match(result.html,/Ready/);assert.match(result.html,/Content-Security-Policy/);
 assert.match(result.html,/connect-src 'none'/);assert.match(result.html,/test-channel/);assert.match(result.html,/candidate!=='null'/);assert.match(result.html,/:'\*'/);
 assert.equal((globalThis as any).__projectHostTouched,undefined);
 assert.equal(result.sha256.length,64);
});
test('syntax failures, host imports and dependency traversal fail compilation',async()=>{
 const compile=await compiler();
 for(const code of ['export default function App(){ return <div>',"import fs from 'node:fs'; export default function App(){return fs.readFileSync('/etc/passwd')}","import x from '../../../../outside'; export default()=>x;","import x from 'react/../../../../outside'; export default()=>x;"]) {
  await assert.rejects(()=>compile({files:{'src/App.jsx':code},assets:{}},'test-channel'));
 }
});
test('local image assets are embedded; external module URLs are rejected',async()=>{
 const compile=await compiler();
 const result=await compile({files:{'src/App.jsx':"import logo from './logo.png'; export default()=> <img src={logo} alt='logo'/>"},assets:{'src/logo.png':'iVBORw0KGgo='}},'test-channel');
 assert.match(result.html,/data:image\/png;base64/);
 await assert.rejects(()=>compile({files:{'src/App.jsx':"import x from 'https://example.com/evil.js'; export default()=>x;"},assets:{}},'test-channel'));
});
