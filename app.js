const STATIC_API="https://aszcgivlsaldcgocljwe.supabase.co/functions/v1/vayzen-gateway";
const API=location.hostname.endsWith(".github.io")?STATIC_API:"/api";
const SESSION_KEY="vayzen.session";
const PREFS_KEY="vayzen.prefs";
const DEVICE_KEY="vayzen.device";
const GUEST_PROGRESS_KEY="vayzen.guest.progress";

const state={
  movies:[],series:[],favorites:[],progress:[],user:null,session:null,
  query:"",movieGenre:"",seriesGenre:"",movieYear:"",seriesYear:"",detail:null,player:null,nextEpisode:null,
  prefs:{autoplayNext:true,saveProgress:true}
};
const viewedThisSession=new Set();

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
  const headers={};
  if(body!==null)headers["Content-Type"]="application/json";
  if(auth&&state.session?.access_token)headers.Authorization="Bearer "+state.session.access_token;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let r;
  try{
    r=await fetch(API+"?"+q.toString(),{
      method,
      headers,
      body:body!==null?JSON.stringify(body):undefined,
      cache:"no-store",
      signal:controller.signal
    });
  }catch(err){
    if(err?.name==="AbortError")throw new Error("انتهت مهلة الاتصال");
    throw new Error("تعذر الاتصال بالخدمة");
  }finally{
    clearTimeout(timer);
  }
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
  const filter=(arr,genre,year)=>arr.filter(x=>{
    const text=[x.title,x.original_title,x.description,...genreList(x)].join(" ").toLowerCase();
    return (!q||text.includes(q))&&(!genre||genreList(x).includes(genre))&&(!year||String(x.release_year||"")===String(year));
  });
  const movies=filter(state.movies,state.movieGenre,state.movieYear);
  const series=filter(state.series,state.seriesGenre,state.seriesYear);

  $("#latestMovies").innerHTML=state.movies.slice(0,10).map(x=>card(x,"movie",{compact:true})).join("")||'<div class="empty-card">لا توجد أفلام بعد.</div>';
  $("#latestSeries").innerHTML=state.series.slice(0,10).map(x=>card(x,"series",{compact:true})).join("")||'<div class="empty-card">لا توجد مسلسلات بعد.</div>';
  const trending=[
    ...state.movies.map(item=>({item,type:"movie"})),
    ...state.series.map(item=>({item,type:"series"}))
  ].sort((a,b)=>(Number(b.item.view_count)||0)-(Number(a.item.view_count)||0)||new Date(b.item.created_at)-new Date(a.item.created_at)).slice(0,10);
  $("#trendingRail").innerHTML=trending.length?trending.map(x=>card(x.item,x.type,{compact:true})).join(""):'<div class="empty-card">يظهر الأكثر مشاهدة بعد بدء المشاهدات.</div>';
  $("#moviesGrid").innerHTML=movies.map(x=>card(x,"movie")).join("")||'<div class="empty-state">لا توجد نتائج مطابقة.</div>';
  $("#seriesGrid").innerHTML=series.map(x=>card(x,"series")).join("")||'<div class="empty-state">لا توجد نتائج مطابقة.</div>';

  renderGenreChips("movieChips",state.movies,"movieGenre");
  renderGenreChips("seriesChips",state.series,"seriesGenre");
  renderYearFilter("movieYearFilter",state.movies,"movieYear");
  renderYearFilter("seriesYearFilter",state.series,"seriesYear");
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
function renderYearFilter(id,items,key){
  const el=$("#"+id);if(!el)return;
  const years=[...new Set(items.map(x=>Number(x.release_year)).filter(y=>Number.isInteger(y)&&y>0))].sort((a,b)=>b-a);
  const current=String(state[key]||"");
  const html='<option value="">كل السنوات</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join("");
  if(el.innerHTML!==html)el.innerHTML=html;
  el.value=current;
  el.onchange=()=>{state[key]=el.value||"";renderCatalog()};
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
async function removeContinueEntry(type,id){
  if(state.user){
    state.progress=state.progress.filter(x=>!(x.entity_type===type&&x.entity_id===id));
    try{await rawApi("progress",{method:"POST",auth:true,body:{entity_type:type,entity_id:id,remove:true}})}catch{}
  }else{
    setGuestProgress(guestProgress().filter(x=>!(x.entity_type===type&&x.entity_id===id)));
  }
  renderContinue();
}
function renderContinue(){
  const entries=(state.user?state.progress:guestProgress())
    .filter(x=>Number(x.position_seconds)>5&&Number(x.duration_seconds)>20&&Number(x.position_seconds)<Number(x.duration_seconds)-5)
    .slice(0,12);
  const playable=[];
  const html=[];
  for(const p of entries){
    const pct=Math.max(2,Math.min(98,Math.round((Number(p.position_seconds)/Number(p.duration_seconds))*100)));
    if(p.entity_type==="movie"){
      const item=state.movies.find(m=>m.id===p.entity_id);if(!item)continue;
      const idx=playable.push({type:"movie",id:item.id,title:item.title,publicId:item.public_id,src:mediaUrl("movie_video",item.id)})-1;
      html.push(`<article class="continue-watch-card" data-cont="${idx}">
        <button class="continue-remove" data-cont-remove="${idx}" aria-label="إزالة">×</button>
        <div class="continue-poster"><img src="${mediaUrl("movie_poster",item.id)}" alt="" loading="lazy"><span class="continue-play"><svg><use href="#i-play"/></svg></span></div>
        <div class="continue-copy"><b>${esc(item.title)}</b><small>فيلم • ${formatClock(p.position_seconds)} من ${formatClock(p.duration_seconds)}</small><div class="continue-progress"><i style="width:${pct}%"></i></div></div>
      </article>`);
    }else if(p.entity_type==="episode"&&p.series_id){
      const title=p.series_title||"مسلسل";
      const epTitle=p.episode_title||("الحلقة "+(p.episode_number||""));
      const idx=playable.push({
        type:"episode",id:p.entity_id,title:title+" • "+epTitle,publicId:p.episode_public_id||"",
        src:mediaUrl("episode_video",p.entity_id),seriesId:p.series_id,seriesTitle:title,
        seasonNumber:p.season_number||null,episodeNumber:p.episode_number||null,episodeTitle:epTitle
      })-1;
      html.push(`<article class="continue-watch-card" data-cont="${idx}">
        <button class="continue-remove" data-cont-remove="${idx}" aria-label="إزالة">×</button>
        <div class="continue-poster"><img src="${mediaUrl("series_poster",p.series_id)}" alt="" loading="lazy"><span class="continue-play"><svg><use href="#i-play"/></svg></span></div>
        <div class="continue-copy"><b>${esc(title)}</b><small>${esc(epTitle)} • ${formatClock(p.position_seconds)} من ${formatClock(p.duration_seconds)}</small><div class="continue-progress"><i style="width:${pct}%"></i></div></div>
      </article>`);
    }
  }
  $("#continueRail").innerHTML=html.length?html.join(""):'<div class="empty-card">ما عندك مشاهدة غير مكتملة بعد.</div>';
  $("#continueRail").querySelectorAll("[data-cont]").forEach(el=>el.onclick=()=>openPlayer(playable[Number(el.dataset.cont)]));
  $("#continueRail").querySelectorAll("[data-cont-remove]").forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const o=playable[Number(btn.dataset.contRemove)];
    if(o)removeContinueEntry(o.type,o.id);
  });
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
          seriesId:series.id,seriesTitle:series.title,seasonNumber:seasons[i].season_number,
          episodeNumber:ep.episode_number,episodeTitle:ep.title||("الحلقة "+ep.episode_number),
          next:next?{
            type:"episode",id:next.id,title:series.title+" • "+(next.title||("الحلقة "+next.episode_number)),
            publicId:next.public_id,src:mediaUrl("episode_video",next.id),
            seriesId:series.id,seriesTitle:series.title,seasonNumber:seasons[i].season_number,
            episodeNumber:next.episode_number,episodeTitle:next.title||("الحلقة "+next.episode_number)
          }:null
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

