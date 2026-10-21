(function(root){
'use strict';
const PROTOCOL='screen12-review8-v1',FIRST=12,REVIEW=8,CAP=20,intervals=[1,3,7,14,30];
const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(s,n)=>{const [y,m,d]=s.split('-').map(Number);return day(new Date(y,m-1,d+n,12));};
const normalize=s=>String(s||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
const skills=w=>['meaning','spell',...(w.pt.length&&w.pp.length?['pt','pp']:[])];
const sameForms=w=>!!w&&!!(w.pt.length&&w.pp.length)&&JSON.stringify([...new Set(w.pt.map(normalize))].sort())===JSON.stringify([...new Set(w.pp.map(normalize))].sort());
const taskSkills=w=>skills(w).filter(k=>!(sameForms(w)&&k==='pp'));
const fresh=()=>({version:1,records:{},days:{},session:null,assessments:{},exam:'',settings:{daily:FIRST,review:REVIEW,total:CAP},history:[]});
function daily(s,date=day()){return s.days[date]||(s.days[date]={ids:[],completed:[],answers:0,correct:0});}
const SCENES=[{"id": "school", "title": "學校的一天"}, {"id": "home", "title": "在家過生活"}, {"id": "food", "title": "吃飯與點餐"}, {"id": "shopping", "title": "一起去買東西"}, {"id": "travel", "title": "搭車與出遊"}, {"id": "hobbies", "title": "放學後的興趣"}, {"id": "health", "title": "照顧自己的身體"}, {"id": "feelings", "title": "心情與朋友相處"}, {"id": "nature", "title": "看看天氣與大自然"}, {"id": "time", "title": "安排今天的生活"}, {"id": "communication", "title": "說話與傳遞訊息"}, {"id": "work", "title": "認識工作與城市"}, {"id": "learning", "title": "想一想與解決問題"}];
const stableRank=w=>{let h=0;for(const c of w.id)h=(h*31+c.charCodeAt(0))>>>0;return h;};
const commonSort=(a,b)=>(a.commonRank??999)-(b.commonRank??999)||a.word.length-b.word.length||stableRank(a)-stableRank(b);
function actualToday(s,date){const ids=new Set(s.history.filter(h=>h.date===date).map(h=>h.id));for(const [id,r]of Object.entries(s.records))if(Object.values(r).some(x=>x.last===date))ids.add(id);return [...ids];}
function due(s,words,date=day()){
 const q=[];
 for(const w of words){const r=s.records[w.id];if(!r)continue;
  for(const skill of taskSkills(w)){
   const keys=skill==='pt'&&sameForms(w)?['pt','pp']:[skill],xs=keys.map(k=>r[k]);
   const missing=xs.some(x=>!x),eligible=xs.filter(x=>x&&x.due<=date);
   if(!missing&&!eligible.length)continue;
   const core=['meaning','spell'].includes(skill),last=Object.values(r).map(x=>x.last||date).sort()[0]||date;
   q.push({id:w.id,skill,due:missing?last:eligible.map(x=>x.due).sort()[0],errors:Math.max(0,...xs.filter(Boolean).map(x=>x.errors||0)),wrong:xs.some(x=>x&&x.errors>0&&(!x.lastOK||x.wins<3)),wins:Math.min(...xs.map(x=>x?.wins||0)),missing,core});
  }
 }
 return q.sort((a,b)=>Number(b.wrong)-Number(a.wrong)||Number(b.missing&&b.core)-Number(a.missing&&a.core)||a.due.localeCompare(b.due)||a.wins-b.wins||b.errors-a.errors||a.id.localeCompare(b.id));
}
function reviewKind(s,id,t){const p=s.assessments?.[id];return t.wrong?'errors':p?.status==='known'&&t.core?'known':'review';}
function chooseNew(s,words,d,n,date){
 const selected=new Set(d.ids),pool=words.filter(w=>!s.records[w.id]&&!selected.has(w.id));if(!pool.length||n<=0)return;
 const goal=Math.round(n*.6),prior=Object.entries(s.days).filter(([k,v])=>k<date&&v.answers>0).length,rotated=SCENES.map((_,i)=>SCENES[(prior+i)%SCENES.length]);
 const scene=rotated.find(x=>pool.filter(w=>w.learningScene===x.id).length>=goal)||rotated.find(x=>pool.some(w=>w.learningScene===x.id))||{id:'general',title:'綜合實用'};
 const theme=pool.filter(w=>w.learningScene===scene.id).sort((a,b)=>(a.sceneRank??999)-(b.sceneRank??999)||commonSort(a,b)).slice(0,goal),themeIds=new Set(theme.map(w=>w.id));
 const common=pool.filter(w=>!themeIds.has(w.id)&&w.learningScene!==scene.id).sort(commonSort).slice(0,n-goal),used=new Set([...theme,...common].map(w=>w.id)),spare=pool.filter(w=>!used.has(w.id)).sort(commonSort);
 for(let i=0;i<n;i++){const w=(i%5<3?theme.shift():common.shift())||theme.shift()||common.shift()||spare.shift();if(!w)break;d.ids.push(w.id);}
 d.sceneId=scene.id;d.sceneTitle=scene.title;
}
function plan(s,words,date=day()){
 const d=daily(s,date),by=Object.fromEntries(words.map(w=>[w.id,w]));s.assessments=s.assessments||{};s.settings={...s.settings,daily:FIRST,review:REVIEW,total:CAP};
 if(d.protocol===PROTOCOL)return d;
 const actual=actualToday(s,date),ss=s.session,active=ss?.date===date&&ss.queue.length;
 const started=d.answers>0||d.completed.length>0||actual.length>0||(active&&ss.attempts>0);
 d.legacy=started;d.reviewIds=[];d.reviewSkills={};d.reviewKinds={};d.reviewCompleted=[];d.outcomes={};d.screenResults={};d.corrections=[];d.touched=actual.slice();d.protocol=PROTOCOL;
 if(!started){d.ids=[];d.completed=[];if(active)s.session=null;}
 else{
  const room=Math.max(0,CAP-actual.length);let kept=0;d.ids=d.ids.filter(id=>actual.includes(id)||d.completed.includes(id)||kept++<room);d.completed=d.completed.filter(id=>d.ids.includes(id));
  for(const id of d.ids)if(d.completed.includes(id))d.outcomes[id]='legacy';
  for(const id of actual.filter(id=>!d.ids.includes(id))){d.reviewIds.push(id);d.reviewKinds[id]='legacy';if(!active||!ss.queue.some(t=>t.id===id))d.reviewCompleted.push(id);}
 }
 // Do not add work to a legacy day that the child has already started or completed.
 if(!started)chooseNew(s,words,d,Math.min(FIRST,Math.max(0,CAP-actual.length)),date);
 const reserved=new Set([...actual,...d.ids,...d.reviewIds]);
 const addReview=t=>{if(reserved.size>=CAP||d.reviewIds.length>=REVIEW||reserved.has(t.id))return;d.reviewIds.push(t.id);d.reviewSkills[t.id]=t.skill;d.reviewKinds[t.id]=reviewKind(s,t.id,t);reserved.add(t.id);};
 if(active&&started){
  for(const t of ss.queue)if(!d.ids.includes(t.id)&&!d.reviewIds.includes(t.id))addReview(due(s,words,date).find(x=>x.id===t.id&&x.skill===t.skill)||{...t,core:['meaning','spell'].includes(t.skill)});
  ss.queue=ss.queue.filter(t=>reserved.has(t.id));for(const t of ss.queue){t.kind=t.kind||'legacy';if(d.reviewIds.includes(t.id)&&!d.reviewSkills[t.id])d.reviewSkills[t.id]=t.skill;}
  ss.total=ss.done+ss.queue.length;ss.protocol='legacy';
 }
 const legacyFinished=started&&d.completed.length===d.ids.length&&(!active||!ss.queue.length);
 if(!legacyFinished)for(const t of due(s,words,date))addReview(t);
 d.sceneWordIds=d.ids.filter(id=>by[id]?.learningScene===d.sceneId);d.commonWordIds=d.ids.filter(id=>!d.sceneWordIds.includes(id));return d;
}
function scheduledIds(d){return [...new Set([...d.ids,...(d.reviewIds||[])])];}
function summary(s,words,date=day()){
 const d=plan(s,words,date),out=Object.values(d.outcomes),actual=actualToday(s,date),planned=scheduledIds(d),complete=new Set([...d.completed,...d.reviewCompleted]);
 const deferred=new Set(due(s,words,date).filter(t=>!planned.includes(t.id)).map(t=>t.id));
 return {firstTotal:d.ids.length,firstDone:d.completed.length,known:out.filter(x=>x==='known').length,listening:out.filter(x=>x==='listening').length,newLearning:out.filter(x=>x==='new').length,legacy:out.filter(x=>x==='legacy').length,reviewTotal:d.reviewIds.length,reviewDone:d.reviewCompleted.length,total:planned.length,done:planned.filter(id=>complete.has(id)).length,actual:actual.length,deferred:deferred.size,legacyDay:!!d.legacy};
}
function tasksFor(s,w,kind){const r=s.records[w.id]||{};return taskSkills(w).filter(k=>!r[k]||(k==='pt'&&sameForms(w)&&!r.pp)).map(skill=>({id:w.id,skill,kind}));}
function start(s,words,mode='daily',date=day()){
 const d=plan(s,words,date);if(s.session?.date===date&&s.session.queue.length)return s.session;
 const q=[];
 if(mode!=='new')for(const id of d.reviewIds){if(d.reviewCompleted.includes(id))continue;const skill=d.reviewSkills[id]||due(s,words,date).find(t=>t.id===id)?.skill;if(d.wordPending?.[id]?.length)q.push(...d.wordPending[id].map(t=>({...t})));else if(skill)q.push({id,skill,kind:'review'});else d.reviewCompleted.push(id);}
 if(mode!=='errors'&&mode!=='review'){
  const pending=d.ids.filter(id=>!d.completed.includes(id));
  if(!d.legacy){
   for(const skill of ['meaning','spell'])for(const id of pending)if(!d.screenResults[id]?.[skill])q.push({id,skill,kind:'screen'});
   // A paused teaching stage can be reconstructed even if the user ended the round.
   for(const id of pending){if(q.some(t=>t.id===id))continue;const w=words.find(w=>w.id===id);if(!w)continue;const todo=d.wordPending?.[id]||[];for(const t of todo)q.push({...t});if(!todo.length)d.completed.push(id);}
  }else for(const id of pending){const w=words.find(w=>w.id===id);if(!w)continue;const missing=tasksFor(s,w,'legacy');if(missing.length)q.push({id,skill:'learn',kind:'legacy'},...missing);else d.completed.push(id);}
 }
 s.session={date,mode,queue:q,done:0,total:q.length,correct:0,attempts:0,feedback:null,protocol:PROTOCOL};return s.session;
}
function grade(s,w,skill,ok,{hint=false,retry=false,date=day()}={}){
 const r=s.records[w.id]||(s.records[w.id]={}),success=ok&&!hint,keys=['pt','pp'].includes(skill)&&sameForms(w)?['pt','pp']:[skill];
 for(const key of keys){const old=r[key]||{level:-1,errors:0,wins:0},sameDay=old.last===date,level=success&&!sameDay?Math.min(4,old.level+1):success?old.level:0;
  r[key]={...old,level,last:date,due:success&&!sameDay?addDays(date,intervals[level]):sameDay&&success?old.due:addDays(date,1),errors:old.errors+(success?0:1),wins:success?old.wins+(!sameDay?1:0):0,lastOK:success,unassessed:false};
 }
 const d=daily(s,date);d.answers++;if(success)d.correct++;if(d.touched&&!d.touched.includes(w.id))d.touched.push(w.id);s.history.push({date,id:w.id,skill,ok:success});s.history=s.history.slice(-5000);return success;
}
function seedForms(s,w,date){const r=s.records[w.id];for(const k of skills(w).filter(k=>['pt','pp'].includes(k)))if(!r[k])r[k]={level:-1,last:'',due:addDays(date,1),errors:0,wins:0,lastOK:false,unassessed:true};}
function markProgress(s,id,queue,date){const d=daily(s,date);d.wordPending=d.wordPending||{};d.wordPending[id]=queue.filter(t=>t.id===id).map(t=>({...t}));if(d.wordPending[id].length)return;
 if(d.ids.includes(id)&&!d.completed.includes(id))d.completed.push(id);if(d.reviewIds?.includes(id)&&!d.reviewCompleted.includes(id))d.reviewCompleted.push(id);
}
function answer(s,words,rawOK,{help='none',date=day()}={}){
 const ss=s.session;if(!ss||!ss.queue.length||ss.feedback)return null;
 const t=ss.queue[0],w=words.find(w=>w.id===t.id);if(!w||t.skill==='learn')return null;
 const d=plan(s,words,date);if(!scheduledIds(d).includes(w.id))return null;const ok=grade(s,w,t.skill,rawOK,{hint:help!=='none',retry:t.kind==='correction',date});
 const append=[];
 if(t.kind==='screen'){
  const x=d.screenResults[w.id]||(d.screenResults[w.id]={});x[t.skill]={ok,rawOK,help,date};
  if(t.skill==='spell'){
   const status=x.meaning?.ok&&rawOK&&help==='none'?'known':x.meaning?.ok&&rawOK&&help==='audio'?'listening':'new';
   d.outcomes[w.id]=status;s.assessments[w.id]={status,screenedAt:date,maintenanceStep:0};seedForms(s,w,date);
   const r=s.records[w.id];if(status==='known')for(const k of ['meaning','spell']){r[k].due=addDays(date,7);r[k].screened=true;}
   if(status==='listening'){r.meaning.due=addDays(date,7);r.spell.due=addDays(date,1);}
   if(status==='new'){
    append.push({id:w.id,skill:'learn',kind:'learning'});
    for(const k of ['meaning','spell'])if(!x[k]?.ok){append.push({id:w.id,skill:k,kind:'correction'});d.corrections.push(w.id+'|'+k);}
    for(const k of taskSkills(w).filter(k=>['pt','pp'].includes(k)))if(s.records[w.id][k]?.unassessed)append.push({id:w.id,skill:k,kind:'learning'});
   }
  }
 }else{
  const correctionKey=w.id+'|'+t.skill;
  if(!ok&&t.kind!=='correction'&&!d.corrections.includes(correctionKey)){d.corrections.push(correctionKey);append.push({id:w.id,skill:t.skill,kind:'correction'});}
  const p=s.assessments[w.id],r=s.records[w.id];
  if(t.kind==='review'&&['meaning','spell'].includes(t.skill)&&p){
   if(p.status==='known'&&ok&&r.meaning?.lastOK&&r.spell?.lastOK){const n=[14,30,60,120][Math.min(3,p.maintenanceStep||0)];p.maintenanceStep=(p.maintenanceStep||0)+1;for(const k of ['meaning','spell'])r[k].due=addDays(date,n);if(r.meaning.wins>=2&&r.spell.wins>=2)p.confirmedAt=date;}
   else if(p.status==='known'&&!ok){p.status='new';p.maintenanceStep=0;}
   else if(p.status==='listening'&&t.skill==='spell'&&ok&&r.meaning?.lastOK){p.status='known';r.meaning.due=r.spell.due=addDays(date,7);}
  }
 }
 // Teaching/correction stays with its word, before moving to the next spelling check.
 if(append.length)ss.queue.splice(1,0,...append);
 ss.attempts++;if(ok)ss.correct++;ss.feedback={ok,rawOK,help,outcome:d.outcomes[w.id]||null};ss.total=ss.done+ss.queue.length;
 markProgress(s,w.id,ss.queue.slice(1),date);return ok;
}
function advance(s,date=day()){
 const ss=s.session;if(!ss?.queue.length)return;const t=ss.queue.shift();ss.done++;ss.feedback=null;ss.hinted=false;ss.help='none';markProgress(s,t.id,ss.queue,date);
}
function complete(s,words,date=day()){const z=summary(s,words,date);return z.total>0&&z.done===z.total&&!(s.session?.date===date&&s.session.queue.length);}
function startWord(s,w,words,date=day()){
 const d=plan(s,words,date);if(s.session?.date===date&&s.session.queue.length)return 'busy';
 if(d.completed.includes(w.id)||d.reviewCompleted.includes(w.id)||d.notifiedAt)return 'done';
 if(!scheduledIds(d).includes(w.id))return 'quota';
 let q=[];
 if(d.ids.includes(w.id)){start(s,words,'daily',date);return 'ok';}
 else if(d.wordPending?.[w.id]?.length)q=d.wordPending[w.id].map(t=>({...t}));
 else {const skill=d.reviewSkills[w.id]||due(s,words,date).find(t=>t.id===w.id)?.skill||'spell';q=[{id:w.id,skill,kind:'review'}];}
 s.session={date,mode:'word',queue:q,done:0,total:q.length,correct:0,attempts:0,feedback:null,protocol:PROTOCOL};return 'ok';
}
function known(s,w,date=day()){for(const k of ['meaning','spell'])grade(s,w,k,true,{date});seedForms(s,w,date);s.assessments=s.assessments||{};s.assessments[w.id]={status:'known',screenedAt:date,maintenanceStep:0};for(const k of ['meaning','spell'])s.records[w.id][k].due=addDays(date,7);}
function mergeSession(s,words){/* Legacy queue migration is performed once, by plan(). */}
function valid(s,words){
 if(!s||s.version!==1||!s.records||Array.isArray(s.records)||typeof s.records!=='object'||!s.days||typeof s.days!=='object'||Array.isArray(s.days)||!Array.isArray(s.history))return false;
 const ids=new Set(words.map(w=>w.id));
 for(const [id,r]of Object.entries(s.records)){if(!ids.has(id)||!r||typeof r!=='object')return false;for(const [k,x]of Object.entries(r))if(!['meaning','spell','pt','pp'].includes(k)||!x||!Number.isInteger(x.level)||x.level< -1||x.level>4||!/^\d{4}-\d{2}-\d{2}$/.test(x.due)||!Number.isFinite(x.errors)||x.errors<0||!Number.isFinite(x.wins)||x.wins<0)return false;}
 for(const [date,d]of Object.entries(s.days)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(d.ids)||d.ids.length>15||d.ids.some(id=>!ids.has(id))||!Array.isArray(d.completed)||d.completed.some(id=>!d.ids.includes(id))||!Number.isFinite(d.answers)||!Number.isFinite(d.correct))return false;
  for(const k of ['reviewIds','reviewCompleted','touched'])if(d[k]!==undefined&&(!Array.isArray(d[k])||d[k].some(id=>!ids.has(id))))return false;
  if(d.reviewCompleted?.some(id=>!d.reviewIds?.includes(id)))return false;
 }
 if(s.assessments!==undefined){if(!s.assessments||typeof s.assessments!=='object'||Array.isArray(s.assessments))return false;for(const [id,p]of Object.entries(s.assessments))if(!ids.has(id)||!p||!['known','listening','new'].includes(p.status))return false;}
 if(s.session){const z=s.session;if(!Array.isArray(z.queue)||z.queue.length>2000||z.queue.some(t=>!ids.has(t.id)||!['learn','meaning','spell','pt','pp'].includes(t.skill))||!Number.isFinite(z.done)||!Number.isFinite(z.total))return false;}
 return true;
}
const api={PROTOCOL,FIRST,REVIEW,CAP,day,addDays,normalize,skills,sameForms,taskSkills,fresh,daily,due,plan,start,grade,known,valid,mergeSession,summary,answer,advance,complete,startWord,scheduledIds};
if(typeof module!=='undefined')module.exports=api;else root.PET=api;
})(typeof window!=='undefined'?window:globalThis);
