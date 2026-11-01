# Cooldown companion

A small Claude Code add-on for the Cooldown Stream Deck plugin.

It writes Claude Code's own five-hour and weekly usage percentages, and when
each one resets, to a single file:

```
<Claude config folder>/cooldown/usage-feed.json
```

Cooldown reads that file to keep your Stream Deck keys up to date. The Claude
config folder is the one named by `CLAUDE_CONFIG_DIR` if you have set it,
otherwise `.claude` in your home folder.

This repository is a Claude Code plugin marketplace with one plugin in it,
`cooldown-usage-feed`.

## Install

```
claude plugin marketplace add BrawnyBravo/cooldown-companion
claude plugin install cooldown-usage-feed@cooldown-companion
```

Start a new Claude Code session afterwards. It works anywhere Claude Code runs
plugins, including the Claude Code terminal and the Code tab of the Claude
desktop app.

## What it writes

```json
{
  "version": 1,
  "observedAtMs": 1791230400000,
  "fiveHour": { "percentUsed": 37.5, "resetsAt": "2026-10-04T22:00:00.000Z" },
  "sevenDay": { "percentUsed": 41, "resetsAt": "2026-10-08T17:00:00.000Z" }
}
```

- `percentUsed` is 0 to 100, as Claude Code reports it.
- `resetsAt` is the reset time in UTC.
- `observedAtMs` is when the file was written, in milliseconds since 1970.
- `sevenDay` is left out when Claude Code has not reported a weekly figure.

The figures are the same ones Claude Code already shows you for your plan's
usage limits.

### Status file

Next to it, `usage-feed-status.json` says how the last attempt went, so a
reader can tell a fresh feed from a stale one and show why:

```json
{ "version": 1, "observedAtMs": 1791230400000, "status": "no-five-hour", "reportedKinds": ["seven_day"] }
```

- `status` is one of:
  - `ok`: `usage-feed.json` was just written.
  - `no-five-hour`: Claude Code reported no five-hour figure, so
    `usage-feed.json` was left as it was. `reportedKinds` lists the windows
    it did report, if any.
  - `usage-failed`: no usage reading could be had. `error` holds a short
    code or error name.
  - `write-failed`: `usage-feed.json` could not be written. `error` holds a
    short code or error name (such as `EACCES`), never a path or message.
- `observedAtMs` is when the status was written.

The format of `usage-feed.json` itself is unchanged, and readers that only
know about that file keep working.

## When it writes

- When a session starts, if Claude Code already has a usage reading.
- After each of your turns finishes (not after background sub-agent turns).
- Whenever Claude Code reports a change in your usage limits.

If there is no five-hour reading yet (for example, before the first reply, or
on an account without plan usage limits), it leaves the existing file alone.
If the file cannot be written, your session carries on normally. Either way
the status file says what happened.

## What it never does

- It does not read your sign-in, tokens, prompts, file names or conversations.
- It makes no network requests of its own and sends nothing anywhere.
- It writes no file other than `usage-feed.json` and `usage-feed-status.json`.

The whole add-on is one short file:
[`cooldown-usage-feed/hooks/cooldown-usage-feed.mjs`](cooldown-usage-feed/hooks/cooldown-usage-feed.mjs).

## Uninstall

```
claude plugin uninstall cooldown-usage-feed@cooldown-companion
claude plugin marketplace remove cooldown-companion
```

The second line is optional and removes this marketplace from your list.
Uninstalling leaves the last `usage-feed.json` in place; delete the `cooldown`
folder inside your Claude config folder if you want it gone.

## Tests

```
claude plugin test cooldown-usage-feed
```

Neither the tests nor validation need a sign-in or an API key. GitHub Actions
runs both on every push and pull request, against a pinned Claude Code
release. Once a week it also runs them against the newest release, and checks
that the events and usage fields the hook relies on are still there; if that
check fails it opens an issue titled "Compatibility check failed".

## License

MIT. See [LICENSE](LICENSE).

Cooldown and this add-on are made by Springe Labs. They are not affiliated
with, endorsed by, or sponsored by Anthropic. Claude and Claude Code are
trademarks of Anthropic.
