#!/usr/bin/env python3
import json, os, subprocess, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

EDGE_URL=os.environ["EDGE_URL"].rstrip("/")
GATEWAY_URL=os.environ["GATEWAY_URL"].rstrip("/")
MEDIA_WORKER_URL=os.environ["MEDIA_WORKER_URL"].rstrip("/")
SERIES_ID=os.environ["SERIES_ID"]
SERIES_EXPECTED=int(os.environ.get("SERIES_EXPECTED","30"))
MKV_MOVIE_ID=os.environ["MKV_MOVIE_ID"]
PORT=int(os.environ.get("PORT","10000"))
RESULT={"ok":False,"checks":{}}

def get_json(url, timeout=90):
    req=urllib.request.Request(url,headers={"User-Agent":"VAYZEN-Smoke/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=timeout) as res:
        return int(res.status),res.geturl(),json.loads(res.read().decode("utf-8"))

def get_bytes(url, timeout=150):
    req=urllib.request.Request(url,headers={"User-Agent":"VAYZEN-Smoke/1.0"})
    with urllib.request.urlopen(req,timeout=timeout) as res:
        return int(res.status),res.geturl(),res.read()

def run(name, fn):
    t=time.time()
    try:
        value=fn()
        RESULT["checks"][name]={"ok":True,"seconds":round(time.time()-t,3),"result":value}
        print("CHECK_OK",name,json.dumps(value,ensure_ascii=False),flush=True)
    except Exception as exc:
        RESULT["checks"][name]={"ok":False,"seconds":round(time.time()-t,3),"error":f"{type(exc).__name__}: {exc}"}
        print("CHECK_FAIL",name,RESULT["checks"][name]["error"],flush=True)
        raise

def health(url):
    status,_,data=get_json(url)
    if status!=200 or not data.get("ok"): raise RuntimeError(f"health failed: {status}")
    return {"status":status,"ok":True,"service":data.get("service") or data.get("name"),
            "ffmpeg":data.get("ffmpeg"),"ffprobe":data.get("ffprobe")}

def series():
    q=urllib.parse.urlencode({"action":"series_content","id":SERIES_ID})
    status,_,data=get_json(EDGE_URL+"?"+q)
    seasons=data.get("seasons") or []
    episodes=[ep for s in seasons for ep in (s.get("episodes") or [])]
    if status!=200 or len(episodes)!=SERIES_EXPECTED:
        raise RuntimeError(f"episodes={len(episodes)} expected={SERIES_EXPECTED}")
    return {"status":status,"seasons":len(seasons),"episodes":len(episodes)}

def mkv():
    q=urllib.parse.urlencode({"media":"movie_video","id":MKV_MOVIE_ID,"source":"xtream"})
    status,final_url,playlist=get_bytes(EDGE_URL+"?"+q)
    text=playlist.decode("utf-8","replace")
    if status!=200 or "#EXTM3U" not in text: raise RuntimeError("playlist unavailable")
    segments=[x.strip() for x in text.splitlines() if x.strip() and not x.startswith("#")]
    if not segments: raise RuntimeError("playlist contains no segments")
    seg_url=urllib.parse.urljoin(final_url,segments[0])
    s2,_,data=get_bytes(seg_url)
    path="/tmp/seg.ts"; open(path,"wb").write(data)
    raw=subprocess.check_output(["ffprobe","-v","error","-select_streams","a:0","-show_entries","stream=codec_name,channels","-of","json",path],timeout=45)
    streams=json.loads(raw.decode("utf-8")).get("streams") or []
    if not streams: raise RuntimeError("no audio stream")
    codec=str(streams[0].get("codec_name") or "").lower()
    channels=int(streams[0].get("channels") or 0)
    if codec!="aac" or channels<1: raise RuntimeError(f"audio={codec}/{channels}")
    return {"playlist_status":status,"segment_status":s2,"audio_codec":codec,"channels":channels,"delivery":"hls"}

try:
    run("gateway_health",lambda:health(GATEWAY_URL+"/health"))
    run("media_worker_health",lambda:health(MEDIA_WORKER_URL+"/health"))
    run("edge_health",lambda:health(EDGE_URL+"?health=1"))
    run("series_full",series)
    run("mkv_audio",mkv)
    RESULT["ok"]=all(v.get("ok") for v in RESULT["checks"].values())
except Exception as exc:
    RESULT["ok"]=False
    RESULT["fatal"]=f"{type(exc).__name__}: {exc}"

print("SMOKE_RESULT "+json.dumps(RESULT,ensure_ascii=False),flush=True)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body=json.dumps(RESULT,ensure_ascii=False).encode()
        self.send_response(200 if RESULT.get("ok") else 500)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def log_message(self,*args): pass

HTTPServer(("0.0.0.0",PORT),Handler).serve_forever()
