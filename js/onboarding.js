import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const firebaseConfig = { apiKey:'AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw', authDomain:'knowwhere-firebase.firebaseapp.com', projectId:'knowwhere-firebase', storageBucket:'knowwhere-firebase.firebasestorage.app', messagingSenderId:'389831660515', appId:'1:389831660515:web:0bcd3292610b1be0af86d6', measurementId:'G-9LMCC5TS1J' };
const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const stateKey = 'kw_onboarding_active_step';
let currentUser = null;
let currentStep = -1;
let highlightedTarget = null;
let targetClickHandler = null;
let positionTimer = null;

const steps = [
  { title:'Welcome to KnowWhere', copy:'Let’s use the real controls to edit your profile, open Settings, request a game, and report an issue.', button:'Start tour' },
  { title:'Open your account menu', copy:'Click your account badge in the top-right corner.', target:()=>document.querySelector('#nav-user-badge .auth-user-name'), clickToContinue:true },
  { title:'Open your profile', copy:'Click your profile header. This is also how you can view your profile at any time.', target:()=>document.querySelector('#user-popup .popup-header-row'), clickToContinue:true },
  { title:'Edit your profile', copy:'Click Edit Profile to open your username, picture, banner, bio, and personal details.', target:()=>document.getElementById('profile-edit-btn'), clickToContinue:true },
  { title:'Try the profile editor', copy:'These are your real profile controls. Make and save changes now, or continue without changing anything.', target:()=>document.getElementById('profile-edit-mode'), button:'Continue to settings' },
  { title:'Open Settings', copy:'Now click Settings in your account menu.', prepare:openAccountMenuForSettings, target:findSettingsButton, clickToContinue:true },
  { title:'Explore your settings', copy:'Use the tabs to customize redirects and cloaking, update your password, or change the sidebar.', target:()=>document.querySelector('#settings-modal > div'), button:'Continue' },
  { title:'Open Support', copy:'Game requests and issue reports now live together on the Support page.', button:'Open Support' },
  { title:'Request a game', copy:'This is the real request form. Enter a game name, plus an optional URL and notes, then submit it to the admins.', target:requestFormTarget, button:'Show issue reports' },
  { title:'Open the issue form', copy:'Click Report an Issue to switch to the reporting form.', target:()=>document.querySelector('.tab-btn[data-tab="report"]'), clickToContinue:true },
  { title:'Report an issue', copy:'Choose the affected page or game and describe what happened. You can track it, comment, and see when it is resolved.', target:issueFormTarget, button:'Finish tour' }
];

const style = document.createElement('style');
style.textContent = `
.kw-tour-shade{display:none;position:fixed;z-index:11000;background:rgba(3,3,8,.82);pointer-events:none;backdrop-filter:blur(2px)}
#kw-tour-ring{display:none;position:fixed;z-index:11001;border:2px solid var(--primary,#a855f7);border-radius:10px;pointer-events:none;box-shadow:0 0 0 4px rgba(168,85,247,.18),0 0 30px rgba(168,85,247,.5)}
#kw-tour-coach{display:none;position:fixed;z-index:12002;width:min(360px,calc(100vw - 24px));padding:1.15rem;background:linear-gradient(145deg,#171720,#0f0f16);border:1px solid #343448;border-radius:13px;box-shadow:0 18px 60px rgba(0,0,0,.7);color:var(--text,#e2e8f0);font-family:var(--font-body,Inter,sans-serif)}
#kw-tour-coach.open{display:block}.kw-guide-step{font-family:var(--font-display,Orbitron,sans-serif);font-size:.54rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--primary,#a855f7);margin-bottom:.45rem}.kw-guide-title{font-family:var(--font-display,Orbitron,sans-serif);font-size:1rem;line-height:1.3;margin:0 0 .55rem}.kw-guide-copy{font-size:.82rem;line-height:1.6;color:var(--muted,#8490a3);margin:0}.kw-guide-click{margin-top:.75rem;color:var(--secondary,#22d3ee);font-family:var(--font-display,Orbitron,sans-serif);font-size:.54rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.kw-guide-actions{display:flex;align-items:center;gap:.55rem;margin-top:1rem}.kw-guide-skip,.kw-guide-next{border-radius:7px;padding:.62rem .8rem;cursor:pointer;font-family:var(--font-display,Orbitron,sans-serif);font-size:.55rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.kw-guide-skip{border:1px solid #343448;background:transparent;color:var(--muted,#8490a3)}.kw-guide-next{margin-left:auto;border:0;background:var(--primary,#a855f7);color:#fff}
#kw-tour-welcome{display:none;position:fixed;inset:0;z-index:12001;align-items:center;justify-content:center;padding:1rem;background:rgba(3,3,8,.86);backdrop-filter:blur(7px)}#kw-tour-welcome.open{display:flex}.kw-welcome-card{width:min(500px,100%);padding:2rem;text-align:center;background:linear-gradient(145deg,#171720,#0f0f16);border:1px solid #343448;border-radius:18px;box-shadow:0 25px 90px rgba(0,0,0,.75);color:var(--text,#e2e8f0);font-family:var(--font-body,Inter,sans-serif)}.kw-welcome-icon{width:68px;height:68px;margin:0 auto 1rem;display:grid;place-items:center;border-radius:18px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);font-size:2rem}.kw-welcome-card .kw-guide-title{font-size:1.45rem}.kw-welcome-card .kw-guide-copy{font-size:.9rem}.kw-welcome-card .kw-guide-actions{justify-content:center;margin-top:1.25rem}.kw-welcome-card .kw-guide-next{margin-left:0}@media(max-width:520px){#kw-tour-coach{padding:1rem}.kw-welcome-card{padding:1.5rem 1.1rem}}
`;
document.head.appendChild(style);

