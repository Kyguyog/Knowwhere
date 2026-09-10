#!/usr/bin/env python3
"""Firebase Game Photo Picker — scrapes images from game URLs and lets you pick screenshots."""

import json
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request

app = Flask(__name__)

FIREBASE_PROJECT = "knowwhere-firebase"
FIREBASE_API_KEY = "AIzaSyB_7DGpmrVotodTuPJDXoZrKrKbkzPhWDw"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"
DOC_PATH = f"{FIRESTORE_BASE}/siteContent/main"


def firestore_to_python(value):
    """Convert a Firestore REST API value to a Python object."""
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "booleanValue" in value:
        return value["booleanValue"]
    if "nullValue" in value:
        return None
    if "arrayValue" in value:
        return [firestore_to_python(v) for v in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {k: firestore_to_python(v) for k, v in value["mapValue"].get("fields", {}).items()}
    return None


def python_to_firestore(value):
    """Convert a Python object to a Firestore REST API value."""
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [python_to_firestore(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: python_to_firestore(v) for k, v in value.items()}}}
    return {"stringValue": str(value)}


def fetch_games():
    """Fetch all games from Firestore."""
    resp = requests.get(DOC_PATH, params={"key": FIREBASE_API_KEY})
    resp.raise_for_status()
    doc = resp.json()
    games_field = doc.get("fields", {}).get("games", {})
    return firestore_to_python(games_field) or {}


