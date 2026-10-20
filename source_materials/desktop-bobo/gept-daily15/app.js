'use strict';
const E=window.PET, KEY='gept-daily15-v1', $=s=>document.querySelector(s), main=$('#main');
const labels={meaning:'意思辨識',spell:'單字拼寫',pt:'過去式 PT',pp:'過去分詞 PP',learn:'新字學習'};
let words=[],byId={},state,view='home',filter='all',search='',visible=50,hinted=false,installPrompt=null,writeBlocked=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>s.replace(/-/g,' / ');
const today=()=>E.day();
const toast=s=>{let el=$('#toast');el.textContent=s;el.style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.style.display='none',3800);};
function persist(){if(writeBlocked)return false;try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch(e){writeBlocked=true;toast('無法儲存進度，請先匯出備份並檢查瀏覽器儲存空間。');return false;}}
function load(){try{let raw=localStorage.getItem(KEY);if(!raw)return E.fresh();let s=JSON.parse(raw);if(!E.valid(s,words))throw Error();return s;}catch(e){writeBlocked=true;return E.fresh();}}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').showModal();}
$('#closeModal').onclick=()=>$('#modal').close();
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close();});
function speak(text){if(!('speechSynthesis'in window)){toast('這個瀏覽器沒有提供語音朗讀。');return;}speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang='en-GB';u.rate=.85;let vs=speechSynthesis.getVoices();u.voice=vs.find(v=>v.lang==='en-GB')||vs.find(v=>v.lang.startsWith('en'))||null;u.onerror=()=>toast('目前無法播放發音；離線時需先有手機英文語音。');speechSynthesis.speak(u);}
const sound=w=>`<button class="sound" data-speak="${esc(w.answers[0])}" aria-label="播放 ${esc(w.word)} 發音">♪</button>`;
const formSound=(text,label)=>`<button type="button" class="sound" data-speak="${esc(text)}" aria-label="播放${esc(label)} ${esc(text)} 發音">♪</button>`;
const forms=w=>w.pt.length&&w.pp.length?`<div class="form-grid">${[['原形',[w.answers[0]]],['過去式 PT',w.pt],['過去分詞 PP',w.pp]].map(([label,values])=>`<div><small>${label}</small>${values.map(value=>`<div class="form-pronunciation"><b>${esc(value)}</b>${formSound(value,label)}</div>`).join('')}</div>`).join('')}</div>`:'';
function example(w){return w.example?`<div class="example">${esc(w.example)}<small>${esc(w.exampleZh)}</small></div>`:w.sourceExample?`<div class="example">${esc(w.sourceExample)}<small>單字表中的用法提示</small></div>`:'';}
function stats(){let rs=Object.values(state.records);let learned=rs.length,mastered=words.filter(w=>{let r=state.records[w.id];return r&&E.skills(w).every(k=>r[k]?.wins>=3);}).length;let errors=words.filter(w=>Object.values(state.records[w.id]||{}).some(x=>x.errors>0&&(!x.lastOK||x.wins<3))).length;return{learned,mastered,errors,due:E.due(state,words)};}
function navigate(){view=location.hash.slice(1)||'home';if(!['home','library','errors','settings','practice'].includes(view))view='home';render();}
function render(){
 if(state.session&&state.session.date!==today()){state.session=null;persist();}
 document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===view));
 if(view==='practice')practice();else if(view==='library')library();else if(view==='errors')errors();else if(view==='settings')settings();else home();
 window.scrollTo(0,0);
}

