(function(){
  const prefix='kw_playtime_outbox_',intervalMs=180000;let flushing=false;
  function read(email){try{return JSON.parse(localStorage.getItem(prefix+email)||'[]');}catch(_){return [];}}
  function write(email,jobs){localStorage.setItem(prefix+email,JSON.stringify(jobs));}
  window.KWPlaytimeOutbox={
    enqueue(email,gameName,seconds,countPlay){
      const jobs=read(email);jobs.push({id:crypto.randomUUID(),gameName,seconds:Math.max(0,Math.floor(seconds)),countPlay:!!countPlay,at:new Date().toISOString()});write(email,jobs);
      if(!localStorage.getItem(prefix+'attempt_'+email))localStorage.setItem(prefix+'attempt_'+email,String(Date.now()));
    },
    async flush(email,save){
      if(flushing||!navigator.onLine||!read(email).length)return;flushing=true;
      try{
        const drain=async()=>{
          const now=Date.now(),last=Number(localStorage.getItem(prefix+'attempt_'+email));
          if(Number.isFinite(last)&&now-last<intervalMs)return;
          // Persist the throttle across reloads/tabs, including failed attempts.
          localStorage.setItem(prefix+'attempt_'+email,String(now));
          const groups=new Map();
          for(const job of read(email)){
            const group=groups.get(job.gameName)||[];
            if(group.length<100)group.push(job);
            groups.set(job.gameName,group);
          }
          for(const jobs of groups.values()){
            await save(jobs);
            const ids=new Set(jobs.map(job=>job.id));write(email,read(email).filter(entry=>!ids.has(entry.id)));
          }
        };
        if(navigator.locks)await navigator.locks.request(prefix+email,drain);else await drain();
      }finally{flushing=false;}
    }
  };
  async function retry(){
    try{await window._checkpointPopupPlaytime?.();await window._flushPlaytimeOutbox?.();}
    catch(e){console.warn('Playtime retry deferred:',e);}
  }
  setInterval(retry,intervalMs);window.addEventListener('online',retry);
})();
