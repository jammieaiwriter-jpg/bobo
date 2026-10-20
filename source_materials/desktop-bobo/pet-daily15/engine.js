(function(root){
 'use strict';
 const intervals=[1,3,7,14,30];
 const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const addDays=(s,n)=>{let [y,m,d]=s.split('-').map(Number);return day(new Date(y,m-1,d+n,12));};
 const normalize=s=>s.trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
 const skills=w=>['meaning','spell',...(w.pt.length&&w.pp.length?['pt','pp']:[])];
 const fresh=()=>({version:1,records:{},days:{},session:null,exam:'2027-01-15',settings:{daily:15},history:[]});
 function daily(s,date=day()){return s.days[date]||(s.days[date]={ids:[],completed:[],answers:0,correct:0});}
 function due(s,words,date=day()){
   let q=[];for(let w of words){let r=s.records[w.id];if(!r)continue;for(let k of skills(w)){let x=r[k];if(x&&x.due<=date)q.push({id:w.id,skill:k,due:x.due,errors:x.errors||0});}}
   return q.sort((a,b)=>a.due.localeCompare(b.due)||b.errors-a.errors);
 }
 const ORDER_VERSION='mixed-scenes-v1',LIMIT=15;
 const SCENES=[{"id": "school", "title": "學校的一天"}, {"id": "home", "title": "在家過生活"}, {"id": "food", "title": "吃飯與點餐"}, {"id": "shopping", "title": "一起去買東西"}, {"id": "travel", "title": "搭車與出遊"}, {"id": "hobbies", "title": "放學後的興趣"}, {"id": "health", "title": "照顧自己的身體"}, {"id": "feelings", "title": "心情與朋友相處"}, {"id": "nature", "title": "看看天氣與大自然"}, {"id": "time", "title": "安排今天的生活"}, {"id": "communication", "title": "說話與傳遞訊息"}, {"id": "work", "title": "認識工作與城市"}, {"id": "learning", "title": "想一想與解決問題"}];
 const stableRank=w=>{let h=0;for(const c of w.id)h=(h*31+c.charCodeAt(0))>>>0;return h;};
 const commonSort=(a,b)=>(a.commonRank??999)-(b.commonRank??999)||a.word.length-b.word.length||stableRank(a)-stableRank(b);
 function plan(s,words,date=day()){
  let d=daily(s,date);s.settings={...s.settings,daily:LIMIT};
  if(d.orderVersion!==ORDER_VERSION){
   const untouched=d.answers===0&&d.completed.length===0&&!d.ids.some(id=>s.records[id]);
   if(untouched){d.ids=[];if(s.session?.date===date&&['daily','new'].includes(s.session.mode)&&!s.session.attempts)s.session=null;}
   if(!untouched){d.sceneTitle=d.sceneTitle||'原有學習計畫';d.sceneWordIds=d.sceneWordIds||[];d.commonWordIds=d.commonWordIds||d.ids.slice();}
   d.orderVersion=ORDER_VERSION;
  }
  if(d.ids.length>=LIMIT)return d;
  const selected=new Set(d.ids),pool=words.filter(w=>!s.records[w.id]&&!selected.has(w.id));if(!pool.length)return d;
  const sceneGoal=Math.round(LIMIT*.6),commonGoal=LIMIT-sceneGoal;
  let scene=SCENES.find(x=>x.id===d.sceneId);
  if(!scene){const prior=Object.entries(s.days).filter(([k,v])=>k<date&&v.answers>0).length;const rotated=SCENES.map((_,i)=>SCENES[(prior+i)%SCENES.length]);scene=rotated.find(x=>pool.filter(w=>w.learningScene===x.id).length>=sceneGoal)||rotated.find(x=>pool.some(w=>w.learningScene===x.id))||{id:'general',title:'綜合實用'};}
  const scenePool=pool.filter(w=>w.learningScene===scene.id).sort((a,b)=>a.sceneRank-b.sceneRank||commonSort(a,b));
  const sceneWords=scenePool.slice(0,sceneGoal),sceneIds=new Set(sceneWords.map(w=>w.id));
  const commonWords=pool.filter(w=>!sceneIds.has(w.id)&&w.learningScene!==scene.id).sort(commonSort).slice(0,commonGoal);
  const used=new Set([...sceneWords,...commonWords].map(w=>w.id));
  const spare=pool.filter(w=>!used.has(w.id)).sort(commonSort);
  const additions=[];for(let i=0;additions.length<LIMIT-d.ids.length;i++){let w=(i%5<3?sceneWords.shift():commonWords.shift())||sceneWords.shift()||commonWords.shift()||spare.shift();if(!w)break;additions.push(w);}
  d.sceneId=scene.id;d.sceneTitle=scene.title;d.ids.push(...additions.map(w=>w.id));
  d.sceneWordIds=d.ids.filter(id=>words.find(w=>w.id===id)?.learningScene===scene.id);
  d.commonWordIds=d.ids.filter(id=>!d.sceneWordIds.includes(id));return d;
 }
 function start(s,words,mode='daily',date=day()){
   if(mode==='daily'||mode==='new')plan(s,words,date);
   if(s.session?.date===date&&s.session.queue.length)return s.session;
   let q=[];if(mode!=='new')q=due(s,words,date).filter(t=>mode!=='errors'||t.errors>0).slice(0,mode==='errors'?60:30).map(({id,skill})=>({id,skill}));
   if(mode==='daily'||mode==='new'){
     let d=plan(s,words,date);
     for(let id of d.ids){if(d.completed.includes(id))continue;let w=words.find(w=>w.id===id);if(!w)continue;
       let existing=s.records[id];let missing=skills(w).filter(k=>!existing?.[k]);
       if(missing.length){q.push({id,skill:'learn'});for(let skill of missing)q.push({id,skill});}
     }
   }
   s.session={date,mode,queue:q,done:0,total:q.length,correct:0,attempts:0,feedback:null};return s.session;
 }
 function grade(s,w,skill,ok,{hint=false,retry=false,date=day()}={}){
   let r=s.records[w.id]||(s.records[w.id]={});let old=r[skill]||{level:-1,errors:0,wins:0};
   let success=ok&&!hint;let sameDay=old.last===date;
   let level=success&&!sameDay?Math.min(4,old.level+1):success?old.level:0;
   let dueDate=success&&!sameDay?addDays(date,intervals[level]):sameDay&&success?old.due:addDays(date,1);
   r[skill]={...old,level,last:date,due:dueDate,errors:old.errors+(success?0:1),wins:success?old.wins+(!sameDay?1:0):0,lastOK:success};
   let d=daily(s,date);d.answers++;if(success)d.correct++;
   if(d.ids.includes(w.id)&&skills(w).every(k=>r[k])&&!d.completed.includes(w.id))d.completed.push(w.id);
   s.history.push({date,id:w.id,skill,ok:success});s.history=s.history.slice(-5000);
   return success;
 }
 function known(s,w,date=day()){
   let r=s.records[w.id]||(s.records[w.id]={});for(let k of skills(w))r[k]={level:2,errors:r[k]?.errors||0,wins:1,last:date,due:addDays(date,7),lastOK:true,screened:true};
   let d=daily(s,date);if(d.ids.includes(w.id)&&!d.completed.includes(w.id))d.completed.push(w.id);
 }
 function valid(s,words){
   if(!s||s.version!==1||!s.records||Array.isArray(s.records)||typeof s.records!=='object'||!s.days||typeof s.days!=='object'||Array.isArray(s.days)||!Array.isArray(s.history))return false;
   let ids=new Set(words.map(w=>w.id));
   for(let [id,r] of Object.entries(s.records)){if(!ids.has(id)||!r||typeof r!=='object')return false;for(let [k,x] of Object.entries(r)){if(!['meaning','spell','pt','pp'].includes(k)||!x||!Number.isInteger(x.level)||x.level< -1||x.level>4||!/^\d{4}-\d{2}-\d{2}$/.test(x.due)||!Number.isFinite(x.errors)||x.errors<0||!Number.isFinite(x.wins)||x.wins<0)return false;}}
   for(let [date,d] of Object.entries(s.days)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(d.ids)||d.ids.length>15||d.ids.some(id=>!ids.has(id))||!Array.isArray(d.completed)||d.completed.some(id=>!d.ids.includes(id))||!Number.isFinite(d.answers)||!Number.isFinite(d.correct))return false;}
   if(s.session){let z=s.session;if(!Array.isArray(z.queue)||z.queue.length>2000||z.queue.some(t=>!ids.has(t.id)||!['learn','meaning','spell','pt','pp'].includes(t.skill))||!Number.isFinite(z.done)||!Number.isFinite(z.total))return false;}
   return true;
 }
 const api={day,addDays,normalize,skills,fresh,daily,due,plan,start,grade,known,valid};
 if(typeof module!=='undefined')module.exports=api;else root.PET=api;
})(typeof window!=='undefined'?window:globalThis);
