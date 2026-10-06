import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncScheduleControl, scheduledStartForSubmission } from "../dist/play-together/timing-control.js";
import { validateSchedule } from "../dist/play-together/domain.js";
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test("Play Now hides the whole label, disables the input and clears stale dates", () => {
  const label = {hidden:false}, input = {disabled:false, value:'2026-10-06T12:00'};
  syncScheduleControl('PLAY_NOW', label, input);
  assert.equal(label.hidden, true); assert.equal(input.disabled, true); assert.equal(input.value, '');
});

test("switching both directions restores Scheduled usability without retaining the previous date", () => {
  const label = {}, input = {value:''};
  syncScheduleControl('PLAY_NOW', label, input);
  syncScheduleControl('SCHEDULED', label, input);
  assert.equal(label.hidden, false); assert.equal(input.disabled, false);
  input.value = '2026-10-06T12:00';
  syncScheduleControl('SCHEDULED', label, input);
  assert.equal(input.value, '2026-10-06T12:00', 'Scheduled rerenders preserve entered date');
  syncScheduleControl('PLAY_NOW', label, input);
  assert.equal(label.hidden, true); assert.equal(input.disabled, true); assert.equal(input.value, '');
  syncScheduleControl('SCHEDULED', label, input);
  assert.equal(input.value, ''); assert.equal(input.disabled, false);
});

test("Play Now submission excludes even a manipulated/stale date; Scheduled preserves its value", () => {
  for (const value of ['invalid date', '2026-10-06T12:00', '']) {
    assert.equal(scheduledStartForSubmission('PLAY_NOW', value), null);
    assert.equal(validateSchedule('PLAY_NOW', scheduledStartForSubmission('PLAY_NOW', value)), null);
    assert.equal(scheduledStartForSubmission('SCHEDULED', value), value);
  }
});

test("Scheduled retains future and at-most-three-hour submission rules", () => {
  const now = Date.parse('2026-10-06T10:00:00Z');
  for (const minutes of [1, 179, 180]) assert.equal(validateSchedule('SCHEDULED', scheduledStartForSubmission('SCHEDULED', new Date(now + minutes * 60000).toISOString()), now), null);
  assert.match(validateSchedule('SCHEDULED', new Date(now + 181 * 60000).toISOString(), now), /within 3 hours/);
  assert.match(validateSchedule('SCHEDULED', new Date(now).toISOString(), now), /future/);
  assert.match(validateSchedule('SCHEDULED', '', now), /future/);
});

test("hidden scheduling control beats shared label display CSS and starts noninteractive", () => {
  assert.match(read('dist/play-together/play-together.css'), /\.pt-shell\s+\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/);
  assert.match(read('dist/account/account.css'), /label\{display:block/);
  assert.match(read('dist/play-together/index.html'), /<label id="scheduledLabel" hidden>Start within 3 hours<input id="scheduledStart" type="datetime-local" disabled/);
  const js = read('dist/play-together/play-together.js');
  assert.match(js, /scheduledStart=scheduledStartForSubmission\(timingKind,\$\("scheduledStart"\)\.value\)/);
  assert.match(js, /if\(input\.checked\)syncTiming\(\)/);
  assert.match(js, /\nsyncTiming\(\);/);
});
