const test=require('node:test');const assert=require('node:assert/strict');const policy=require('../js/ai-policy.js');
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
test('system prompt includes public context and explicit capability limits',()=>{
 const prompt=policy.prompt('Be friendly',{games:[{name:'Example'}]});
 assert.match(prompt,/Be friendly/);assert.match(prompt,/Example/);assert.match(prompt,/cannot browse/);assert.match(prompt,/Do not invent/);
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
