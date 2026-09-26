import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ProjectStore} from '../lib/projects/store';

async function functions() {
 const modulePath='../lib/projects/images';
 const api=await import(modulePath).catch(()=>({}));
 assert.equal(typeof api.normalizeReferenceImage,'function','Real raster normalization must exist');
 return api;
}
async function png() {return sharp({create:{width:40,height:20,channels:3,background:'#e9e9e9'}}).png().withMetadata().toBuffer();}

test('image input is decoded, metadata is stripped, and dimensions/hash describe normalized bytes',async()=>{
 const {normalizeReferenceImage}=await functions();const raw=await png();
 const result=await normalizeReferenceImage(raw.toString('base64'));
 assert.equal(result.mime,'image/png');assert.equal(result.width,40);assert.equal(result.height,20);
 const metadata=await sharp(Buffer.from(result.data,'base64')).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
 assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.equal(result.bytes,Buffer.from(result.data,'base64').length);
});

test('unsupported, corrupt and oversized images are rejected rather than stored or read by URL',async()=>{
 const {normalizeReferenceImage}=await functions();
 for(const source of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),'http://example.com/a.png','a'.repeat(8*1024*1024),Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')])await assert.rejects(()=>normalizeReferenceImage(source));
 const large=await sharp({create:{width:8193,height:1,channels:3,background:'#fff'}}).png().toBuffer();
 await assert.rejects(()=>normalizeReferenceImage(large.toString('base64')),/dimension|pixel/i);
});

test('reference records are immutable, scoped, and bound to run idempotency',async()=>{
 const {ReferenceImageStore}=await functions();const store=new ProjectStore(':memory:');
 try {
 const images=new ReferenceImageStore(store);const a=store.createProject('owner','A','gateway/vision'),b=store.createProject('owner','B','gateway/vision');
 const picture=await images.add('owner',a.id,'reference.png','target',(await png()).toString('base64'));
 assert.equal(picture.role,'target');assert.equal('data' in picture,false);
 assert.equal(images.list('owner',b.id).length,0);assert.throws(()=>images.get('other',a.id,picture.id),/not found/);
 assert.throws(()=>images.get('owner',b.id,picture.id),/not found/);
 const inputs={mode:'build' as const,imageIDs:[picture.id]};
 const run=store.beginRun('owner',a.id,'visual-key','Create','gateway/vision',1,inputs);
 assert.equal(run.inputs.images[0].sha256,picture.sha256);
 assert.throws(()=>store.beginRun('owner',a.id,'visual-key','Create','gateway/vision',1,{mode:'plan',imageIDs:[picture.id]}),/conflict/);
 images.archive('owner',a.id,picture.id);assert.equal(images.list('owner',a.id).length,0);
 assert.equal(images.forRun('owner',a.id,run.id)[0].sha256,picture.sha256);
 assert.equal(store.beginRun('owner',a.id,'visual-key','Create','gateway/vision',1,inputs).id,run.id);
 store.cancelRun('owner',a.id,run.id);
 assert.throws(()=>store.beginRun('owner',a.id,'new-visual-key','Create','gateway/vision',1,inputs),/archived|not found/);
 assert.deepEqual(store.getProject('owner',a.id).snapshot.files,{});
 }finally{store.close();}
});

test('plan mode cannot stage or accept application changes, even if a model emits file tags',async()=>{
 const store=new ProjectStore(':memory:');try{
 const p=store.createProject('owner','Plan','gateway/text');
 const run=store.beginRun('owner',p.id,'planning-key','Plan change','gateway/text',1,{mode:'plan'});
 assert.throws(()=>store.stageRun('owner',p.id,run.id,{files:{'src/App.jsx':'export default()=>null'},assets:{}},'bad'),/plan/i);
 store.completePlan('owner',p.id,run.id,'<file path="src/App.jsx">untrusted plan text</file>');
 assert.equal(store.getRun('owner',p.id,run.id).state,'SUCCEEDED');assert.equal(store.getProject('owner',p.id).version,1);
 assert.equal(store.revisions('owner',p.id).length,1);assert.equal(store.getRun('owner',p.id,run.id).candidate,null);
 assert.throws(()=>store.acceptRun('owner',p.id,run.id,1));
 }finally{store.close();}
});


test('archived references count toward quota and corrupted bound image bytes fail integrity checks',async()=>{
 const {ReferenceImageStore}=await functions();const store=new ProjectStore(':memory:');try{
 const images=new ReferenceImageStore(store),p=store.createProject('owner','Quota','gateway/vision');
 const encoded=(await png()).toString('base64');
 const first=await images.add('owner',p.id,'first.png','current',encoded);
 const run=store.beginRun('owner',p.id,'integrity-run','Review','gateway/vision',1,{imageIDs:[first.id]});
 store.db.prepare('UPDATE project_images SET data=? WHERE id=?').run(Buffer.from('corrupt').toString('base64'),first.id);
 assert.throws(()=>images.forRun('owner',p.id,run.id),/integrity/);
 for(let i=1;i<32;i++){const image=await images.add('owner',p.id,'other.png','target',encoded);images.archive('owner',p.id,image.id);}
 await assert.rejects(()=>images.add('owner',p.id,'too-many.png','target',encoded),/budget/);
 }finally{store.close();}
});

test('a plan cannot finish against a stale base revision',()=>{
 const store=new ProjectStore(':memory:');try{
 const p=store.createProject('owner','Stale plan','gateway/text'),run=store.beginRun('owner',p.id,'stale-plan','Plan','gateway/text',1,{mode:'plan'});
 store.saveSnapshot('owner',p.id,1,{files:{'src/App.jsx':'export default()=>null'},assets:{}},'Changed');
 assert.throws(()=>store.completePlan('owner',p.id,run.id,'A stale plan'),/changed during planning/);assert.equal(store.getProject('owner',p.id).version,2);
 }finally{store.close();}
});