const shades = Array.from({length:4},()=>{ const el=document.createElement('div'); el.className='kw-tour-shade'; document.body.appendChild(el); return el; });
const ring=document.createElement('div'); ring.id='kw-tour-ring'; document.body.appendChild(ring);
const coach=document.createElement('div'); coach.id='kw-tour-coach'; coach.setAttribute('role','dialog'); coach.setAttribute('aria-live','polite'); document.body.appendChild(coach);
const welcome=document.createElement('div'); welcome.id='kw-tour-welcome'; welcome.innerHTML='<div class="kw-welcome-card"><div class="kw-welcome-icon">✦</div><div class="kw-guide-step">Interactive site tour</div><h2 class="kw-guide-title"></h2><p class="kw-guide-copy"></p><div class="kw-guide-actions"><button class="kw-guide-skip">Skip tour</button><button class="kw-guide-next"></button></div></div>'; document.body.appendChild(welcome);

function visible(el){ if(!el)return false; const css=getComputedStyle(el),r=el.getBoundingClientRect(); return css.display!=='none'&&css.visibility!=='hidden'&&r.width>0&&r.height>0; }
function findSettingsButton(){ return [...document.querySelectorAll('#user-popup .popup-btn')].find(b=>b.textContent.trim()==='Settings')||null; }
function requestFormTarget(){ const panel=document.getElementById('panel-request'); if(panel&&!panel.classList.contains('active')&&window.switchTab)window.switchTab('request'); return document.querySelector('#panel-request .form-card'); }
function issueFormTarget(){ const panel=document.getElementById('panel-report'); if(panel&&!panel.classList.contains('active')&&window.switchTab)window.switchTab('report'); return document.querySelector('#panel-report .form-card'); }
function clearTarget(){ if(highlightedTarget&&targetClickHandler)highlightedTarget.removeEventListener('click',targetClickHandler); highlightedTarget=null; targetClickHandler=null; clearTimeout(positionTimer); shades.forEach(el=>el.style.display='none'); ring.style.display='none'; coach.classList.remove('open'); }

