import { test, expect, mock } from 'claude-code/testing';

const FIVE = { kind: 'five_hour', percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' };
const WEEK = { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-08T17:00:00.000Z' };
const AT = 1791230400000;

function engine(on, rateLimits, writes) {
  mock.env(on, { USERPROFILE: 'C:/Users/someone' });
  on('clock.now', () => ({ value: AT }));
  on('session.usage', () => ({ value: { startedAt: AT - 1000, context: { window: 200000 }, rateLimits } }));
  on('session.measure', (_$, e) => ({ changed: e.changed }));
  on('fs.write', (_$, e) => {
    writes.push(e);
    return { value: undefined };
  });
}

function measure(changed) {
  return { context: { window: 200000 }, rateLimits: [], changed };
}

test('a rate-limit change writes only the two windows and the moment', async ($, on) => {
  const writes = [];
  engine(on, [FIVE, WEEK], writes);
  await $.session.measure(measure(['rateLimits']));
  expect(writes.length).toBe(1);
  expect(writes[0].path.split('\\').join('/')).toBe('C:/Users/someone/.claude/cooldown/usage-feed.json');
  expect(JSON.parse(writes[0].text)).toEqual({
    version: 1,
    observedAtMs: AT,
    fiveHour: { percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' },
    sevenDay: { percentUsed: 41, resetsAt: '2026-10-08T17:00:00.000Z' },
  });
});

test('a measurement that moved only the context window writes nothing', async ($, on) => {
  const writes = [];
  engine(on, [FIVE, WEEK], writes);
  await $.session.measure(measure(['context']));
  expect(writes.length).toBe(0);
});

test('no five-hour reading yet leaves the last report alone', async ($, on) => {
  const writes = [];
  engine(on, [WEEK], writes);
  await $.session.measure(measure(['rateLimits']));
  expect(writes.length).toBe(0);
});

test('a missing weekly window writes the five-hour one alone', async ($, on) => {
  const writes = [];
  engine(on, [FIVE], writes);
  await $.session.measure(measure(['rateLimits']));
  expect(JSON.parse(writes[0].text)).toEqual({
    version: 1,
    observedAtMs: AT,
    fiveHour: { percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' },
  });
});
