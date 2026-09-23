const API="/api";
const SESSION_KEY="vayzen.session";
const PREFS_KEY="vayzen.prefs";
const DEVICE_KEY="vayzen.device";
const GUEST_PROGRESS_KEY="vayzen.guest.progress";

const state={
  movies:[],series:[],favorites:[],progress:[],user:null,session:null,
  query:"",movieGenre:"",seriesGenre:"",detail:null,player:null,nextEpisode:null,
  prefs:{autoplayNext:true,saveProgress:true}
};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function showToast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove("show"),2600);
}
function openModal(id){$("#"+id)?.classList.add("open")}
function closeModal(id){$("#"+id)?.classList.remove("open")}
function savePrefs(){localStorage.setItem(PREFS_KEY,JSON.stringify(state.prefs))}
function loadPrefs(){
  try{state.prefs={...state.prefs,...JSON.parse(localStorage.getItem(PREFS_KEY)||"{}")}}catch{}
  $("#autoplayNext").checked=state.prefs.autoplayNext!==false;
  $("#saveProgress").checked=state.prefs.saveProgress!==false;
}
function loadSession(){
  try{state.session=JSON.parse(localStorage.getItem(SESSION_KEY)||"null")}catch{state.session=null}
}
function setSession(s){
  state.session=s||null;
  if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY);
}
function deviceKey(){
  let k=localStorage.getItem(DEVICE_KEY);
  if(k)return k;
  const a=new Uint8Array(20);crypto.getRandomValues(a);
  k=[...a].map(x=>x.toString(16).padStart(2,"0")).join("");
  localStorage.setItem(DEVICE_KEY,k);return k;
}
function requestKey(){return state.user?.id||deviceKey()}

