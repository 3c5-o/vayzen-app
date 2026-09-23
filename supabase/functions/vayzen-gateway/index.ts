import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const BOT_SECRET = Deno.env.get("TELEGRAM_BOT_SECRET") ?? "";
const STREAM_GATEWAY = Deno.env.get("STREAM_GATEWAY") ?? "";
const STREAM_SIGNING_SECRET = Deno.env.get("STREAM_SIGNING_SECRET") ?? "";
const publishableMap = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const PUBLIC_KEY = publishableMap["default"] ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false },
});

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type, authorization, apikey",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{...cors,"Content-Type":"application/json; charset=utf-8"},
  });
}

async function tg(method:string,body:Record<string,unknown>){
  if(!BOT_TOKEN) throw new Error("Telegram bot token is not configured");
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),
  });
  const j=await r.json();
  if(!r.ok||!j.ok) throw new Error(j?.description||"Telegram API error");
  return j.result;
}

async function channel(key:string){
  const {data,error}=await db.from("telegram_channels")
    .select("telegram_channel_id,title,is_active")
    .eq("channel_key",key).maybeSingle();
  if(error) throw error;
  if(!data?.is_active||!data.telegram_channel_id) throw new Error(`Channel not configured: ${key}`);
  return data;
}

async function send(chatId:string|number,text:string,reply_markup?:unknown){
  return tg("sendMessage",{chat_id:chatId,text,...(reply_markup?{reply_markup}:{})});
}

type Admin={telegram_user_id:number;role:string;permissions:Record<string,boolean>;is_active:boolean};

async function getAdmin(id:string|number):Promise<Admin|null>{
  const {data}=await db.from("admin_users")
    .select("telegram_user_id,role,permissions,is_active")
    .eq("telegram_user_id",Number(id)).maybeSingle();
  return data?.is_active ? data as Admin : null;
}

function can(admin:Admin,perm:"content"|"requests"|"reports"|"logs"){
  if(admin.role==="owner"||admin.role==="secondary_admin") return true;
  const custom=admin.permissions?.[perm];
  if(typeof custom==="boolean") return custom;
  if(perm==="content") return admin.role==="content_manager";
  if(perm==="requests") return ["requests_manager","moderator","support"].includes(admin.role);
  if(perm==="reports") return ["requests_manager","moderator","support"].includes(admin.role);
  return false;
}

const mainMenu={
  inline_keyboard:[
    [{text:"إضافة فيلم",callback_data:"add_movie"},{text:"إضافة مسلسل",callback_data:"add_series"}],
    [{text:"إضافة حلقة",callback_data:"add_episode"}],
    [{text:"طلبات المستخدمين",callback_data:"requests"},{text:"البلاغات",callback_data:"reports"}],
    [{text:"آخر المحتوى",callback_data:"content"},{text:"الإحصائيات",callback_data:"stats"}],
    [{text:"إلغاء العملية",callback_data:"cancel"}],
  ]
};

async function showMenu(chatId:string|number,text="لوحة إدارة VAYZEN"){
  return send(chatId,text,mainMenu);
}

async function getSession(userId:number){
  const {data}=await db.from("bot_sessions").select("flow,step,draft")
    .eq("telegram_user_id",userId).maybeSingle();
  return data??null;
}
async function setSession(userId:number,flow:string,step:string,draft:Record<string,unknown>={}){
  const {error}=await db.from("bot_sessions").upsert({
    telegram_user_id:userId,flow,step,draft,updated_at:new Date().toISOString(),
  });
  if(error) throw error;
}
async function clearSession(userId:number){
  await db.from("bot_sessions").delete().eq("telegram_user_id",userId);
}

function photoFrom(m:any){
  const photos=Array.isArray(m.photo)?m.photo:[];
  if(photos.length){
    const p=photos[photos.length-1];
    return {file_id:p.file_id,file_unique_id:p.file_unique_id??null,mime_type:"image/jpeg",file_name:null,file_size:p.file_size??null};
  }
  const d=m.document;
  if(d?.file_id&&String(d.mime_type||"").startsWith("image/")){
    return {file_id:d.file_id,file_unique_id:d.file_unique_id??null,mime_type:d.mime_type,file_name:d.file_name??null,file_size:d.file_size??null};
  }
  return null;
}
function videoFrom(m:any){
  const v=m.video;
  if(v?.file_id) return {file_id:v.file_id,file_unique_id:v.file_unique_id??null,mime_type:v.mime_type??"video/mp4",file_name:v.file_name??null,file_size:v.file_size??null};
  const d=m.document;
  if(d?.file_id&&String(d.mime_type||"").startsWith("video/")){
    return {file_id:d.file_id,file_unique_id:d.file_unique_id??null,mime_type:d.mime_type,file_name:d.file_name??null,file_size:d.file_size??null};
  }
  return null;
}
function yearOf(v:string){
  const n=Number(v.trim());
  return Number.isInteger(n)&&n>=1888&&n<=2100?n:null;
}
function positiveOrNull(v:string){
  if(v.trim()==="-") return null;
  const n=Number(v.trim());
  return Number.isInteger(n)&&n>0?n:null;
}
function splitGenres(v:string){
  return v.split(/[,،/]/).map(x=>x.trim()).filter(Boolean).slice(0,12);
}
function sizeLabel(v:any){
  const n=Number(v||0);
  if(!n) return "غير معروف";
  return n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:`${(n/1024**2).toFixed(1)} MB`;
}

