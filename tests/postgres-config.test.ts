import test from 'node:test';
import assert from 'node:assert/strict';
async function config(){const m=await import('../lib/persistence/postgres-config').catch(()=>({})) as Record<string,any>;assert.equal(typeof m.postgresConfiguration,'function');return m.postgresConfiguration;}
test('PostgreSQL configuration requires explicit credentials and verifies remote TLS',async()=>{
 const fn=await config();const remote=fn('postgresql://runtime:synthetic-password@db.example.test/control');
 assert.deepEqual(remote.ssl,{rejectUnauthorized:true});assert.equal(remote.max,4);assert.ok(remote.connectionTimeoutMillis<=10000);
 for(const url of ['http://host/database','postgres://runtime@host/database','postgres://runtime:secret@host/database?sslmode=disable','postgres://runtime:secret@localhost/database'])assert.throws(()=>fn(url));
 assert.equal(fn('postgres://runtime:synthetic-password@127.0.0.1/ol_test_p04',{allowLoopback:true}).ssl,false);
});