async function rawApi(action,{method="GET",body=null,auth=false,params={},retry=true}={}){
  const q=new URLSearchParams({action,...params});
  const headers={"Content-Type":"application/json"};
  if(auth&&state.session?.access_token)headers.Authorization="Bearer "+state.session.access_token;
  const r=await fetch(API+"?"+q.toString(),{method,headers,body:body?JSON.stringify(body):undefined,cache:"no-store"});
  if(r.status===401&&auth&&retry&&state.session?.refresh_token){
    const ok=await refreshSession();
    if(ok)return rawApi(action,{method,body,auth,params,retry:false});
  }
  const j=await r.json().catch(()=>({error:"تعذر قراءة الاستجابة"}));
  if(!r.ok)throw new Error(j.error||"حدث خطأ");
  return j;
}
async function refreshSession(){
  try{
    const r=await fetch(API+"?action=refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:state.session?.refresh_token})});
    const j=await r.json();
    if(!r.ok||!j.session)throw new Error();
    setSession(j.session);return true;
  }catch{
    setSession(null);state.user=null;renderAccount();return false;
  }
}

function mediaUrl(kind,id){return API+"?media="+encodeURIComponent(kind)+"&id="+encodeURIComponent(id)}
function typeLabel(type){return type==="movie"?"فيلم":"مسلسل"}
function genreList(x){return Array.isArray(x.genres)?x.genres:[]}
function isFav(type,id){return state.favorites.some(x=>x.entity_type===type&&x.entity_id===id)}
function progressFor(type,id){return state.progress.find(x=>x.entity_type===type&&x.entity_id===id)}
function percent(type,id){
  const p=progressFor(type,id);
  if(!p||!Number(p.duration_seconds))return 0;
  return Math.max(0,Math.min(100,Number(p.position_seconds)/Number(p.duration_seconds)*100));
}
function itemBy(type,id){return (type==="movie"?state.movies:state.series).find(x=>x.id===id)}

function card(item,type,{compact=false}={}){
  const pct=type==="movie"?percent("movie",item.id):0;
  return `<article class="media-card" data-type="${type}" data-id="${item.id}">
    <div class="poster">
      <div class="poster-fallback">V</div>
      <img src="${mediaUrl(type==="movie"?"movie_poster":"series_poster",item.id)}" alt="" loading="lazy" onerror="this.style.display='none'">
      <span class="badge">${isFav(type,item.id)?"محفوظ":typeLabel(type)}</span>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-meta">${esc(item.release_year||"")} ${genreList(item).length?"• "+esc(genreList(item).slice(0,2).join(" • ")):""}</div>
      ${pct>1?`<div class="card-progress"><span style="width:${pct}%"></span></div>`:""}
    </div>
  </article>`;
}

function bindCards(root=document){
  root.querySelectorAll?.(".media-card").forEach(c=>c.onclick=()=>openDetails(c.dataset.type,c.dataset.id));
}

function renderCatalog(){
  const q=state.query.trim().toLowerCase();
  const filter=(arr,genre)=>arr.filter(x=>{
    const text=[x.title,x.original_title,x.description,...genreList(x)].join(" ").toLowerCase();
    return (!q||text.includes(q))&&(!genre||genreList(x).includes(genre));
  });
  const movies=filter(state.movies,state.movieGenre);
  const series=filter(state.series,state.seriesGenre);

  $("#latestMovies").innerHTML=state.movies.slice(0,10).map(x=>card(x,"movie",{compact:true})).join("")||'<div class="empty-card">لا توجد أفلام بعد.</div>';
  $("#latestSeries").innerHTML=state.series.slice(0,10).map(x=>card(x,"series",{compact:true})).join("")||'<div class="empty-card">لا توجد مسلسلات بعد.</div>';
  $("#moviesGrid").innerHTML=movies.map(x=>card(x,"movie")).join("")||'<div class="empty-state">لا توجد نتائج مطابقة.</div>';
  $("#seriesGrid").innerHTML=series.map(x=>card(x,"series")).join("")||'<div class="empty-state">لا توجد نتائج مطابقة.</div>';

  renderGenreChips("movieChips",state.movies,"movieGenre");
  renderGenreChips("seriesChips",state.series,"seriesGenre");
  bindCards();
  renderHero();
  renderMyList();
  renderContinue();
}
function renderGenreChips(id,items,key){
  const genres=[...new Set(items.flatMap(genreList))].filter(Boolean).slice(0,18);
  $("#"+id).innerHTML=`<button class="chip ${!state[key]?"active":""}" data-genre="">الكل</button>`+
    genres.map(g=>`<button class="chip ${state[key]===g?"active":""}" data-genre="${esc(g)}">${esc(g)}</button>`).join("");
  $("#"+id).querySelectorAll(".chip").forEach(b=>b.onclick=()=>{state[key]=b.dataset.genre||"";renderCatalog()});
}
function renderHero(){
  const x=state.movies.find(x=>x.is_featured)||state.series.find(x=>x.is_featured)||state.movies[0]||state.series[0];
  if(!x)return;
  const type=state.movies.includes(x)?"movie":"series";
  $("#heroTitle").textContent=x.title;
  $("#heroText").textContent=x.description||"شاهد التفاصيل واكتشف المزيد على VAYZEN.";
  $("#heroMedia").style.backgroundImage=`url("${mediaUrl(type==="movie"?"movie_poster":"series_poster",x.id)}")`;
  $("#heroDetails").onclick=()=>openDetails(type,x.id);
  $("#heroPlay").onclick=()=>type==="movie"?openPlayer({type:"movie",id:x.id,title:x.title,publicId:x.public_id,src:mediaUrl("movie_video",x.id)}):openDetails(type,x.id);
}

function guestProgress(){
  try{return JSON.parse(localStorage.getItem(GUEST_PROGRESS_KEY)||"[]")}catch{return[]}
}
function setGuestProgress(list){localStorage.setItem(GUEST_PROGRESS_KEY,JSON.stringify(list.slice(0,100)))}
function renderContinue(){
  const entries=state.user?state.progress:guestProgress();
  const movies=entries.filter(x=>x.entity_type==="movie"&&Number(x.position_seconds)>5&&Number(x.duration_seconds)>20).slice(0,10);
  const items=movies.map(p=>state.movies.find(m=>m.id===p.entity_id)).filter(Boolean);
  $("#continueRail").innerHTML=items.length?items.map(x=>card(x,"movie",{compact:true})).join(""):'<div class="empty-card">ما عندك مشاهدة غير مكتملة بعد.</div>';
  bindCards($("#continueRail"));
}
function renderMyList(){
  const guest=$("#myListGuest"),grid=$("#myListGrid");
  if(!state.user){
    guest.classList.remove("hidden");grid.innerHTML="";return;
  }
  guest.classList.add("hidden");
  const items=state.favorites.map(f=>({type:f.entity_type,item:itemBy(f.entity_type,f.entity_id)})).filter(x=>x.item);
  grid.innerHTML=items.length?items.map(x=>card(x.item,x.type)).join(""):'<div class="empty-state">قائمتك فارغة. احفظ أي فيلم أو مسلسل ليظهر هنا.</div>';
  bindCards(grid);
}

async function loadCatalog(){
  try{
    const j=await rawApi("catalog");
    state.movies=j.movies||[];state.series=j.series||[];
    renderCatalog();
  }catch(e){
    showToast("تعذر تحميل المحتوى");
    $("#moviesGrid").innerHTML='<div class="empty-state">تعذر تحميل المحتوى حاليًا.</div>';
  }
}
async function loadUserState(){
  if(!state.session?.access_token){state.user=null;state.favorites=[];state.progress=[];renderAccount();renderCatalog();return}
  try{
    const [me,fav,prog]=await Promise.all([
      rawApi("me",{auth:true}),
      rawApi("favorites",{auth:true}),
      rawApi("progress",{auth:true})
    ]);
    state.user=me.user;state.favorites=fav.favorites||[];state.progress=prog.progress||[];
  }catch{
    state.user=null;state.favorites=[];state.progress=[];setSession(null);
  }
  renderAccount();renderCatalog();
}
function renderAccount(){
  const guest=$("#guestAccount"),user=$("#userAccount");
  if(!state.user){guest.classList.remove("hidden");user.classList.add("hidden");return}
  guest.classList.add("hidden");user.classList.remove("hidden");
  $("#profileName").textContent=state.user.display_name||"مستخدم VAYZEN";
  $("#profileEmail").textContent=state.user.email||"";
  $("#profileAvatar").textContent=(state.user.display_name||state.user.email||"V").trim().charAt(0).toUpperCase();
  $("#profileNameInput").value=state.user.display_name||"";
}

async function openDetails(type,id){
  const item=itemBy(type,id);if(!item)return;
  state.detail={type,id};
  const poster=mediaUrl(type==="movie"?"movie_poster":"series_poster",id);
  const genreTags=genreList(item).slice(0,4).map(g=>`<span class="tag">${esc(g)}</span>`).join("");
  $("#detailContent").innerHTML=`
    <div class="detail-hero">
      <div class="detail-bg" style="background-image:url('${poster}')"></div>
      <div class="detail-summary">
        <div class="detail-poster"><img src="${poster}" alt=""></div>
        <div class="detail-copy">
          <h2>${esc(item.title)}</h2>
          <div class="tags"><span class="tag">${esc(item.release_year||"—")}</span><span class="tag">${esc(item.quality||"—")}</span>${genreTags}</div>
          <p>${esc(item.description||"لا يوجد وصف متاح.")}</p>
        </div>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn primary" id="detailPlay"><svg><use href="#i-play"/></svg><span>${type==="movie"?"مشاهدة الآن":"عرض الحلقات"}</span></button>
      <button class="circle-action ${isFav(type,id)?"active":""}" id="favoriteBtn" title="قائمتي"><svg><use href="#${isFav(type,id)?"i-check":"i-plus"}"/></svg></button>
      <button class="circle-action" id="detailReport" title="إبلاغ"><svg><use href="#i-report"/></svg></button>
    </div>
    ${type==="series"?'<div class="seasons-wrap"><div class="season-tabs" id="seasonTabs"></div><div class="episode-list" id="episodeList"></div></div>':""}
  `;
  openModal("detailModal");

  $("#favoriteBtn").onclick=()=>toggleFavorite(type,id);
  $("#detailReport").onclick=()=>openReport(type,item.public_id);
  if(type==="movie"){
    $("#detailPlay").onclick=()=>openPlayer({type:"movie",id:item.id,title:item.title,publicId:item.public_id,src:mediaUrl("movie_video",item.id)});
  }else{
    $("#detailPlay").onclick=()=>$("#seasonTabs")?.scrollIntoView({behavior:"smooth",block:"center"});
    await loadSeriesContent(item);
  }
}

async function loadSeriesContent(series){
  const tabs=$("#seasonTabs"),list=$("#episodeList");
  tabs.innerHTML='<button class="season-tab active">جاري التحميل...</button>';list.innerHTML="";
  try{
    const j=await rawApi("series_content",{params:{id:series.id}});
    const seasons=j.seasons||[];
    if(!seasons.length){tabs.innerHTML="";list.innerHTML='<div class="empty-state">لا توجد حلقات منشورة بعد.</div>';return}
    tabs.innerHTML=seasons.map((s,i)=>`<button class="season-tab ${i===0?"active":""}" data-i="${i}">${esc(s.title||("الموسم "+s.season_number))}</button>`).join("");
    const show=i=>{
      tabs.querySelectorAll(".season-tab").forEach((b,n)=>b.classList.toggle("active",n===i));
      const eps=seasons[i].episodes||[];
      list.innerHTML=eps.length?eps.map((e,n)=>`<div class="episode-row">
        <div class="episode-no">${e.episode_number}</div>
        <div class="episode-copy"><b>${esc(e.title||("الحلقة "+e.episode_number))}</b><small>${esc(e.quality||"")} ${e.duration_minutes?"• "+e.duration_minutes+" دقيقة":""}</small></div>
        <button class="episode-play" data-e="${n}"><svg><use href="#i-play"/></svg></button>
      </div>`).join(""):'<div class="empty-state">لا توجد حلقات بهذا الموسم.</div>';
      list.querySelectorAll("[data-e]").forEach(btn=>{
        const n=Number(btn.dataset.e),ep=eps[n],next=eps[n+1];
        btn.onclick=()=>openPlayer({
          type:"episode",id:ep.id,title:series.title+" • "+(ep.title||("الحلقة "+ep.episode_number)),
          publicId:ep.public_id,src:mediaUrl("episode_video",ep.id),
          next:next?{type:"episode",id:next.id,title:series.title+" • "+(next.title||("الحلقة "+next.episode_number)),publicId:next.public_id,src:mediaUrl("episode_video",next.id)}:null
        });
      });
    };
    tabs.querySelectorAll(".season-tab").forEach((b,i)=>b.onclick=()=>show(i));
    show(0);
  }catch{tabs.innerHTML="";list.innerHTML='<div class="empty-state">تعذر تحميل الحلقات.</div>'}
}

async function toggleFavorite(type,id){
  if(!state.user){openAuth("login");return}
  const enabled=!isFav(type,id);
  try{
    await rawApi("favorites",{method:"POST",auth:true,body:{entity_type:type,entity_id:id,enabled}});
    if(enabled)state.favorites.unshift({entity_type:type,entity_id:id,created_at:new Date().toISOString()});
    else state.favorites=state.favorites.filter(x=>!(x.entity_type===type&&x.entity_id===id));
    renderCatalog();
    const btn=$("#favoriteBtn");if(btn){btn.classList.toggle("active",enabled);btn.innerHTML=`<svg><use href="#${enabled?"i-check":"i-plus"}"/></svg>`}
    showToast(enabled?"تمت الإضافة إلى قائمتك":"تمت الإزالة من قائمتك");
  }catch(e){showToast(e.message)}
}

function openAuth(tab="login"){setAuthTab(tab);openModal("authModal")}
function setAuthTab(tab){
  const login=tab==="login";
  $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.authTab===tab));
  $("#loginForm").classList.toggle("hidden",!login);$("#registerForm").classList.toggle("hidden",login);
  $("#authTitle").textContent=login?"تسجيل الدخول":"إنشاء حساب";
  $("#authSubtitle").textContent=login?"مرحبًا بعودتك إلى VAYZEN":"أنشئ حسابك خلال لحظات";
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=e.submitter;btn.disabled=true;
  try{
    const j=await rawApi("login",{method:"POST",body:{email:$("#loginEmail").value.trim(),password:$("#loginPassword").value}});
    setSession(j.session);closeModal("authModal");await loadUserState();showToast("تم تسجيل الدخول");
  }catch(err){showToast(err.message)}finally{btn.disabled=false}
});
$("#registerForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const pass=$("#registerPassword").value,confirm=$("#registerConfirm").value;
  if(pass!==confirm){showToast("كلمتا المرور غير متطابقتين");return}
  const btn=e.submitter;btn.disabled=true;
  try{
    const j=await rawApi("signup",{method:"POST",body:{display_name:$("#registerName").value.trim(),email:$("#registerEmail").value.trim(),password:pass}});
    if(j.session){setSession(j.session);closeModal("authModal");await loadUserState();showToast("تم إنشاء الحساب")}
    else{setAuthTab("login");showToast("تم إنشاء الحساب. تحقق من بريدك إذا طُلب التأكيد")}
  }catch(err){showToast(err.message)}finally{btn.disabled=false}
});

