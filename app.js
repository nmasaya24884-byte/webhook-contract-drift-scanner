const $ = (id) => document.getElementById(id);

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const joinPath = (base, key) => base ? `${base}.${key}` : String(key);

export function comparePayloads(oldValue, newValue, path = '$') {
  const changes = [];
  const oldType = typeOf(oldValue);
  const newType = typeOf(newValue);
  if (oldType !== newType) {
    changes.push({ severity: oldType === 'null' || newType === 'null' ? 'medium' : 'high', path, kind: 'type_changed', message: `Type changed from ${oldType} to ${newType}. A decoder or type guard expecting ${oldType} may fail.` });
    return changes;
  }
  if (oldType === 'object') {
    const oldKeys = Object.keys(oldValue);
    const newKeys = Object.keys(newValue);
    for (const key of oldKeys) {
      if (!(key in newValue)) changes.push({ severity: 'high', path: joinPath(path, key), kind: 'field_removed', message: 'Existing field is absent. A consumer that reads it without a fallback may fail.' });
      else changes.push(...comparePayloads(oldValue[key], newValue[key], joinPath(path, key)));
    }
    for (const key of newKeys) if (!(key in oldValue)) changes.push({ severity: 'info', path: joinPath(path, key), kind: 'field_added', message: 'New field. Usually additive, but strict decoders may reject unknown properties.' });
  } else if (oldType === 'array') {
    if (oldValue.length && newValue.length) changes.push(...comparePayloads(oldValue[0], newValue[0], `${path}[0]`));
    else if (oldValue.length !== newValue.length && (!oldValue.length || !newValue.length)) changes.push({ severity: 'info', path, kind: 'array_sample_ambiguous', message: 'One sample array is empty, so its item contract cannot be inferred.' });
  } else if (oldValue !== newValue) {
    changes.push({ severity: 'info', path, kind: 'value_changed', message: 'Value changed. Two samples cannot establish whether this is an enum or ordinary data.' });
  }
  return changes;
}

export function buildTest(oldPayload, newPayload, changes) {
  const highPaths = changes.filter((c) => c.severity === 'high').map((c) => c.path);
  return `// Generated locally by Webhook Drift Scanner\nconst oldFixture = ${JSON.stringify(oldPayload, null, 2)};\nconst newFixture = ${JSON.stringify(newPayload, null, 2)};\n\ndescribe('webhook contract drift', () => {\n  test('review candidate changes before accepting the new fixture', () => {\n    const highRiskPaths = ${JSON.stringify(highPaths, null, 2)};\n    // Replace this review assertion with your consumer/parser call.\n    expect(highRiskPaths).toEqual([]);\n    expect(newFixture).toBeDefined();\n  });\n});\n`;
}

function track(name) {
  // Strict allow-list: event name only. Never pass payloads, paths, values, or test output.
  const allowed = new Set(['sample_loaded','scanner_viewed','scan_started','scan_completed','scan_error','fixture_generated','test_copy','test_download','paid_plan_viewed','paid_cta_clicked','github_cta_clicked']);
  if (!allowed.has(name)) return;
  window.dispatchEvent(new CustomEvent('tst001:event', { detail: { name } }));
  if (typeof window.gtag === 'function') window.gtag('event', name);
}

function parse(id) {
  const text = $(id).value;
  if (text.length > 1_000_000) throw new Error('Keep each payload under 1 MB for this free scan.');
  return JSON.parse(text);
}

function render(changes) {
  const order = { high: 0, medium: 1, info: 2 };
  changes.sort((a, b) => order[a.severity] - order[b.severity]);
  $('changes').replaceChildren(...changes.map((change) => {
    const item = document.createElement('article');
    item.className = `change ${change.severity}`;
    const head = document.createElement('div');
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = change.severity.toUpperCase();
    const code = document.createElement('code'); code.textContent = change.path;
    head.append(badge, code);
    const message = document.createElement('p'); message.textContent = change.message;
    item.append(head, message);
    return item;
  }));
}

if (typeof document !== 'undefined') {
  let latestTest = '';
  $('load-sample').addEventListener('click', () => {
    $('old-json').value = JSON.stringify({ id: 'evt_safe_example', customer: { id: 'cus_1', email: 'dev@example.test' }, amount: 1200, items: [{ sku: 'A1', quantity: 1 }] }, null, 2);
    $('new-json').value = JSON.stringify({ id: 'evt_safe_example', customer: { id: 'cus_1' }, amount: '1200', items: { sku: 'A1', quantity: 1 }, currency: 'JPY' }, null, 2);
    track('sample_loaded');
  });
  $('clear').addEventListener('click', () => { $('old-json').value = ''; $('new-json').value = ''; $('results').hidden = true; $('input-error').hidden = true; });
  $('scan').addEventListener('click', () => {
    track('scan_started');
    try {
      const oldPayload = parse('old-json');
      const newPayload = parse('new-json');
      const changes = comparePayloads(oldPayload, newPayload);
      render(changes.length ? changes : [{ severity: 'info', path: '$', kind: 'no_structural_change', message: 'No structural or value changes were found in these two samples.' }]);
      latestTest = buildTest(oldPayload, newPayload, changes);
      track('fixture_generated');
      $('test-output').textContent = latestTest;
      const high = changes.filter((c) => c.severity === 'high').length;
      $('summary').textContent = `${high} high · ${changes.length} total`;
      $('results').hidden = false; $('input-error').hidden = true;
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      track('scan_completed');
    } catch (error) {
      $('input-error').textContent = `Could not scan: ${error.message}`; $('input-error').hidden = false; track('scan_error');
    }
  });
  $('copy-test').addEventListener('click', async () => { await navigator.clipboard.writeText(latestTest); $('copy-test').textContent = 'Copied'; track('test_copy'); });
  $('download-test').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([latestTest], { type: 'text/javascript' })); const a = document.createElement('a'); a.href = url; a.download = 'webhook-contract.test.js'; a.click(); URL.revokeObjectURL(url); track('test_download'); });
  for (const [id, event] of [['paid-cta','paid_cta_clicked'],['github-cta','github_cta_clicked']]) $(id).addEventListener('click', () => { track(event); $('intent-dialog').showModal(); });
  const paidCard = document.querySelector('.price-card.featured');
  const scannerPanel = document.querySelector('#scanner');
  if ('IntersectionObserver' in window && scannerPanel) {
    const scannerObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        track('scanner_viewed');
        scannerObserver.disconnect();
      }
    }, { threshold: 0.5 });
    scannerObserver.observe(scannerPanel);
  }
  if ('IntersectionObserver' in window && paidCard) {
    const paidObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        track('paid_plan_viewed');
        paidObserver.disconnect();
      }
    }, { threshold: 0.5 });
    paidObserver.observe(paidCard);
  }
  $('close-dialog').addEventListener('click', () => $('intent-dialog').close());
}