const NOTIFY_ENDPOINT='https://bobo-math-notify.bobo-math-grader.workers.dev';
let notifying=false;
function taskReady(){const d=E.daily(state);return d.ids.length>0&&d.completed.length===d.ids.length&&E.due(state,words).length===0&&!(state.session?.date===today()&&state.session.queue.length);}
function dailyAttemptStats(){const d=E.daily(state);if(!d.itemAttempts){d.itemAttempts={};for(const h of state.history.filter(h=>h.date===today())){const key=h.id+'|'+h.skill;const x=d.itemAttempts[key]||(d.itemAttempts[key]={attempts:0,successes:0});x.attempts++;if(h.ok)x.successes++;}}return d.itemAttempts;}
function completionMessage(name){const d=E.daily(state),items=dailyAttemptStats();const lines=Object.entries(items).sort(([a],[b])=>a.localeCompare(b)).map(([key,x])=>{const [id,skill]=key.split('|');return `${byId[id]?.word||id} · ${labels[skill]||skill}：${x.attempts} 次，無提示答對 ${x.successes} 次`;});return `${name} 國中＋GEPT 初級每日單字完成。\n日期：${today()}\n新字 Completed ${d.completed.length} / ${d.ids.length}\n總練習：${d.answers} 次\n無提示答對：${d.correct} / ${d.answers}\n到期複習：已完成\n口說：本版未設口說測驗\n單字練習明細：\n${lines.join('\n')}`;}
function reportParts(text){const parts=[];let current='';for(const line of text.split('\n')){if(current.length+line.length+1>3200){parts.push(current);current='';}current+=(current?'\n':'')+line;}if(current)parts.push(current);return parts.map((part,i)=>parts.length>1?`GEPT 完成回報 (${i+1}/${parts.length})\n${part}`:part);}
function maybeAutoNotify(){const d=E.daily(state);if(!d.notifiedAt&&!d.autoNotifyTried&&state.settings.learnerName&&taskReady()&&!writeBlocked){d.autoNotifyTried=true;persist();notifyEmma();}}
function notificationCard(){const d=E.daily(state),sent=!!d.notifiedAt,ready=taskReady();return `<section class="card"><h3>今天完成任務，通知 Emma</h3><p class="muted">比照 OiKID，完成今日新字與到期複習後自動回報到 Emma 的 Telegram；若未收到，可按下方按鈕補送。</p><label for="learnerName">孩子稱呼</label><input id="learnerName" type="text" maxlength="24" autocomplete="off" placeholder="例如：Bobo" value="${esc(state.settings.learnerName||'')}" ${sent?'disabled':''}><button id="notifyEmma" type="button" class="primary" style="margin-top:12px" ${sent||!ready||notifying||writeBlocked?'disabled':''}>${sent?'✓ 今天已通知 Emma':notifying?'正在傳送…':'今天任務完成，通知 Emma'}</button><p id="notifyStatus" class="muted" role="status">${sent?'今天的完成紀錄已傳送。':ready?'準備好了！請填寫稱呼後傳送。':'先完成今日新字、到期複習及目前回合，再來通知。'}</p></section>`;}
function bindNotification(){const input=$('#learnerName');if(input)input.onchange=()=>{state.settings.learnerName=input.value.trim().slice(0,24);persist();maybeAutoNotify();};const button=$('#notifyEmma');if(button)button.onclick=notifyEmma;}
async function notifyEmma(){
 if(notifying||writeBlocked)return;
 const date=today(),d=E.daily(state);if(d.notifiedAt){toast('今天已通知 Emma。');return;}if(!taskReady()){toast('請先完成今天的任務。');return;}
 const name=($('#learnerName')?.value||'').trim().slice(0,24);if(!name){toast('請先填寫孩子稱呼。');$('#learnerName')?.focus();return;}
 state.settings.learnerName=name;if(!persist())return;notifying=true;const button=$('#notifyEmma');if(button){button.disabled=true;button.textContent='正在傳送…';}
 const parts=d.notificationReportParts||(d.notificationReportParts=reportParts(completionMessage(name)));persist();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{for(let i=d.notificationSentParts||0;i<parts.length;i++){const response=await fetch(NOTIFY_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:parts[i],to:'default'}),signal:controller.signal});const result=await response.json();if(!response.ok||result.ok!==true)throw Error('send_failed');d.notificationSentParts=i+1;persist();}d.notifiedAt=new Date().toISOString();persist();toast('已通知 Emma！');}
 catch(error){toast('傳送未成功，請檢查網路後再試；若已收到通知，就不必重送。');}
 finally{clearTimeout(timer);notifying=false;if(view==='home'||view==='practice')render();}
}
function home(){
 let date=today(),d=E.plan(state,words,date);if(!writeBlocked)persist();let st=stats(),count=d.completed.length,newCount=d.ids.filter(id=>!d.completed.includes(id)).length;
 let upcoming=d.ids.filter(id=>!d.completed.includes(id)).slice(0,3).map(id=>byId[id]);
 let exam=state.exam;let remain=exam?Math.ceil((new Date(exam+'T23:59:59')-new Date())/86400000):null;
 let days=Object.keys(state.days).filter(k=>state.days[k].answers>0);let streak=0,cursor=date;if(!days.includes(cursor))cursor=E.addDays(cursor,-1);while(days.includes(cursor)){streak++;cursor=E.addDays(cursor,-1);}
 main.innerHTML=`<div class="eyebrow">${fmt(date)} · YOUR DAILY PRACTICE</div><h1>今天，也前進一點。</h1><div class="exam-date">國中＋GEPT 初級 · ${remain===null?'每天累積基本字彙':remain>0?`距設定考試日 ${remain} 天`:'持續練習，累積實力'} <a href="#settings">調整日期</a></div>
 <section class="hero"><div class="hero-top"><div><div class="eyebrow">DAILY GOAL</div><h2>${count>=15?'今日新字完成了。':'15 個新字，<br>一步一步記牢。'}</h2><p>${st.due.length?`${st.due.length} 項能力到期複習，先喚醒記憶。`:'先懂意思，再練到能拼出來。'}</p></div><div class="ring" style="--angle:${count/15*360}deg"><div class="ring-inner"><strong>${count}<span style="font-size:14px;color:#9db3a4"> / 15</span></strong><small>今日新字</small></div></div></div><button id="startDaily" class="primary">${state.session?.queue.length?'繼續上次練習 →':count>=15&&!st.due.length?'再看看今天的成果 ✓':'開始今日練習 →'}</button></section>
 <div class="stats"><div class="stat"><b>${st.learned}</b><span>已接觸單字 / ${words.length}</span></div><div class="stat"><b>${st.mastered}</b><span>跨日熟練單字</span></div><div class="stat"><b>${streak}<small style="font-size:12px"> 天</small></b><span>連續練習</span></div></div>
 <div class="section-head"><h2>今天的練習路線</h2><span class="pill">每天 15 字</span></div><div class="card"><div class="row"><div><h3>01　到期複習</h3><span class="muted">意思、拼字、動詞變化分開追蹤</span></div><b>${st.due.length}<small class="muted"> 項</small></b></div><div style="height:1px;background:var(--line);margin:15px 0"></div><div class="row"><div><h3>02　今日新字</h3><span class="muted">每個動詞連同 PT、PP 一起學</span></div><b>${newCount}<small class="muted"> 待練</small></b></div><div class="daily-strip">${Array.from({length:15},(_,i)=>`<span class="${i<count?'done':''}"></span>`).join('')}</div></div>
 <div class="section-head"><h2>${upcoming.length?'即將認識':'今天已完成'}</h2><a href="#library" class="text-btn">全部單字</a></div>${(upcoming.length?upcoming:d.ids.slice(0,3).map(id=>byId[id])).map(w=>`<div class="card word-preview"><div><b>${esc(w.word)}</b><small>${esc(w.pos)} ${w.phonetic?' /'+esc(w.phonetic)+'/':''}</small><div class="meaning">${esc(w.meaning)}</div></div>${sound(w)}</div>`).join('')}
 <div class="safe-note">新字完成表示今天已練過；跨日熟練需每項能力在至少 3 個不同日子無提示答對。<br>複習間隔：1、3、7、14、30 天。三態不另占新字名額。</div>${notificationCard()}<footer>國中＋GEPT 初級 · 本機整理字庫 · 個人練習工具</footer>`;
 $('#startDaily').onclick=()=>startSession('daily');bindNotification();maybeAutoNotify();
}
function startSession(mode){if(writeBlocked){toast('目前進度未能儲存，請先在設定匯出備份。');return;}E.start(state,words,mode);persist();view='practice';location.hash='practice';render();}
function choices(w){let options=[w];let pool=words.filter(x=>x.id!==w.id&&x.meaning!==w.meaning);let seed=[...w.id].reduce((a,c)=>a+c.charCodeAt(0),0);for(let i=0;options.length<4;i++){let x=pool[(seed*13+i*277)%pool.length];if(!options.some(o=>o.meaning===x.meaning))options.push(x);}let rotate=seed%4;return options.slice(rotate).concat(options.slice(0,rotate));}
function answers(w,k){return k==='spell'?w.answers:k==='pt'?w.pt:k==='pp'?w.pp:[];}
function context(w,k){
 const contexts={
 'go':{pt:['Yesterday, I ___ to the library.','昨天我去了圖書館。'],pp:['She has ___ home.','她已經回家了。']},
 'buy':{pt:['I ___ a new book yesterday.','我昨天買了一本新書。'],pp:['I have already ___ the tickets.','我已經買好票了。']},
 'do':{pt:['I ___ my homework last night.','我昨晚做了作業。'],pp:['I have already ___ my homework.','我已經做完作業了。']},
 'write':{pt:['She ___ an email yesterday.','她昨天寫了一封電子郵件。'],pp:['The email was ___ in English.','這封電子郵件是用英文寫的。']},
 'see':{pt:['We ___ a film last night.','我們昨晚看了一部電影。'],pp:['I have ___ that film before.','我以前看過那部電影。']},
 'eat':{pt:['We ___ lunch at noon.','我們中午吃了午餐。'],pp:['I have already ___ lunch.','我已經吃過午餐了。']},
 'take':{pt:['He ___ the bus yesterday.','他昨天搭了公車。'],pp:['She has ___ her umbrella.','她已經帶走她的傘。']},
 'break':{pt:['He ___ the glass yesterday.','他昨天打破了玻璃杯。'],pp:['The window was ___ yesterday.','窗戶昨天被打破了。']},
 'give':{pt:['She ___ me a present.','她送了我一份禮物。'],pp:['I have ___ him my phone number.','我已經給他我的電話號碼了。']},
 'choose':{pt:['We ___ this hotel last week.','我們上週選了這家旅館。'],pp:['We have ___ a name for our team.','我們已經為團隊選好名字了。']},
 'speak':{pt:['I ___ to the teacher yesterday.','我昨天和老師說了話。'],pp:['I have already ___ to her.','我已經和她說過話了。']},
 'read':{pt:['I ___ this book last week.','我上週讀了這本書。'],pp:['Have you ___ this book?','你讀過這本書嗎？']},
 'borrow':{pt:['I ___ a book from the library.','我向圖書館借了一本書。'],pp:['I have ___ three books.','我已經借了三本書。']},
 'lend':{pt:['He ___ me his pen.','他把筆借給我。'],pp:['I have ___ my bike to Tom.','我已經把腳踏車借給 Tom。']},
 'spend':{pt:['I ___ an hour reading yesterday.','我昨天花了一小時閱讀。'],pp:['We have ___ all our money.','我們已經花光所有的錢。']},
 'decide':{pt:['We ___ to stay at home.','我們決定待在家。'],pp:['We have ___ to take the train.','我們已經決定搭火車。']},
 'enjoy':{pt:['I ___ the concert last night.','我很享受昨晚的演唱會。'],pp:['I have always ___ reading.','我一直很喜歡閱讀。']},
 'suggest':{pt:['She ___ taking the bus.','她建議搭公車。'],pp:['She has ___ a different plan.','她已經提出另一個計畫。']},
 'advise':{pt:['The teacher ___ me to practise more.','老師建議我多練習。'],pp:['I have ___ him to rest.','我已經建議他休息。']},
 'avoid':{pt:['We ___ the busy road.','我們避開了繁忙的道路。'],pp:['We have ___ making the same mistake.','我們已避免犯同樣的錯。']},
 'arrange':{pt:['I ___ a meeting yesterday.','我昨天安排了一場會議。'],pp:['We have ___ a taxi.','我們已經安排好計程車。']},
 'attend':{pt:['I ___ the meeting last week.','我上週出席了會議。'],pp:['She has ___ every class.','她每堂課都出席了。']},
 'invite':{pt:['We ___ our friends to dinner.','我們邀請朋友來吃晚餐。'],pp:['I have ___ everyone in my class.','我已經邀請了班上所有人。']},
 'prepare':{pt:['I ___ dinner last night.','我昨晚準備了晚餐。'],pp:['We have ___ everything for the trip.','我們已經準備好旅行需要的一切。']},
 'prefer':{pt:['She ___ the blue dress.','她比較喜歡那件藍色洋裝。'],pp:['I have always ___ tea to coffee.','我一直比較喜歡茶勝過咖啡。']},
 'promise':{pt:['He ___ to help me.','他答應幫助我。'],pp:['She has ___ to call tonight.','她已經答應今晚打電話。']},
 'provide':{pt:['The hotel ___ breakfast.','旅館提供了早餐。'],pp:['They have ___ all the equipment.','他們已經提供了所有器材。']},
 'recommend':{pt:['She ___ this restaurant.','她推薦了這家餐廳。'],pp:['My teacher has ___ this book.','我的老師已經推薦了這本書。']},
 'remind':{pt:['He ___ me to bring my ticket.','他提醒我帶票。'],pp:['I have ___ her about the meeting.','我已經提醒她會議的事。']},
 'improve':{pt:['My English ___ last year.','我的英文去年進步了。'],pp:['My English has ___ a lot.','我的英文已經進步很多。']},
 'accept':{pt:['She ___ my invitation.','她接受了我的邀請。'],pp:['They have ___ our offer.','他們已經接受了我們的提議。']}
 };return contexts[w.id]?.[k];
}
function practice(){
 let ss=state.session;if(!ss||!ss.queue.length){finish(ss);return;}
 let t=ss.queue[0],w=byId[t.id];if(!w){ss.queue.shift();persist();practice();return;}
 let f=ss.feedback;hinted=!!ss.hinted;
 let pct=Math.round(ss.done/(ss.done+ss.queue.length)*100);
 let contextPair=context(w,t.skill);
 main.innerHTML=`<div class="practice-head"><button id="pause">← 暫停，保留進度</button><span>${ss.done} / ${ss.done+ss.queue.length} 步</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="row"><span class="pill">${labels[t.skill]}</span><span class="muted">${t.retry?'錯題再練':state.days[today()]?.ids.includes(w.id)?'今日新字':'到期複習'}</span></div><section class="question">
 ${t.skill==='learn'?`<div class="learn-banner">先認識這個字，再用小測驗記住它。</div><div class="row"><h1 class="question-word">${esc(w.word)}</h1>${sound(w)}</div><div class="phonetic">${esc(w.pos)} ${w.phonetic?'/'+esc(w.phonetic)+'/':''}</div><p class="question-meaning">${esc(w.meaning)}</p>${forms(w)}${w.note?`<p class="note">${esc(w.note)}</p>`:''}${example(w)}<p class="note">這個字的 PT／PP ${w.pt.length?'會分開練習，三態算同一個新字。':'不適用或尚未列入本題庫。'}</p><div class="actions"><button id="learnNext" class="primary">記住了，試試看 →</button><button id="quickKnown" class="text-btn">我已熟悉，先做拼字小測驗</button></div>`:
 t.skill==='meaning'?`<div class="row"><h1 class="question-word">${esc(w.word)}</h1>${sound(w)}</div><div class="phonetic">${esc(w.pos)}</div><p class="muted">選出符合這個字的意思。</p><div class="options">${choices(w).map((o,i)=>`<button class="option ${f&&o.id===w.id?'selected':''} ${f&&!f.ok&&o.id===f.selected?'wrong':''}" data-choice="${esc(o.id)}" ${f?'disabled':''}><span>${'ABCD'[i]}</span>${esc(o.meaning)}</button>`).join('')}</div>`:
 `<h2 class="question-meaning">${t.skill==='spell'?esc(w.meaning):esc(w.answers[0])}</h2><p class="muted">${t.skill==='spell'?`${esc(w.pos)} · 輸入對應的英文單字或片語。<br>開頭 ${esc(w.answers[0][0])} · ${w.answers[0].length} 個字元`:`輸入這個動詞的${t.skill==='pt'?'過去式（PT）':'過去分詞（PP）'}。`}</p>${contextPair?`<div class="example">${esc(contextPair[0])}<small>${esc(contextPair[1])}</small></div>`:''}<form id="answerForm"><label class="compact" for="answer">${t.skill==='spell'?'英文答案':labels[t.skill]}</label><input class="answer-input" id="answer" name="answer" lang="en" type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" placeholder="輸入答案…" ${f?'disabled':''} value="${esc(f?.typed||'')}"><div class="row"><button type="button" id="hint" class="text-btn" ${f?'disabled':''}>給我提示</button>${t.skill==='spell'?'<button type="button" id="listenHint" class="text-btn">聽發音提示 ♪</button>':''}</div>${hinted?`<div class="hint">提示：${esc(answers(w,t.skill)[0].slice(0,2))}…（${answers(w,t.skill)[0].length} 個字元）<br>使用提示會安排隔天再練。</div>`:''}<button class="primary" type="submit" ${f?'disabled':''}>確認答案</button></form>`}</section>
 ${f?`<div class="feedback ${f.ok?'':'bad'}" role="status"><strong>${f.ok?'答對了！':f.rawOK?'提示後答對，再練一次。':'再記一次，會更熟。'}</strong><p>${t.skill==='meaning'?esc(w.word)+'：'+esc(w.meaning):'答案：<b>'+esc(answers(w,t.skill).join(' / '))+'</b>'}</p>${t.skill==='pt'||t.skill==='pp'?forms(w):''}<p>${f.ok?(t.retry?'今天訂正完成，仍會隔天複習。':'已記錄，下次按間隔複習。'):'已加入隔天複習；這回合稍後會再出現。'}</p>${w.note?`<p class="note">${esc(w.note)}</p>`:''}${example(w)}</div><button id="next" class="primary">下一題 →</button>`:''}
 <p class="safe-note">${t.skill==='pp'?'PP 是過去分詞，可用於完成式或被動語態。':t.skill==='pt'?'PT 是過去式，常用來描述已發生的事情。':'先試著回想，答錯也沒關係。'} <span>來源：整理字庫第 ${w.sourceRow} 筆。</span></p>`;
 $('#pause').onclick=()=>{persist();location.hash='home';};
 if(t.skill==='learn'){
   $('#learnNext').onclick=()=>{ss.queue.shift();ss.done++;persist();practice();};
   $('#quickKnown').onclick=()=>{ss.queue=ss.queue.filter((x,i)=>i===0||x.id!==w.id);ss.queue[0]={id:w.id,skill:'spell',screen:true};ss.feedback=null;ss.hinted=false;persist();practice();};
 }else if(t.skill==='meaning'){
   document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>submit(b.dataset.choice===w.id,{selected:b.dataset.choice}));
 }else{
   $('#answerForm').onsubmit=e=>{e.preventDefault();let typed=$('#answer').value;if(!typed.trim()){toast('先輸入你的答案。');return;}submit(answers(w,t.skill).some(a=>E.normalize(a)===E.normalize(typed)),{typed});};
   $('#hint').onclick=()=>{ss.hinted=true;persist();practice();};
   if($('#listenHint'))$('#listenHint').onclick=()=>{ss.hinted=true;speak(w.answers[0]);persist();};
 }
 if(f)$('#next').onclick=()=>{ss.queue.shift();ss.done++;ss.feedback=null;ss.hinted=false;persist();practice();window.scrollTo(0,0);};
}
function submit(rawOK,extra){let ss=state.session;if(ss.feedback)return;let t=ss.queue[0],w=byId[t.id];let items=dailyAttemptStats();let ok=E.grade(state,w,t.skill,rawOK,{hint:!!ss.hinted,retry:!!t.retry});let key=w.id+'|'+t.skill;let item=items[key]||(items[key]={attempts:0,successes:0});item.attempts++;if(ok)item.successes++;
 if(t.screen&&ok){E.known(state,w);}
 if(t.screen&&!ok){let missing=E.skills(w).filter(k=>k!=='spell'&&!state.records[w.id]?.[k]);ss.queue.splice(1,0,...missing.map(skill=>({id:w.id,skill})));}
 if(!ok&&(t.retries||0)<2){ss.queue.splice(Math.min(5,ss.queue.length),0,{id:w.id,skill:t.skill,retry:true,retries:(t.retries||0)+1});}
 ss.attempts++;if(ok)ss.correct++;ss.feedback={ok,rawOK,...extra};persist();practice();setTimeout(()=>$('#next')?.scrollIntoView({behavior:'smooth',block:'nearest'}),80);}
function finish(ss){let d=E.daily(state),st=stats();let completed=d.completed.length;
 main.innerHTML=`<div class="eyebrow">TODAY'S PROGRESS</div><div class="empty"><div class="finish-icon">✦</div><h1>${ss?.attempts?'這一回合，完成了。':'今天的記憶，已就位。'}</h1><p class="muted">${completed>=15?'15 個新字已練習，明天再讓記憶更牢。':completed+' / 15 個今日新字已完成。'}</p></div><div class="stats"><div class="stat"><b>${completed}</b><span>今日新字</span></div><div class="stat"><b>${ss?.attempts?Math.round(ss.correct/ss.attempts*100):0}%</b><span>本回合無提示答對</span></div><div class="stat"><b>${st.due.length}</b><span>仍到期的能力項目</span></div></div><div class="card"><h3>答錯的字，有下一次機會。</h3><p class="muted">今天訂正完成的題目，隔天仍會出現。隔幾天還能想起來，才是記住了。</p></div>${notificationCard()}<div class="gap">${st.due.length?'<button id="moreReview" class="primary">繼續到期複習</button>':''}<a href="#home" class="secondary">回到今日首頁</a></div>`;
 bindNotification();maybeAutoNotify();if($('#moreReview'))$('#moreReview').onclick=()=>{state.session=null;startSession('review');};
}
function item(w,errorMode=false){let r=state.records[w.id],bad=Object.entries(r||{}).filter(([k,x])=>x.errors>0&&(!x.lastOK||x.wins<3));return `<button class="word-item" data-detail="${esc(w.id)}"><div class="row"><div><b>${esc(w.word)}</b><span class="pos">${esc(w.pos)}</span></div><span class="pill">${!r?'未開始':E.skills(w).every(k=>r[k]?.wins>=3)?'跨日熟練':'學習中'}</span></div><p>${esc(w.meaning)}</p>${errorMode?`<div class="list-meta"><span>${bad.map(([k])=>labels[k]).join('、')}</span><span class="badge-error">累計 ${bad.reduce((n,[k,x])=>n+x.errors,0)} 次需加強</span></div>`:''}</button>`;}
function library(){main.innerHTML=`<div class="eyebrow">YOUR WORD COLLECTION</div><h1>把單字，慢慢變熟。</h1><p class="muted">${words.length} 個詞條 · 依本機 GEPT 整理字庫製作</p><input id="search" type="search" placeholder="搜尋英文或中文…" aria-label="搜尋單字" value="${esc(search)}"><div class="tabs">${[['all','全部'],['verbs','動詞三態'],['new','未開始'],['learning','學習中'],['mastered','跨日熟練']].map(([k,v])=>`<button class="tab ${filter===k?'active':''}" data-filter="${k}">${v}</button>`).join('')}</div><div id="listCount" class="muted"></div><div id="wordList" class="word-list"></div><button id="loadMore" class="text-btn" style="width:100%">顯示更多</button>`;
 $('#search').oninput=e=>{search=e.target.value;visible=50;drawList();};document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;visible=50;library();});$('#loadMore').onclick=()=>{visible+=50;drawList();};drawList();}
