(function () {
  window.normalizeEditorUrl = function(value, folder) {
    const url = String(value || '').trim();
    if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(url)) return url;
    // Preserve paths already rooted in either content directory.
    if (/^\/?(?:Games|Sites)(?:\/|$)/i.test(url)) return '/' + url.replace(/^\//, '');
    if (url.startsWith('/')) return url;
    return '/' + folder + '/' + url.replace(/^(?:\.\/)+/, '');
  };
  const style = document.createElement('style');
  style.textContent = `.editor-row-details{width:100%;min-width:0}.editor-row-details>summary{display:none;cursor:pointer;padding:.6rem;font-weight:700;overflow-wrap:anywhere}.editor-row-body{display:flex;align-items:center;gap:.5rem;width:100%;min-width:0}.admin-row-item[hidden]{display:none!important}.editor-search{width:100%;margin-bottom:1rem;padding:.8rem;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:6px}@media(max-width:700px){.editor-row-details>summary{display:list-item}.editor-row-body{flex-direction:column;align-items:stretch;padding-top:.6rem}.editor-row-body>input{width:100%;box-sizing:border-box}.editor-row-body>div{flex-wrap:wrap}.editor-row-body input{min-width:0}}`;
  document.head.appendChild(style);
  const mobile = matchMedia('(max-width:700px)');
  const initialized = new WeakSet();
  function initEditors() {
  ['games', 'sites'].forEach(kind => {
    const list = document.getElementById('ae-' + kind + '-list');
    if (!list || initialized.has(list)) return;
    initialized.add(list);
    const search = document.createElement('input');
    search.type = 'search'; search.className = 'editor-search';
    search.placeholder = 'Search ' + kind + ' by name or URL'; search.setAttribute('aria-label', search.placeholder);
    list.before(search);
    const empty = document.createElement('p'); empty.textContent = 'No matching ' + kind + '.'; empty.hidden = true; list.after(empty);
    function filter() {
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      list.querySelectorAll('.admin-row-item').forEach(row => {
        row.hidden = !Array.from(row.querySelectorAll('input:not([type=checkbox])')).some(input => input.value.toLowerCase().includes(q));
        if (!row.hidden) visible++;
      });
      empty.hidden = visible !== 0;
    }
    function enhance() {
      list.querySelectorAll('.admin-row-item').forEach(row => {
        if (row.querySelector('.editor-row-details')) return;
        const details = document.createElement('details'); details.className = 'editor-row-details'; details.open = !mobile.matches;
        const summary = document.createElement('summary');
        const body = document.createElement('div'); body.className = 'editor-row-body';
        while (row.firstChild) body.appendChild(row.firstChild);
        details.append(summary, body); row.appendChild(details);
        function title() { summary.textContent = body.querySelector('input')?.value || 'New ' + (kind === 'games' ? 'game' : 'site'); }
        title(); body.addEventListener('input', title);
      });
      filter();
    }
    new MutationObserver(enhance).observe(list, {childList:true});
    search.addEventListener('input', filter); list.addEventListener('input', filter);
    list.addEventListener('focusout', e => {
      if (!(e.target instanceof HTMLInputElement)) return;
      const row = e.target.closest('.admin-row-item');
      const url = kind === 'games' ? row?.querySelector('.game-url-input') : row?.querySelectorAll('input')[1];
      if (e.target !== url) return;
      url.value = window.normalizeEditorUrl(url.value, kind === 'games' ? 'Games' : 'Sites');
      window.adminHandleGameUrlInput?.(url); filter();
    });
    mobile.addEventListener('change', () => list.querySelectorAll('details').forEach(d => { d.open = !mobile.matches; }));
    enhance();
  });
  }
  const mount = document.getElementById('admin-panels-mount');
  if (mount) new MutationObserver(initEditors).observe(mount, {childList:true});
  initEditors();
})();
