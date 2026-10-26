(function(root) {
  const policy = {
    adminBypassesLimit(user = {}) { return user?.admin === true; },
    limits(settings = {}, model) {
      const selected = settings.modelLimits?.[model] || {};
      const max = Math.floor(Number(selected.rateLimitMessages ?? settings.rateLimitMessages));
      const minutes = Math.floor(Number(selected.rateLimitMinutes ?? settings.rateLimitMinutes));
      return {max: Number.isFinite(max) ? Math.min(10000, Math.max(0,max)) : 20,
        windowMs: (Number.isFinite(minutes) ? Math.min(10080, Math.max(1,minutes)) : 60) * 60000};
    },
    allowedModels(settings = {}) {
      return [...new Set([settings.model || 'gemini-2.5-flash-lite',...(Array.isArray(settings.allowedModels)?settings.allowedModels:[])].filter(policy.modelId))];
    },
    usageByModel(user = {}, settings = {}) {
      const byModel = {...(user?.aiUsageByModel || {})};
      const defaultModel = settings.model || 'gemini-2.5-flash-lite';
      if (!user?.aiUsageMigrated && user?.aiUsage && !byModel[defaultModel]) byModel[defaultModel] = user.aiUsage;
      return byModel;
    },
    modelUsage(user = {}, model, settings = {}) {
      return policy.usageByModel(user, settings)[model] ?? null;
    },
    usage(previous, limits, now = Date.now()) {
      const valid = previous && previous.windowMs === limits.windowMs && Number.isFinite(previous.startedAt) && previous.startedAt <= now && now < previous.startedAt + limits.windowMs;
      return {startedAt: valid ? previous.startedAt : now, count: valid ? Math.max(0, Math.floor(Number(previous.count) || 0)) : 0, windowMs: limits.windowMs};
    },
    modelId(value) { return /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(value || ''); },
    toolData(tool, context = {}) {
      if (tool === 'games') return (context.games || []).map(game => ({name:game.name,description:game.description || ''}));
      if (tool === 'sites') return (context.sites || []).map(site => ({name:site.name,url:site.url || '',description:site.description || '',openInPopup:site.openInPopup===true}));
      if (tool === 'users') return {lookup:'on demand',actions:['list_users','search_users','get_user_info']};
      return null;
    },
    siteHref(value, base = 'https://knowwhere.invalid/') {
      const raw=String(value||'').trim();
      if(!raw)return '';
      try {
        const url=new URL(raw,base);
        return url.protocol==='http:'||url.protocol==='https:'?url.href:'';
      } catch (_) { return ''; }
    },
    responseParts(text, games = [], sites = [], users = []) {
      const source = String(text || '');
      const byGame = new Map(games.filter(game => game?.name).map(game => [String(game.name).trim().toLowerCase(),String(game.name).trim()]));
      const bySite = new Map(sites.filter(site => site?.name).map(site => [String(site.name).trim().toLowerCase(),site]));
      const byUser = new Map();
      for(const user of users){
        const name=policy.userName(user),key=name.toLowerCase();
        if(!name||!user?.email)continue;
        if(byUser.has(key))byUser.set(key,null);
        else byUser.set(key,{name,email:String(user.email)});
      }
      const parts=[];let last=0;const pattern=/\[\[(game|site|user):([^\]\r\n]+)\]\]/gi;let match;
      while((match=pattern.exec(source))){
        if(match.index>last)parts.push({type:'text',value:source.slice(last,match.index)});
        const kind=match[1].toLowerCase(),key=match[2].trim().toLowerCase();
        const game=kind==='game'?byGame.get(key):null;
        const site=kind==='site'?bySite.get(key):null;
        const user=kind==='user'?byUser.get(key):null;
        if(game)parts.push({type:'game',name:game});
        else if(site)parts.push({type:'site',name:String(site.name),url:String(site.url||''),openInPopup:site.openInPopup===true});
        else if(user)parts.push({type:'user',name:user.name,email:user.email});
        else parts.push({type:'text',value:match[0]});
        last=pattern.lastIndex;
      }
      if(last<source.length)parts.push({type:'text',value:source.slice(last)});
      return parts.length?parts:[{type:'text',value:source}];
    },
    prompt(custom, context = {}, activeTool = context.activeTool || '') {
      const selected = policy.toolData(activeTool, context);
      const toolName=activeTool||'none';
      const toolData=selected===null?'none':JSON.stringify(selected);
      return String(custom||'')
        .replace(/\{\{active_tool\}\}/g,()=>toolName)
        .replace(/\{\{tool_data\}\}/g,()=>toolData);
    },
    userName(user = {}) {
      return String(user.username || user.fullName || user.email || '').trim();
    },
    userBanned(user = {}, now = Date.now()) {
      if (user.banType === 'permanent') return true;
      if (user.banType !== 'temporary') return false;
      const raw = user.banUntil;
      const until = raw?.toMillis?.() ?? raw?.toDate?.()?.getTime?.() ?? new Date(raw || 0).getTime();
      return Number.isFinite(until) && until > now;
    },
    searchUsers(users = [], filter = 'all', term = '', now = Date.now()) {
      const needle=String(term || '').trim().toLowerCase();
      const filters={all:()=>true,banned:user=>policy.userBanned(user,now),disabled:user=>user.active===false,active:user=>user.active!==false,admin:user=>user.admin===true,editor:user=>user.editor===true};
      if (!Object.hasOwn(filters,filter)) return {error:'Unsupported user filter.'};
      const matches=users.filter(user=>filters[filter](user)&&(!needle||policy.userName(user).toLowerCase().includes(needle)));
      return {total:matches.length,users:matches.slice(0,100).map(user=>({name:policy.userName(user)})),truncated:matches.length>100};
    },
    listUsers(users = [], offset = 0) {
      const start=Number.isInteger(offset)&&offset>=0?offset:0;
      return {total:users.length,offset:start,users:users.slice(start,start+100).map(user=>({name:policy.userName(user)})),hasMore:start+100<users.length};
    },
    findUser(users = [], name = '') {
      const target=String(name || '').trim().toLowerCase();
      if(!target)return {error:'A user name is required.'};
      const matches=users.filter(user=>[user.username,user.fullName,user.email].some(value=>String(value||'').trim().toLowerCase()===target));
      if(matches.length!==1)return {error:matches.length?'Multiple users match; ask for a more specific name.':'User not found.'};
      return matches[0];
    },
    userToolDeclarations() {
      return [{functionDeclarations:[
        {name:'list_users',description:'List display names of all users, up to 100 per page. Use only when the user asks for everyone.',parameters:{type:'OBJECT',properties:{offset:{type:'INTEGER',description:'Starting index, beginning at zero.'}}}},
        {name:'search_users',description:'Find users matching a name or visible account status. For banned users use filter=banned. Returns only display names.',parameters:{type:'OBJECT',properties:{filter:{type:'STRING',enum:['all','banned','disabled','active','admin','editor']},name:{type:'STRING',description:'Optional partial display name.'}}}},
        {name:'get_user_info',description:'Get profile details for one user by exact display name or email. Email and phone are visible in ordinary user profiles and can be requested. For several people, call this function for each person. Ask only for fields needed to answer.',parameters:{type:'OBJECT',properties:{name:{type:'STRING'},fields:{type:'ARRAY',items:{type:'STRING',enum:['username','fullName','email','phone','bio','lunchSchedule','jobTag','admin','editor','orders','active','banned']}}},required:['name','fields']}}
      ]}];
    },
    userInfo(user = {}, fields = []) {
      const allowed=new Set(['username','fullName','email','phone','bio','lunchSchedule','jobTag','admin','editor','orders','active','banned']);
      const result={name:policy.userName(user)};
      for(const field of Array.isArray(fields)?fields:[]){
        if(!allowed.has(field))continue;
        if(field==='banned'){result.banned=policy.userBanned(user);continue;}
        const value=user[field];
        if(value===undefined||value===null)continue;
        if(typeof value==='string'||typeof value==='boolean'||typeof value==='number')result[field]=value;
        else if(field==='lunchSchedule'&&typeof value==='object')result[field]={aDay:value.aDay||'',bDay:value.bDay||''};
      }
      return result;
    },
    verifiedContactReply(reply, lookups = [], recentUserMessages = []) {
      const contactLookups=lookups.filter(item=>item?.name==='get_user_info'&&Array.isArray(item.fields)&&item.fields.some(field=>field==='email'||field==='phone'));
      if(contactLookups.length){
        const rows=contactLookups.map(item=>{
          const name=String(item.result?.name||item.requestedName||'User');
          if(item.result?.error)return `- **${name}:** ${item.result.error}`;
          const details=[];
          if(item.fields.includes('email'))details.push(`Email: ${item.result?.email||'Not set'}`);
          if(item.fields.includes('phone'))details.push(`Phone: ${item.result?.phone||'Not set'}`);
          return `- **${name}:** ${details.join(' · ')} [[user:${name}]]`;
        });
        return `Verified from the Users tool:\n${rows.join('\n')}`;
      }
      const source=String(reply||'');
      const hasAddress=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source);
      const hasPhone=/(?:\+?\d[\d().\s-]{5,}\d)/.test(source);
      const lastUserMessage=String(recentUserMessages.at(-1)||'');
      const isFollowup=lastUserMessage.length<80&&/\b(?:check|again|wrong|sure|those|them|really|actually)\b/i.test(lastUserMessage);
      const relevantMessages=isFollowup?recentUserMessages.slice(-4):recentUserMessages.slice(-1);
      const contactTopic=relevantMessages.some(message=>{
        const text=String(message||'');
        const asksForContact=/\b(?:e-?mails?|phone(?:s|\s*(?:numbers?|#s?))?|contact\s*(?:info|details)?)\b/i.test(text);
        const personReference=/\b(?:admins?|users?|profiles?|their|his|her|them|people|person|who|someone)\b|\b\w+'s\s+(?:e-?mail|phone)\b/i.test(text);
        const writingOrExplanation=/\b(?:write|draft|example|template|format|what is|how to)\b/i.test(text);
        return asksForContact&&(personReference||!writingOrExplanation);
      });
      const claimsContact=/\b(?:e-?mails?|phone(?:s|\s*(?:numbers?|#s?))?|contact\s*(?:info|details)?)\b/i.test(source);
      if(contactTopic&&(hasAddress||hasPhone||claimsContact))return 'I could not verify those profile details. Select the Users tool (between file upload and emoji), then ask again.';
      return source;
    }
  };
  if (typeof module === 'object') module.exports = policy;
  else root.KWAIPolicy = policy;
})(typeof window === 'object' ? window : globalThis);
