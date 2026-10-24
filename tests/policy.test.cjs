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
