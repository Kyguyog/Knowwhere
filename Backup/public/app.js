const $ = id => document.getElementById(id);
let state, selected, initialized = false, saving = false, polling = false;
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
function render() {
  const { config, active, backups, recovery } = state;
  $('connection').textContent = config?.projectId || 'Not configured';
  $('database-label').textContent = config ? `${config.databaseId} · ${config.clientEmail}` : 'Connect your Firestore database below';
  $('next-backup').textContent = recovery ? 'Paused for recovery' : config?.enabled ? date(state.nextAt) : 'Schedule paused';
  $('schedule-label').textContent = config ? `Every ${config.intervalValue} ${config.intervalValue === 1 ? config.intervalUnit.slice(0, -1) : config.intervalUnit}` : 'No schedule yet';
  $('backup-count').replaceChildren(document.createTextNode(`${backups.length} `), element('small', `/ ${config?.retention || 100}`));
  $('storage-label').textContent = `${bytes(backups.reduce((sum, b) => sum + b.bytes, 0))} · Stored in your Docker volume`;
  $('backup-now').disabled = !config || !!active || !!recovery;
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
    if (backup.protected) created.append(element('span', 'Recovery protected', 'tag protected'));
    const kind = element('td'); kind.append(element('span', backup.kind, `tag ${backup.kind}`));
    const count = element('td', backup.count.toLocaleString()); count.append(element('small', bytes(backup.bytes)));
    const actions = element('td');
    const download = element('a', 'Download'); download.href = `/api/backups/${backup.id}/download`;
    download.setAttribute('aria-label', `Download backup from ${date(backup.createdAt)}`);
    const restore = element('button', 'Restore');
    restore.disabled = !!active || !config || config.projectId !== backup.projectId || config.databaseId !== backup.databaseId;
    restore.setAttribute('aria-label', `Restore backup from ${date(backup.createdAt)}`);
    restore.addEventListener('click', () => {
      selected = backup;
      $('restore-summary').textContent = `${date(backup.createdAt)} · ${backup.count.toLocaleString()} documents · ${backup.kind} backup`;
      $('confirmation-label').textContent = `${config.projectId}/${config.databaseId}`;
      $('confirmation').value = ''; $('restore-dialog').showModal();
    });
    actions.append(download, restore); row.append(created, kind, count, actions); $('backups').append(row);
  }
  const last = state.lastJob;
  $('last-result').textContent = last ? `${last.type} ${last.status} · ${date(last.finishedAt)}${last.error ? ` · ${last.error}` : ''}` : 'No jobs yet';
}
async function refresh() {
  if (polling) return; polling = true;
  try {
    state = await api('status');
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
$('settings-form').addEventListener('submit', async event => {
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
  finally { saving = false; $('save').textContent = 'Test connection & save'; await refresh(); }
});
$('backup-now').addEventListener('click', async () => {
  $('backup-now').disabled = true;
  try { await api('backup', {}); notice('Manual backup started.'); }
  catch (error) { notice(error.message, true); }
  await refresh();
});
$('cancel-restore').addEventListener('click', () => $('restore-dialog').close());
$('restore-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('confirmation').value !== $('confirmation-label').textContent) { $('confirmation').setCustomValidity('Type the full project/database shown above.'); $('confirmation').reportValidity(); return; }
  $('confirm-restore').disabled = true;
  try {
    await api('restore', { id: selected.id, confirmation: $('confirmation').value });
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
