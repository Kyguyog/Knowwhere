const $ = id => document.getElementById(id);
let state, selected, initialized = false, saving = false, polling = false;
let treeIdentity = '', draftExclusions = [], exclusionsDirty = false, exclusionsSaving = false, treeLocked = false, stateRevision = 0;
const treeCache = new Map(), treeOpen = new Set();
const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const bytes = value => value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;

function notice(message, error = false) {
  $('notice').hidden = false; $('notice').textContent = message; $('notice').className = error ? 'error' : '';
}
async function api(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (response.status === 401) { window.location.replace('/login'); throw new Error('Your admin session expired. Please sign in.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function fillForm(config) {
  if (!config) return;
  $('project-id').value = config.projectId; $('database-id').value = config.databaseId;
  $('interval-value').value = config.intervalValue; $('interval-unit').value = config.intervalUnit;
  $('retention').value = config.retention; $('enabled').checked = config.enabled;
  $('credential-status').textContent = 'Saved key · leave blank to keep it';
}
const excludedBy = path => draftExclusions.find(excluded => path === excluded || path.startsWith(`${excluded}/`));
const exclusionKey = paths => JSON.stringify([...paths].sort());
function changeExclusion(path, excluded) {
  draftExclusions = draftExclusions.filter(existing => existing !== path && !existing.startsWith(`${path}/`));
  if (excluded && !excludedBy(path)) draftExclusions.push(path);
  exclusionsDirty = exclusionKey(draftExclusions) !== exclusionKey(state.config?.excludedPaths || []);
  renderTree(); render();
}
async function loadBranch(path, more = false) {
  if (!state.config || treeCache.get(path)?.loading) return;
  const identity = treeIdentity;
  const cached = more ? treeCache.get(path) : null;
  const branch = { nodes: cached?.nodes || [], nextPageToken: cached?.nextPageToken || null, loading: true, error: '' };
  treeCache.set(path, branch); renderTree();
  const query = new URLSearchParams({ path });
  if (more && branch.nextPageToken) query.set('pageToken', branch.nextPageToken);
  try {
    const data = await api(`tree?${query}`);
    if (identity !== treeIdentity || `${data.projectId}/${data.databaseId}` !== treeIdentity) return;
    branch.nodes = [...new Map([...branch.nodes, ...data.nodes].map(node => [node.path, node])).values()];
    branch.nextPageToken = data.nextPageToken;
  } catch (error) { if (identity === treeIdentity) branch.error = error.message; }
  finally { branch.loading = false; if (identity === treeIdentity) renderTree(); }
}
function renderTree() {
  const focused = document.activeElement?.dataset.treeFocus;
  const locked = !!state?.active || !!state?.recovery || exclusionsSaving;
  const container = $('database-tree'); container.replaceChildren();
  const branchList = path => {
    const branch = treeCache.get(path), list = element('ul');
    if (!branch) return list;
    for (const node of branch.nodes) {
      const item = element('li'), row = element('div', undefined, 'tree-row');
      const expanded = treeOpen.has(node.path);
      const toggle = element('button', expanded ? '⌄' : '›', 'tree-expand'); toggle.type = 'button';
      toggle.dataset.treeFocus = `expand:${node.path}`;
      toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${node.path}`);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.addEventListener('click', () => {
        if (expanded) treeOpen.delete(node.path);
        else { treeOpen.add(node.path); if (!treeCache.has(node.path)) loadBranch(node.path); }
        renderTree();
      });
      const label = element('label'), checkbox = element('input'); checkbox.type = 'checkbox';
      checkbox.dataset.treeFocus = `ignore:${node.path}`; checkbox.dataset.path = node.path;
      checkbox.setAttribute('aria-label', `Ignore ${node.path}`);
      const inherited = excludedBy(node.path);
      checkbox.checked = !!inherited;
      checkbox.indeterminate = !inherited && draftExclusions.some(path => path.startsWith(`${node.path}/`));
      checkbox.disabled = locked || (!!inherited && inherited !== node.path);
      checkbox.addEventListener('change', () => changeExclusion(node.path, checkbox.checked));
      const name = element('span', node.id, 'tree-name'); name.title = node.path;
      label.append(checkbox, name, element('small', node.missing ? 'missing parent' : node.type));
      row.append(toggle, label);
      if (inherited) { row.classList.add('ignored'); row.append(element('span', inherited === node.path ? 'Ignored' : 'Inherited', 'tag')); }
      item.append(row);
      if (expanded) item.append(branchList(node.path));
      list.append(item);
    }
    if (branch.loading) list.append(element('li', 'Loading…', 'tree-message'));
    else if (branch.error) {
      const item = element('li', branch.error, 'tree-message tree-error'), retry = element('button', 'Retry');
      retry.type = 'button'; retry.addEventListener('click', () => loadBranch(path, branch.nodes.length > 0)); item.append(retry); list.append(item);
    } else if (!branch.nodes.length) list.append(element('li', path ? 'No children' : 'No collections found', 'tree-message'));
    if (!branch.loading && !branch.error && branch.nextPageToken) {
      const item = element('li'), more = element('button', 'Load more', 'tree-more'); more.type = 'button';
      more.dataset.treeFocus = `more:${path}`; more.addEventListener('click', () => loadBranch(path, true)); item.append(more); list.append(item);
    }
    return list;
  };
  if (treeCache.has('')) container.append(branchList(''));
  else container.append(element('p', state?.config ? 'Load the tree to browse collections and documents.' : 'Connect your database, then load the tree.', 'tree-message'));
  $('excluded-paths').replaceChildren();
  for (const path of draftExclusions) {
    const item = element('li'), code = element('code', path), remove = element('button', 'Remove'); remove.type = 'button';
    remove.disabled = locked; remove.setAttribute('aria-label', `Remove exclusion ${path}`);
    remove.addEventListener('click', () => changeExclusion(path, false)); item.append(code, remove); $('excluded-paths').append(item);
  }
  $('exclusion-empty').hidden = draftExclusions.length > 0;
  $('exclusion-count').textContent = draftExclusions.length ? `${draftExclusions.length} selected` : 'None';
  $('exclusion-status').textContent = exclusionsSaving ? 'Saving…' : exclusionsDirty ? 'Unsaved changes · save before backing up or restoring' : 'Exclusions saved';
  $('save-exclusions').disabled = !state?.config || !exclusionsDirty || locked;
  $('discard-exclusions').disabled = !exclusionsDirty || locked;
  $('load-tree').disabled = !state?.config || !!treeCache.get('')?.loading;
  $('load-tree').textContent = treeCache.has('') ? 'Refresh tree' : 'Load tree';
  treeLocked = locked;
  if (focused) [...container.querySelectorAll('[data-tree-focus]')].find(el => el.dataset.treeFocus === focused)?.focus({ preventScroll: true });
}
function syncTree() {
  const identity = state.config ? `${state.config.projectId}/${state.config.databaseId}` : '';
  let changed = false;
  if (identity !== treeIdentity) {
    treeIdentity = identity; treeCache.clear(); treeOpen.clear(); exclusionsDirty = false; changed = true;
  }
  if (!exclusionsDirty && exclusionKey(draftExclusions) !== exclusionKey(state.config?.excludedPaths || [])) {
    draftExclusions = [...(state.config?.excludedPaths || [])]; changed = true;
  }
  if (changed || treeLocked !== (!!state.active || !!state.recovery || exclusionsSaving)) renderTree();
  $('load-tree').disabled = !state.config || !!treeCache.get('')?.loading;
}
function updateRestoreScope() {
  if (!selected) return;
  const current = state.config?.excludedPaths || [], omitted = selected.excludedPaths || [];
  const parts = [];
  if ($('restore-include-excluded').checked) parts.push('Currently excluded branches will be restored wherever this backup contains them.');
  else if (current.length) parts.push(`Current exclusions stay untouched: ${current.join(', ')}.`);
  else parts.push('There are no current exclusions.');
  if (omitted.length) parts.push(`This backup did not include these branches, so they will always stay untouched: ${omitted.join(', ')}.`);
  $('restore-exclusions').textContent = parts.join(' ');
}
function render() {
  const { config, active, backups, recovery } = state;
  $('connection').textContent = config?.projectId || 'Not configured';
  $('database-label').textContent = config ? `${config.databaseId} · ${config.clientEmail}` : 'Connect your Firestore database below';
  $('next-backup').textContent = recovery ? 'Paused for recovery' : config?.enabled ? date(state.nextAt) : 'Schedule paused';
  $('schedule-label').textContent = config ? `Every ${config.intervalValue} ${config.intervalValue === 1 ? config.intervalUnit.slice(0, -1) : config.intervalUnit}` : 'No schedule yet';
  $('backup-count').replaceChildren(document.createTextNode(`${backups.length} `), element('small', `/ ${config?.retention || 100}`));
  $('storage-label').textContent = `${bytes(backups.reduce((sum, b) => sum + b.bytes, 0))} · Stored in your Docker volume`;
  syncTree();
  $('backup-now').disabled = !config || !!active || !!recovery || exclusionsDirty || exclusionsSaving;
  $('save').disabled = !!active || saving || !!recovery;
  $('recovery').hidden = !recovery;
  $('acknowledge').disabled = !!active;
  $('job-panel').hidden = !active;
  if (active) {
    $('job-title').textContent = active.phase;
    $('job-detail').textContent = `${(active.type || 'job').toUpperCase()} · ${(active.count || 0).toLocaleString()} documents processed. You can leave this page open or return later.`;
  }
  $('backups').replaceChildren();
  $('empty').hidden = backups.length > 0;
  for (const backup of backups) {
    const row = element('tr');
    const created = element('td', date(backup.createdAt));
    created.append(element('small', `${backup.projectId} / ${backup.databaseId}`));
    if (backup.excludedPaths?.length) { const scope = element('small', `${backup.excludedPaths.length} excluded paths`); scope.title = backup.excludedPaths.join(', '); created.append(scope); }
    if (backup.protected) created.append(element('span', 'Recovery protected', 'tag protected'));
    const kind = element('td'); kind.append(element('span', backup.kind, `tag ${backup.kind}`));
    const count = element('td', backup.count.toLocaleString()); count.append(element('small', bytes(backup.bytes)));
    const actions = element('td');
    const download = element('a', 'Download'); download.href = `/api/backups/${backup.id}/download`;
    download.setAttribute('aria-label', `Download backup from ${date(backup.createdAt)}`);
    const restore = element('button', 'Restore');
    restore.disabled = !!active || exclusionsDirty || exclusionsSaving || !config || config.projectId !== backup.projectId || config.databaseId !== backup.databaseId;
    restore.setAttribute('aria-label', `Restore backup from ${date(backup.createdAt)}`);
    restore.addEventListener('click', () => {
      selected = backup;
      $('restore-summary').textContent = `${date(backup.createdAt)} · ${backup.count.toLocaleString()} documents · ${backup.kind} backup`;
      $('restore-include-excluded').checked = false; updateRestoreScope();
      $('confirmation-label').textContent = `${config.projectId}/${config.databaseId}`;
      $('confirmation').value = ''; $('restore-dialog').showModal();
    });
    actions.append(download, restore); row.append(created, kind, count, actions); $('backups').append(row);
  }
  const last = state.lastJob;
  $('last-result').textContent = last ? `${last.type} ${last.status} · ${date(last.finishedAt)}${last.error ? ` · ${last.error}` : ''}` : 'No jobs yet';
}
async function refresh() {
  if (polling || saving || exclusionsSaving) return; polling = true;
  const revision = stateRevision;
  try {
    const next = await api('status');
    if (revision !== stateRevision || saving || exclusionsSaving) return;
    state = next;
    if (!initialized) { fillForm(state.config); initialized = true; }
    render();
  } catch (error) { notice(error.message, true); }
  finally { polling = false; }
}
$('key-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 100000) { notice('Key file is too large.', true); return; }
  try { const value = await file.text(); JSON.parse(value); $('service-account').value = value; }
  catch { notice('Choose a valid JSON service-account key file.', true); }
});
$('load-tree').addEventListener('click', () => { treeCache.clear(); treeOpen.clear(); loadBranch(''); });
$('discard-exclusions').addEventListener('click', () => {
  draftExclusions = [...(state.config?.excludedPaths || [])]; exclusionsDirty = false; renderTree(); render();
});
$('save-exclusions').addEventListener('click', async () => {
  stateRevision++;
  exclusionsSaving = true; renderTree(); render();
  try {
    state = await api('exclusions', { projectId: state.config.projectId, databaseId: state.config.databaseId, excludedPaths: draftExclusions });
    draftExclusions = [...state.config.excludedPaths]; exclusionsDirty = false;
    notice('Exclusions saved. Selected branches will be skipped unless you include them for an individual manual backup or restore.');
  } catch (error) { notice(error.message, true); }
  finally { stateRevision++; exclusionsSaving = false; renderTree(); render(); }
});
$('settings-form').addEventListener('submit', async event => {
  stateRevision++;
  event.preventDefault(); saving = true; $('save').disabled = true; $('save').textContent = 'Testing connection…';
  try {
    const serviceAccount = $('service-account').value.trim();
    state = await api('config', { serviceAccount: serviceAccount || undefined,
      projectId: $('project-id').value.trim(), databaseId: $('database-id').value.trim(),
      intervalValue: Number($('interval-value').value), intervalUnit: $('interval-unit').value,
      retention: Number($('retention').value), enabled: $('enabled').checked });
    $('service-account').value = ''; $('key-file').value = ''; fillForm(state.config);
    notice('Connection verified. Settings saved.');
  } catch (error) { notice(error.message, true); }
  finally { stateRevision++; saving = false; $('save').textContent = 'Test connection & save'; await refresh(); }
});
$('backup-now').addEventListener('click', () => {
  const exclusions = state.config?.excludedPaths || [];
  $('backup-exclusions').textContent = exclusions.length ? `Your excluded paths are: ${exclusions.join(', ')}. Include them to take a full database backup this time.` : 'There are no saved exclusions. Either choice backs up the entire database.';
  $('backup-dialog').showModal();
});
$('cancel-backup').addEventListener('click', () => $('backup-dialog').close());
async function startManualBackup(includeExcluded) {
  $('backup-now').disabled = true;
  $('backup-include-excluded').disabled = true; $('backup-keep-exclusions').disabled = true;
  try {
    await api('backup', { includeExcluded }); $('backup-dialog').close();
    notice(includeExcluded ? 'Manual backup started, including excluded data for this run.' : 'Manual backup started using your saved exclusions.');
  }
  catch (error) { $('backup-dialog').close(); notice(error.message, true); }
  finally { $('backup-include-excluded').disabled = false; $('backup-keep-exclusions').disabled = false; await refresh(); }
}
$('backup-include-excluded').addEventListener('click', () => startManualBackup(true));
$('backup-keep-exclusions').addEventListener('click', () => startManualBackup(false));
$('cancel-restore').addEventListener('click', () => $('restore-dialog').close());
$('restore-include-excluded').addEventListener('change', updateRestoreScope);
$('restore-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('confirmation').value !== $('confirmation-label').textContent) { $('confirmation').setCustomValidity('Type the full project/database shown above.'); $('confirmation').reportValidity(); return; }
  $('confirm-restore').disabled = true;
  try {
    await api('restore', { id: selected.id, confirmation: $('confirmation').value, includeExcluded: $('restore-include-excluded').checked });
    $('restore-dialog').close(); notice('Restore started. Creating a safety backup before changing documents.');
  } catch (error) { $('restore-dialog').close(); notice(error.message, true); }
  finally { $('confirm-restore').disabled = false; await refresh(); }
});
$('confirmation').addEventListener('input', () => $('confirmation').setCustomValidity(''));
$('acknowledge').addEventListener('click', () => { $('recovery-confirmation').value = ''; $('recovery-dialog').showModal(); });
$('cancel-recovery').addEventListener('click', () => $('recovery-dialog').close());
$('recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await api('recovery/acknowledge', { confirmation: $('recovery-confirmation').value }); $('recovery-dialog').close(); notice('Recovery acknowledged. Scheduling resumed.'); }
  catch (error) { $('recovery-dialog').close(); notice(error.message, true); }
  await refresh();
});
$('logout').addEventListener('click', async () => {
  try { await api('logout', {}); window.location.replace('/login'); }
  catch (error) { notice(error.message, true); }
});
refresh();
setInterval(refresh, 3000);
