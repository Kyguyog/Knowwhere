(function(){
  let runtimePromise=null,player=null,version=0,cancelLoading=null;
  function runtime(){
    if(window.RufflePlayer?.newest)return Promise.resolve(window.RufflePlayer);
    if(!runtimePromise)runtimePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://unpkg.com/@ruffle-rs/ruffle@0.7.1/ruffle.js';
      const timer=setTimeout(()=>{script.remove();reject(new Error('Flash player download timed out.'));},30000);
      script.onload=()=>{clearTimeout(timer);if(window.RufflePlayer?.newest)resolve(window.RufflePlayer);else reject(new Error('Flash player did not initialize.'));};
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Failed to download Flash player.'));};
      document.head.appendChild(script);
    }).catch(error=>{runtimePromise=null;throw error;});
    return runtimePromise;
  }
  window.KWRufflePopup={
    destroy(){version++;cancelLoading?.();cancelLoading=null;if(player){player.remove();player=null;}const container=document.getElementById('game-popup-ruffle');if(container){container.replaceChildren();container.style.display='none';delete container.dataset.state;}},
    async load(src){
      const container=document.getElementById('game-popup-ruffle');if(!container)return;
      cancelLoading?.();const request=++version;container.dataset.state='loading';
      try{
        const ruffle=await runtime();if(request!==version)return;
        player=ruffle.newest().createPlayer();player.style.width='100%';player.style.height='100%';container.replaceChildren(player);
        const api=typeof player.ruffle==='function'?player.ruffle():player;
        // load() resolves before the SWF download/parse finishes in current Ruffle.
        // Wait for loadeddata so HTTP failures cannot be reported as ready.
        const currentPlayer=player;
        const loaded=new Promise((resolve,reject)=>{
          const cleanup=()=>{clearTimeout(timer);currentPlayer.removeEventListener('loadeddata',ready);};
          const ready=()=>{cleanup();resolve();};
          const timer=setTimeout(()=>{cleanup();reject(new Error('Flash content download timed out.'));},30000);
          currentPlayer.addEventListener('loadeddata',ready,{once:true});
          cancelLoading=()=>{cleanup();resolve();};
        });
        await Promise.all([api.load(src),loaded]);if(request!==version)return;
        cancelLoading=null;container.dataset.state='ready';
      }catch(error){
        if(request!==version)return;
        cancelLoading?.();cancelLoading=null;
        if(player){player.remove();player=null;}
        container.dataset.state='error';
        const message=document.createElement('p');message.style.cssText='color:#ef4444;padding:1.5rem;text-align:center;width:100%';
        message.textContent='Could not load Flash content. Check the SWF URL or try again.';container.replaceChildren(message);
        console.warn('Flash load failed:',error);
      }
    }
  };
})();