async function copyTo(key:string,fromChatId:number,messageId:number,caption:string){
  const ch=await channel(key);
  const r=await tg("copyMessage",{
    chat_id:ch.telegram_channel_id,
    from_chat_id:fromChatId,
    message_id:messageId,
    caption,
  });
  return {channel_id:Number(ch.telegram_channel_id),message_id:Number(r.message_id)};
}

async function saveAsset(entity_type:string,entity_id:string,kind:string,file:any,place:any){
  const {error}=await db.from("media_assets").upsert({
    entity_type,entity_id,kind,variant:"default",
    channel_id:place.channel_id,
    channel_message_id:place.message_id,
    telegram_file_id:file.file_id??null,
    telegram_unique_id:file.file_unique_id??null,
    mime_type:file.mime_type??null,
    file_name:file.file_name??null,
    file_size:file.file_size??null,
  },{onConflict:"entity_type,entity_id,kind,variant"});
  if(error) throw error;
}

async function adminLog(adminId:number,action:string,entity_type?:string,entity_id?:string,public_id?:string,details:any={}){
  await db.from("admin_logs").insert({
    admin_telegram_id:adminId,action,
    entity_type:entity_type??null,entity_id:entity_id??null,entity_public_id:public_id??null,details,
  });
  try{
    const ch=await channel("admin_logs");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:
      `VAYZEN ADMIN LOG\nAction: ${action}\nAdmin: ${adminId}\nID: ${public_id||"—"}\nType: ${entity_type||"—"}`
    });
  }catch{}
}

async function systemLog(level:string,message:string,details:any={}){
  try{await db.from("system_logs").insert({level,source:"edge",message,details});}catch{}
  try{
    const ch=await channel("system_logs");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`VAYZEN SYSTEM ${level.toUpperCase()}\n${message}`});
  }catch{}
}

function movieSummary(d:any){
  return [
    "معاينة الفيلم:",
    `الاسم: ${d.title}`,
    `الاسم الأصلي: ${d.original_title||"—"}`,
    `السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `المدة: ${d.duration_minutes?d.duration_minutes+" دقيقة":"—"}`,
    `الجودة: ${d.quality||"—"}`,
    `الحجم: ${sizeLabel(d.video?.file_size)}`,
  ].join("\n");
}
function seriesSummary(d:any){
  return [
    "معاينة المسلسل:",
    `الاسم: ${d.title}`,
    `الاسم الأصلي: ${d.original_title||"—"}`,
    `السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `الجودة: ${d.quality||"—"}`,
  ].join("\n");
}

