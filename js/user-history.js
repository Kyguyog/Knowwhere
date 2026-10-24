(function () {
  function openCard(event) {
    if (event.target.closest('button,input,a,select,textarea,label')) return;
    const card = event.target.closest('[data-profile-email]');
    if (!card || (event.type === 'keydown' && !['Enter',' '].includes(event.key))) return;
    event.preventDefault();
    window.openProfile?.(card.dataset.profileEmail);
  }
  document.addEventListener('click', openCard);
  document.addEventListener('keydown', openCard);
  window.renderHistoryAttachment = function(msg) {
    const url = String(msg.fileUrl || '');
    if (!/^(https?:\/\/|data:(?:image\/(?:png|jpeg|gif|webp)|video\/|audio\/|application\/|text\/))/i.test(url)) return '';
    const esc = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const src = esc(url), name = esc(msg.fileName || 'Attachment');
    if (msg.fileType === 'image') return `<div><button type="button" data-fv-url="${src}" data-fv-name="${name}" data-fv-type="image" data-fv-size="${Number(msg.fileSize)||0}" aria-label="Preview ${name}" style="padding:0;border:0;background:transparent;cursor:pointer"><img src="${src}" alt="${name}" loading="lazy" style="max-width:100%;max-height:320px;border-radius:6px;margin-top:.5rem"></button></div>`;
    if (msg.fileType === 'video') return `<video src="${src}" controls preload="metadata" style="max-width:100%;max-height:320px"></video>`;
    if ((msg.mimeType || '').startsWith('audio/')) return `<audio src="${src}" controls preload="metadata"></audio>`;
    return `<div><a href="${src}" download="${name}" target="_blank" rel="noopener noreferrer">📎 ${name}</a></div>`;
  };
})();
