import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparePayloads, buildTest, parsePayloadText, validatePayload } from '../app.js';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const analyticsSource = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../runtime-config.js', import.meta.url), 'utf8');

const cases = [
  ['removed root', {id:1,name:'a'}, {id:1}, 'field_removed', '$.name'],
  ['removed nested', {a:{b:1}}, {a:{}}, 'field_removed', '$.a.b'],
  ['number to string', {a:1}, {a:'1'}, 'type_changed', '$.a'],
  ['object to array', {a:{}}, {a:[]}, 'type_changed', '$.a'],
  ['array to object', {a:[]}, {a:{}}, 'type_changed', '$.a'],
  ['string to null', {a:'x'}, {a:null}, 'type_changed', '$.a'],
  ['nested item type', {a:[{id:1}]}, {a:[{id:'1'}]}, 'type_changed', '$.a[0].id'],
  ['added field', {id:1}, {id:1,x:true}, 'field_added', '$.x'],
  ['value change', {id:1}, {id:2}, 'value_changed', '$.id'],
  ['empty array ambiguity', {a:[]}, {a:[1]}, 'array_sample_ambiguous', '$.a'],
  ['deep removal', {a:{b:{c:{d:1}}}}, {a:{b:{c:{}}}}, 'field_removed', '$.a.b.c.d'],
  ['boolean to string', {active:true}, {active:'true'}, 'type_changed', '$.active'],
  ['array scalar type', {v:[1]}, {v:['1']}, 'type_changed', '$.v[0]'],
  ['top type', [], {}, 'type_changed', '$'],
  ['null to object', {x:null}, {x:{}}, 'type_changed', '$.x'],
];

for (const [name, oldValue, newValue, kind, path] of cases) test(name, () => {
  const changes = comparePayloads(oldValue, newValue);
  assert.ok(changes.some((c) => c.kind === kind && c.path === path));
});

for (let i = 0; i < 35; i++) test(`seeded critical removal ${i + 1}`, () => {
  const changes = comparePayloads({ id:i, payload:{ required:`v${i}`, stable:true } }, { id:i, payload:{ stable:true } });
  const hit = changes.find((c) => c.path === '$.payload.required');
  assert.equal(hit?.severity, 'high');
});

test('unchanged payload has no changes', () => assert.deepEqual(comparePayloads({a:1},{a:1}), []));
test('generated test contains fixtures but no network code', () => {
  const output = buildTest({a:1},{a:'1'},comparePayloads({a:1},{a:'1'}));
  assert.match(output, /highRiskPaths/);
  assert.doesNotMatch(output, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test('production measurement ID is configured only in analytics module', () => {
  assert.equal((analyticsSource.match(/G-C6F5VQ98EG/g) || []).length, 1);
  assert.doesNotMatch(indexSource, /G-C6F5VQ98EG/);
});

test('advertising and Google Signals are disabled', () => {
  assert.match(analyticsSource, /allow_google_signals:\s*false/);
  assert.match(analyticsSource, /allow_ad_personalization_signals:\s*false/);
  assert.match(analyticsSource, /ads_data_redaction:\s*true/);
});

test('custom analytics sends only an allow-listed event name', () => {
  assert.match(analyticsSource, /window\.gtag\('event', name\)/);
  assert.doesNotMatch(analyticsSource, /gtag\([^\n]*(oldPayload|newPayload|latestTest|test-output|old-json|new-json|error\.message)/);
});

test('required KPI events are allow-listed', () => {
  for (const event of ['scan_started','scan_completed','fixture_generated','paid_cta_clicked','github_cta_clicked']) {
    assert.match(analyticsSource, new RegExp(`['"]${event}['"]`));
  }
});

test('CSP disallows inline scripts, objects, workers, forms, and foreign defaults', () => {
  assert.match(indexSource, /Content-Security-Policy/);
  assert.match(indexSource, /default-src 'self'/);
  assert.match(indexSource, /object-src 'none'/);
  assert.match(indexSource, /worker-src 'none'/);
  assert.match(indexSource, /form-action 'none'/);
  assert.doesNotMatch(indexSource, /'unsafe-inline'|'unsafe-eval'/);
});

test('kill switches default on and are independently configurable', () => {
  for (const key of ['scannerEnabled', 'ctaEnabled', 'analyticsEnabled']) assert.match(runtimeSource, new RegExp(`${key}: true`));
});

test('payload parser accepts unicode, markup-like strings, null, and empty shapes', () => {
  const value = parsePayloadText(JSON.stringify({ unicode:'日本語🙂', html:'<script>alert(1)</script>', secret:'sk_test_FAKE_ONLY_123', nil:null, object:{}, array:[] }));
  assert.equal(value.html, '<script>alert(1)</script>');
  assert.deepEqual(value.object, {});
});

test('payload parser rejects invalid JSON', () => assert.throws(() => parsePayloadText('{bad'), /JSON/));
test('payload parser rejects one-million-plus-one characters', () => assert.throws(() => parsePayloadText(`"${'x'.repeat(1_000_000)}"`), /under 1 MB/));

test('payload validator rejects excessive nesting without recursive traversal', () => {
  let value = 'leaf';
  for (let i = 0; i < 102; i++) value = { child:value };
  assert.throws(() => validatePayload(value), /nesting exceeds/);
});

test('large array within node limit is accepted', () => {
  const value = Array.from({ length: 20_000 }, (_, i) => i);
  assert.equal(validatePayload(value).length, 20_000);
});

test('render path uses textContent and fixed download filename', () => {
  assert.match(appSource, /code\.textContent = change\.path/);
  assert.match(appSource, /message\.textContent = change\.message/);
  assert.match(appSource, /a\.download = 'webhook-contract\.test\.js'/);
  assert.doesNotMatch(appSource, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('generated file preserves hostile-looking text as quoted fixture data', () => {
  const output = buildTest({ value:'</script><img src=x onerror=alert(1)>' }, { value:'javascript:alert(1)' }, []);
  assert.match(output, /"<\/script><img src=x onerror=alert\(1\)>"/);
  assert.match(output, /javascript:alert\(1\)/);
  assert.doesNotMatch(output, /fetch\(|XMLHttpRequest|sendBeacon/);
});