$("#profileForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{
    const j=await rawApi("profile",{method:"POST",auth:true,body:{display_name:$("#profileNameInput").value.trim()}});
    state.user.display_name=j.display_name;renderAccount();closeModal("editProfileModal");showToast("تم حفظ الاسم");
  }catch(err){showToast(err.message)}finally{btn.disabled=false}
});
$("#logoutBtn").onclick=()=>{setSession(null);state.user=null;state.favorites=[];state.progress=[];renderAccount();renderCatalog();go("home");showToast("تم تسجيل الخروج")};

$("#requestForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{
    const j=await rawApi("request_content",{method:"POST",body:{requester_key:requestKey(),request_type:$("#requestType").value,title:$("#requestTitle").value.trim(),note:$("#requestNote").value.trim()}});
    closeModal("requestModal");$("#requestForm").reset();showToast("تم إرسال الطلب "+j.request.request_code);
  }catch(err){showToast(err.message)}finally{btn.disabled=false}
});
async function openRequests(){
  openModal("requestsModal");$("#requestsList").innerHTML='<div class="empty-state">جاري التحميل...</div>';
  try{
    const j=await rawApi("request_status",{params:{requester_key:requestKey()}});
    const labels={new:"جديد",reviewing:"قيد المراجعة",added:"تمت الإضافة",rejected:"مرفوض",duplicate:"مكرر"};
    $("#requestsList").innerHTML=(j.requests||[]).length?(j.requests||[]).map(x=>`<div class="request-item"><div class="request-top"><b>${esc(x.title)}</b><span class="status-pill status-${esc(x.status)}">${labels[x.status]||esc(x.status)}</span></div><small>${esc(x.request_code)} • ${x.request_type==="movie"?"فيلم":"مسلسل"}</small></div>`).join(""):'<div class="empty-state">ما عندك طلبات بعد.</div>';
  }catch{$("#requestsList").innerHTML='<div class="empty-state">تعذر تحميل الطلبات.</div>'}
}
function openReport(type="other",publicId=""){if(!state.user){openAuth("login");return}$("#reportEntityType").value=type;$("#reportPublicId").value=publicId;$("#reportDetails").value="";openModal("reportModal")}
$("#reportForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{
    const j=await rawApi("report",{method:"POST",body:{reporter_key:requestKey(),entity_type:$("#reportEntityType").value||"other",entity_public_id:$("#reportPublicId").value||"",reason:$("#reportReason").value,details:$("#reportDetails").value.trim()}});
    closeModal("reportModal");showToast("تم إرسال البلاغ "+j.report.report_code);
  }catch(err){showToast(err.message)}finally{btn.disabled=false}
});

