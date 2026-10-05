export type XtreamCredentials = {
  server:string;
  username:string;
  password:string;
};

export type XtreamCatalogItem = Record<string,unknown>;

const COUNTRY_RULES:Array<[string,string[]]> = [
  ["IQ",["iraq","iraqi","العراق","عراقي","عراقية"]],
  ["TR",["turkey","turkish","türk","turk","تركي","تركية","تركيا"]],
  ["SY",["syria","syrian","سوري","سورية","سوريا"]],
  ["EG",["egypt","egyptian","مصري","مصرية","مصر"]],
  ["LB",["lebanon","lebanese","لبناني","لبنانية","لبنان"]],
  ["SA",["saudi","السعودية","سعودي","سعودية"]],
  ["KW",["kuwait","kuwaiti","الكويت","كويتي","كويتية"]],
  ["AE",["uae","emirates","emirati","الإمارات","امارات","إماراتي","اماراتي"]],
  ["QA",["qatar","qatari","قطر","قطري","قطرية"]],
  ["BH",["bahrain","bahraini","البحرين","بحريني"]],
  ["OM",["oman","omani","عمان","عُمان","عماني"]],
  ["JO",["jordan","jordanian","الأردن","الاردن","أردني","اردني"]],
  ["PS",["palestine","palestinian","فلسطين","فلسطيني"]],
  ["MA",["morocco","moroccan","المغرب","مغربي"]],
  ["DZ",["algeria","algerian","الجزائر","جزائري"]],
  ["TN",["tunisia","tunisian","تونس","تونسي"]],
  ["KR",["korea","korean","كوريا","كوري","كورية"]],
  ["JP",["japan","japanese","اليابان","ياباني","يابانية"]],
  ["IN",["india","indian","bollywood","الهند","هندي","هندية"]],
  ["US",["usa","u.s.","american","أمريكي","امريكي","أمريكية","امريكية"]],
  ["GB",["uk","british","england","بريطاني","بريطانية"]],
  ["ES",["spain","spanish","إسباني","اسباني","إسبانية","اسبانية"]],
  ["FR",["france","french","فرنسا","فرنسي","فرنسية"]],
  ["DE",["germany","german","ألمانيا","المانيا","ألماني","الماني"]],
  ["IT",["italy","italian","إيطاليا","ايطاليا","إيطالي","ايطالي"]],
  ["MX",["mexico","mexican","المكسيك","مكسيكي"]],
  ["CN",["china","chinese","الصين","صيني","صينية"]]
];

export function normalizeXtreamServer(value:string){
  let raw=String(value||"").trim();
  if(!/^https?:\/\//i.test(raw))raw="https://"+raw;
  const url=new URL(raw);
  if(!["http:","https:"].includes(url.protocol))throw new Error("Unsupported Xtream protocol");
  url.username="";
  url.password="";
  url.search="";
  url.hash="";
  url.pathname=url.pathname.replace(/\/player_api\.php\/?$/i,"").replace(/\/+$/,"");
  return url.href.replace(/\/$/,"");
}

export function validateXtreamCredentials(input:Partial<XtreamCredentials>):XtreamCredentials{
  const server=normalizeXtreamServer(String(input.server||""));
  const username=String(input.username||"").trim();
  const password=String(input.password||"").trim();
  if(!username||!password)throw new Error("Xtream username/password required");
  if(username.length>240||password.length>240)throw new Error("Xtream credentials too long");
  return {server,username,password};
}

export async function xtreamRequest(
  credentials:XtreamCredentials,
  action="",
  params:Record<string,string|number|boolean|undefined>={},
  timeoutMs=25000
){
  const cfg=validateXtreamCredentials(credentials);
  const url=new URL(cfg.server+"/player_api.php");
  url.searchParams.set("username",cfg.username);
  url.searchParams.set("password",cfg.password);
  if(action)url.searchParams.set("action",action);
  for(const [key,value] of Object.entries(params)){
    if(value!==undefined)url.searchParams.set(key,String(value));
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url.href,{
      method:"GET",
      headers:{Accept:"application/json","User-Agent":"VAYZEN/1.0"},
      cache:"no-store",
      signal:controller.signal
    });
    if(!response.ok)throw new Error("Xtream HTTP "+response.status);
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("json")){
      const raw=await response.text();
      try{return JSON.parse(raw);}catch{throw new Error("Xtream returned non-JSON response");}
    }
    return await response.json();
  }catch(error){
    if(error instanceof DOMException&&error.name==="AbortError")throw new Error("Xtream request timeout");
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

export function normalizeCatalogTitle(value:string){
  return String(value||"")
    .normalize("NFKC")
    .replace(/\[[^\]]{0,40}\]/g," ")
    .replace(/\([^)]*(?:4k|uhd|fhd|hd|1080p|720p|480p|dub|sub)[^)]*\)/gi," ")
    .replace(/\b(?:4k|uhd|fhd|full\s*hd|1080p|720p|480p|2160p|web[- .]?dl|bluray|blu[- ]?ray|hdtv|x26[45]|hevc)\b/gi," ")
    .replace(/[._]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

export function extractCatalogYear(item:Record<string,unknown>,title=""){
  for(const candidate of [item.year,item.release_year,item.releaseDate,item.releasedate,item.added]){
    const text=String(candidate??"");
    const match=text.match(/\b(19\d{2}|20\d{2}|2100)\b/);
    if(match)return Number(match[1]);
  }
  const match=String(title||"").match(/(?:^|\D)(19\d{2}|20\d{2}|2100)(?:\D|$)/);
  return match?Number(match[1]):null;
}

export function identityKey(type:"movie"|"series",title:string,year:number|null){
  const normalized=normalizeCatalogTitle(title)
    .toLocaleLowerCase("en")
    .replace(/[\u064B-\u065F\u0670]/g,"")
    .replace(/[أإآ]/g,"ا")
    .replace(/ة/g,"ه")
    .replace(/ى/g,"ي")
    .replace(/[^\p{L}\p{N}]+/gu," ")
    .trim();
  return [type,normalized,year||0].join(":");
}

export function classifyCountry(...values:Array<unknown>){
  const haystack=values.map(value=>String(value??"").toLocaleLowerCase("en")).join(" | ");
  for(const [code,tokens] of COUNTRY_RULES){
    if(tokens.some(token=>haystack.includes(token.toLocaleLowerCase("en"))))return code;
  }
  return "";
}

export function qualityFromName(...values:Array<unknown>){
  const text=values.map(value=>String(value??"")).join(" ").toLowerCase();
  if(/\b(2160p|4k|uhd)\b/.test(text))return "2160p";
  if(/\b1080p\b|\bfhd\b|full\s*hd/.test(text))return "1080p";
  if(/\b720p\b|\bhd\b/.test(text))return "720p";
  if(/\b480p\b|\bsd\b/.test(text))return "480p";
  if(/\b360p\b/.test(text))return "360p";
  return "";
}

export function categoryMap(categories:unknown){
  const map=new Map<string,string>();
  if(Array.isArray(categories)){
    for(const category of categories as Record<string,unknown>[]){
      const id=String(category?.category_id??"");
      if(id)map.set(id,String(category?.category_name??"").trim());
    }
  }
  return map;
}

export function asXtreamArray(value:unknown):Record<string,unknown>[]{
  return Array.isArray(value)?value.filter(x=>x&&typeof x==="object") as Record<string,unknown>[]:[];
}
