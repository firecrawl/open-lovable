import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {middleware} from '../middleware';
const origin='http://127.0.0.1:3102';
test('P05 account routing isolates legacy global APIs and permits only public account entry pages',async()=>{
 process.env.OPEN_LOVABLE_AUTH_MODE='supabase';process.env.OPEN_LOVABLE_APP_ORIGIN=origin;
 const req=(path:string,cookie='',site='same-origin')=>new NextRequest(origin+path,{headers:{host:'127.0.0.1:3102',cookie,'sec-fetch-site':site}});
 try{
  assert.equal((await middleware(req('/api/run-command','ol_session='+'a'.repeat(43)))).status,403);
  assert.equal((await middleware(req('/generation','ol_session='+'a'.repeat(43)))).status,403);
  assert.equal((await middleware(req('/projects'))).headers.get('location'),origin+'/login');
  assert.equal((await middleware(req('/login'))).status,200);
  assert.equal((await middleware(req('/auth/confirm','','cross-site'))).status,200);
  assert.equal((await middleware(req('/api/auth'))).status,200);
 }finally{delete process.env.OPEN_LOVABLE_AUTH_MODE;delete process.env.OPEN_LOVABLE_APP_ORIGIN;}
});
