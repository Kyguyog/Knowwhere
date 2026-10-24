// Optional online integration check: real Ruffle + the repository SWF, without Firebase.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:8765'||url.hostname==='unpkg.com')return route.continue();
   return route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:8765/__swf-check',r=>r.fulfill({contentType:'text/html',body:'<div id="game-popup-ruffle" style="display:flex;width:800px;height:600px"></div><script src="/js/ruffle-popup.js"></script>'}));
  await page.goto('http://127.0.0.1:8765/__swf-check');
  await page.evaluate(()=>{window.loadingSwf=KWRufflePopup.load('/game-assets/Burito%20Bison%20Revenge/Burrito_Bison_Revenge_FIX.swf?check=1#movie')});
  await page.waitForFunction(()=>document.getElementById('game-popup-ruffle').dataset.state==='ready',null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('ruffle-player')?.ruffle().metadata?.width===720,null,{timeout:20000});
  const movie=await page.evaluate(()=>{const api=document.querySelector('ruffle-player').ruffle();return{metadata:api.metadata,playing:api.isPlaying}});
  assert.equal(movie.metadata.width,720);assert.equal(movie.metadata.height,480);assert.equal(movie.metadata.swfVersion,10);assert.equal(movie.playing,true);
  await page.waitForTimeout(1000);
  await page.screenshot({path:'/tmp/knowwhere-swf-check.png'});
  await page.evaluate(()=>KWRufflePopup.destroy());assert.equal(await page.locator('ruffle-player').count(),0);
  await page.evaluate(()=>{const container=document.getElementById('game-popup-ruffle');container.style.display='flex';window.loadingSwf=KWRufflePopup.load('/missing-swf-check.swf');});
  await page.waitForFunction(()=>document.getElementById('game-popup-ruffle').dataset.state==='error',null,{timeout:35000});
  assert.match(await page.locator('#game-popup-ruffle').textContent(),/Could not load Flash/);
  assert.deepEqual(errors,[]);
  console.log('Real SWF check passed: AS3 SWF v10, 720×480, playback, cleanup, and missing-file handling. Screenshot: /tmp/knowwhere-swf-check.png');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
