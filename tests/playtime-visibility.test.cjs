const test=require('node:test'),assert=require('node:assert/strict');
const visibility=require('../js/playtime-visibility.js');
const now=Date.parse('2026-10-24T18:00:00Z'),cutoff=now-14*86400000;
test('hides records exactly fourteen days old and older, retaining newer records',()=>{
 assert.equal(visibility.isVisible({lastPlayedAt:new Date(cutoff).toISOString()},now),false);
 assert.equal(visibility.isVisible({lastPlayedAt:new Date(cutoff-1).toISOString()},now),false);
 assert.equal(visibility.isVisible({lastPlayedAt:new Date(cutoff+1).toISOString()},now),true);
});
test('accepts Firestore timestamps, Date objects, and numeric timestamps',()=>{
 for(const lastPlayedAt of [{toMillis:()=>now},new Date(now),now])assert.equal(visibility.isVisible({lastPlayedAt},now),true);
 for(const lastPlayedAt of [undefined,null,'','invalid',{toMillis:()=>NaN}])assert.equal(visibility.isVisible({lastPlayedAt},now),false);
});
test('filtering preserves stored rows and cumulative totals',()=>{
 const rows=[{lastPlayedAt:now,totalSeconds:1000},{lastPlayedAt:cutoff,totalSeconds:2000}];
 assert.deepEqual(visibility.recent(rows,now),[rows[0]]);assert.equal(rows.length,2);assert.equal(rows[1].totalSeconds,2000);
 assert.equal(visibility.recent(rows,now+14*86400000).length,0);
});
