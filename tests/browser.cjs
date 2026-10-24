const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{if(route.request().url().startsWith('http://127.0.0.1:8765/'))return route.continue();return route.abort();});
 const errors=[];
 const fixture={
  'users/test@example.com':{email:'test@example.com',username:'Tester',fullName:'Test User',admin:true,paid:true,active:true},
  'users/other@example.com':{email:'other@example.com',username:'Other',fullName:'Other User',paid:true,banType:'permanent'},
  'siteContent/main':{games:{E:[{name:'Example',url:'/Games/example.html',openInPopup:true,description:'A fixture game'}]},sites:[{name:'Example Site',url:'/Sites/example.html'}],banned:['Manual label','Other User','Manual label'],aiSettings:{aiEnabled:true,apiKeys:['test-key'],model:'gemini-2.5-flash-lite',allowedModels:['gemini-test'],rateLimitMessages:2,rateLimitMinutes:60}},
  'conversations/test@example.com__other@example.com':{participants:['test@example.com','other@example.com'],lastMessage:'hello'},
  'conversations/test@example.com__other@example.com/messages/image':{senderEmail:'other@example.com',text:'Image caption',fileType:'image',fileUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',fileName:'test.png'}
 };
 const names=new Set();for(const file of [...fs.readdirSync('.').filter(f=>/\.html$/.test(f)),...fs.readdirSync('js').filter(f=>f.endsWith('.js')).map(f=>'js/'+f)]){for(const match of fs.readFileSync(file,'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*["']https:\/\/www.gstatic.com\/firebasejs/g)){for(const n of match[1].split(','))names.add(n.trim());}}
 const mock=`const store=window.__fixture;const user={email:'test@example.com',uid:'test-user',displayName:'Tester'};
 const db={};const auth={currentUser:user};const ref=(...parts)=>({path:parts.filter(p=>typeof p==='string').join('/')});
 const snap=(path)=>({id:path.split('/').pop(),exists:()=>!!store[path],data:()=>store[path]||{}});
 const docs=path=>Object.keys(store).filter(key=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0).map(snap);
 const stamp=()=>({toMillis:()=>Date.now(),toDate:()=>new Date()});
 const impl={initializeApp:()=>({}),getApps:()=>[{}],getApp:()=>({}),getAnalytics:()=>({}),getAuth:()=>auth,getFirestore:()=>db,
 doc:ref,collection:ref,getDoc:async r=>snap(r.path),getDocs:async r=>({docs:docs(r.path)}),query:r=>r,where:()=>null,orderBy:()=>null,
 onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(user),0);return()=>{}},onSnapshot:(r,cb)=>{setTimeout(()=>{const ds=docs(r.path);cb(r.path.split('/').length%2===0?snap(r.path):{docs:ds,docChanges:()=>ds.map(doc=>({type:'added',doc})),forEach:fn=>ds.forEach(fn),empty:!ds.length,size:ds.length});},0);return()=>{}},
 serverTimestamp:stamp,Timestamp:{now:stamp},increment:n=>n,
 setDoc:async(r,d)=>{store[r.path]={...store[r.path],...d}},updateDoc:async(r,d)=>{store[r.path]={...store[r.path],...d}},addDoc:async(r,d)=>{const id='added-'+Math.random();store[r.path+'/'+id]=d;return{id}},
 runTransaction:async(db,fn)=>fn({get:async r=>snap(r.path),update:(r,d)=>{store[r.path]={...store[r.path],...d}},set:(r,d)=>{store[r.path]={...store[r.path],...d}}})};
 ${[...names].map(n=>`export const ${n}=impl.${n}||(()=>{});`).join('\n')}`;
 await context.addInitScript(data=>{if(window.top!==window)return;window.__fixture=data;localStorage.setItem('kw_cloak_skip','1');localStorage.setItem('kw_cloak_skipped','1');localStorage.setItem('kw_skip_cloak','1');},fixture);
 await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:mock}));
 await context.route('https://generativelanguage.googleapis.com/**',route=>route.fulfill({json:{candidates:[{content:{parts:[{text:'Fixture AI response'}]},finishReason:'STOP'}]}}));
 await context.route('**/cloak.js*',route=>route.fulfill({contentType:'application/javascript',body:"document.getElementById('kw-cloak-overlay')?.remove();"}));
 await context.route('**/Games/example.html',route=>route.fulfill({contentType:'text/html',body:'<button>Fixture game</button>'}));
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});page.setDefaultTimeout(8000);
 console.log('Loading page');await page.goto('http://127.0.0.1:8765/edit.html');await page.waitForTimeout(700);
 await page.locator('#nav-hamburger').click();assert.equal(await page.locator('#nav-hamburger').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#nav-mobile-drawer').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#nav-hamburger').getAttribute('aria-expanded'),'false');
 await page.evaluate(()=>{window._isAdmin=true;renderGamesEditor({A:[{name:'Alpha',url:'alpha.html'},{name:'Beta',url:'beta.html'}]});renderSitesEditor([{name:'Sample',url:'sample.html'}]);switchAdminTab('games');});
 await page.waitForTimeout(50);
 assert.equal(await page.locator('#ae-games-list details[open]').count(),0);
 await page.locator('#ae-games-list summary').first().click();await page.locator('#ae-games-list .game-url-input').first().fill('new.html');await page.locator('#ae-games-list .game-name-input').first().focus();
 assert.equal(await page.locator('#ae-games-list .game-url-input').first().inputValue(),'/Games/new.html');
 await page.locator('input[aria-label="Search games by name or URL"]').fill('beta');assert.equal(await page.locator('#ae-games-list .admin-row-item:visible').count(),1);
 await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(50);assert.equal(await page.locator('#ae-games-list details[open]').count(),2);
 await page.setViewportSize({width:390,height:844});console.log('Loading page');await page.goto('http://127.0.0.1:8765/msg.html');await page.waitForTimeout(700);
 await page.evaluate(()=>openAiConversation());await page.waitForTimeout(100);
 assert.equal(await page.locator('#ai-model-picker option').count(),2);
 await page.selectOption('#ai-model-picker','gemini-test');
 await page.locator('#emoji-btn').click();await page.locator('#emoji-picker button').first().click();assert.equal(await page.locator('#msg-input').inputValue(),'😀');
 assert.ok(await page.locator('#emoji-picker').isVisible());assert.equal(await page.locator('#emoji-btn').getAttribute('aria-expanded'),'true');
 await page.locator('#emoji-picker button').first().click();assert.equal(await page.locator('#msg-input').inputValue(),'😀😀');
 await page.locator('#msg-input').click();await page.keyboard.press('Escape');assert.ok(await page.locator('#emoji-picker').isVisible());
 await page.locator('#emoji-btn').click();assert.equal(await page.locator('#emoji-picker').isVisible(),false);assert.equal(await page.locator('#emoji-btn').getAttribute('aria-expanded'),'false');
 for(let i=0;i<2;i++){if(i===1)await page.selectOption('#ai-model-picker','gemini-2.5-flash-lite');await page.locator('#msg-input').fill('Prompt '+i);await page.locator('#send-btn').click();await page.waitForTimeout(100);}
 assert.match(await page.locator('#ai-usage').textContent(),/2 \/ 2/);
 await page.locator('#msg-input').fill('Over quota');await page.locator('#send-btn').click();await page.waitForTimeout(100);assert.match(await page.locator('#ai-notice').textContent(),/limit reached/);assert.equal(await page.locator('#msg-input').inputValue(),'Over quota');
 await page.evaluate(()=>openConversation('test@example.com__other@example.com'));await page.waitForTimeout(100);
 await page.locator('#messages-area img[data-fv-url]').click();assert.ok(await page.locator('#file-viewer-modal').isVisible());assert.equal(await page.locator('#fv-body img').count(),1);await page.keyboard.press('Escape');
 await page.locator('#file-input').setInputFiles({name:'hello.txt',mimeType:'text/plain',buffer:Buffer.from('Hello')});await page.waitForTimeout(50);assert.match(await page.locator('#file-preview-strip').textContent(),/hello.txt/);
 await page.locator('#msg-input').fill('File caption');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 assert.ok(await page.evaluate(()=>Object.entries(window.__fixture).some(([key,value])=>key.includes('/messages/added-')&&value.fileName==='hello.txt'&&value.fileUrl.startsWith('data:text/plain'))));
 await page.setViewportSize({width:1280,height:900});console.log('Loading page');await page.goto('http://127.0.0.1:8765/user.html');await page.waitForTimeout(500);
 await page.evaluate(()=>{window._allUsers=[window.__fixture['users/other@example.com']];document.getElementById('approvals-list').innerHTML=renderUserCard(window._allUsers[0]);document.getElementById('approvals-panel').style.display='flex';window._fetchUserConversations=async()=>[{id:'fixture',messages:[window.__fixture['conversations/test@example.com__other@example.com/messages/image']]}];});
 await page.locator('[data-profile-email]').click();assert.equal(await page.locator('#profile-modal').evaluate(e=>e.style.display),'flex');assert.equal(await page.locator('#profile-username').textContent(),'Other');
 await page.evaluate(()=>displayDmHistory('fixture','test@example.com'));await page.waitForTimeout(50);assert.equal(await page.locator('#history-ai-content img').count(),1);
 await page.evaluate(()=>{closeProfile();document.getElementById('user-history-modal').style.display='flex';});
 await page.locator('#history-ai-content img').click();assert.ok(await page.locator('#file-viewer-modal').isVisible());assert.equal(await page.locator('#fv-filename').textContent(),'test.png');
 assert.equal(await page.locator('#fv-body img').count(),1);
 const download=page.waitForEvent('download');await page.locator('#fv-download-btn').click();assert.equal((await download).suggestedFilename(),'test.png');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#file-viewer-modal').isVisible(),false);
 console.log('Loading page');await page.goto('http://127.0.0.1:8765/index.html');await page.waitForTimeout(700);
 assert.equal(await page.locator('[data-stat="banned"]').getAttribute('data-target'),'2');
 assert.equal(await page.locator('#banned-list .banned-item').count(),2,'manual/account duplicates must count once');
 assert.equal(Number(await page.locator('[data-stat="banned"]').getAttribute('data-target')),await page.locator('#banned-list .banned-item').count());
 // Local-only close checkpoints; cloud delivery is throttled across sessions.
 await page.locator('#archive .game-card[data-name="Example"]').click();await page.waitForTimeout(1200);
 await page.evaluate(()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
 now+=60000;Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
 closeGamePopup();delete document.hidden;Date.now=realNow;
 });await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>Object.keys(window.__fixture).filter(k=>k.startsWith('playtime/')).length),0,'close must not immediately write Firebase');
 await page.evaluate(async()=>{const now=Date.now();Date.now=()=>now+180001;await window._flushPlaytimeOutbox();});
 const rows=await page.evaluate(()=>Object.entries(window.__fixture).filter(([k])=>k.startsWith('playtime/')).map(([,v])=>v));
 assert.equal(rows[0]?.plays,1);assert.ok(rows[0].totalSeconds>=1);assert.ok(rows[0].totalSeconds<10,'hidden minute should not count');
 await page.evaluate(async row=>{const now=Date.now();Date.now=()=>now+180001;localStorage.setItem('kw_playtime_outbox_test@example.com',JSON.stringify([{id:row.recentBatches[0],gameName:'Example',seconds:10,countPlay:true,at:new Date().toISOString()}]));await window._flushPlaytimeOutbox();},rows[0]);
 const afterReplay=await page.evaluate(()=>Object.entries(window.__fixture).find(([k])=>k.startsWith('playtime/'))[1]);
 assert.equal(afterReplay.plays,1);assert.equal(afterReplay.totalSeconds,rows[0].totalSeconds);
 await page.locator('#archive .game-card[data-name="Example"]').click();await page.waitForTimeout(150);
 await page.evaluate(async()=>{
 let now=Date.now();Date.now=()=>now;now+=120000;
 document.getElementById('game-popup-frame').contentDocument.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 now+=240000;await window._checkpointPopupPlaytime();await window._flushPlaytimeOutbox();
 });
 const activeRow=await page.evaluate(()=>Object.entries(window.__fixture).find(([k])=>k.startsWith('playtime/'))[1]);
 assert.equal(activeRow.totalSeconds,rows[0].totalSeconds+300,'frame input extends activity; idle focus cannot extend it');
 await page.evaluate(async()=>{const now=Date.now();Date.now=()=>now+180000;await window._checkpointPopupPlaytime();await window._flushPlaytimeOutbox();closeGamePopup();});
 const idleRow=await page.evaluate(()=>Object.entries(window.__fixture).find(([k])=>k.startsWith('playtime/'))[1]);assert.equal(idleRow.totalSeconds,activeRow.totalSeconds);
 await context.route('http://cross-origin.test/game',route=>route.fulfill({contentType:'text/html',body:'<button>External game</button>'}));
 await page.evaluate(()=>{GAMES={X:[{name:'External fixture',url:'http://cross-origin.test/game',openInPopup:true}]};buildArchive('');});
 await page.locator('#archive .game-card[data-name="External fixture"]').click();await page.waitForTimeout(100);
 await page.evaluate(async()=>{let now=Date.now();Date.now=()=>now;now+=360000;await window._checkpointPopupPlaytime();});
 let externalSeconds=await page.evaluate(()=>JSON.parse(localStorage.getItem('kw_playtime_outbox_test@example.com')).filter(j=>j.gameName==='External fixture').reduce((sum,j)=>sum+j.seconds,0));
 assert.equal(externalSeconds,360,'cross-origin play continues past three minutes');
 await page.evaluate(async()=>{const now=Date.now();Date.now=()=>now+18000000;await window._checkpointPopupPlaytime();closeGamePopup();});
 externalSeconds=await page.evaluate(()=>JSON.parse(localStorage.getItem('kw_playtime_outbox_test@example.com')).filter(j=>j.gameName==='External fixture').reduce((sum,j)=>sum+j.seconds,0));
 assert.equal(externalSeconds,14400,'cross-origin play caps at four hours');
 // Root bootstrap must retain ZIP runtime interception after the implementation moves.
 await context.route('http://127.0.0.1:8765/__zip-worker-check',route=>route.fulfill({contentType:'text/html',body:'ZIP worker scope check'}));
 await page.goto('http://127.0.0.1:8765/__zip-worker-check');
 const zipResponse=await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.register('/zip-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  const cache=await caches.open('zip-runtime'),url=location.origin+'/__zip_runtime/refactor-check/index.html';
  await cache.put(url,new Response('ZIP runtime works',{headers:{'Content-Type':'text/html'}}));
  const text=await(await fetch(url)).text();await cache.delete(url);await reg.unregister();return text;
 });
 assert.equal(zipResponse,'ZIP runtime works');
 // Hide old rows before all leaderboard aggregations without deleting stored data.
 const visibilityNow=Date.parse('2026-10-24T18:00:00Z');
 const playtimeFixture={...fixture,
  'playtime/recent':{email:'test@example.com',username:'Tester',gameName:'Recent Game',totalSeconds:100,plays:1,lastPlayedAt:new Date(visibilityNow-86400000).toISOString()},
  'playtime/boundary':{email:'test@example.com',username:'Tester',gameName:'Boundary Game',totalSeconds:5000,plays:30,lastPlayedAt:new Date(visibilityNow-14*86400000).toISOString()},
  'playtime/old':{email:'old@example.com',username:'Old Player',gameName:'Old Game',totalSeconds:9000,plays:90,lastPlayedAt:new Date(visibilityNow-15*86400000).toISOString()}
 };
 await context.addInitScript(({data,now})=>{if(window.top===window&&location.pathname==='/playtime.html'){window.__fixture=data;Date.now=()=>now;}},{data:playtimeFixture,now:visibilityNow});
 await page.goto('http://127.0.0.1:8765/playtime.html');await page.waitForTimeout(300);
 assert.equal(await page.locator('#leaderboard .row:not(.head)').count(),1);assert.match(await page.locator('#leaderboard').textContent(),/1m 40s/);
 await page.evaluate(()=>drillPlayer('test@example.com'));assert.match(await page.locator('#leaderboard').textContent(),/Recent Game/);assert.doesNotMatch(await page.locator('#leaderboard').textContent(),/Boundary Game/);
 await page.evaluate(()=>setView('game'));assert.equal(await page.locator('#leaderboard .row:not(.head)').count(),1);
 await page.evaluate(()=>drillGame('Recent Game'));assert.match(await page.locator('#leaderboard').textContent(),/1m 40s/);
 await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+14*86400000;renderCurrentView();});assert.match(await page.locator('#leaderboard').textContent(),/No playtime found/);
 assert.equal(await page.evaluate(()=>window.__fixture['playtime/boundary'].totalSeconds),5000);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: mobile navigation, editor search/collapse/paths, AI selection/quota/emoji, file sends, profiles/history, banned count, playtime.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
