import {join,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {ProjectStore} from '../../lib/projects/store';
import {CredentialStore} from '../../lib/settings/store';
import {createRecoveryBundle,restoreRecoveryBundle,verifyRecoveryBundle} from '../../lib/projects/recovery';

// Synthetic data only. The prefix prevents accidental use of an operator's data directory.
const root=process.argv[2];
if(!root||!basename(root).startsWith('open-lovable-recovery-e2e-'))throw new Error('Expected an isolated E2E directory');
const store=new ProjectStore(join(root,'source','state.sqlite3')),key=randomBytes(32);
try {
 const p=store.createProject('admin','Recovered application','openai/fixture-coder');
 const code="import {useState} from 'react';export default function App(){const [n,setN]=useState(0);return <main className='p-8'><h1>Recovery verified</h1><button onClick={()=>setN(n+1)}>Clicks {n}</button></main>}";
 store.saveSnapshot('admin',p.id,1,{files:{'src/App.jsx':code},assets:{}},'Before backup');
 store.addDocument('admin',p.id,'requirements.md','Keep the working counter and history.');
 new CredentialStore(store,key).save('admin','openai',0,{enabled:false,apiKey:'fixture-recovery-ui-key',models:['fixture-coder']});
 const bundle=join(root,'bundle');await createRecoveryBundle(store,key,bundle);await verifyRecoveryBundle(bundle,key);
 await restoreRecoveryBundle(bundle,key,join(root,'restored'));
 writeFileSync(join(root,'fixture.json'),JSON.stringify({id:p.id,version:2,code}),{mode:0o600});
 console.log(JSON.stringify({id:p.id,version:2}));
}finally{store.close();key.fill(0);}