$("#changePasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const current=$("#currentPassword").value;
  const next=$("#newPassword").value;
  const confirm=$("#confirmNewPassword").value;
  if(next.length<8){showToast("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");return}
  if(next!==confirm){showToast("تأكيد كلمة المرور غير مطابق");return}
  if(current===next){showToast("اختر كلمة مرور جديدة مختلفة");return}
  const btn=e.submitter;btn.disabled=true;
  try{
    await rawApi("change_password",{method:"POST",auth:true,body:{current_password:current,new_password:next}});
    e.target.reset();closeModal("changePasswordModal");showToast("تم تحديث كلمة المرور");
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
    $("#requestsList").innerHTML=(j.requests||[]).length?(j.requests||[]).map((x,i)=>`<div class="request-item"><div class="request-top"><b>${esc(x.title)}</b><span class="status-pill status-${esc(x.status)}">${labels[x.status]||esc(x.status)}</span></div><small>${esc(x.request_code)} • ${x.request_type==="movie"?"فيلم":"مسلسل"}</small>${x.linked?`<button class="btn primary request-watch" data-request-watch="${i}"><svg><use href="#i-play"/></svg><span>مشاهدة الآن</span></button>`:""}</div>`).join(""):'<div class="empty-state">ما عندك طلبات بعد.</div>';
    $("#requestsList").querySelectorAll("[data-request-watch]").forEach(btn=>btn.onclick=()=>{
      const x=(j.requests||[])[Number(btn.dataset.requestWatch)];
      if(!x?.linked)return;
      closeModal("requestsModal");
      openDetails(x.linked.type,x.linked.id);
    });
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
const playerLayer=$("#playerLayer");
const playerStage=$("#playerStage");
const seekInput=$("#playerSeek");
let progressTimer=0;
let controlsTimer=0;
let holdTimer=0;
let holdActive=false;
let holdPreviousRate=1;
let lastTapAt=0;
let lastTapX=0;
let singleTapTimer=0;
let playerRetryCount=0;
let playerRetryTimer=0;
let nextCountdownTimer=0;
let nextCountdownTick=0;

function formatClock(value){
  const n=Math.max(0,Math.floor(Number(value)||0));
  const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;
  return h?String(h)+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m)+":"+String(s).padStart(2,"0");
}
function updatePlayIcon(){
  const use=$("#playPauseIcon use");
  if(use)use.setAttribute("href",video.paused?"#i-play":"#i-pause");
}
function syncPlayerUI(){
  const duration=Number.isFinite(video.duration)?video.duration:0;
  const current=Math.max(0,video.currentTime||0);
  $("#playerCurrentTime").textContent=formatClock(current);
  $("#playerDuration").textContent=formatClock(duration);
  $("#playerRemaining").textContent="−"+formatClock(Math.max(0,duration-current));
  if(duration>0&&!seekInput.matches(":active")){
    const v=Math.round((current/duration)*1000);
    seekInput.value=String(v);
    seekInput.style.setProperty("--progress",(v/10)+"%");
  }
  updatePlayIcon();
}
function scheduleControlsHide(){
  clearTimeout(controlsTimer);
  if(video.paused)return;
  controlsTimer=setTimeout(()=>playerLayer.classList.add("controls-hidden","idle"),3000);
}
function showPlayerControls(sticky=false){
  playerLayer.classList.remove("controls-hidden","idle");
  clearTimeout(controlsTimer);
  if(!sticky)scheduleControlsHide();
}
function flashSeek(text){
  const el=$("#seekFeedback");
  el.textContent=text;el.classList.remove("hidden");
  clearTimeout(flashSeek.timer);
  flashSeek.timer=setTimeout(()=>el.classList.add("hidden"),650);
}
function seekBy(delta){
  if(!Number.isFinite(video.duration)||video.duration<=0)return;
  video.currentTime=Math.min(video.duration,Math.max(0,(video.currentTime||0)+delta));
  flashSeek((delta>0?"+":"−")+Math.abs(delta)+" ث");
  syncPlayerUI();showPlayerControls();
}
function togglePlayback(){
  if(video.paused)video.play().catch(()=>{});
  else video.pause();
  updatePlayIcon();showPlayerControls();
}
function playerProgress(){
  const o=state.player;
  if(!o)return null;
  return state.user?progressFor(o.type,o.id):guestProgress().find(x=>x.entity_type===o.type&&x.entity_id===o.id);
}
async function recordPlaybackView(o){
  if(!o?.id||!["movie","episode"].includes(o.type))return;
  const key=o.type+":"+o.id;
  if(viewedThisSession.has(key))return;
  viewedThisSession.add(key);
  try{await rawApi("view",{method:"POST",body:{entity_type:o.type,entity_id:o.id,viewer_key:requestKey()}})}catch{}
}
function openPlayer(o){
  clearTimeout(playerRetryTimer);clearInterval(nextCountdownTimer);clearInterval(nextCountdownTick);
  playerRetryCount=0;
  $("#nextCountdown")?.classList.add("hidden");
  state.player=o;state.nextEpisode=o.next||null;
  $("#playerTitle").textContent=o.title;$("#playerMeta").textContent=o.publicId||"";
  $("#nextEpisodeBtn").classList.toggle("hidden",!o.next);
  $("#playerError").classList.add("hidden");$("#playerLoader").classList.remove("hidden");
  $("#playerErrorText").textContent="تحقق من الاتصال وحاول مرة أخرى.";
  playerLayer.classList.add("open");playerLayer.classList.remove("controls-hidden","idle");
  playerLayer.setAttribute("aria-hidden","false");
  seekInput.value="0";seekInput.style.setProperty("--progress","0%");
  $("#playerCurrentTime").textContent="0:00";$("#playerDuration").textContent="0:00";$("#playerRemaining").textContent="−0:00";
  video.playbackRate=1;$("#speedSelect").value="1";
  video.src=o.src;video.load();

  const p=playerProgress();
  video.addEventListener("loadedmetadata",()=>{
    if(p&&Number(p.position_seconds)>7&&Number(p.position_seconds)<video.duration-10){
      video.currentTime=Number(p.position_seconds);
    }
    syncPlayerUI();
    video.addEventListener("playing",()=>recordPlaybackView(o),{once:true});
    video.play().catch(()=>{showPlayerControls(true)});
  },{once:true});
  showPlayerControls();
}
async function closePlayer(){
  clearTimeout(playerRetryTimer);clearInterval(nextCountdownTimer);clearInterval(nextCountdownTick);
  $("#nextCountdown")?.classList.add("hidden");
  await saveCurrentProgress();
  video.pause();
  video.removeAttribute("src");video.load();
  playerLayer.classList.remove("open","controls-hidden","idle");
  playerLayer.setAttribute("aria-hidden","true");
  $("#playerLoader").classList.add("hidden");$("#playerError").classList.add("hidden");
  clearTimeout(controlsTimer);clearTimeout(holdTimer);clearTimeout(singleTapTimer);
  if(document.fullscreenElement===playerLayer){try{await document.exitFullscreen()}catch{}}
  try{screen.orientation?.unlock?.()}catch{}
  state.player=null;state.nextEpisode=null;
}
async function saveCurrentProgress(){
  const o=state.player;if(!o||!state.prefs.saveProgress||!video.duration||!isFinite(video.duration))return;
  const entry={
    entity_type:o.type,entity_id:o.id,position_seconds:Math.floor(video.currentTime||0),duration_seconds:Math.floor(video.duration||0),updated_at:new Date().toISOString(),
    ...(o.type==="episode"?{
      series_id:o.seriesId||null,series_title:o.seriesTitle||"",season_number:o.seasonNumber||null,
      episode_number:o.episodeNumber||null,episode_public_id:o.publicId||"",episode_title:o.episodeTitle||o.title||""
    }:{})
  };
  if(state.user){
    const i=state.progress.findIndex(x=>x.entity_type===o.type&&x.entity_id===o.id);if(i>=0)state.progress[i]=entry;else state.progress.unshift(entry);
    try{await rawApi("progress",{method:"POST",auth:true,body:entry})}catch{}
  }else{
    const list=guestProgress(),i=list.findIndex(x=>x.entity_type===o.type&&x.entity_id===o.id);if(i>=0)list[i]=entry;else list.unshift(entry);setGuestProgress(list);
  }
  renderContinue();
}

video.addEventListener("loadstart",()=>$("#playerLoader").classList.remove("hidden"));
video.addEventListener("waiting",()=>$("#playerLoader").classList.remove("hidden"));
video.addEventListener("stalled",()=>$("#playerLoader").classList.remove("hidden"));
video.addEventListener("playing",()=>{playerRetryCount=0;$("#playerLoader").classList.add("hidden");$("#playerError").classList.add("hidden");updatePlayIcon();scheduleControlsHide()});
video.addEventListener("canplay",()=>$("#playerLoader").classList.add("hidden"));
video.addEventListener("loadedmetadata",syncPlayerUI);
video.addEventListener("durationchange",syncPlayerUI);
video.addEventListener("play",()=>{updatePlayIcon();scheduleControlsHide()});
video.addEventListener("pause",()=>{updatePlayIcon();showPlayerControls(true);saveCurrentProgress()});
function retryCurrentPlayer(auto=false){
  const o=state.player;if(!o)return;
  const t=video.currentTime||0;
  $("#playerError").classList.add("hidden");$("#playerLoader").classList.remove("hidden");
  video.src=o.src;video.load();
  video.addEventListener("loadedmetadata",()=>{
    if(t>0&&t<video.duration)video.currentTime=t;
    video.play().catch(()=>{});
  },{once:true});
  if(!auto)playerRetryCount=0;
}
function startNextEpisodeCountdown(){
  const next=state.nextEpisode;if(!next)return;
  let left=5;
  $("#nextCountdownTitle").textContent=next.title||"الحلقة التالية";
  $("#nextCountdownSeconds").textContent=String(left);
  $("#nextCountdown").classList.remove("hidden");
  clearInterval(nextCountdownTick);
  nextCountdownTick=setInterval(()=>{
    left-=1;
    $("#nextCountdownSeconds").textContent=String(Math.max(0,left));
    if(left<=0){
      clearInterval(nextCountdownTick);
      $("#nextCountdown").classList.add("hidden");
      openPlayer(next);
    }
  },1000);
}
video.addEventListener("error",()=>{
  const code=video.error?.code||0;
  if(code===2&&navigator.onLine&&playerRetryCount<2&&state.player){
    playerRetryCount+=1;
    $("#playerError").classList.add("hidden");$("#playerLoader").classList.remove("hidden");
    $("#playerErrorText").textContent="إعادة الاتصال بمصدر الفيديو...";
    clearTimeout(playerRetryTimer);
    playerRetryTimer=setTimeout(()=>retryCurrentPlayer(true),1200*playerRetryCount);
    return;
  }
  $("#playerLoader").classList.add("hidden");
  $("#playerErrorText").textContent=code===2?"انقطع الاتصال بمصدر الفيديو. أعد المحاولة.":code===3?"تعذر قراءة الفيديو على هذا الجهاز.":"تعذر الوصول إلى مصدر الفيديو. أعد المحاولة.";
  $("#playerError").classList.remove("hidden");showPlayerControls(true);
});
video.addEventListener("timeupdate",()=>{
  syncPlayerUI();
  if(Date.now()-progressTimer>8000){progressTimer=Date.now();saveCurrentProgress()}
});
video.addEventListener("ended",async()=>{
  await saveCurrentProgress();showPlayerControls(true);
  if(state.prefs.autoplayNext&&state.nextEpisode)startNextEpisodeCountdown();
});

seekInput.addEventListener("input",e=>{
  const v=Number(e.target.value)||0;
  seekInput.style.setProperty("--progress",(v/10)+"%");
  if(Number.isFinite(video.duration)&&video.duration>0){
    const t=(v/1000)*video.duration;
    $("#playerCurrentTime").textContent=formatClock(t);
  }
  showPlayerControls(true);
});
seekInput.addEventListener("change",e=>{
  if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=(Number(e.target.value)/1000)*video.duration;
  syncPlayerUI();showPlayerControls();
});

function endHoldSpeed(){
  clearTimeout(holdTimer);
  if(!holdActive)return;
  holdActive=false;
  video.playbackRate=holdPreviousRate||1;
  $("#holdSpeedBadge").classList.add("hidden");
  $("#speedSelect").value=String(video.playbackRate);
  showPlayerControls();
}
playerStage.addEventListener("pointerdown",e=>{
  if(e.target.closest(".player-chrome,.player-error,.player-loader"))return;
  holdActive=false;
  holdPreviousRate=video.playbackRate||1;
  holdTimer=setTimeout(()=>{
    if(video.paused)return;
    holdActive=true;video.playbackRate=2;
    $("#holdSpeedBadge").classList.remove("hidden");
    if(navigator.vibrate)navigator.vibrate(20);
  },430);
});
playerStage.addEventListener("pointerup",e=>{
  if(e.target.closest(".player-chrome,.player-error,.player-loader"))return;
  clearTimeout(holdTimer);
  if(holdActive){endHoldSpeed();return}
  const now=Date.now(),x=e.clientX,w=window.innerWidth||1;
  const isDouble=now-lastTapAt<330&&Math.abs(x-lastTapX)<Math.max(70,w*.18);
  if(isDouble){
    clearTimeout(singleTapTimer);lastTapAt=0;
    if(x<w*.42)seekBy(-10);
    else if(x>w*.58)seekBy(10);
    else togglePlayback();
    return;
  }
  lastTapAt=now;lastTapX=x;
  clearTimeout(singleTapTimer);
  singleTapTimer=setTimeout(()=>{
    if(playerLayer.classList.contains("controls-hidden"))showPlayerControls();
    else{playerLayer.classList.add("controls-hidden","idle");clearTimeout(controlsTimer)}
  },330);
});
playerStage.addEventListener("pointercancel",endHoldSpeed);
playerStage.addEventListener("pointerleave",e=>{if(holdActive)endHoldSpeed()});
playerLayer.addEventListener("pointermove",()=>{if(!holdActive)showPlayerControls()});

$("#playerBack").onclick=closePlayer;
$("#playPauseBtn").onclick=togglePlayback;
$("#rewindBtn").onclick=()=>seekBy(-10);
$("#forwardBtn").onclick=()=>seekBy(10);
$("#speedSelect").onchange=e=>{
  video.playbackRate=Number(e.target.value)||1;
  flashSeek((Number(e.target.value)||1)+"×");showPlayerControls();
};
$("#pipBtn").onclick=async()=>{
  try{
    if(document.pictureInPictureElement)await document.exitPictureInPicture();
    else if(document.pictureInPictureEnabled&&video.requestPictureInPicture)await video.requestPictureInPicture();
    else showToast("صورة داخل صورة غير مدعومة على هذا الجهاز");
  }catch{showToast("تعذر تشغيل صورة داخل صورة")}
};
$("#fullscreenBtn").onclick=async()=>{
  try{
    if(document.fullscreenElement){
      await document.exitFullscreen();try{screen.orientation?.unlock?.()}catch{}
    }else if(playerLayer.requestFullscreen){
      await playerLayer.requestFullscreen();
      try{await screen.orientation?.lock?.("landscape")}catch{}
    }else if(video.webkitEnterFullscreen){
      video.webkitEnterFullscreen();
    }
  }catch{showToast("تعذر فتح ملء الشاشة")}
};
$("#nextEpisodeBtn").onclick=()=>{if(state.nextEpisode)openPlayer(state.nextEpisode)};
$("#retryPlayer").onclick=()=>retryCurrentPlayer(false);
$("#playNextNow").onclick=()=>{
  clearInterval(nextCountdownTick);$("#nextCountdown").classList.add("hidden");
  if(state.nextEpisode)openPlayer(state.nextEpisode);
};
$("#cancelNext").onclick=()=>{
  clearInterval(nextCountdownTick);$("#nextCountdown").classList.add("hidden");showPlayerControls(true);
};
document.addEventListener("keydown",e=>{
  if(!playerLayer.classList.contains("open")||e.target.matches("input,select,textarea"))return;
  if(e.key==="Escape"){closePlayer();return}
  if(e.key===" "){e.preventDefault();togglePlayback();return}
  if(e.key==="ArrowLeft"){e.preventDefault();seekBy(-10);return}
  if(e.key==="ArrowRight"){e.preventDefault();seekBy(10);return}
});
document.addEventListener("fullscreenchange",()=>{
  if(!document.fullscreenElement){try{screen.orientation?.unlock?.()}catch{}}
  showPlayerControls();
});

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
$("#openPasswordBtn").onclick=()=>openModal("changePasswordModal");
$("#openRequestBtn").onclick=()=>openModal("requestModal");
$("#openRequestsHistory").onclick=openRequests;
$("#openReportGeneral").onclick=()=>openReport("other","");
$("#autoplayNext").onchange=e=>{state.prefs.autoplayNext=e.target.checked;savePrefs()};
$("#saveProgress").onchange=e=>{state.prefs.saveProgress=e.target.checked;savePrefs()};

async function boot(){
  const splashTimer=setTimeout(()=>$("#splash")?.classList.add("hide"),900);
  try{
    loadPrefs();loadSession();
    await loadCatalog();
    await loadUserState();
  }finally{
    clearTimeout(splashTimer);
    setTimeout(()=>$("#splash")?.classList.add("hide"),250);
  }
}
window.addEventListener("online",()=>showToast("عاد الاتصال"));
window.addEventListener("offline",()=>showToast("لا يوجد اتصال بالإنترنت"));
document.addEventListener("visibilitychange",()=>{if(document.hidden)saveCurrentProgress()});
boot();
