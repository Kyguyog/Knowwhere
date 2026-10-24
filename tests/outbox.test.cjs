const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {randomUUID}=require('node:crypto');
function load(storage=new Map(),initial=1000000){
 let now=initial;
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const window={addEventListener(){}};const navigator={onLine:true};const intervals=[];
 const context={window,navigator,Date:ClockDate,crypto:{randomUUID},console,setInterval(fn,ms){intervals.push(ms)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/playtime-outbox.js'),'utf8'),context);
 return {box:window.KWPlaytimeOutbox,navigator,storage,tick:ms=>now+=ms,intervals};
}
test('sends at most every three minutes; same-game checkpoints share one transaction',async()=>{
 const {box,tick,intervals}=load();assert.deepEqual(intervals,[180000]);
 box.enqueue('a','Game',60,true);box.enqueue('a','Game',120,false);
 const batches=[];await box.flush('a',async jobs=>batches.push(jobs));assert.equal(batches.length,0);
 tick(179999);await box.flush('a',async jobs=>batches.push(jobs));assert.equal(batches.length,0);
 tick(1);await box.flush('a',async jobs=>batches.push(jobs));assert.equal(batches.length,1);assert.equal(batches[0].length,2);
 box.enqueue('a','Game',10,false);await box.flush('a',async jobs=>batches.push(jobs));assert.equal(batches.length,1);
});
test('offline saves survive reload, preserve throttle and remain isolated by account',async()=>{
 const first=load();first.navigator.onLine=false;first.box.enqueue('a@example.com','Game',12,true);first.box.enqueue('b@example.com','Game',20,true);
 let saves=0;await first.box.flush('a@example.com',async()=>saves++);assert.equal(saves,0);
 const reloaded=load(first.storage);const delivered=[];
 await reloaded.box.flush('a@example.com',async jobs=>delivered.push(jobs));assert.equal(delivered.length,0);
 reloaded.tick(180000);await reloaded.box.flush('a@example.com',async jobs=>delivered.push(jobs));
 assert.equal(delivered.length,1);assert.equal(delivered[0][0].seconds,12);
 assert.equal(JSON.parse(first.storage.get('kw_playtime_outbox_a@example.com')).length,0);
 assert.equal(JSON.parse(first.storage.get('kw_playtime_outbox_b@example.com')).length,1);
});
test('failed writes stay queued and cannot retry before the next three-minute window',async()=>{
 const {box,storage,tick}=load();box.enqueue('a','Game',15,false);box.enqueue('a','Game',10,false);tick(180000);
 const original=JSON.parse(storage.get('kw_playtime_outbox_a'));
 await assert.rejects(box.flush('a',async()=>{throw new Error('offline')}));
 assert.equal(JSON.parse(storage.get('kw_playtime_outbox_a')).length,2);
 const ids=[];await box.flush('a',async jobs=>ids.push(...jobs.map(j=>j.id)));assert.equal(ids.length,0);
 tick(180000);await box.flush('a',async jobs=>ids.push(...jobs.map(j=>j.id)));
 assert.deepEqual(ids,original.map(j=>j.id));assert.equal(JSON.parse(storage.get('kw_playtime_outbox_a')).length,0);
});
test('overlapping flushes do not send duplicate jobs and concurrent enqueue is retained',async()=>{
 const {box,storage,tick}=load();box.enqueue('a','First',15,true);tick(180000);let finish;
 const first=box.flush('a',()=>new Promise(resolve=>{finish=resolve}));
 let duplicate=false;await box.flush('a',async()=>{duplicate=true});box.enqueue('a','Second',4,true);finish();await first;
 assert.equal(duplicate,false);const remaining=JSON.parse(storage.get('kw_playtime_outbox_a'));assert.equal(remaining.length,1);assert.equal(remaining[0].gameName,'Second');
});
