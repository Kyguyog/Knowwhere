const test=require('node:test');const assert=require('node:assert/strict');const activity=require('../js/playtime-activity.js');
function play(){return{lastTickAt:0,lastInputAt:0,pendingActiveMs:0}}
test('focused but untouched games stop counting after three minutes',()=>{
 const state=play();activity.accrue(state,180000);assert.equal(state.pendingActiveMs,180000);
 activity.accrue(state,360000);assert.equal(state.pendingActiveMs,180000);
});
test('real input extends the cutoff; returning after idle never counts the idle gap',()=>{
 const state=play();activity.accrue(state,120000);state.lastInputAt=120000;
 activity.accrue(state,360000);assert.equal(state.pendingActiveMs,300000);
 activity.accrue(state,600000);state.lastInputAt=600000;
 activity.accrue(state,660000);assert.equal(state.pendingActiveMs,360000);
});
test('hidden time is excluded and visibility alone does not reset inactivity',()=>{
 const state=play();activity.accrue(state,60000);state.paused=true;
 activity.accrue(state,600000);state.paused=false;
 activity.accrue(state,660000);assert.equal(state.pendingActiveMs,60000);
});

test('cross-origin games count beyond three minutes and stop at four hours',()=>{
 const state={...play(),unobservableInput:true};
 activity.accrue(state,360000);assert.equal(state.pendingActiveMs,360000);
 activity.accrue(state,14400000);assert.equal(state.pendingActiveMs,14400000);
 activity.accrue(state,18000000);assert.equal(state.pendingActiveMs,14400000);
});
