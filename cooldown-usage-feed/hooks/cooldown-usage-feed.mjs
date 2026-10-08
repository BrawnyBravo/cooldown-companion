// Cooldown usage feed: hands the Stream Deck plugin Claude Code's own
// five-hour and weekly usage figures, so the deck stays live without the
// plugin ever needing a sign-in of its own.
//
// What it writes, and nothing else: <Claude config folder>/cooldown/
// usage-feed.json, holding the two rate-limit windows exactly as Claude Code
// reports them to every mod ($.session.usage(), the status line's figures:
// percent used 0-100 and the reset time) and the moment they were written.
// No sign-in, token, prompt, file name or conversation text is read or
// written; the call it makes is free (no breakdown is asked for, so no
// request is sent).
//
// When: once at session start (if the session already has a reading), after
// every main-loop turn, and whenever Claude Code pushes a rate-limit change.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const FEED_VERSION = 1;

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await writeFeed($);
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId) {
      await writeFeed($);
    }
    return result;
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    if (Array.isArray(e.changed) && e.changed.includes("rateLimits")) {
      await writeFeed($);
    }
    return result;
  });
}

async function feedFile($) {
  const configured = await $.env.get("CLAUDE_CONFIG_DIR");
  let base = configured && configured.trim();
  if (!base) {
    const home = (await $.env.get("USERPROFILE")) || (await $.env.get("HOME"));
    if (!home) {
      return null;
    }
    base = `${home}/.claude`;
  }
  return `${base}/cooldown/usage-feed.json`;
}

function pick(rateLimits, kind) {
  const w = (rateLimits || []).find((r) => r && r.kind === kind);
  if (!w || typeof w.percentUsed !== "number" || typeof w.resetsAt !== "string") {
    return undefined;
  }
  return { percentUsed: w.percentUsed, resetsAt: w.resetsAt };
}

async function writeFeed($) {
  try {
    const { rateLimits } = await $.session.usage();
    const fiveHour = pick(rateLimits, "five_hour");
    if (!fiveHour) {
      // Nothing reported yet (or not on a subscription): leave the last
      // report alone rather than overwrite it with nothing.
      return;
    }
    const path = await feedFile($);
    if (!path) {
      return;
    }
    const report = {
      version: FEED_VERSION,
      observedAtMs: await $.clock.now(),
      fiveHour,
    };
    const sevenDay = pick(rateLimits, "seven_day");
    if (sevenDay) {
      report.sevenDay = sevenDay;
    }
    await $.fs.write(path, JSON.stringify(report));
  } catch {
    // A feed that cannot be written must never disturb the session.
  }
}