function drawList(){let query=E.normalize(search);let list=words.filter(w=>{let r=state.records[w.id],mastered=r&&E.skills(w).every(k=>r[k]?.wins>=3);return (!query||`${w.word} ${w.meaning} ${w.pt.join(' ')} ${w.pp.join(' ')}`.toLowerCase().includes(query))&&(filter==='all'||filter==='verbs'&&w.pt.length&&w.pp.length||filter==='new'&&!r||filter==='learning'&&r&&!mastered||filter==='mastered'&&mastered);});$('#listCount').textContent=`找到 ${list.length} 個詞條`;$('#wordList').innerHTML=list.slice(0,visible).map(w=>item(w)).join('')||'<div class="empty"><p>沒有符合的單字，試試其他關鍵字。</p></div>';$('#loadMore').hidden=list.length<=visible;}
function detail(w){let r=state.records[w.id]||{};modal(`<div class="eyebrow">WORD NOTE · #${w.sourceRow}</div><div class="row"><h2 class="modal-title">${esc(w.word)}</h2>${sound(w)}</div><p class="muted">${esc(w.pos)} ${w.phonetic?'/'+esc(w.phonetic)+'/':''}</p><h3 style="font-size:22px">${esc(w.meaning)}</h3>${forms(w)}${w.id==='lie'?'<p class="note">躺：lie–lay–lain；說謊：lie–lied–lied。三態題接受兩種詞義的對應形式。</p>':''}${w.note?`<p class="note">${esc(w.note)}</p>`:''}${example(w)}${E.skills(w).map(k=>`<div class="metric-line"><span>${labels[k]}</span><span>${r[k]?`${r[k].wins} 個不同日子答對 · ${r[k].due} 再練`:'尚未練習'}</span></div>`).join('')}<div class="actions"><button class="primary" id="practiceWord">練習這個字</button></div><p class="note">中文是輔助釋義，非官方翻譯；實際意思需配合上下文。發音使用手機提供的英文語音。</p>`);$('#practiceWord').onclick=()=>{if(state.session?.queue.length){toast('請先完成或在設定結束目前回合，再做單字練習。');return;}state.session={date:today(),mode:'word',queue:[{id:w.id,skill:'learn'},...E.skills(w).map(skill=>({id:w.id,skill}))],done:0,total:E.skills(w).length+1,correct:0,attempts:0,feedback:null};persist();$('#modal').close();location.hash='practice';render();};}
function errors(){let list=words.filter(w=>Object.values(state.records[w.id]||{}).some(x=>x.errors>0&&(!x.lastOK||x.wins<3)));let eligible=E.due(state,words).filter(t=>t.errors>0).length;
 main.innerHTML=`<div class="eyebrow">A LITTLE MORE PRACTICE</div><h1>錯過一次，再記牢。</h1><p class="muted">${list.length} 個單字需要加強 · ${eligible} 項能力今天到期</p>${eligible?'<button id="startErrors" class="primary">開始到期錯題複習 →</button>':''}<p class="safe-note">今天訂正後，明天仍會再練。每項能力在 3 個不同日子無提示答對，且最近一次答對，才移出錯題本。</p><div class="word-list">${list.slice(0,100).map(w=>item(w,true)).join('')||'<div class="empty"><div class="symbol">✧</div><h2>目前沒有待加強的錯題</h2><p class="muted">開始練習後，需要複習的字會自動出現在這裡。</p></div>'}</div>${list.length>100?'<p class="note">先顯示前 100 個，完成後會逐步更新。</p>':''}`;
 if($('#startErrors'))$('#startErrors').onclick=()=>startSession('errors');}