const video=$("#videoPlayer");
function openPlayer(o){
  state.player=o;state.nextEpisode=o.next||null;
  $("#playerTitle").textContent=o.title;$("#playerMeta").textContent=o.publicId||"";
  $("#nextEpisodeBtn").classList.toggle("hidden",!o.next);
  $("#playerError").classList.add("hidden");$("#playerLoader").classList.remove("hidden");
  video.src=o.src;$("#playerLayer").classList.add("open");video.load();
  const p=state.user?progressFor(o.type,o.id):guestProgress().find(x=>x.entity_type===o.type&&x.entity_id===o.id);
  video.addEventListener("loadedmetadata",()=>{if(p&&Number(p.position_seconds)>7&&Number(p.position_seconds)<video.duration-10)video.currentTime=Number(p.position_seconds)},{once:true});
  video.play().catch(()=>{});
}
function closePlayer(){
  saveCurrentProgress();video.pause();video.removeAttribute("src");video.load();$("#playerLayer").classList.remove("open");state.player=null;state.nextEpisode=null;
}
let progressTimer=0;
async function saveCurrentProgress(){
  const o=state.player;if(!o||!state.prefs.saveProgress||!video.duration||!isFinite(video.duration))return;
  const entry={entity_type:o.type,entity_id:o.id,position_seconds:Math.floor(video.currentTime||0),duration_seconds:Math.floor(video.duration||0),updated_at:new Date().toISOString()};
  if(state.user){
    const i=state.progress.findIndex(x=>x.entity_type===o.type&&x.entity_id===o.id);if(i>=0)state.progress[i]=entry;else state.progress.unshift(entry);
    try{await rawApi("progress",{method:"POST",auth:true,body:entry})}catch{}
  }else{
    const list=guestProgress(),i=list.findIndex(x=>x.entity_type===o.type&&x.entity_id===o.id);if(i>=0)list[i]=entry;else list.unshift(entry);setGuestProgress(list);
  }
  renderContinue();
}
video.addEventListener("waiting",()=>$("#playerLoader").classList.remove("hidden"));
video.addEventListener("playing",()=>$("#playerLoader").classList.add("hidden"));
video.addEventListener("canplay",()=>$("#playerLoader").classList.add("hidden"));
video.addEventListener("error",()=>{$("#playerLoader").classList.add("hidden");$("#playerError").classList.remove("hidden")});
video.addEventListener("timeupdate",()=>{if(Date.now()-progressTimer>6000){progressTimer=Date.now();saveCurrentProgress()}});
video.addEventListener("pause",saveCurrentProgress);
video.addEventListener("ended",()=>{saveCurrentProgress();if(state.prefs.autoplayNext&&state.nextEpisode)openPlayer(state.nextEpisode)});
$("#playerBack").onclick=closePlayer;
$("#rewindBtn").onclick=()=>video.currentTime=Math.max(0,video.currentTime-10);
$("#forwardBtn").onclick=()=>video.currentTime=Math.min(video.duration||Infinity,video.currentTime+10);
$("#speedSelect").onchange=e=>video.playbackRate=Number(e.target.value)||1;
$("#fullscreenBtn").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $("#playerLayer").requestFullscreen()}catch{}};
$("#nextEpisodeBtn").onclick=()=>{if(state.nextEpisode)openPlayer(state.nextEpisode)};
$("#retryPlayer").onclick=()=>{const o=state.player;if(!o)return;const t=video.currentTime||0;$("#playerError").classList.add("hidden");video.src=o.src;video.load();video.addEventListener("loadedmetadata",()=>{if(t>0&&t<video.duration)video.currentTime=t},{once:true});video.play().catch(()=>{})};

