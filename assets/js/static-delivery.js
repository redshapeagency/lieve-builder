(() => {
 'use strict';
 const config = window.LieveStaticConfig;
 const root = document.getElementById('lieve-static');
 if (!config || !root) return;
 let data = config.data, busy = false, server = 'nginx';
 const pageRoot = root.closest('.lieve-static-page');
 const status = root.querySelector('[data-static-status]');
 const labels = {dynamic: 'WordPress', stale: 'Needs generation', blocked: 'Not compatible', ready: 'Snapshot ready', error: 'Recovery required'};
 const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
 const safeUrl = value => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? esc(url.href) : '#'; } catch { return '#'; } };
 const pathLabel = value => { try { return new URL(value).pathname; } catch { return 'Invalid permalink'; } };
 function announce(message, error = false) {
  const setupOpen = pageRoot.querySelector('#lieve-static-setup').open;
  status.setAttribute('aria-live', setupOpen ? 'off' : 'polite'); status.textContent = message; status.classList.toggle('is-error', error);
  const setupStatus = pageRoot.querySelector('[data-static-setup-status]');
  if (setupStatus) { setupStatus.setAttribute('aria-live', setupOpen ? 'polite' : 'off'); setupStatus.textContent = message; setupStatus.classList.toggle('is-error', error); }
 }
 function rememberFocus() {
  const active = document.activeElement;
  for (const key of ['data-static-setting', 'data-static-select', 'data-static-generate', 'data-static-refresh', 'data-static-verify', 'data-static-generate-all']) {
   if (active?.hasAttribute(key)) { const value = active.getAttribute(key); return () => { const target = pageRoot.querySelector(`[${key}="${CSS.escape(value)}"]`); if (target && !target.disabled) target.focus({preventScroll:true}); }; }
  }
  return () => {};
 }
 function setBusy(value) {
  busy = value;
  root.setAttribute('aria-busy', String(value));
  pageRoot.querySelectorAll('button, input[type="checkbox"]').forEach(control => { control.disabled = value; });
  if (!value) syncDisabled();
 }
 function syncDisabled() {
  data.pages.forEach(page => { const button = root.querySelector(`[data-static-generate="${page.id}"]`); if (button) button.disabled = !page.selected || page.issues.length > 0; });
  root.querySelector('[data-static-generate-all]').disabled = !data.pages.some(page => page.selected && !page.issues.length);
  pageRoot.querySelector('[data-static-verify]').disabled = !data.settings.enabled;
 }
 function filter() {
  const query = root.querySelector('[data-static-search]').value.trim().toLowerCase();
  let visible = 0;
  data.pages.forEach(page => { const row = root.querySelector(`[data-static-id="${page.id}"]`); if (row) { row.hidden = !`${page.title} ${page.url}`.toLowerCase().includes(query); if (!row.hidden) visible++; } });
  root.querySelector('[data-static-empty]').hidden = visible > 0;
 }
 function render(next) {
  data = next;
  const focusId = document.activeElement?.getAttribute('data-static-select') || document.activeElement?.getAttribute('data-static-generate');
  const focusType = document.activeElement?.hasAttribute('data-static-select') ? 'select' : 'generate';
  root.querySelector('[data-static-list]').innerHTML = data.pages.map(page => `<tr data-static-id="${page.id}" id="static-page-${page.id}"><td data-label="Static mode"><label class="lieve-static-switch"><input type="checkbox" data-static-select="${page.id}" aria-label="Static mode for ${esc(page.title)}" ${page.selected ? 'checked' : ''}><span aria-hidden="true"></span></label></td><td data-label="Page"><a class="lieve-static-title" href="${safeUrl(page.edit)}">${esc(page.title)}</a><a class="lieve-static-url" href="${safeUrl(page.url)}" target="_blank" rel="noopener">${esc(pathLabel(page.url))}</a></td><td data-label="Status"><span class="lieve-static-status is-${esc(page.status)}">${esc(labels[page.status] || labels.stale)}</span>${page.message && page.selected ? `<span class="lieve-static-reason">${esc(page.message)}</span>` : ''}</td><td data-label="Generated"><span class="lieve-static-generated">${esc(page.generated || '—')}</span>${page.bytes ? `<small>${(page.bytes / 1024).toFixed(1)} KB HTML</small>` : ''}</td><td data-label="Actions"><button type="button" class="lieve-conditions-cancel" data-static-generate="${page.id}">${page.status === 'ready' ? 'Regenerate' : 'Generate'}</button></td></tr>`).join('');
  root.querySelectorAll('[data-static-setting]').forEach(control => { control.checked = data.settings[control.dataset.staticSetting]; });
  const badge = root.querySelector('[data-static-server-status]');
  const problem = data.settings.safety && data.settings.safety !== 'ok';
  badge.textContent = problem ? (data.settings.safety === 'unsafe' ? 'Unsafe delivery · host action required' : 'Delivery fenced · recovery required') : data.settings.active ? 'Server delivery active' : data.settings.verified ? 'Server verified · delivery paused' : 'Server setup required';
  badge.className = `lieve-static-status is-${problem ? 'blocked' : data.settings.active ? 'ready' : data.settings.verified ? 'dynamic' : 'stale'}`;
  root.querySelector('[data-static-server-note]').textContent = problem ? `${data.settings.error} ${data.settings.recovery}` : data.settings.active ? 'Verified requests are delivered by the web server, without running PHP.' : data.settings.verified ? 'Routing is verified. Enable delivery and generate fresh snapshots to serve selected pages.' : 'You can generate snapshots now. PHP-free delivery needs the server rules below and a successful verification.';
  filter(); syncDisabled();
  if (focusId) root.querySelector(`[data-static-${focusType}="${focusId}"]`)?.focus({preventScroll: true});
 }
 async function request(action, body) {
  const response = await ( window.LieveTransport?.fetch || fetch )( config.url + (action ? '/' + action : ''), {method: action ? 'POST' : 'GET', credentials: 'same-origin', headers: {'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json'}, ...(action ? {body: JSON.stringify(body || {})} : {})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The request failed. Refresh the page and try again.');
  return result;
 }
 async function run(action, body, success) {
  if (busy) return;
  const restoreFocus = rememberFocus();
  setBusy(true); announce(action === 'generate' ? 'Generating the anonymous page snapshot…' : action === 'verify' ? 'Checking server delivery and safety bypasses…' : 'Saving…');
  try { render(await request(action, body)); announce(success); }
  catch (error) { try { render(await request('')); } catch {} announce(error.message, true); }
  finally { setBusy(false); restoreFocus(); }
 }
 root.addEventListener('change', event => {
  const setting = event.target.closest('[data-static-setting]');
  if (setting) { run('settings', {enabled: root.querySelector('[data-static-setting="enabled"]').checked, automatic: root.querySelector('[data-static-setting="automatic"]').checked}, 'Delivery settings saved.'); return; }
  const select = event.target.closest('[data-static-select]');
  if (select) run('select', {id: Number(select.dataset.staticSelect), selected: select.checked}, select.checked ? 'Static mode enabled. Generate a snapshot when ready.' : 'Static mode disabled. This page uses WordPress.');
 });
 root.querySelector('[data-static-search]').addEventListener('input', filter);
 pageRoot.addEventListener('click', async event => {
  const setupLink = event.target.closest('a[href="#lieve-static-setup"]');
  if (setupLink) pageRoot.querySelector('#lieve-static-setup').open = true;
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.hasAttribute('data-static-generate')) { run('generate', {id: Number(button.dataset.staticGenerate)}, 'Snapshot generated. Server delivery requires verified routing.'); }
  if (button.hasAttribute('data-static-refresh')) run('', null, 'Snapshot statuses refreshed.');
  if (button.hasAttribute('data-static-verify')) run('verify', {}, 'Server routing and safety bypasses verified.');
  if (button.hasAttribute('data-static-generate-all')) {
   const restoreFocus = rememberFocus();
   setBusy(true); const pages = data.pages.filter(page => page.selected && !page.issues.length); let errors = 0;
   try { for (let i = 0; i < pages.length; i++) { announce(`Generating ${i + 1} of ${pages.length}: ${pages[i].title}…`); try { data = await request('generate', {id: pages[i].id}); } catch { errors++; } } render(await request('')); announce(errors ? `Generation complete. ${errors} page(s) could not be generated; see their status.` : `${pages.length} snapshot(s) generated.`, errors > 0); }
   catch (error) { announce(error.message, true); } finally { setBusy(false); restoreFocus(); }
  }
  if (button.hasAttribute('data-static-server')) { server = button.dataset.staticServer; pageRoot.querySelectorAll('[data-static-server]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button))); pageRoot.querySelector('[data-static-code]').value = data.config[server]; }
  if (button.hasAttribute('data-static-copy')) {
   try { await navigator.clipboard.writeText(data.config[server]); announce('Server configuration copied.'); }
   catch { pageRoot.querySelector('[data-static-code]').select(); announce('Select and copy the configuration with your keyboard.'); }
  }
  if (button.hasAttribute('data-static-download')) { const url = URL.createObjectURL(new Blob([data.config[server]], {type: 'text/plain'})); const link = document.createElement('a'); link.href = url; link.download = `lieve-static-${server}.conf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
 });
 window.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && pageRoot.contains(event.target)) { event.preventDefault(); if (!busy) announce('All settings are already saved automatically.'); } });
 syncDisabled();
})();