def save_games(games):
    """Save the entire games map back to Firestore."""
    payload = {"fields": {"games": python_to_firestore(games)}}
    resp = requests.patch(
        DOC_PATH,
        params={"key": FIREBASE_API_KEY, "updateMask.fieldPaths": "games"},
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


def scrape_images(url):
    """Scrape image URLs from a given page."""
    images = []
    try:
        parsed = urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except Exception as e:
        return images, str(e)

    soup = BeautifulSoup(resp.text, "html.parser")

    def resolve(src):
        if not src:
            return None
        full = urljoin(url, src)
        if full.startswith("data:"):
            return None
        return full

    seen = set()

    # og:image and image_src
    for tag in soup.find_all("meta", attrs={"property": "og:image"}):
        src = resolve(tag.get("content"))
        if src and src not in seen:
            seen.add(src)
            images.append({"url": src, "source": "og:image"})

    for tag in soup.find_all("link", attrs={"rel": "image_src"}):
        src = resolve(tag.get("href"))
        if src and src not in seen:
            seen.add(src)
            images.append({"url": src, "source": "link:image_src"})

    # <img> tags — skip tiny icons
    for tag in soup.find_all("img"):
        for attr in ("src", "data-src", "data-lazy-src"):
            src = resolve(tag.get(attr))
            if not src or src in seen:
                continue
            w = tag.get("width", "")
            h = tag.get("height", "")
            try:
                if (w and int(w) < 32) or (h and int(h) < 32):
                    continue
            except (ValueError, TypeError):
                pass
            seen.add(src)
            images.append({"url": src, "source": "img"})

    # <source> inside <picture>
    for tag in soup.find_all("source"):
        srcset = tag.get("srcset", "")
        for part in srcset.split(","):
            part = part.strip().split()[0] if part.strip() else ""
            src = resolve(part)
            if src and src not in seen:
                seen.add(src)
                images.append({"url": src, "source": "picture:source"})

    # <a> tags pointing to images
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        if re.search(r"\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)", href, re.I):
            src = resolve(href)
            if src and src not in seen:
                seen.add(src)
                images.append({"url": src, "source": "a:href"})

    # Inline background-image in style attrs
    for tag in soup.find_all(style=True):
        for match in re.findall(r"url\(['\"]?([^'\")\s]+)['\"]?\)", tag["style"]):
            src = resolve(match)
            if src and src not in seen:
                seen.add(src)
                images.append({"url": src, "source": "style:url"})

    return images, None


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Photo Picker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#111;color:#eee;display:flex;height:100vh}
#sidebar{width:320px;min-width:320px;background:#1a1a2e;overflow-y:auto;border-right:1px solid #333;display:flex;flex-direction:column}
#sidebar h2{padding:16px;font-size:16px;border-bottom:1px solid #333;color:#8be9fd;position:sticky;top:0;background:#1a1a2e;z-index:1}
#sidebar .count{font-size:12px;color:#666;padding:8px 16px;border-bottom:1px solid #333}
.game-item{padding:12px 16px;cursor:pointer;border-bottom:1px solid #222;transition:background .15s}
.game-item:hover{background:#2a2a4e}
.game-item.selected{background:#44475a;border-left:3px solid #8be9fd}
.game-item .name{font-weight:600;font-size:14px}
.game-item .url{font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
#main{flex:1;overflow-y:auto;padding:24px}
#main h2{margin-bottom:16px;color:#8be9fd}
#main .no-selection{color:#666;text-align:center;margin-top:100px;font-size:18px}
.image-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.image-card{background:#1a1a2e;border-radius:8px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;border:2px solid transparent}
.image-card:hover{transform:scale(1.03);box-shadow:0 4px 20px rgba(0,0,0,.5)}
.image-card.selected{border-color:#50fa7b}
.image-card img{width:100%;height:160px;object-fit:cover;background:#222}
.image-card .meta{padding:8px 10px;font-size:11px;color:#888}
.image-card .meta .source{color:#bd93f9}
#loading{display:none;text-align:center;padding:40px;color:#8be9fd}
#loading .spinner{display:inline-block;width:28px;height:28px;border:3px solid #333;border-top-color:#8be9fd;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#50fa7b;color:#111;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px;z-index:999;animation:fadeUp .4s ease}
@keyframes fadeUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
#refresh-btn{position:fixed;top:12px;right:16px;background:#44475a;color:#eee;border:1px solid #555;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;z-index:10}
#refresh-btn:hover{background:#6272a4}
</style>
</head>
<body>
<div id="sidebar">
  <h2>Games Without Screenshots</h2>
  <div class="count" id="count">Loading...</div>
  <div id="game-list"></div>
</div>
<div id="main">
  <button id="refresh-btn" onclick="loadGames()">Refresh</button>
  <div class="no-selection" id="placeholder">Select a game from the sidebar</div>
  <div id="loading"><div class="spinner"></div><div style="margin-top:12px">Scraping images...</div></div>
  <div id="game-header" style="display:none">
    <h2 id="game-name"></h2>
    <div style="font-size:12px;color:#666;margin-bottom:16px;word-break:break-all" id="game-url"></div>
  </div>
  <div class="image-grid" id="image-grid"></div>
</div>
<script>
let games=[], currentIdx=-1;
async function loadGames(){
  document.getElementById("count").textContent="Loading...";
  document.getElementById("game-list").innerHTML="";
  const r=await fetch("/api/games");
  games=await r.json();
  games.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  document.getElementById("count").textContent=games.length+" game"+(games.length!==1?"s":"")+" without screenshots";
  const list=document.getElementById("game-list");
  games.forEach((g,i)=>{
    const div=document.createElement("div");
    div.className="game-item";
    div.innerHTML=`<div class="name">${esc(g.name||"Unnamed")}</div><div class="url">${esc(g.url||"")}</div>`;
    div.onclick=()=>selectGame(i);
    list.appendChild(div);
  });
}
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
async function selectGame(idx){
  currentIdx=idx;
  document.querySelectorAll(".game-item").forEach((el,i)=>el.classList.toggle("selected",i===idx));
  const g=games[idx];
  document.getElementById("placeholder").style.display="none";
  document.getElementById("game-header").style.display="block";
  document.getElementById("game-name").textContent=g.name||"Unnamed";
  document.getElementById("game-url").textContent=g.url||"";
  document.getElementById("loading").style.display="block";
  document.getElementById("image-grid").innerHTML="";
  const r=await fetch("/api/scrape?url="+encodeURIComponent(g.url));
  const data=await r.json();
  document.getElementById("loading").style.display="none";
  const grid=document.getElementById("image-grid");
  if(!data.images||data.images.length===0){
    grid.innerHTML="<div style='color:#666;padding:20px'>No images found. "+esc(data.error||"")+"</div>";
    return;
  }
  data.images.forEach(img=>{
    const card=document.createElement("div");
    card.className="image-card";
    card.innerHTML=`<img src="${esc(img.url)}" loading="lazy" onerror="this.parentElement.style.display='none'"><div class="meta"><span class="source">${esc(img.source)}</span></div>`;
    card.onclick=()=>setScreenshot(g, img.url, card);
    grid.appendChild(card);
  });
}
async function setScreenshot(game, imgUrl, card){
  if(!confirm("Set this as the screenshot for '"+(game.name||"Unnamed")+"'?"))return;
  card.classList.add("selected");
  const r=await fetch("/api/set-screenshot",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({letter:game._letter, index:game._index, screenshot:imgUrl})
  });
  const res=await r.json();
  if(res.ok){
    showToast("Screenshot saved!");
    games.splice(currentIdx,1);
    renderSidebar();
    if(games.length>0) selectGame(Math.min(currentIdx,games.length-1));
    else{document.getElementById("placeholder").style.display="block";document.getElementById("game-header").style.display="none";document.getElementById("image-grid").innerHTML="";}
  } else {
    showToast("Error: "+(res.error||"unknown"),true);
  }
}
function renderSidebar(){
  document.getElementById("count").textContent=games.length+" game"+(games.length!==1?"s":"")+" without screenshots";
  const list=document.getElementById("game-list");
  list.innerHTML="";
  games.forEach((g,i)=>{
    const div=document.createElement("div");
    div.className="game-item";
    div.innerHTML=`<div class="name">${esc(g.name||"Unnamed")}</div><div class="url">${esc(g.url||"")}</div>`;
    div.onclick=()=>selectGame(i);
    list.appendChild(div);
  });
}
function showToast(msg,err){
  const t=document.createElement("div");
  t.className="toast";
  if(err)t.style.background="#ff5555";
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2500);
}
loadGames();
</script>
</body>
</html>"""


@app.route("/api/games")
def api_games():
    """Return games that have no screenshot set."""
    try:
        all_games = fetch_games()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    result = []
    for letter, game_list in all_games.items():
        if not isinstance(game_list, list):
            continue
        for idx, game in enumerate(game_list):
            if not isinstance(game, dict):
                continue
            screenshot = game.get("screenshot", "")
            if not screenshot or not screenshot.strip():
                game["_letter"] = letter
                game["_index"] = idx
                result.append(game)

    return jsonify(result)


@app.route("/api/scrape")
def api_scrape():
    """Scrape images from a URL."""
    url = request.args.get("url", "")
    if not url:
        return jsonify({"error": "No URL provided", "images": []})
    images, error = scrape_images(url)
    return jsonify({"images": images, "error": error})


@app.route("/api/set-screenshot", methods=["POST"])
def api_set_screenshot():
    """Set the screenshot for a game."""
    data = request.json
    letter = data.get("letter")
    index = data.get("index")
    screenshot = data.get("screenshot", "")

    if not letter or index is None or not screenshot:
        return jsonify({"ok": False, "error": "Missing fields"}), 400

    try:
        games = fetch_games()
        game_list = games.get(letter, [])
        if index >= len(game_list):
            return jsonify({"ok": False, "error": "Index out of range"}), 400

        game_list[index]["screenshot"] = screenshot
        games[letter] = game_list
        save_games(games)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("Starting Game Photo Picker on http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
