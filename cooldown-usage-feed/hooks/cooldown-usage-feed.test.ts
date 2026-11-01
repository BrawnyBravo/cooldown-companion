import { test, expect, mock } from 'claude-code/testing';

const FIVE = { kind: 'five_hour', percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' };
const WEEK = { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-08T17:00:00.000Z' };
const AT = 1791230400000;
const FEED = 'C:/Users/someone/.claude/cooldown/usage-feed.json';
const STATUS = 'C:/Users/someone/.claude/cooldown/usage-feed-status.json';

// The engine starts each test fresh; a slow or busy machine (a CI runner)
// can take a few seconds to do it, past the kit's 5 s default.
const SLOW = { timeoutMs: 30000 };

type Write = { path: string; text: string };

// On a Linux runner the engine may resolve the Windows-style test home
// against its own folder, so a write is matched from the test home onward.
function norm(path: string) {
  const p = path.split('\\').join('/');
  const at = p.indexOf('C:/Users/someone/');
  return at >= 0 ? p.slice(at) : p;
}

function feedWrites(writes: Write[]) {
  return writes.filter((w) => norm(w.path) === FEED);
}

function statusWrites(writes: Write[]) {
  return writes.filter((w) => norm(w.path) === STATUS);
}

function lastStatus(writes: Write[]) {
  const all = statusWrites(writes);
  expect(all.length).toBeGreaterThan(0);
  return JSON.parse(all[all.length - 1].text);
}

function engine(on, rateLimits, writes: Write[], opts: { failFeed?: boolean; failUsage?: boolean } = {}) {
  mock.env(on, { USERPROFILE: 'C:/Users/someone' });
  on('clock.now', () => ({ value: AT }));
  on('session.usage', () =>
    opts.failUsage
      ? { deny: 'no reading' }
      : { value: { startedAt: AT - 1000, context: { window: 200000 }, rateLimits } },
  );
  on('session.measure', (_$, e) => ({ changed: e.changed }));
  on('fs.write', (_$, e) => {
    writes.push(e);
    if (opts.failFeed && norm(e.path) === FEED) {
      return { deny: 'EACCES' };
    }
    return { value: undefined };
  });
}

function measure(changed) {
  return { context: { window: 200000 }, rateLimits: [], changed };
}

test('a rate-limit change writes only the two windows and the moment', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [FIVE, WEEK], writes);
  await $.session.measure(measure(['rateLimits']));
  const feed = feedWrites(writes);
  expect(feed.length).toBe(1);
  expect(JSON.parse(feed[0].text)).toEqual({
    version: 1,
    observedAtMs: AT,
    fiveHour: { percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' },
    sevenDay: { percentUsed: 41, resetsAt: '2026-10-08T17:00:00.000Z' },
  });
  expect(lastStatus(writes)).toEqual({ version: 1, observedAtMs: AT, status: 'ok' });
  // Nothing but the feed and its status file is ever written.
  expect(writes.length).toBe(feed.length + statusWrites(writes).length);
});

test('a measurement that moved only the context window writes nothing', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [FIVE, WEEK], writes);
  await $.session.measure(measure(['context']));
  expect(writes.length).toBe(0);
});

test('no five-hour reading yet leaves the last report alone and says why', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [WEEK], writes);
  await $.session.measure(measure(['rateLimits']));
  expect(feedWrites(writes).length).toBe(0);
  expect(lastStatus(writes)).toEqual({
    version: 1,
    observedAtMs: AT,
    status: 'no-five-hour',
    reportedKinds: ['seven_day'],
  });
});

for (const [label, odd] of [
  ['an object', { five_hour: FIVE }],
  ['a string', 'five_hour'],
  ['a number', 42],
] as const) {
  test(`a usage reading that is ${label}, not a list, is read as no windows, never thrown`, SLOW, async ($, on) => {
    const writes: Write[] = [];
    engine(on, odd, writes);
    await $.session.measure(measure(['rateLimits']));
    expect(feedWrites(writes).length).toBe(0);
    expect(lastStatus(writes).status).toBe('no-five-hour');
  });
}

test('a missing weekly window writes the five-hour one alone', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [FIVE], writes);
  await $.session.measure(measure(['rateLimits']));
  expect(JSON.parse(feedWrites(writes)[0].text)).toEqual({
    version: 1,
    observedAtMs: AT,
    fiveHour: { percentUsed: 37.5, resetsAt: '2026-10-04T22:00:00.000Z' },
  });
});

test('a feed that cannot be written is reported in the status file', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [FIVE, WEEK], writes, { failFeed: true });
  await $.session.measure(measure(['rateLimits']));
  const status = lastStatus(writes);
  expect(status.status).toBe('write-failed');
  expect(typeof status.error).toBe('string');
  expect(status.error.length).toBeGreaterThan(0);
  expect(status.error.length).toBeLessThanOrEqual(64);
  expect(status.error).not.toContain('/');
});

test('a usage reading that fails is reported and the feed is left alone', SLOW, async ($, on) => {
  const writes: Write[] = [];
  engine(on, [FIVE, WEEK], writes, { failUsage: true });
  await $.session.measure(measure(['rateLimits']));
  expect(feedWrites(writes).length).toBe(0);
  expect(lastStatus(writes).status).toBe('usage-failed');
});
