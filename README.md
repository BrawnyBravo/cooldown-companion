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

## When it writes

- When a session starts, if Claude Code already has a usage reading.
- After each of your turns finishes (not after background sub-agent turns).
- Whenever Claude Code reports a change in your usage limits.

If there is no five-hour reading yet (for example, before the first reply, or
on an account without plan usage limits), it leaves the existing file alone.
If the file cannot be written, it does nothing and your session carries on
normally.

## What it never does

- It does not read your sign-in, tokens, prompts, file names or conversations.
- It makes no network requests of its own and sends nothing anywhere.
- It writes no other file.

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

## License

MIT. See [LICENSE](LICENSE).

Cooldown and this add-on are made by Springe Labs. They are not affiliated
with, endorsed by, or sponsored by Anthropic. Claude and Claude Code are
trademarks of Anthropic.
