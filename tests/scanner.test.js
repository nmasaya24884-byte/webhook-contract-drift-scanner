import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { comparePayloads, buildTest } from '../app.js';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

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

test('production measurement ID is configured once for loader and config', () => {
  assert.equal((indexSource.match(/G-C6F5VQ98EG/g) || []).length, 2);
});

test('advertising and Google Signals are disabled', () => {
  assert.match(indexSource, /allow_google_signals:\s*false/);
  assert.match(indexSource, /allow_ad_personalization_signals:\s*false/);
  assert.match(indexSource, /ads_data_redaction:\s*true/);
});

test('custom analytics sends only an allow-listed event name', () => {
  assert.match(appSource, /window\.gtag\('event', name\)/);
  assert.doesNotMatch(appSource, /gtag\([^\n]*(oldPayload|newPayload|latestTest|test-output|old-json|new-json)/);
});

test('required KPI events are allow-listed', () => {
  for (const event of ['scan_started','scan_completed','fixture_generated','paid_cta_clicked','github_cta_clicked']) {
    assert.match(appSource, new RegExp(`['"]${event}['"]`));
  }
});
