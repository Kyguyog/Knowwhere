(function(root){
  const activity={accrue(play,now,idleMs=play.unobservableInput?14400000:180000){
    const from=play.lastTickAt??now;
    if(!play.paused&&now>from){
      const cutoff=(play.lastInputAt??from)+idleMs;
      play.pendingActiveMs=(play.pendingActiveMs||0)+Math.max(0,Math.min(now,cutoff)-from);
    }
    play.lastTickAt=now;
  }};
  if(typeof module==='object')module.exports=activity;else root.KWPlaytimeActivity=activity;
})(typeof window==='object'?window:globalThis);