function go(page){
  $$(".page").forEach(p=>p.classList.toggle("active",p.dataset.page===page));
  $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.nav===page));
  window.scrollTo({top:0,behavior:"smooth"});
  if(page==="mylist")renderMyList();
  if(page==="account")renderAccount();
}
$$(".nav-item").forEach(b=>b.onclick=()=>go(b.dataset.nav));
$$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$$("[data-auth-open]").forEach(b=>b.onclick=()=>openAuth(b.dataset.authOpen||"login"));
$$("[data-auth-tab]").forEach(b=>b.onclick=()=>setAuthTab(b.dataset.authTab));
$$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id)}));

$("#globalSearchBtn").onclick=()=>{$("#searchPanel").classList.toggle("hidden");if(!$("#searchPanel").classList.contains("hidden"))$("#searchInput").focus()};
$("#clearSearch").onclick=()=>{$("#searchInput").value="";state.query="";renderCatalog()};
$("#searchInput").oninput=e=>{state.query=e.target.value;renderCatalog()};
$("#editProfileBtn").onclick=()=>openModal("editProfileModal");
$("#openRequestBtn").onclick=()=>openModal("requestModal");
$("#openRequestsHistory").onclick=openRequests;
$("#openReportGeneral").onclick=()=>openReport("other","");
$("#autoplayNext").onchange=e=>{state.prefs.autoplayNext=e.target.checked;savePrefs()};
$("#saveProgress").onchange=e=>{state.prefs.saveProgress=e.target.checked;savePrefs()};

async function boot(){
  loadPrefs();loadSession();
  await loadCatalog();
  await loadUserState();
  setTimeout(()=>$("#splash").classList.add("hide"),850);
}
window.addEventListener("online",()=>showToast("عاد الاتصال"));
window.addEventListener("offline",()=>showToast("لا يوجد اتصال بالإنترنت"));
document.addEventListener("visibilitychange",()=>{if(document.hidden)saveCurrentProgress()});
boot();
