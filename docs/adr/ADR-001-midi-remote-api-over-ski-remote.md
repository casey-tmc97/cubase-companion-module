# ADR-001: Use Cubase's MIDI Remote API instead of reverse-engineering SKI Remote

**Status:** Accepted (2026-07-08)

## Context

The original goal was to control Cubase "the way Cubase iC uses it." Cubase iC Pro talks to Cubase over Wi-Fi via an official Steinberg extension called SKI Remote (installed on the Cubase machine, discovered via Bonjour/mDNS). Research confirmed SKI Remote is real, but its wire protocol is **not publicly documented** — no spec, SDK, or API reference exists. An existing Companion module request for Cubase ([bitfocus/companion-module-requests#724](https://github.com/bitfocus/companion-module-requests/issues/724)) is tagged "missing documentation" and stalled for exactly this reason.

The alternative: Cubase 12+ ships an official, documented **MIDI Remote API** — a JavaScript scripting layer where a script receives MIDI over a virtual port and maps it to real Cubase actions (transport, track/channel select, mixer parameters, etc.).

## Decision

Build against the MIDI Remote API, not SKI Remote.

## Consequences

- **Gained:** a stable, Steinberg-supported foundation that needs zero reverse-engineering and won't silently break on a Cubase update the way an undocumented-protocol implementation could.
- **Given up:** true iC Pro feature parity — the MIDI Remote API doesn't expose 100% of what iC Pro can do. In practice this wasn't a real cost for Phase 1 (Transport), since everything needed there is exposed via `mHostAccess.mTransport.mValue`.
- If SKI Remote's protocol is ever published or reverse-engineered by someone else, this decision could be revisited for a future phase that needs something the MIDI Remote API can't expose (e.g. exact iC Pro EQ curve display) — but that's speculative, not a current need.
