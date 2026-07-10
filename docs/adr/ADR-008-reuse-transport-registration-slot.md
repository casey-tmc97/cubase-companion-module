# ADR-008: Reuse the existing Transport vendor/model registration instead of a new one

**Status:** Accepted (2026-07-10)

## Context

ADR-007 consolidated every phase into one script, registered as a new device
driver `makeDeviceDriver('CubaseCompanion', 'Controller', ...)`. Deploying that
new vendor/model pair to `Local/CubaseCompanion/Controller/` and live-testing it
against Cubase 15 on this install found that Cubase's MIDI Remote Local-script
discovery would not register it — it never appeared in the Add Surface vendor
dropdown or the MIDI Remote Manager's Scripts catalog, under any name.

This was investigated exhaustively before concluding it was a genuine
environmental/Cubase-side issue rather than anything in our files:

- Folder depth, syntax, encoding (no BOM), file permissions, and the absence of
  a Mark-of-the-Web block were all confirmed correct.
- Renaming the model (`Companion` → `Controller`) and then the vendor entirely
  (`CubaseCompanion` → `CubaseCompanionV2`) both failed identically.
- A brand-new, minimal, trivially-valid script under a never-before-used
  vendor/model (`DiagBaseline`/`Minimal`) also failed to appear — ruling out
  anything about our specific content or names.
- A full Cubase preferences reset (`Ctrl+Shift+Alt` at launch) did not help.
- No on-disk cache file anywhere under `AppData\Roaming\Steinberg` or
  `AppData\Local\Steinberg` references any of these vendor/model names —
  ruling out a stale cache we could just delete.
- Windows Defender Controlled Folder Access was disabled, and no block events
  for Cubase/Steinberg existed — ruling out security-software interference.
- The one differentiator found: the original two-script-era Transport
  controller (`CubaseCompanion` / `Transport`) still worked reliably, because
  Cubase was resolving it via an **already-saved MIDI Controller instance**
  (visible in the MIDI Remote Manager's "MIDI Controllers" tab) that gets
  re-pointed at the script file on each launch — not via fresh Local-folder
  discovery. Fresh discovery of a *new* vendor/model pair is the part that
  doesn't work on this install; re-resolving an *already-registered* one does.

## Decision

The consolidated script keeps the original Phase 1 registration:
`makeDeviceDriver('CubaseCompanion', 'Transport', 'companion-module-cubase')`,
deployed at `Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js` —
the exact vendor/model/path Cubase already has a live MIDI Controller instance
for. The file's *content* is the full merged script (Transport + Markers,
everything ADR-007 already established); only the registration identity is
reused rather than freshly created.

This is a pragmatic unblock for a Cubase-side limitation, not a statement that
`Controller` was the wrong name — if Local-script discovery starts working
again (a Cubase update, a different install, a cause we haven't found), this
reuse is no longer necessary and the model could be renamed back to something
accurate. Until then, don't rename this vendor/model pair without expecting to
re-hit the same discovery failure this ADR works around.

A second, unrelated issue surfaced once this deployment path was working:
Cubase's MIDI Remote Manager kept its **Mapping Page** selector pointed at
`Transport` — the page name the original Transport-only script used
(`mMapping.makePage('Transport')`). ADR-007's merged script renamed the page to
`Main` (`mMapping.makePage('Main')`, since Transport and Markers share one
always-active page). Because `Transport` no longer exists as a page name in the
script, the UI was left pointing at a stale page and no bindings were active —
all 20 buttons showed as unbound until the Mapping Page dropdown was manually
switched to `Main`. This isn't a discovery issue; it only affects existing
controller instances carrying forward a page name from before a rename, so it
doesn't need code changes, just a one-time manual page selection when this
script version is deployed to this instance for the first time. Documented in
the setup checklist so it isn't rediscovered from scratch next time.

## Consequences

- **Gained:** unblocks verification entirely, without depending on ever
  understanding *why* fresh Local-script discovery stopped working on this
  install — which, after exhausting file-system, preference, process, and
  cache-level investigation, looks like a genuine Cubase-side limitation
  outside anything this project controls.
- **Given up:** the model name `Transport` is now inaccurate — it covers
  Transport and Markers (and will cover future phases too). Anyone reading
  `makeDeviceDriver('CubaseCompanion', 'Transport', ...)` needs this ADR's
  context to understand why. Mitigated with an inline comment at the call site
  pointing here.
- If Local-script discovery is ever confirmed working again (e.g. after a
  Cubase update), revisit whether to rename back to something accurate like
  `Controller` — re-test discovery in isolation first before assuming it's
  fixed.
