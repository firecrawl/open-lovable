import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ProjectStore} from '../lib/projects/store';

test('conversation order is stable when messages share the same millisecond, including the last-100 window',t=>{
 const store=new ProjectStore(':memory:');t.after(()=>store.close());
 const project=store.createProject('alice','Order','gateway/model');
 for(let i=0;i<120;i++)store.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(randomUUID(),project.id,null,i%2?'assistant':'user',String(i),'2026-01-01T00:00:00.000Z');
 assert.deepEqual(store.messages('alice',project.id).map(row=>row.content),Array.from({length:100},(_,i)=>String(i+20)));
});
