const test=require('node:test');const assert=require('node:assert/strict');const policy=require('../js/ai-policy.js');
test('only an explicit admin flag bypasses AI limits',()=>{
 assert.equal(policy.adminBypassesLimit({admin:true}),true);
 assert.equal(policy.adminBypassesLimit({admin:false}),false);
 assert.equal(policy.adminBypassesLimit({editor:true}),false);
 assert.equal(policy.adminBypassesLimit({admin:'true'}),false);
});
test('limits validate missing, zero, invalid, and bounded settings',()=>{
 assert.deepEqual(policy.limits(),{max:20,windowMs:3600000});
 assert.equal(policy.limits({rateLimitMessages:0}).max,0);
 assert.equal(policy.limits({rateLimitMessages:'invalid'}).max,20);
 assert.equal(policy.limits({rateLimitMessages:100000,rateLimitMinutes:-1}).max,10000);
 assert.equal(policy.limits({rateLimitMinutes:-1}).windowMs,60000);
});
test('quota resets on expiry, clock reversal, or policy window changes',()=>{
 const limits={max:2,windowMs:100};const prev={startedAt:1000,count:2,windowMs:100};
 assert.equal(policy.usage(prev,limits,1099).count,2);
 assert.equal(policy.usage(prev,limits,1100).count,0);
 assert.equal(policy.usage(prev,limits,999).count,0);
 assert.equal(policy.usage(prev,{...limits,windowMs:200},1050).count,0);
});
test('model IDs cannot insert URLs, slashes, or query parameters',()=>{
 assert.ok(policy.modelId('gemini-2.5-flash-lite'));
 for(const id of ['../bad','gemini-x?key=secret','https://example.com','gemini-x/y',''])assert.equal(policy.modelId(id),false);
});
test('system prompt comes entirely from its stored template and exposes only the active tool',()=>{
 const context={games:[{name:'Example'}],sites:[{name:'Hidden Site'}]};
 const template='Firebase behavior only. Active={{active_tool}} Data={{tool_data}}';
 const prompt=policy.prompt(template,context,'games');
 assert.match(prompt,/Firebase behavior only/);assert.match(prompt,/Active=games/);assert.match(prompt,/Example/);assert.doesNotMatch(prompt,/Hidden Site/);
 assert.equal(policy.prompt('',context),'');
});
test('Users tool starts with actions only and does not preload user records',()=>{
 const context={users:[{name:'Alex',role:'admin',email:'private@example.com'}]};
 assert.deepEqual(policy.toolData('users',context),{lookup:'on demand',actions:['list_users','search_users','get_user_info']});
 assert.equal(policy.toolData('banned',context),null);
 assert.equal(policy.toolData('',context),null);
});
test('user lookups list names, filter bans, and return requested approved fields only',()=>{
 const users=[
  {username:'Alex',email:'alex@example.com',admin:true,password:'secret',phone:'123',banType:'permanent'},
  {email:'fallback@example.com',banType:'temporary',banUntil:'2020-01-01T00:00:00Z'},
  {username:'Sam',active:false}
 ];
 assert.deepEqual(policy.listUsers(users),{total:3,offset:0,users:[{name:'Alex'},{name:'fallback@example.com'},{name:'Sam'}],hasMore:false});
 assert.deepEqual(policy.searchUsers(users,'banned'),{total:1,users:[{name:'Alex'}],truncated:false});
 assert.deepEqual(policy.searchUsers(users,'disabled'),{total:1,users:[{name:'Sam'}],truncated:false});
 assert.equal(policy.findUser(users,'Alex'),users[0]);
 assert.deepEqual(policy.userInfo(users[0],['admin','banned','password','phone','paid']),{name:'Alex',admin:true,banned:true,phone:'123'});
 assert.deepEqual(policy.userInfo(users[0],['email','phone']),{name:'Alex',email:'alex@example.com',phone:'123'});
 assert.ok(policy.userToolDeclarations()[0].functionDeclarations.find(item=>item.name==='get_user_info').parameters.properties.fields.items.enum.includes('email'));
 assert.deepEqual(policy.searchUsers(users,'paid'),{error:'Unsupported user filter.'});
});
test('profile contact replies use only verified lookup results',()=>{
 const invented='Email: madeup@example.com, Phone: 555-0192';
 assert.match(policy.verifiedContactReply(invented,[],['Can I have their emails?']),/could not verify/);
 assert.match(policy.verifiedContactReply('No email or phone set.',[],['Can I have their emails?']),/could not verify/);
 const lookups=[
  {name:'get_user_info',requestedName:'Alex',fields:['email','phone'],result:{name:'Alex',email:'alex@example.com',phone:'555-0100'}},
  {name:'get_user_info',requestedName:'Sam',fields:['email','phone'],result:{name:'Sam',email:'sam@example.com'}},
  {name:'get_user_info',requestedName:'Pat',fields:['email'],result:{error:'User not found.'}}
 ];
 const verified=policy.verifiedContactReply(invented,lookups,['Can I have their emails?']);
 assert.match(verified,/alex@example\.com/);assert.match(verified,/555-0100/);
 assert.match(verified,/sam@example\.com/);assert.match(verified,/Phone: Not set/);
 assert.match(verified,/Pat.*User not found/);assert.doesNotMatch(verified,/madeup@example\.com|555-0192/);
 assert.equal(policy.verifiedContactReply('The answer is 2026-10-24.',[],['What is the date?']),'The answer is 2026-10-24.');
 assert.equal(policy.verifiedContactReply('Use student@example.com in your draft.',[],['Write an example email.']),'Use student@example.com in your draft.');
 assert.match(policy.verifiedContactReply(invented,[],['Can I have their emails?','Those look wrong','Quad check?']),/could not verify/);
});
test('only exact catalog game markers become launchable response parts',()=>{
 const parts=policy.responseParts('Try this [[game:Example]] and [[game:Invented]]',[{name:'Example'}]);
 assert.deepEqual(parts,[{type:'text',value:'Try this '},{type:'game',name:'Example'},{type:'text',value:' and '},{type:'text',value:'[[game:Invented]]'}]);
});
test('site and user markers resolve only to known entries and safe site URLs',()=>{
 const sites=[{name:'Example Site',url:'/Sites/example.html',openInPopup:true},{name:'Bad Site',url:'javascript:alert(1)'}];
 const users=[{username:'Alex',email:'alex@example.com'},{username:'Sam',email:'sam@example.com'}];
 const parts=policy.responseParts('[[site:Example Site]] [[user:Alex]] [[site:Invented]] [[user:Unknown]]',[],sites,users);
 assert.deepEqual(parts,[{type:'site',name:'Example Site',url:'/Sites/example.html',openInPopup:true},{type:'text',value:' '},{type:'user',name:'Alex',email:'alex@example.com'},{type:'text',value:' '},{type:'text',value:'[[site:Invented]]'},{type:'text',value:' '},{type:'text',value:'[[user:Unknown]]'}]);
 assert.equal(policy.siteHref('/Sites/example.html','https://knowwhere.example/'),'https://knowwhere.example/Sites/example.html');
 assert.equal(policy.siteHref('https://hoodamath.com','https://knowwhere.example/'),'https://hoodamath.com/');
 assert.equal(policy.siteHref('javascript:alert(1)','https://knowwhere.example/'),'');
 assert.equal(policy.siteHref('data:text/html,evil','https://knowwhere.example/'),'');
 assert.deepEqual(policy.responseParts('[[user:Alex]]',[],[],[...users,{username:'Alex',email:'other@example.com'}]),[{type:'text',value:'[[user:Alex]]'}]);
});
test('model-specific limits override defaults independently',()=>{
 const settings={model:'gemini-a',rateLimitMessages:20,rateLimitMinutes:60,modelLimits:{'gemini-a':{rateLimitMessages:2,rateLimitMinutes:5},'gemini-b':{rateLimitMessages:0,rateLimitMinutes:30}}};
 assert.deepEqual(policy.limits(settings,'gemini-a'),{max:2,windowMs:300000});
 assert.deepEqual(policy.limits(settings,'gemini-b'),{max:0,windowMs:1800000});
 assert.deepEqual(policy.limits(settings,'gemini-c'),{max:20,windowMs:3600000});
});
test('only the default and explicitly allowed models are offered',()=>{
 assert.deepEqual(policy.allowedModels({model:'gemini-a',allowedModels:['gemini-b','gemini-a','bad','../bad']}),['gemini-a','gemini-b']);
 assert.deepEqual(policy.allowedModels({model:'gemini-a',allowedModels:[]}),['gemini-a']);
});
test('model counters remain isolated and legacy usage carries forward only for default model',()=>{
 const legacy={startedAt:1000,count:2,windowMs:60000};
 const settings={model:'gemini-a'};
 assert.equal(policy.modelUsage({aiUsage:legacy},'gemini-a',settings),legacy);
 assert.equal(policy.modelUsage({aiUsage:legacy},'gemini-b',settings),null);
 const modelB={...legacy,count:1};const user={aiUsage:legacy,aiUsageByModel:{'gemini-b':modelB}};
 assert.equal(policy.modelUsage(user,'gemini-b',settings),modelB);
 assert.equal(policy.modelUsage(user,'gemini-a',settings),legacy);
 assert.equal(user.aiUsage.count,2);
});

test('legacy usage migrates once without following later default-model changes',()=>{
 const legacy={startedAt:1000,count:2,windowMs:60000};
 const initial={aiUsage:legacy};const aiUsageByModel=policy.usageByModel(initial,{model:'gemini-a'});
 const migrated={...initial,aiUsageByModel,aiUsageMigrated:true};
 assert.equal(policy.modelUsage(migrated,'gemini-a',{model:'gemini-b'}),legacy);
 assert.equal(policy.modelUsage(migrated,'gemini-b',{model:'gemini-b'}),null);
 assert.equal(initial.aiUsageByModel,undefined);
});