async function publishMovie(userId:number,chatId:number,d:any){
  const {data:movie,error}=await db.from("movies").insert({
    title:d.title,original_title:d.original_title||"",description:d.description||"",
    release_year:d.release_year,genres:d.genres||[],language:d.language||"",country:d.country||"",
    duration_minutes:d.duration_minutes,quality:d.quality||"",status:"draft",created_by:userId,
  }).select("id,public_id").single();
  if(error||!movie) throw error??new Error("Movie insert failed");

  const infoCaption=[
    `${movie.public_id}`,
    "",
    `🎬 ${d.title}`,
    d.original_title&&d.original_title!==d.title?d.original_title:"",
    "",
    `السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `المدة: ${d.duration_minutes?d.duration_minutes+" دقيقة":"—"}`,
    `الجودة: ${d.quality||"—"}`,
    "",
    d.description||"",
    "",
    `Movie ID: ${movie.public_id}`,
  ].filter(Boolean).join("\n");

  const posterPlace=await copyTo("movies_info",chatId,d.poster_source_message_id,infoCaption);
  const videoPlace=await copyTo("movies_storage",chatId,d.video_source_message_id,
    `${movie.public_id} | ${d.title} | ${d.quality||"Video"} | ${sizeLabel(d.video?.file_size)}`);

  await saveAsset("movie",movie.id,"poster",d.poster,posterPlace);
  await saveAsset("movie",movie.id,"video",d.video,videoPlace);
  await db.from("movies").update({status:"published"}).eq("id",movie.id);
  await adminLog(userId,"movie_publish","movie",movie.id,movie.public_id,{title:d.title});
  return movie.public_id;
}

async function publishSeries(userId:number,chatId:number,d:any){
  const {data:series,error}=await db.from("series").insert({
    title:d.title,original_title:d.original_title||"",description:d.description||"",
    release_year:d.release_year,genres:d.genres||[],language:d.language||"",country:d.country||"",
    quality:d.quality||"",status:"draft",created_by:userId,
  }).select("id,public_id").single();
  if(error||!series) throw error??new Error("Series insert failed");

  const infoCaption=[
    `${series.public_id}`,"",`📺 ${d.title}`,
    d.original_title&&d.original_title!==d.title?d.original_title:"",
    "",`السنة: ${d.release_year||"—"}`,
    `التصنيف: ${(d.genres||[]).join(" • ")||"—"}`,
    `اللغة: ${d.language||"—"}`,
    `الدولة: ${d.country||"—"}`,
    `الجودة: ${d.quality||"—"}`,"",d.description||"","",
    `Series ID: ${series.public_id}`,
  ].filter(Boolean).join("\n");

  const posterPlace=await copyTo("series_info",chatId,d.poster_source_message_id,infoCaption);
  await saveAsset("series",series.id,"poster",d.poster,posterPlace);
  await db.from("series").update({status:"published"}).eq("id",series.id);
  await adminLog(userId,"series_publish","series",series.id,series.public_id,{title:d.title});
  return series.public_id;
}

async function publishEpisode(userId:number,chatId:number,d:any){
  const {data:series}=await db.from("series").select("id,title,public_id,status")
    .eq("public_id",String(d.series_public_id).toUpperCase()).maybeSingle();
  if(!series||series.status!=="published") throw new Error("Series not found");

  const {data:season,error:se}=await db.from("seasons").upsert({
    series_id:series.id,season_number:d.season_number,title:`الموسم ${d.season_number}`,status:"published",
  },{onConflict:"series_id,season_number"}).select("id").single();
  if(se||!season) throw se??new Error("Season failed");

  const {data:ep,error}=await db.from("episodes").upsert({
    season_id:season.id,episode_number:d.episode_number,title:d.title||`الحلقة ${d.episode_number}`,
    description:d.description||"",quality:d.quality||"",status:"draft",created_by:userId,
  },{onConflict:"season_id,episode_number"}).select("id,public_id").single();
  if(error||!ep) throw error??new Error("Episode failed");

  const place=await copyTo("series_storage",chatId,d.video_source_message_id,
    `${ep.public_id} | ${series.title} | موسم ${d.season_number} | حلقة ${d.episode_number} | ${d.quality||"Video"}`);
  await saveAsset("episode",ep.id,"video",d.video,place);
  await db.from("episodes").update({status:"published"}).eq("id",ep.id);
  await adminLog(userId,"episode_publish","episode",ep.id,ep.public_id,{series:series.title});
  return ep.public_id;
}

async function callback(q:any){
  const userId=Number(q.from?.id||0);
  const admin=await getAdmin(userId);
  if(!admin){
    await tg("answerCallbackQuery",{callback_query_id:q.id,text:"غير مصرح"});
    return;
  }
  await tg("answerCallbackQuery",{callback_query_id:q.id});
  const chatId=Number(q.message?.chat?.id||userId);
  const a=String(q.data||"");

  if(a==="cancel"){
    await clearSession(userId);
    return showMenu(chatId,"تم إلغاء العملية.");
  }
  if(a==="add_movie"){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await setSession(userId,"movie","title",{});
    return send(chatId,"أرسل اسم الفيلم.");
  }
  if(a==="add_series"){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await setSession(userId,"series","title",{});
    return send(chatId,"أرسل اسم المسلسل.");
  }
  if(a==="add_episode"){
    if(!can(admin,"content")) return send(chatId,"لا تملك صلاحية إضافة المحتوى.");
    await setSession(userId,"episode","series_id",{});
    return send(chatId,"أرسل Series ID، مثال: SER-000001");
  }
  if(a==="confirm_movie"){
    const s=await getSession(userId);
    if(!s||s.flow!=="movie"||s.step!=="confirm") return showMenu(chatId,"انتهت جلسة الفيلم.");
    const id=await publishMovie(userId,chatId,s.draft);
    await clearSession(userId);
    return showMenu(chatId,`تم نشر الفيلم بنجاح.\nMovie ID: ${id}`);
  }
  if(a==="confirm_series"){
    const s=await getSession(userId);
    if(!s||s.flow!=="series"||s.step!=="confirm") return showMenu(chatId,"انتهت جلسة المسلسل.");
    const id=await publishSeries(userId,chatId,s.draft);
    await clearSession(userId);
    return showMenu(chatId,`تم نشر المسلسل بنجاح.\nSeries ID: ${id}`);
  }
  if(a==="confirm_episode"){
    const s=await getSession(userId);
    if(!s||s.flow!=="episode"||s.step!=="confirm") return showMenu(chatId,"انتهت جلسة الحلقة.");
    const id=await publishEpisode(userId,chatId,s.draft);
    await clearSession(userId);
    return showMenu(chatId,`تم نشر الحلقة بنجاح.\nEpisode ID: ${id}`);
  }
  if(a==="content"){
    const [{data:m},{data:s}]=await Promise.all([
      db.from("movies").select("public_id,title").order("created_at",{ascending:false}).limit(8),
      db.from("series").select("public_id,title").order("created_at",{ascending:false}).limit(8),
    ]);
    return showMenu(chatId,
      "آخر الأفلام:\n"+((m??[]).map((x:any)=>`• ${x.public_id} | ${x.title}`).join("\n")||"—")+
      "\n\nآخر المسلسلات:\n"+((s??[]).map((x:any)=>`• ${x.public_id} | ${x.title}`).join("\n")||"—")
    );
  }
  if(a==="stats"){
    const [m,s,e,r,p]=await Promise.all([
      db.from("movies").select("id",{head:true,count:"exact"}),
      db.from("series").select("id",{head:true,count:"exact"}),
      db.from("episodes").select("id",{head:true,count:"exact"}),
      db.from("content_requests").select("id",{head:true,count:"exact"}).eq("status","new"),
      db.from("reports").select("id",{head:true,count:"exact"}).eq("status","new"),
    ]);
    return showMenu(chatId,`إحصائيات VAYZEN\n\nالأفلام: ${m.count||0}\nالمسلسلات: ${s.count||0}\nالحلقات: ${e.count||0}\nطلبات جديدة: ${r.count||0}\nبلاغات جديدة: ${p.count||0}`);
  }
  if(a==="requests"){
    if(!can(admin,"requests")) return send(chatId,"لا تملك صلاحية الطلبات.");
    const {data}=await db.from("content_requests").select("request_code,request_type,title,status")
      .order("created_at",{ascending:false}).limit(12);
    return showMenu(chatId,"الطلبات:\n"+((data??[]).map((x:any)=>`• ${x.request_code} | ${x.title} | ${x.status}`).join("\n")||"لا توجد طلبات"));
  }
  if(a==="reports"){
    if(!can(admin,"reports")) return send(chatId,"لا تملك صلاحية البلاغات.");
    const {data}=await db.from("reports").select("report_code,entity_public_id,reason,status")
      .order("created_at",{ascending:false}).limit(12);
    return showMenu(chatId,"البلاغات:\n"+((data??[]).map((x:any)=>`• ${x.report_code} | ${x.entity_public_id||"—"} | ${x.reason} | ${x.status}`).join("\n")||"لا توجد بلاغات"));
  }
  return showMenu(chatId);
}

async function message(m:any){
  const chatId=Number(m.chat?.id||0);
  const userId=Number(m.from?.id||0);
  if(!chatId||!userId) return;
  const admin=await getAdmin(userId);
  if(!admin) return send(chatId,"هذا البوت مخصص لإدارة VAYZEN.");
  const text=String(m.text??"").trim();

  if(text==="/start"||text==="/menu"){
    await clearSession(userId);
    return showMenu(chatId);
  }

  const s=await getSession(userId);
  if(!s) return showMenu(chatId);
  const d:any={...(s.draft??{})};

  if(s.flow==="movie"){
    if(s.step==="title"){if(!text)return send(chatId,"أرسل الاسم.");d.title=text;await setSession(userId,"movie","original_title",d);return send(chatId,"أرسل الاسم الأصلي، أو - للتخطي.");}
    if(s.step==="original_title"){d.original_title=text==="-"?"":text;await setSession(userId,"movie","description",d);return send(chatId,"أرسل وصف الفيلم، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"movie","year",d);return send(chatId,"أرسل سنة الإصدار.");}
    if(s.step==="year"){const y=yearOf(text);if(!y)return send(chatId,"السنة غير صحيحة.");d.release_year=y;await setSession(userId,"movie","genres",d);return send(chatId,"أرسل التصنيفات، مثال: أكشن، خيال علمي.");}
    if(s.step==="genres"){d.genres=splitGenres(text);await setSession(userId,"movie","language",d);return send(chatId,"أرسل اللغة.");}
    if(s.step==="language"){d.language=text;await setSession(userId,"movie","country",d);return send(chatId,"أرسل الدولة، أو - للتخطي.");}
    if(s.step==="country"){d.country=text==="-"?"":text;await setSession(userId,"movie","duration",d);return send(chatId,"أرسل مدة الفيلم بالدقائق، أو - للتخطي.");}
    if(s.step==="duration"){const n=positiveOrNull(text);if(text!=="-"&&!n)return send(chatId,"أرسل رقمًا صحيحًا أو -.");d.duration_minutes=n;await setSession(userId,"movie","quality",d);return send(chatId,"أرسل الجودة، مثال 1080p.");}
    if(s.step==="quality"){d.quality=text;await setSession(userId,"movie","poster",d);return send(chatId,"أرسل بوستر الفيلم.");}
    if(s.step==="poster"){const f=photoFrom(m);if(!f)return send(chatId,"أرسل صورة البوستر.");d.poster=f;d.poster_source_message_id=m.message_id;await setSession(userId,"movie","video",d);return send(chatId,"أرسل فيديو الفيلم. الحد الحالي 500MB.");}
    if(s.step==="video"){
      const f=videoFrom(m);if(!f)return send(chatId,"أرسل ملف فيديو.");
      if(f.file_size&&f.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 500MB.");
      d.video=f;d.video_source_message_id=m.message_id;
      await setSession(userId,"movie","confirm",d);
      return send(chatId,movieSummary(d),{inline_keyboard:[[{text:"نشر الفيلم",callback_data:"confirm_movie"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(s.flow==="series"){
    if(s.step==="title"){if(!text)return send(chatId,"أرسل الاسم.");d.title=text;await setSession(userId,"series","original_title",d);return send(chatId,"أرسل الاسم الأصلي، أو - للتخطي.");}
    if(s.step==="original_title"){d.original_title=text==="-"?"":text;await setSession(userId,"series","description",d);return send(chatId,"أرسل وصف المسلسل، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"series","year",d);return send(chatId,"أرسل سنة الإصدار.");}
    if(s.step==="year"){const y=yearOf(text);if(!y)return send(chatId,"السنة غير صحيحة.");d.release_year=y;await setSession(userId,"series","genres",d);return send(chatId,"أرسل التصنيفات.");}
    if(s.step==="genres"){d.genres=splitGenres(text);await setSession(userId,"series","language",d);return send(chatId,"أرسل اللغة.");}
    if(s.step==="language"){d.language=text;await setSession(userId,"series","country",d);return send(chatId,"أرسل الدولة، أو - للتخطي.");}
    if(s.step==="country"){d.country=text==="-"?"":text;await setSession(userId,"series","quality",d);return send(chatId,"أرسل الجودة.");}
    if(s.step==="quality"){d.quality=text;await setSession(userId,"series","poster",d);return send(chatId,"أرسل بوستر المسلسل.");}
    if(s.step==="poster"){
      const f=photoFrom(m);if(!f)return send(chatId,"أرسل صورة البوستر.");
      d.poster=f;d.poster_source_message_id=m.message_id;
      await setSession(userId,"series","confirm",d);
      return send(chatId,seriesSummary(d),{inline_keyboard:[[{text:"نشر المسلسل",callback_data:"confirm_series"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }

  if(s.flow==="episode"){
    if(s.step==="series_id"){if(!/^SER-\d{6}$/i.test(text))return send(chatId,"Series ID غير صحيح.");d.series_public_id=text.toUpperCase();await setSession(userId,"episode","season",d);return send(chatId,"أرسل رقم الموسم.");}
    if(s.step==="season"){const n=Number(text);if(!Number.isInteger(n)||n<1)return send(chatId,"رقم الموسم غير صحيح.");d.season_number=n;await setSession(userId,"episode","episode",d);return send(chatId,"أرسل رقم الحلقة.");}
    if(s.step==="episode"){const n=Number(text);if(!Number.isInteger(n)||n<1)return send(chatId,"رقم الحلقة غير صحيح.");d.episode_number=n;await setSession(userId,"episode","title",d);return send(chatId,"أرسل اسم الحلقة، أو - للاسم التلقائي.");}
    if(s.step==="title"){d.title=text==="-"?`الحلقة ${d.episode_number}`:text;await setSession(userId,"episode","description",d);return send(chatId,"أرسل وصف الحلقة، أو - للتخطي.");}
    if(s.step==="description"){d.description=text==="-"?"":text;await setSession(userId,"episode","quality",d);return send(chatId,"أرسل الجودة.");}
    if(s.step==="quality"){d.quality=text;await setSession(userId,"episode","video",d);return send(chatId,"أرسل فيديو الحلقة. الحد 500MB.");}
    if(s.step==="video"){
      const f=videoFrom(m);if(!f)return send(chatId,"أرسل ملف فيديو.");
      if(f.file_size&&f.file_size>MAX_VIDEO_BYTES)return send(chatId,"الفيديو أكبر من 500MB.");
      d.video=f;d.video_source_message_id=m.message_id;
      await setSession(userId,"episode","confirm",d);
      return send(chatId,`معاينة الحلقة:\n${d.series_public_id}\nالموسم: ${d.season_number}\nالحلقة: ${d.episode_number}\nالعنوان: ${d.title}\nالجودة: ${d.quality}\nالحجم: ${sizeLabel(f.file_size)}`,{inline_keyboard:[[{text:"نشر الحلقة",callback_data:"confirm_episode"},{text:"إلغاء",callback_data:"cancel"}]]});
    }
  }
  return showMenu(chatId);
}

async function asset(type:string,id:string){
  if(!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let entity_type="",kind="";
  if(type==="movie_poster"||type==="movie_video"){
    const {data}=await db.from("movies").select("status").eq("id",id).maybeSingle();
    if(data?.status!=="published") return null;
    entity_type="movie";kind=type==="movie_poster"?"poster":"video";
  }else if(type==="series_poster"){
    const {data}=await db.from("series").select("status").eq("id",id).maybeSingle();
    if(data?.status!=="published") return null;
    entity_type="series";kind="poster";
  }else if(type==="episode_video"){
    const {data:e}=await db.from("episodes").select("season_id,status").eq("id",id).maybeSingle();
    if(e?.status!=="published") return null;
    const {data:se}=await db.from("seasons").select("series_id,status").eq("id",e.season_id).maybeSingle();
    if(se?.status!=="published") return null;
    const {data:sr}=await db.from("series").select("status").eq("id",se.series_id).maybeSingle();
    if(sr?.status!=="published") return null;
    entity_type="episode";kind="video";
  }else return null;

  const {data}=await db.from("media_assets")
    .select("channel_id,channel_message_id,telegram_file_id,mime_type,file_size")
    .eq("entity_type",entity_type).eq("entity_id",id).eq("kind",kind).eq("variant","default").maybeSingle();
  return data??null;
}

async function hmacHex(payload:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(STREAM_SIGNING_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function media(type:string,id:string){
  const a:any=await asset(type,id);
  if(!a) return json({error:"not found"},404);
  if(type==="movie_video"||type==="episode_video"){
    if(!STREAM_GATEWAY||!STREAM_SIGNING_SECRET) return json({error:"streaming gateway not configured"},503);
    if(a.file_size&&Number(a.file_size)>MAX_VIDEO_BYTES) return json({error:"file exceeds current 500MB limit"},413);
    const exp=Math.floor(Date.now()/1000)+600;
    const payload=`${a.channel_id}:${a.channel_message_id}:${exp}`;
    const sig=await hmacHex(payload);
    return Response.redirect(`${STREAM_GATEWAY}/stream/${a.channel_id}/${a.channel_message_id}?exp=${exp}&sig=${sig}`,307);
  }
  if(!a.telegram_file_id) return json({error:"poster file id missing"},409);
  const file=await tg("getFile",{file_id:a.telegram_file_id});
  const upstream=await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  const headers=new Headers(cors);
  headers.set("Content-Type",upstream.headers.get("content-type")||a.mime_type||"image/jpeg");
  headers.set("Cache-Control","public, max-age=3600");
  return new Response(upstream.body,{status:upstream.status,headers});
}


async function userFromRequest(req:Request){
  const auth=req.headers.get("authorization")||"";
  const token=auth.toLowerCase().startsWith("bearer ")?auth.slice(7).trim():"";
  if(!token||!PUBLIC_KEY)return null;
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return null;
  return {user:data.user,token};
}

async function authSignup(req:Request){
  const body=await req.json().catch(()=>null);
  const email=String(body?.email||"").trim();
  const password=String(body?.password||"");
  const displayName=String(body?.display_name||"").trim().slice(0,40);
  if(!PUBLIC_KEY||!email.includes("@")||password.length<8||displayName.length<2)return json({error:"invalid signup data"},400);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name:displayName}}});
  if(error)return json({error:error.message},400);
  return json({ok:true,user:data.user?{id:data.user.id,email:data.user.email}:null,session:data.session?{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}:null});
}

async function authLogin(req:Request){
  const body=await req.json().catch(()=>null);
  const email=String(body?.email||"").trim();
  const password=String(body?.password||"");
  if(!PUBLIC_KEY)return json({error:"auth unavailable"},503);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signInWithPassword({email,password});
  if(error)return json({error:"بيانات الدخول غير صحيحة"},401);
  return json({ok:true,user:{id:data.user.id,email:data.user.email},session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}});
}

async function authRefresh(req:Request){
  const body=await req.json().catch(()=>null);
  const refreshToken=String(body?.refresh_token||"");
  if(!PUBLIC_KEY||!refreshToken)return json({error:"invalid refresh token"},400);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.refreshSession({refresh_token:refreshToken});
  if(error||!data.session)return json({error:"session expired"},401);
  return json({ok:true,session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at}});
}

async function me(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  const {data:profile}=await db.from("profiles").select("display_name,avatar_url,created_at").eq("id",auth.user.id).maybeSingle();
  return json({ok:true,user:{id:auth.user.id,email:auth.user.email,display_name:profile?.display_name||"",avatar_url:profile?.avatar_url||"",created_at:profile?.created_at||auth.user.created_at}});
}

async function updateProfile(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  const body=await req.json().catch(()=>null);
  const name=String(body?.display_name||"").trim().slice(0,40);
  if(name.length<2)return json({error:"invalid name"},400);
  const {error}=await db.from("profiles").update({display_name:name,updated_at:new Date().toISOString()}).eq("id",auth.user.id);
  if(error)throw error;
  return json({ok:true,display_name:name});
}

async function catalog(){
  const [m,s]=await Promise.all([
    db.from("movies").select("id,public_id,title,original_title,description,release_year,genres,language,country,duration_minutes,quality,is_featured,view_count,created_at").eq("status","published").order("created_at",{ascending:false}),
    db.from("series").select("id,public_id,title,original_title,description,release_year,genres,language,country,quality,is_featured,view_count,created_at").eq("status","published").order("created_at",{ascending:false})
  ]);
  if(m.error)throw m.error;if(s.error)throw s.error;
  return json({ok:true,movies:m.data??[],series:s.data??[]});
}

async function seriesContent(url:URL){
  const id=String(url.searchParams.get("id")||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid id"},400);
  const {data:seasons,error}=await db.from("seasons").select("id,season_number,title").eq("series_id",id).eq("status","published").order("season_number",{ascending:true});
  if(error)throw error;
  const out=[];
  for(const season of seasons??[]){
    const {data:episodes,error:e}=await db.from("episodes").select("id,public_id,episode_number,title,description,duration_minutes,quality").eq("season_id",season.id).eq("status","published").order("episode_number",{ascending:true});
    if(e)throw e;
    out.push({...season,episodes:episodes??[]});
  }
  return json({ok:true,seasons:out});
}

async function favoritesApi(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  if(req.method==="GET"){
    const {data,error}=await db.from("favorites").select("entity_type,entity_id,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false});
    if(error)throw error;return json({ok:true,favorites:data??[]});
  }
  const body=await req.json().catch(()=>null);
  const type=String(body?.entity_type||""),id=String(body?.entity_id||""),enabled=Boolean(body?.enabled);
  if(!["movie","series"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid favorite"},400);
  if(enabled){
    const {error}=await db.from("favorites").upsert({user_id:auth.user.id,entity_type:type,entity_id:id});
    if(error)throw error;
  }else{
    const {error}=await db.from("favorites").delete().eq("user_id",auth.user.id).eq("entity_type",type).eq("entity_id",id);
    if(error)throw error;
  }
  return json({ok:true});
}

async function progressApi(req:Request){
  const auth=await userFromRequest(req);
  if(!auth)return json({error:"unauthorized"},401);
  if(req.method==="GET"){
    const {data,error}=await db.from("watch_progress").select("entity_type,entity_id,position_seconds,duration_seconds,updated_at").eq("user_id",auth.user.id).order("updated_at",{ascending:false}).limit(100);
    if(error)throw error;return json({ok:true,progress:data??[]});
  }
  const body=await req.json().catch(()=>null);
  const type=String(body?.entity_type||""),id=String(body?.entity_id||"");
  const position=Math.max(0,Number(body?.position_seconds||0)),duration=Math.max(0,Number(body?.duration_seconds||0));
  if(!["movie","episode"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"invalid progress"},400);
  const {error}=await db.from("watch_progress").upsert({user_id:auth.user.id,entity_type:type,entity_id:id,position_seconds:position,duration_seconds:duration,updated_at:new Date().toISOString()});
  if(error)throw error;return json({ok:true});
}

async function publicRequest(req:Request){
  const b=await req.json().catch(()=>null);
  if(!b) return json({error:"invalid body"},400);
  const requester=String(b.requester_key||"").trim();
  const type=String(b.request_type||"");
  const title=String(b.title||"").trim().slice(0,160);
  const note=String(b.note||"").trim().slice(0,500);
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(requester)||!["movie","series"].includes(type)||title.length<2) return json({error:"invalid request"},400);
  const since=new Date(Date.now()-86400000).toISOString();
  const {count}=await db.from("content_requests").select("id",{head:true,count:"exact"}).eq("requester_key",requester).gte("created_at",since);
  if((count||0)>=5) return json({error:"daily limit reached"},429);
  const {data,error}=await db.from("content_requests").insert({requester_key:requester,request_type:type,title,note})
    .select("request_code,status,title,request_type,created_at").single();
  if(error) throw error;
  try{
    const ch=await channel("requests");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`طلب جديد\n${data.request_code}\nالنوع: ${type==="movie"?"فيلم":"مسلسل"}\nالاسم: ${title}\nملاحظة: ${note||"—"}`});
  }catch{}
  return json({ok:true,request:data},201);
}

async function requestStatus(url:URL){
  const k=String(url.searchParams.get("requester_key")||"");
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(k)) return json({error:"invalid key"},400);
  const {data}=await db.from("content_requests").select("request_code,request_type,title,status,created_at,updated_at")
    .eq("requester_key",k).order("created_at",{ascending:false}).limit(20);
  return json({ok:true,requests:data??[]});
}

async function publicReport(req:Request){
  const b=await req.json().catch(()=>null);
  if(!b) return json({error:"invalid body"},400);
  const reporter=String(b.reporter_key||"").trim();
  const type=String(b.entity_type||"");
  const publicId=String(b.entity_public_id||"").trim().slice(0,40);
  const reason=String(b.reason||"").trim().slice(0,160);
  const details=String(b.details||"").trim().slice(0,800);
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(reporter)||!["movie","series","episode","other"].includes(type)||reason.length<2) return json({error:"invalid report"},400);
  const {data,error}=await db.from("reports").insert({
    reporter_key:reporter,entity_type:type,entity_public_id:publicId,reason,details,
  }).select("report_code,status,created_at").single();
  if(error) throw error;
  try{
    const ch=await channel("reports");
    await tg("sendMessage",{chat_id:ch.telegram_channel_id,text:`بلاغ جديد\n${data.report_code}\nID: ${publicId||"—"}\nالسبب: ${reason}\nالتفاصيل: ${details||"—"}`});
  }catch{}
  return json({ok:true,report:data},201);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const url=new URL(req.url);
    if(req.method==="GET"&&url.searchParams.get("health")==="1"){
      return json({
        ok:true,name:"VAYZEN",maxVideoMB:500,
        botConfigured:Boolean(BOT_TOKEN),
        webhookSecretConfigured:Boolean(BOT_SECRET),
        streamGatewayConfigured:Boolean(STREAM_GATEWAY),
        streamSigningConfigured:Boolean(STREAM_SIGNING_SECRET),
      });
    }
    if(req.method==="GET"&&url.searchParams.has("setup")){
      if(!BOT_SECRET||url.searchParams.get("setup")!==BOT_SECRET) return json({error:"unauthorized"},401);
      const webhook=`${SUPABASE_URL}/functions/v1/vayzen-gateway`;
      const r=await tg("setWebhook",{url:webhook,secret_token:BOT_SECRET,allowed_updates:["message","callback_query"],drop_pending_updates:true});
      return json({ok:true,webhook,telegram:r});
    }
    const action=url.searchParams.get("action");
    if(action==="catalog"&&req.method==="GET") return catalog();
    if(action==="series_content"&&req.method==="GET") return seriesContent(url);
    if(action==="signup"&&req.method==="POST") return authSignup(req);
    if(action==="login"&&req.method==="POST") return authLogin(req);
    if(action==="refresh"&&req.method==="POST") return authRefresh(req);
    if(action==="me"&&req.method==="GET") return me(req);
    if(action==="profile"&&req.method==="POST") return updateProfile(req);
    if(action==="favorites"&&(req.method==="GET"||req.method==="POST")) return favoritesApi(req);
    if(action==="progress"&&(req.method==="GET"||req.method==="POST")) return progressApi(req);
    if(req.method==="POST"&&action==="request_content") return publicRequest(req);
    if(req.method==="GET"&&action==="request_status") return requestStatus(url);
    if(req.method==="POST"&&action==="report") return publicReport(req);

    const mt=url.searchParams.get("media"),id=url.searchParams.get("id");
    if(req.method==="GET"&&mt&&id) return media(mt,id);

    if(req.method!=="POST") return json({error:"method not allowed"},405);
    if(!BOT_SECRET||req.headers.get("x-telegram-bot-api-secret-token")!==BOT_SECRET) return json({error:"bad webhook signature"},403);

    const u=await req.json();
    if(u.callback_query) await callback(u.callback_query);
    else if(u.message) await message(u.message);
    return json({ok:true});
  }catch(e){
    const msg=e instanceof Error?e.message:"unknown error";
    console.error(msg);
    await systemLog("error",msg);
    return json({error:"internal error"},500);
  }
});