function settings(){let st=stats();let d=E.daily(state);main.innerHTML=`<div class="eyebrow">MAKE IT YOUR ROUTINE</div><h1>適合你的練習節奏。</h1><section class="settings-section"><h2>學習目標</h2><div class="metric-line"><span>每日新字</span><b>15 個</b></div><div class="metric-line"><span>來源</span><span>本機 GEPT 初級整理字庫</span></div><p>可選填實際考試日期；未設定時不顯示倒數。</p><label for="examDate">考試日期</label><input id="examDate" type="date" value="${esc(state.exam||'')}"></section><section class="settings-section"><h2>你的累積</h2><div class="metric-line"><span>已接觸 / 跨日熟練</span><b>${st.learned} / ${st.mastered}</b></div><div class="metric-line"><span>今天無提示答對</span><span>${d.correct} / ${d.answers} 次</span></div><div class="history-bars">${Array.from({length:7},(_,i)=>{let date=E.addDays(today(),i-6),n=state.days[date]?.completed.length||0;return `<div><i style="height:${Math.max(3,n/15*55)}px"></i>${date.slice(5).replace('-','/')}</div>`;}).join('')}</div><p>最近七天完成的新字。熟練需意思、拼字，以及適用的三態都跨日答對。</p></section><section class="settings-section"><h2>進度備份</h2><p>進度存在這個瀏覽器，不會自動跨手機同步。換手機、清除瀏覽資料或移動到不同網址前，請先備份。</p><div class="gap"><button id="export" class="primary">匯出進度備份</button><label class="backup-label" for="importFile">匯入進度備份</label><input type="file" id="importFile" accept="application/json,.json"></div></section><section class="settings-section"><h2>安裝與離線</h2><button id="installButton" class="secondary">加入手機主畫面</button><p id="cacheStatus">正在檢查離線檔案…</p><p>首次開啟需連網。只有顯示「離線題庫已就緒」後，才代表核心題目已快取。朗讀是否可離線，取決於手機英文語音。</p></section><section class="settings-section"><h2>練習管理</h2><button id="endSession" class="secondary">結束目前回合，保留答題紀錄</button><p>未完成的新字仍會留在今天的練習計畫中。</p></section><section class="settings-section"><h2>題庫說明</h2><p>依本機 GEPT_2000_Bobo_clean_wordbank.xlsx 整理，共 2,101 筆；排除缺少釋義的 kong。保留原表中文、詞性與來源筆號，動詞三態與部分音標、例句沿用 PET 版資料並補充。<a href="./LICENSE-ECDICT.txt" target="_blank">字典授權</a>。</p><p>這是個人學習工具，非官方試題；整理字庫不是考試所有可能用字。例句提示與三態練習不能取代完整讀寫聽說準備。</p><p>題型以選擇約四成、拼字與動詞輸入約六成為方向，實際比例隨動詞數及到期錯題調整。一般動詞提供三態填寫；部分常用動詞另有情境句。</p></section>`;
 $('#examDate').onchange=e=>{if(!e.target.value||/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){state.exam=e.target.value;persist();toast('已更新考試日期。');}};
 $('#export').onclick=exportBackup;$('#importFile').onchange=importBackup;$('#installButton').onclick=installHelp;
 $('#endSession').onclick=()=>{state.session=null;persist();toast('目前回合已結束，答題紀錄已保留。');};cacheStatus();
}
function exportBackup(){let a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({app:'gept-daily15',exported:new Date().toISOString(),data:state},null,2)],{type:'application/json'}));a.href=url;a.download=`GEPT進度-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('備份已匯出，請保存下載的 JSON 檔。');}
async function importBackup(e){let file=e.target.files[0];if(!file)return;try{if(file.size>10e6)throw Error('備份檔案過大。');let parsed=JSON.parse(await file.text());if(parsed.app!=='gept-daily15'||!E.valid(parsed.data,words))throw Error('這不是有效的 GEPT 進度備份。');modal('<h2 class="modal-title">還原這份進度？</h2><p>這會取代目前手機上的練習進度。建議先匯出目前進度保留一份。</p><div class="gap"><button id="beforeImport" class="secondary">先匯出目前進度</button><button id="confirmImport" class="primary">確認還原</button></div>');$('#beforeImport').onclick=exportBackup;$('#confirmImport').onclick=()=>{state=parsed.data;state.settings={...state.settings,daily:15};state.session=null;writeBlocked=false;persist();$('#modal').close();settings();toast('進度已還原。');};}catch(err){toast(err.message||'無法讀取備份檔。');}e.target.value='';}
function installHelp(){if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(()=>{installPrompt=null;});return;}modal(`<div class="eyebrow">TAKE YOUR WORDS WITH YOU</div><h2 class="modal-title">加入手機主畫面</h2><h3>Android · Chrome</h3><ol class="steps"><li>用 Chrome 開啟這個網址。</li><li>點右上角「⋮」，選「加到主畫面」或「安裝應用程式」。</li><li>之後從主畫面圖示開啟練習。</li></ol><h3>iPhone</h3><p class="muted">用 Safari 開啟同一網址，點「分享」，選「加入主畫面」。Chrome 若沒有顯示對應選項，請改用 Safari。</p><h3>進度與離線</h3><p class="muted">請固定使用同一個瀏覽器／主畫面 App。先到「設定」確認離線題庫就緒，再關網路練習。發音使用手機英文語音；部分裝置需要連網。</p><p class="safe-note">目前網站為私人使用，首次開啟可能需要以建立網站的 ChatGPT 帳號登入。</p>`);}
async function cacheStatus(){let el=$('#cacheStatus');if(!el)return;try{let names=await caches.keys();let found=false;for(let name of names.filter(n=>n.startsWith('gept15-'))){let c=await caches.open(name);if(await c.match(new URL('./words.json',location.href).href))found=true;}el.textContent=found?'✓ 離線題庫已就緒':'尚未完成離線快取，請保持連線稍候再查看。';}catch(e){el.textContent='此環境無法使用離線快取。';}}
$('#installHelp').onclick=installHelp;
document.addEventListener('click',e=>{let s=e.target.closest('[data-speak]');if(s)speak(s.dataset.speak);let d=e.target.closest('[data-detail]');if(d)detail(byId[d.dataset.detail]);});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('hashchange',navigate);
window.addEventListener('storage',e=>{if(e.key===KEY){try{let s=JSON.parse(e.newValue);if(E.valid(s,words)){state=s;render();toast('已同步另一個分頁的進度。');}}catch{}}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state&&state.session?.date!==today())render();});
async function boot(){try{let res=await fetch('./words.json');if(!res.ok)throw Error();words=await res.json();byId=Object.fromEntries(words.map(w=>[w.id,w]));state=load();if(writeBlocked){modal('<h2 class="modal-title">進度暫時無法讀取</h2><p>原有資料未被覆寫。請先下載原始資料，或匯入之前的備份。</p><button id="rawExport" class="primary">下載原始進度</button><button id="recoverFresh" class="secondary" style="margin-top:10px">已備份，建立新的進度</button>');$('#rawExport').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([localStorage.getItem(KEY)||''],{type:'application/json'}));a.download='GEPT原始進度.json';a.click();};$('#recoverFresh').onclick=()=>{writeBlocked=false;state=E.fresh();persist();$('#modal').close();render();};}navigate();if('serviceWorker'in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').then(()=>{navigator.serviceWorker.ready.then(()=>setTimeout(cacheStatus,1500));}).catch(()=>{});}}catch(e){main.innerHTML='<div class="empty"><h1>題庫尚未載入</h1><p>首次使用請保持連網，並透過網站網址開啟。</p><button class="primary" onclick="location.reload()">重新載入</button></div>';}}
boot();
