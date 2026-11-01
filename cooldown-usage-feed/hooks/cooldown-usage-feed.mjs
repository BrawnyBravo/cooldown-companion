// Cooldown usage feed: hands the Stream Deck plugin Claude Code's own
// five-hour and weekly usage figures, so the deck stays live without the
// plugin ever needing a sign-in of its own.
//
// What it writes (these two files and nothing else): <Claude config folder>/cooldown/
// usage-feed.json, holding the two rate-limit windows exactly as Claude Code
// reports them to every mod ($.session.usage(), the status line's figures:
// percent used 0-100 and the reset time) and the moment they were written.
// No sign-in, token, prompt, file name or conversation text is read or
// written; the call it makes is free (no breakdown is asked for, so no
// request is sent).
//
// Beside it, usage-feed-status.json says how the last attempt went, so a
// stale feed has a reason a reader can show: "ok", "no-five-hour" (Claude
// Code reported no five-hour window, so the feed was left as it was),
// "usage-failed" (no usage reading could be had) or "write-failed" (the feed
// file could not be written). The feed file's own format is unchanged.
//
// When: once at session start (if the session already has a reading), after
// every main-loop turn, and whenever Claude Code pushes a rate-limit change.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const FEED_VERSION = 1;
const STATUS_VERSION = 1;

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

async function configFolder($) {
  const configured = await $.env.get("CLAUDE_CONFIG_DIR");
  let base = configured && configured.trim();
  if (!base) {
    const home = (await $.env.get("USERPROFILE")) || (await $.env.get("HOME"));
    if (!home) {
      return null;
    }
    base = `${home}/.claude`;
  }
  return `${base}/cooldown`;
}

function pick(rateLimits, kind) {
  // Anything but a list (an object, a string) reads as no window at all.
  const w = (Array.isArray(rateLimits) ? rateLimits : []).find((r) => r && r.kind === kind);
  if (!w || typeof w.percentUsed !== "number" || typeof w.resetsAt !== "string") {
    return undefined;
  }
  return { percentUsed: w.percentUsed, resetsAt: w.resetsAt };
}

// A short, path-free reason: an errno-style code or the error's name.
function reasonOf(err) {
  const raw = (err && (err.code || err.name)) || "unknown";
  return String(raw).slice(0, 64);
}

async function writeStatus($, folder, status, extra) {
  try {
    const report = {
      version: STATUS_VERSION,
      observedAtMs: await $.clock.now(),
      status,
      ...extra,
    };
    await $.fs.write(`${folder}/usage-feed-status.json`, JSON.stringify(report));
  } catch {
    // Best effort: the status file must never disturb the session either.
  }
}

async function writeFeed($) {
  let folder;
  try {
    folder = await configFolder($);
  } catch {
    return;
  }
  if (!folder) {
    // No config folder to write to, so there is nowhere to say why either.
    return;
  }
  let rateLimits;
  try {
    ({ rateLimits } = await $.session.usage());
  } catch (err) {
    await writeStatus($, folder, "usage-failed", { error: reasonOf(err) });
    return;
  }
  const fiveHour = pick(rateLimits, "five_hour");
  if (!fiveHour) {
    // Nothing reported yet (or not on a subscription): leave the last
    // report alone rather than overwrite it with nothing, and say so.
    const reportedKinds = (Array.isArray(rateLimits) ? rateLimits : [])
      .map((r) => r && r.kind)
      .filter((k) => typeof k === "string")
      .slice(0, 8)
      .map((k) => k.slice(0, 32));
    await writeStatus($, folder, "no-five-hour", { reportedKinds });
    return;
  }
  try {
    const report = {
      version: FEED_VERSION,
      observedAtMs: await $.clock.now(),
      fiveHour,
    };
    const sevenDay = pick(rateLimits, "seven_day");
    if (sevenDay) {
      report.sevenDay = sevenDay;
    }
    await $.fs.write(`${folder}/usage-feed.json`, JSON.stringify(report));
  } catch (err) {
    // A feed that cannot be written must never disturb the session.
    await writeStatus($, folder, "write-failed", { error: reasonOf(err) });
    return;
  }
  await writeStatus($, folder, "ok", {});
}