function positionGuide(){
  if(!highlightedTarget||!visible(highlightedTarget))return;
  const m=7,r=highlightedTarget.getBoundingClientRect(),left=Math.max(0,r.left-m),top=Math.max(0,r.top-m),right=Math.min(innerWidth,r.right+m),bottom=Math.min(innerHeight,r.bottom+m);
  const boxes=[[0,0,innerWidth,top],[0,top,left,bottom-top],[right,top,Math.max(0,innerWidth-right),bottom-top],[0,bottom,innerWidth,Math.max(0,innerHeight-bottom)]];
  shades.forEach((el,i)=>{ const b=boxes[i]; Object.assign(el.style,{display:'block',left:`${b[0]}px`,top:`${b[1]}px`,width:`${b[2]}px`,height:`${b[3]}px`}); });
  Object.assign(ring.style,{display:'block',left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
  const cr=coach.getBoundingClientRect(),below=bottom+12,ct=below+cr.height<=innerHeight-8?below:Math.max(8,top-cr.height-12),cl=Math.min(Math.max(12,r.left+r.width/2-cr.width/2),innerWidth-cr.width-12);
  Object.assign(coach.style,{top:`${ct}px`,left:`${cl}px`});
}

function coachMarkup(step){ return `<div class="kw-guide-step">Step ${currentStep} of ${steps.length-1}</div><h2 class="kw-guide-title">${step.title}</h2><p class="kw-guide-copy">${step.copy}</p>${step.clickToContinue?'<div class="kw-guide-click">Click the highlighted control to continue</div>':''}<div class="kw-guide-actions"><button class="kw-guide-skip">Skip tour</button>${step.button?`<button class="kw-guide-next">${step.button}</button>`:''}</div>`; }
function bindButtons(container){ container.querySelector('.kw-guide-skip')?.addEventListener('click',completeTour); container.querySelector('.kw-guide-next')?.addEventListener('click',()=>advanceFrom(currentStep)); }
function showWelcome(step){ clearTarget(); welcome.querySelector('.kw-guide-title').textContent=step.title; welcome.querySelector('.kw-guide-copy').textContent=step.copy; welcome.querySelector('.kw-guide-next').textContent=step.button; welcome.classList.add('open'); }
async function waitForTarget(getTarget,attempt=0){ const target=getTarget(); if(visible(target))return target; if(attempt>=100||currentStep<0)return null; await new Promise(r=>setTimeout(r,100)); return waitForTarget(getTarget,attempt+1); }

async function showTargetStep(step){
  welcome.classList.remove('open');
  const target=await waitForTarget(step.target); if(!target||steps[currentStep]!==step)return;
  highlightedTarget=target; coach.innerHTML=coachMarkup(step); bindButtons(coach); coach.classList.add('open');
  target.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); positionGuide(); positionTimer=setTimeout(positionGuide,350);
  if(step.clickToContinue){ targetClickHandler=()=>setTimeout(()=>enterStep(currentStep+1),250); target.addEventListener('click',targetClickHandler,{once:true}); }
}

function openAccountMenuForSettings(){ if(window.cancelProfileEdit)window.cancelProfileEdit(); if(window.closeProfile)window.closeProfile(); if(window.closeSettings)window.closeSettings(); const popup=document.getElementById('user-popup'); if(popup&&!popup.classList.contains('open')&&window.toggleUserPopup)window.toggleUserPopup(); }
function advanceFrom(step){
  if(step===0)return enterStep(1); if(step===4)return enterStep(5); if(step===6)return enterStep(7);
  if(step===7){ try{sessionStorage.setItem(stateKey,'8')}catch{} location.href='/bugs.html?tab=request'; return; }
  if(step===8)return enterStep(9); if(step===10)return completeTour(); enterStep(step+1);
}
async function enterStep(index){
  clearTarget(); welcome.classList.remove('open'); currentStep=index; try{sessionStorage.setItem(stateKey,String(index))}catch{}
  const step=steps[index]; if(!step)return completeTour(); if(step.prepare)step.prepare();
  if(index===8&&location.pathname!=='/bugs.html'){ location.href='/bugs.html?tab=request'; return; }
  if(index===8&&window.switchTab)window.switchTab('request'); if(index===10&&window.switchTab)window.switchTab('report');
  if(!step.target)showWelcome(step); else await showTargetStep(step);
}
async function completeTour(){
  clearTarget(); welcome.classList.remove('open'); currentStep=-1; try{sessionStorage.removeItem(stateKey)}catch{} if(!currentUser)return;
  try{localStorage.setItem(`kw_onboarding_${currentUser.uid}`,'complete')}catch{}
  try{await setDoc(doc(db,'users',currentUser.email),{onboardingComplete:true,onboardingCompletedAt:new Date().toISOString()},{merge:true})}catch(error){console.warn('Could not save onboarding progress:',error)}
}

window.startOnboarding=()=>enterStep(0);
welcome.querySelector('.kw-guide-skip').addEventListener('click',completeTour); welcome.querySelector('.kw-guide-next').addEventListener('click',()=>advanceFrom(currentStep));
addEventListener('resize',positionGuide); addEventListener('scroll',positionGuide,true);

function customizeUserMenu(attempt=0){
  const popup=document.getElementById('user-popup'); if(!popup){if(attempt<50)setTimeout(()=>customizeUserMenu(attempt+1),100);return;}
  const request=[...popup.querySelectorAll('.popup-btn')].find(b=>b.textContent.trim()==='Request a Game');
  if(request){request.onclick=()=>{location.href='/bugs.html?tab=request'};request.parentElement.querySelector('#game-request-form')?.remove();}
  if(!document.getElementById('onboarding-popup-btn')){const settings=findSettingsButton(),section=document.createElement('div');section.className='popup-section';section.innerHTML='<button class="popup-btn" id="onboarding-popup-btn"><span aria-hidden="true">✦</span>Interactive Site Tour</button>';section.querySelector('button').addEventListener('click',()=>{if(window.toggleUserPopup)window.toggleUserPopup();window.startOnboarding()});if(settings)settings.parentElement.before(section);else popup.appendChild(section);}
}
customizeUserMenu();

onAuthStateChanged(auth,async user=>{
  currentUser=user; if(!user)return;
  const resumeRaw=sessionStorage.getItem(stateKey),resume=resumeRaw===null?null:Number(resumeRaw); if(Number.isInteger(resume)&&resume>=0&&resume<steps.length){setTimeout(()=>enterStep(resume),500);return;}
  try{if(localStorage.getItem(`kw_onboarding_${user.uid}`)==='complete')return}catch{}
  try{const snap=await getDoc(doc(db,'users',user.email)),data=snap.exists()?snap.data():{};if(data.onboardingComplete===true)return;const created=new Date(data.createdAt||user.metadata.creationTime||0).getTime(),isNew=!created||Date.now()-created<30*24*60*60*1000;if(isNew)setTimeout(()=>enterStep(0),700)}catch(error){console.warn('Could not check onboarding status:',error)}
});
