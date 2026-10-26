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
  'users/other@example.com':{email:'other@example.com',username:'Other',fullName:'Other User',paid:true,banType:'permanent',password:'never-send-this',phone:'555-0100'},
  'siteContent/main':{games:{E:[{name:'Example',url:'/Games/example.html',openInPopup:true,description:'A fixture game'}]},sites:[{name:'Example Site',url:'/Sites/example.html',openInPopup:true},{name:'Direct Site',url:'/Sites/direct.html',openInPopup:false}],banned:['Manual label','Other User','Manual label'],aiSettings:{aiEnabled:true,apiKeys:['test-key'],model:'gemini-2.5-flash-lite',systemPrompt:'Fixture prompt. Active tool: {{active_tool}}. Tool data: {{tool_data}}',allowedModels:['gemini-test'],rateLimitMessages:2,rateLimitMinutes:60,modelLimits:{'gemini-test':{rateLimitMessages:1,rateLimitMinutes:60},'gemini-2.5-flash-lite':{rateLimitMessages:2,rateLimitMinutes:60}}}},
  'conversations/test@example.com__other@example.com':{participants:['test@example.com','other@example.com'],lastMessage:'hello'},
  'conversations/test@example.com__other@example.com/messages/image':{senderEmail:'other@example.com',text:'Image caption',fileType:'image',fileUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',fileName:'test.png'}
 };
 const names=new Set();for(const file of [...fs.readdirSync('.').filter(f=>/\.html$/.test(f)),...fs.readdirSync('js').filter(f=>f.endsWith('.js')).map(f=>'js/'+f)]){for(const match of fs.readFileSync(file,'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*["']https:\/\/www.gstatic.com\/firebasejs/g)){for(const n of match[1].split(','))names.add(n.trim());}}
 const mock=`const store=window.__fixture;const user={email:'test@example.com',uid:'test-user',displayName:'Tester'};
 const db={};const auth={currentUser:user};const ref=(...parts)=>({path:parts.filter(p=>typeof p==='string').join('/')});
 const snap=(path)=>({id:path.split('/').pop(),exists:()=>!!store[path],data:()=>store[path]||{}});
 const docs=path=>Object.keys(store).filter(key=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0).map(snap);
 const stamp=()=>({toMillis:()=>Date.now(),toDate:()=>new Date()});
 const patch=(path,data)=>{store[path] ||= {};for(const [key,value] of Object.entries(data)){const parts=key.split('.');let target=store[path];for(const part of parts.slice(0,-1))target=target[part] ||= {};target[parts.at(-1)]=value;}};
 const impl={initializeApp:()=>({}),getApps:()=>[{}],getApp:()=>({}),getAnalytics:()=>({}),getAuth:()=>auth,getFirestore:()=>db,
 doc:ref,collection:ref,getDoc:async r=>snap(r.path),getDocs:async r=>({docs:docs(r.path)}),query:r=>r,where:()=>null,orderBy:()=>null,
 onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(user),0);return()=>{}},onSnapshot:(r,cb)=>{setTimeout(()=>{const ds=docs(r.path);cb(r.path.split('/').length%2===0?snap(r.path):{docs:ds,docChanges:()=>ds.map(doc=>({type:'added',doc})),forEach:fn=>ds.forEach(fn),empty:!ds.length,size:ds.length});},0);return()=>{}},
 serverTimestamp:stamp,Timestamp:{now:stamp},increment:n=>n,
 setDoc:async(r,d)=>{store[r.path]={...store[r.path],...d}},updateDoc:async(r,d)=>patch(r.path,d),addDoc:async(r,d)=>{const id='added-'+Math.random();store[r.path+'/'+id]=d;return{id}},
 runTransaction:async(db,fn)=>fn({get:async r=>snap(r.path),update:(r,d)=>{store[r.path]={...store[r.path],...d}},set:(r,d)=>{store[r.path]={...store[r.path],...d}}})};
 ${[...names].map(n=>`export const ${n}=impl.${n}||(()=>{});`).join('\n')}`;
 await context.addInitScript(data=>{if(window.top!==window)return;window.__fixture=data;localStorage.setItem('kw_cloak_skip','1');localStorage.setItem('kw_cloak_skipped','1');localStorage.setItem('kw_skip_cloak','1');},fixture);
 await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:mock}));
 const aiRequests=[];
 await context.route('https://generativelanguage.googleapis.com/**',route=>{
  const body=JSON.parse(route.request().postData()||'{}');aiRequests.push(body);
  const isUsers=body.system_instruction?.parts?.[0]?.text?.includes('Active tool: users');
  if(isUsers&&!JSON.stringify(body.contents).includes('functionResponse')){
   const request=body.contents.filter(item=>item.role==='user').at(-1)?.parts?.[0]?.text||'';const functionCall=request.includes('banned people')?{name:'search_users',args:{filter:'banned'}}:{name:'get_user_info',args:{name:'Other',fields:['banned','email','password','phone','paid']}};
   return route.fulfill({json:{candidates:[{content:{role:'model',parts:[{functionCall}]},finishReason:'STOP'}]}});
  }
  const text=isUsers?(body.contents.at(-1)?.parts?.[0]?.functionResponse?.name==='get_user_info'?'Other has fake@example.com and 555-0192.':'User lookup complete [[user:Other]]'):body.system_instruction?.parts?.[0]?.text?.includes('Active tool: games')?'Try Example [[game:Example]]':body.system_instruction?.parts?.[0]?.text?.includes('Active tool: sites')?'Available sites: [[site:Example Site]] [[site:Direct Site]]':'Fixture AI response';
  return route.fulfill({json:{candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]}});
 });
 await context.route('**/cloak.js*',route=>route.fulfill({contentType:'application/javascript',body:"document.getElementById('kw-cloak-overlay')?.remove();"}));
 await context.route('**/Games/example.html',route=>route.fulfill({contentType:'text/html',body:'<button>Fixture game</button>'}));
 await context.route('**/Sites/example.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Example Site</h1>'}));
 await context.route('**/Sites/direct.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Direct Site</h1>'}));
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
 assert.equal(await page.locator('#ai-model-picker').isVisible(),false);
 assert.equal(await page.locator('#chat-settings-btn').count(),0);
 async function openAiSettings(){
  await page.locator('#chat-header-identity').click();
  await page.locator('#ai-chat-menu .ai-chat-menu-action').filter({hasText:'Settings'}).click();
  await page.waitForTimeout(30);
 }
 async function personalModel(model){
  await openAiSettings();
  assert.equal(await page.locator('#ai-model-picker').getAttribute('aria-label'),'Personal model');
  await page.selectOption('#ai-model-picker',model);
  await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 }
 await personalModel('gemini-test');
 await page.locator('#emoji-btn').click();await page.locator('#emoji-picker button').first().click();assert.equal(await page.locator('#msg-input').inputValue(),'😀');
 assert.ok(await page.locator('#emoji-picker').isVisible());assert.equal(await page.locator('#emoji-btn').getAttribute('aria-expanded'),'true');
 await page.locator('#emoji-picker button').first().click();assert.equal(await page.locator('#msg-input').inputValue(),'😀😀');
 await page.locator('#msg-input').click();await page.keyboard.press('Escape');assert.ok(await page.locator('#emoji-picker').isVisible());
 await page.locator('#emoji-btn').click();assert.equal(await page.locator('#emoji-picker').isVisible(),false);assert.equal(await page.locator('#emoji-btn').getAttribute('aria-expanded'),'false');
 assert.match(await page.locator('#ai-usage').textContent(),/Unlimited for admins/);
 await page.locator('#msg-input').fill('Test model prompt');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 await page.locator('#msg-input').fill('Beyond test model quota');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 assert.doesNotMatch(await page.locator('#ai-notice').textContent(),/limit reached/);
 assert.equal(await page.evaluate(()=>window.__fixture['users/test@example.com'].aiUsageByModel?.['gemini-test']),undefined);
 await page.locator('#chat-header-identity').click();
 assert.ok(await page.locator('#ai-chat-menu').isVisible());
 assert.match(await page.locator('#ai-chat-menu-list').textContent(),/Test model prompt/);
 await page.locator('#msg-input').fill('Unsent draft');
 await page.locator('#ai-chat-menu .ai-chat-menu-action').filter({hasText:'New chat'}).click();
 assert.equal(await page.locator('#msg-input').inputValue(),'');
 assert.doesNotMatch(await page.locator('#messages-area').textContent(),/Test model prompt/);
 await page.locator('#msg-input').fill('Separate AI thread');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 await page.locator('#chat-header-identity').click();
 assert.equal(await page.locator('#ai-chat-menu-list .ai-chat-menu-item').count(),2);
 await page.locator('#ai-chat-menu-list .ai-chat-menu-item').filter({hasText:'Test model prompt'}).click();
 assert.match(await page.locator('#messages-area').textContent(),/Test model prompt/);
 assert.doesNotMatch(await page.locator('#messages-area').textContent(),/Separate AI thread/);
 await page.locator('#chat-header-identity').click();
 await page.locator('#ai-chat-menu-list .ai-chat-menu-item').filter({hasText:'Separate AI thread'}).click();
 assert.match(await page.locator('#messages-area').textContent(),/Separate AI thread/);
 await page.locator('#chat-header-identity').click();
 await page.evaluate(()=>{window.confirm=()=>true;});
 await page.locator('#ai-chat-menu-list .ai-chat-menu-row').filter({hasText:'Test model prompt'}).locator('.ai-chat-delete').click();
 assert.equal(await page.locator('#ai-chat-menu-list .ai-chat-menu-item').count(),1);
 assert.match(await page.locator('#messages-area').textContent(),/Separate AI thread/);
 assert.ok(await page.evaluate(()=>Object.values(window.__fixture).some(value=>value.title==='Test model prompt'&&value.hidden===true)));
 await page.locator('#ai-chat-menu .ai-chat-menu-action').filter({hasText:'Settings'}).click();
 assert.ok(await page.locator('#ai-settings-modal').isVisible());
 await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 await personalModel('gemini-2.5-flash-lite');assert.match(await page.locator('#ai-usage').textContent(),/Unlimited for admins/);
 for(let i=0;i<2;i++){await page.locator('#msg-input').fill('Default model prompt '+i);await page.locator('#send-btn').click();await page.waitForTimeout(100);}
 assert.match(await page.locator('#ai-usage').textContent(),/Unlimited for admins/);
 assert.equal(await page.evaluate(()=>window.__fixture['users/test@example.com'].aiUsageByModel?.['gemini-2.5-flash-lite']),undefined);
 await personalModel('gemini-test');assert.match(await page.locator('#ai-usage').textContent(),/Unlimited for admins/);
 await openAiSettings();
 assert.equal(await page.locator('#ai-model-usage').count(),0);
 assert.equal(await page.locator('#ai-model-picker option[value="gemini-test"]').textContent(),'gemini-test - Unlimited');
 assert.equal(await page.locator('#ai-model-picker option[value="gemini-2.5-flash-lite"]').textContent(),'gemini-2.5-flash-lite - Unlimited');
 await page.locator('#ai-admin-settings summary').click();
 await page.locator('#s-allowed-models').fill('gemini-test\ngemini-extra');
 await page.locator('#s-model-limits [data-model="gemini-test"] [data-messages]').fill('3');
 await page.locator('#s-model-limits [data-model="gemini-extra"] [data-messages]').fill('1');
 await page.locator('#s-model-limits [data-model="gemini-extra"] [data-minutes]').fill('5');
 await page.locator('#s-model-limits [data-model="gemini-extra"] [data-messages]').fill('-1');
 await page.locator('#save-ai-admin-settings').click();assert.match(await page.locator('#settings-error').textContent(),/Each model needs/);
 assert.equal(await page.evaluate(()=>window.__fixture['siteContent/main'].aiSettings.modelLimits['gemini-test'].rateLimitMessages),1,'invalid settings cannot partially save');
 await page.locator('#s-model-limits [data-model="gemini-extra"] [data-messages]').fill('1');
 await page.locator('#save-ai-admin-settings').click();await page.waitForTimeout(50);
 assert.match(await page.locator('#settings-success').textContent(),/saved/);
 assert.equal(await page.evaluate(()=>window.__fixture['siteContent/main'].aiSettings.modelLimits['gemini-test'].rateLimitMessages),3);
 assert.equal(await page.locator('#ai-model-picker option').count(),3);
 assert.equal(await page.locator('#ai-model-picker option[value="gemini-test"]').textContent(),'gemini-test - Unlimited');
 await page.selectOption('#ai-model-picker','gemini-extra');
 await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 assert.ok(await page.locator('#ai-tools-btn').isVisible());
 await page.locator('#ai-tools-btn').click();await page.locator('[data-ai-tool="games"]').click();
 assert.match(await page.locator('#ai-tool-status').textContent(),/Games tool active · 1 item/);
 await page.locator('#msg-input').fill('Find me a game');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 const gameLink=page.locator('.ai-game-link');assert.match(await gameLink.textContent(),/Open Example/);assert.equal(await gameLink.getAttribute('href'),'/index.html?Example');
 const openedPromise=context.waitForEvent('page');await gameLink.click();const gamePage=await openedPromise;await gamePage.waitForTimeout(800);
 assert.ok(await gamePage.locator('#game-popup-modal').evaluate(el=>el.classList.contains('open')));assert.equal(await gamePage.locator('#game-popup-title').textContent(),'Example');await gamePage.close();
 await page.evaluate(()=>{window.__fixture['siteContent/main'].aiSettings.modelLimits['gemini-extra'].rateLimitMessages=10;});
 await page.locator('[data-ai-tool="sites"]').click();
 await page.locator('#msg-input').fill('What sites are there?');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 const siteLink=page.locator('.ai-msg a.ai-game-link').filter({hasText:'Open Example Site'});
 assert.equal(await siteLink.getAttribute('href'),'/index.html?site=Example%20Site');
 assert.match(await siteLink.textContent(),/Open Example Site/);
 assert.equal((await page.locator('.ai-msg').last().textContent()).match(/Example Site/g)?.length,1);
 const openedSitePromise=context.waitForEvent('page');await siteLink.click();const sitePage=await openedSitePromise;
 await sitePage.waitForTimeout(800);
 assert.equal(new URL(sitePage.url()).pathname,'/index.html');
 assert.ok(await sitePage.locator('#game-popup-modal').evaluate(el=>el.classList.contains('open')));
 assert.equal(await sitePage.locator('#game-popup-title').textContent(),'Example Site');
 assert.equal(await sitePage.locator('#game-popup-frame').getAttribute('src'),'/Sites/example.html');
 await sitePage.close();
 const directSiteLink=page.locator('.ai-msg a.ai-game-link').filter({hasText:'Open Direct Site'});
 assert.equal(await directSiteLink.getAttribute('href'),'http://127.0.0.1:8765/Sites/direct.html');
 await page.locator('[data-ai-tool="users"]').click();
 assert.equal(await page.locator('[data-ai-tool="banned"]').count(),0);
 await openAiSettings();await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 assert.match(await page.locator('#ai-tool-status').textContent(),/Users tool active/);
 await page.locator('#msg-input').fill('Who are the banned people?');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 assert.match(await page.locator('#messages-area').textContent(),/User lookup complete/);
 const userRequests=aiRequests.filter(request=>request.system_instruction?.parts?.[0]?.text?.includes('Active tool: users'));
 assert.equal(userRequests.length,2);assert.doesNotMatch(JSON.stringify(userRequests[0]),/never-send-this|other@example.com|Other User/);
 assert.deepEqual(userRequests[1].contents.at(-1).parts[0].functionResponse.response.users,[{name:'Other'}]);
 await page.locator('[data-ai-profile-email="other@example.com"]').first().click();
 assert.equal(await page.locator('#msg-profile-modal').evaluate(el=>el.style.display),'flex');
 assert.equal(await page.locator('#msg-profile-username').textContent(),'Other');
 await page.evaluate(()=>closeMsgProfile());
 await page.locator('#msg-input').fill('Is Other banned and what is their phone?');await page.locator('#send-btn').click();await page.waitForTimeout(100);
 const detailRequest=aiRequests.filter(request=>request.system_instruction?.parts?.[0]?.text?.includes('Active tool: users')).at(-1);
 assert.deepEqual(detailRequest.contents.at(-1).parts[0].functionResponse.response,{name:'Other',banned:true,email:'other@example.com',phone:'555-0100'});
 assert.match(await page.locator('#messages-area').textContent(),/Verified from the Users tool/);
 assert.match(await page.locator('#messages-area').textContent(),/other@example\.com/);
 assert.match(await page.locator('#messages-area').textContent(),/555-0100/);
 assert.doesNotMatch(await page.locator('#messages-area').textContent(),/fake@example\.com|555-0192/);
 await page.evaluate(async()=>{window.confirm=()=>true;await deleteAiHistory();});
 await page.locator('#chat-header-identity').click();
 assert.equal(await page.locator('#ai-chat-menu-list .ai-chat-menu-item').count(),0);
 assert.doesNotMatch(await page.locator('#ai-chat-menu-list').textContent(),/Separate AI thread/);
 await page.evaluate(()=>closeAiChatMenu());
 await page.evaluate(()=>{localStorage.removeItem('kw_playtime_outbox_test@example.com');localStorage.removeItem('kw_playtime_sync_test@example.com');});
 await page.evaluate(()=>openConversation('test@example.com__other@example.com'));await page.waitForTimeout(100);
 assert.equal(await page.locator('#ai-tools-btn').isVisible(),false);
 await page.evaluate(()=>openAiConversation());await page.waitForTimeout(100);
 assert.doesNotMatch(await page.locator('#messages-area').textContent(),/Separate AI thread/);
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
 // Ordinary users have personal settings and usage, without admin controls.
 await context.addInitScript(()=>{
  if(window.top===window&&location.pathname==='/msg.html'&&location.search==='?personal-test'){
   window.__fixture['users/test@example.com'].admin=false;
   window.__fixture['users/test@example.com'].aiUsageByModel={
    'gemini-test':{startedAt:Date.now(),windowMs:3600000,count:1},
    'gemini-2.5-flash-lite':{startedAt:Date.now(),windowMs:3600000,count:0}
   };
  }
 });
 await page.goto('http://127.0.0.1:8765/msg.html?personal-test');await page.waitForTimeout(300);await page.evaluate(()=>openAiConversation());
 await openAiSettings();
 assert.ok(await page.locator('#ai-model-picker').isVisible());assert.equal(await page.locator('#ai-admin-settings').isVisible(),false);
 assert.equal(await page.locator('#ai-model-picker option[value="gemini-test"]').textContent(),'gemini-test - 1 message per 60 minutes');
 await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 await personalModel('gemini-test');
 await page.locator('#msg-input').fill('Over regular user quota');await page.locator('#send-btn').click();await page.waitForTimeout(50);
 assert.match(await page.locator('#ai-notice').textContent(),/limit reached/);
 assert.equal(await page.locator('#msg-input').inputValue(),'Over regular user quota');
 assert.equal(await page.evaluate(()=>window.__fixture['users/test@example.com'].aiUsageByModel['gemini-test'].count),1);
 await page.locator('#msg-input').fill('');
 await openAiSettings();
 await page.selectOption('#ai-model-picker','gemini-2.5-flash-lite');await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 await page.locator('#msg-input').fill('Available model');await page.locator('#send-btn').click();await page.waitForTimeout(50);assert.match(await page.locator('#ai-usage').textContent(),/1 \/ 2/);
 // Removed models cannot submit via a stale selection, and rejected requests do not count.
 await personalModel('gemini-test');
 await page.evaluate(()=>{window.__fixture['siteContent/main'].aiSettings.allowedModels=[];});
 await page.locator('#msg-input').fill('Removed model');await page.locator('#send-btn').click();await page.waitForTimeout(50);
 assert.match(await page.locator('#ai-notice').textContent(),/no longer available/);
 assert.equal(await page.evaluate(()=>window.__fixture['users/test@example.com'].aiUsageByModel['gemini-test'].count),1);
 await openAiSettings();assert.equal(await page.locator('#ai-model-picker option').count(),1);await page.locator('#ai-settings-modal .modal-cancel-btn').click();
 // Unlimited policies still record usage. Simultaneous submit attempts reserve once.
 await page.evaluate(()=>{window.__fixture['siteContent/main'].aiSettings.modelLimits['gemini-2.5-flash-lite'].rateLimitMessages=0;document.getElementById('msg-input').value='Count unlimited usage';return Promise.all([sendMessage(),sendMessage()]);});
 assert.equal(await page.evaluate(()=>window.__fixture['users/test@example.com'].aiUsageByModel['gemini-2.5-flash-lite'].count),2);
 assert.match(await page.locator('#ai-usage').textContent(),/2 messages used; unlimited/);
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
