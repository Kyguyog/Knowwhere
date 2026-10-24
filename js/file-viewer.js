// Shared unchanged viewer UI and preview behavior extracted from msg.html.
(function(){
  const template=document.createElement('template');
  template.innerHTML=`<div id="file-viewer-modal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);align-items:center;justify-content:center;flex-direction:column;gap:0;" onclick="if(event.target===this)closeFileViewer()">
  <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;width:min(92vw,820px);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.9);">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;border-bottom:1px solid var(--border);flex-shrink:0;">
      <div style="display:flex;align-items:center;gap:0.6rem;min-width:0;">
        <svg id="fv-icon" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24" width="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span id="fv-filename" style="font-family:var(--font-display);font-size:0.7rem;font-weight:700;letter-spacing:0.05em;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;"></span>
        <span id="fv-filesize" style="font-size:0.65rem;color:var(--muted);flex-shrink:0;"></span>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
        <a id="fv-download-btn" href="#" download style="display:flex;align-items:center;gap:0.35rem;padding:0.4rem 0.85rem;background:var(--primary-dim);border:1px solid rgba(168,85,247,0.4);border-radius:6px;color:var(--primary);font-family:var(--font-display);font-size:0.58rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;transition:background 0.15s;" onmouseover="this.style.background='rgba(168,85,247,0.25)'" onmouseout="this.style.background='var(--primary-dim)'">
          <svg fill="none" height="12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewbox="0 0 24 24" width="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Download
        </a>
        <button onclick="closeFileViewer()" style="background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:1rem;line-height:1;transition:color 0.15s;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--muted)'">✕</button>
      </div>
    </div>
    <!-- Body -->
    <div id="fv-body" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;min-height:0;padding:1rem;"></div>
  </div>
</div>`;
  document.body.appendChild(template.content);
function formatFileSize(bytes){if(!bytes)return'';if(bytes<1024)return bytes+'B';if(bytes<1048576)return(bytes/1024).toFixed(1)+'KB';return(bytes/1048576).toFixed(1)+'MB';}
function escapeHtml(str){if(!str)return'';return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
window.openFileViewer=function(url,name,type,size){
  const modal=document.getElementById('file-viewer-modal');
  const body=document.getElementById('fv-body');
  const fname=document.getElementById('fv-filename');
  const fsize=document.getElementById('fv-filesize');
  const dlBtn=document.getElementById('fv-download-btn');
  fname.textContent=name||'File';
  fsize.textContent=size?formatFileSize(size):'';
  dlBtn.href=url;
  dlBtn.download=name||'download';
  body.innerHTML='<div class="loading-spinner"><div class="spinner"></div> Loading...</div>';
  modal.style.display='flex';
  const ext=(name||'').split('.').pop().toLowerCase();
  const isImage=type==='image'||/^(png|jpe?g|gif|webp|bmp|svg|ico|avif|tiff?)$/.test(ext);
  const isVideo=type==='video'||/^(mp4|webm|ogg|mov|avi|mkv|m4v)$/.test(ext);
  const isAudio=/^(mp3|wav|ogg|aac|flac|m4a|opus)$/.test(ext);
  const isText=/^(txt|md|csv|json|xml|yaml|yml|log|sh|bat|py|js|ts|html|css|sql|env|ini|cfg|toml|rs|go|rb|php|java|c|cpp|h|cs|swift|kt)$/.test(ext);
  const isPdf=ext==='pdf';
  if(isImage){
    const img=document.createElement('img');
    img.src=url;img.alt=name||'image';
    img.style.cssText='max-width:100%;max-height:72vh;border-radius:8px;object-fit:contain;';
    img.onerror=()=>{body.innerHTML=`<div style="text-align:center;color:var(--muted);padding:2rem;">Could not load image</div>`;};
    body.innerHTML='';body.appendChild(img);
  } else if(isVideo){
    body.innerHTML=`<video controls style="max-width:100%;max-height:72vh;border-radius:8px;" src="${escapeHtml(url)}">Your browser does not support video.</video>`;
  } else if(isAudio){
    body.innerHTML=`<div style="padding:2rem;text-align:center;width:100%;"><audio controls style="width:100%;max-width:420px;" src="${escapeHtml(url)}"></audio><div style="margin-top:1rem;font-size:0.8rem;color:var(--muted);">${escapeHtml(name)}</div></div>`;
  } else if(isPdf){
    body.innerHTML=`<iframe src="${escapeHtml(url)}" style="width:100%;height:68vh;border:none;border-radius:6px;" title="${escapeHtml(name)}"></iframe>`;
  } else if(isText){
    // Fetch and display text content
    fetch(url).then(r=>r.text()).then(text=>{
      const pre=document.createElement('pre');
      pre.style.cssText='width:100%;max-height:66vh;overflow:auto;font-size:0.8rem;line-height:1.55;color:var(--text);white-space:pre-wrap;word-break:break-word;font-family:monospace;background:var(--bg);border-radius:8px;padding:1rem;border:1px solid var(--border);';
      pre.textContent=text.slice(0,200000);
      body.innerHTML='';body.appendChild(pre);
    }).catch(()=>{showDownloadOnly(body,name,url);});
  } else {
    // Unsupported — show download prompt
    showDownloadOnly(body,name,url);
  }
};
function showDownloadOnly(body,name,url){
  body.innerHTML=`<div style="text-align:center;padding:3rem 2rem;display:flex;flex-direction:column;align-items:center;gap:1.25rem;">
    <svg fill="none" height="52" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewbox="0 0 24 24" width="52" style="color:var(--muted);opacity:0.5;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <div style="color:var(--text);font-size:0.9rem;">${escapeHtml(name)}</div>
    <div style="color:var(--muted);font-size:0.8rem;">Preview not available for this file type.</div>
    <a href="${escapeHtml(url)}" download="${escapeHtml(name)}" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.65rem 1.5rem;background:var(--primary);color:#fff;border-radius:8px;font-family:var(--font-display);font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;box-shadow:0 0 20px rgba(168,85,247,0.3);">
      <svg fill="none" height="14" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewbox="0 0 24 24" width="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
      Download
    </a>
  </div>`;
}
window.closeFileViewer=function(){
  const modal=document.getElementById('file-viewer-modal');
  modal.style.display='none';
  const body=document.getElementById('fv-body');
  // Stop any playing video/audio
  body.querySelectorAll('video,audio').forEach(m=>{m.pause();m.src='';});
  body.innerHTML='';
};

  document.addEventListener('click',event=>{
    const attachment=event.target.closest('[data-fv-url]');
    if(!attachment)return;
    event.preventDefault();
    window.openFileViewer(attachment.dataset.fvUrl,attachment.dataset.fvName,attachment.dataset.fvType,Number(attachment.dataset.fvSize)||0);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')window.closeFileViewer();});
})();
