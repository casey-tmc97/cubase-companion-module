# Cubase Companion — Setup & Verification

> **Note:** This is the historical Phase 1-3 verification record, dated
> 2026-07-10 — it predates the [v1.0 scope trim](superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md)
> and its checklist covers a wider feature set (Cycle, Click, Rewind,
> Forward, Return to Zero, Next/Previous Marker, To Marker 1-9) than what
> v1.0 actually ships (Play, Stop, Record, Add Marker only — see
> [ROADMAP.md](../ROADMAP.md)). The v1.0-relevant subset of this checklist
> — Play/Stop/Record and Add Marker — was included in and passed that same
> live verification pass; the rest documents features since deferred to a
> future full-API implementation pass, kept here as a known-working
> reference rather than rewritten or deleted.

## Setup

1. Point your existing virtual/network MIDI port pair so both a "CubaseCompanion" input and output are visible to Cubase and to Node/Companion (loopMIDI locally, or rtpMIDI/AppleMIDI across machines). One port pair carries every phase (Transport, Markers, and future phases) — see [ADR-007](adr/ADR-007-single-consolidated-cubase-script.md).
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\`.
   Steinberg's MIDI Remote requires a two-level `<Vendor>/<Model>/<script>.js` folder structure — a script placed directly in the vendor folder without a model subfolder will not be detected. The vendor/model pair is `CubaseCompanion` / `Transport` — not a typo, and not actually specific to Transport anymore. This install's Cubase would not register any *new* vendor/model pair through Local-script discovery (confirmed by extensive live testing — fresh names, fresh content, a full preferences reset, all ruled out), but it does still resolve the *already-registered* Transport controller from Phase 1 against whatever's currently in that file. Reusing that registration is the documented workaround — see [ADR-008](adr/ADR-008-reuse-transport-registration-slot.md) before renaming this.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote. You should already have a "CubaseCompanion - Transport" controller from Phase 1 setup — no need to add a new one; it will pick up the new script content (Transport + Markers) automatically on next launch. **After updating the script, check the Mapping Page selector at the top of the MIDI Remote panel** — if it's still pointed at a page named `Transport` (the old page name), switch it to `Main` (the page this merged script defines). Until you do, every button shows as unbound even though the script loaded correctly. Only a brand-new install with no existing controller would need to bind MIDI In/Out to the port pair from scratch.
4. Build the Companion module: `cd companion-module-cubase && npm install && npm run build`.
5. Load `companion-module-cubase` into a local Companion dev instance and add a Cubase instance, setting MIDI In/Out to the same port pair.

## Verification checklist

### Transport

- [x] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [x] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [x] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), triggered from Companion.
- [x] Same, triggered from Cubase's own UI.
- [x] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [x] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three; Rewind/Forward must be triggered via the preset buttons, whose release step sends the matching Note Off — a manually-built button using only the raw action will not stop on release).
- [x] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [x] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.

### Markers

- [x] Add Marker: press in Companion, confirm a new marker appears at the current cursor/playhead position in Cubase.
- [x] Next Marker / Previous Marker: with at least two markers present, confirm the cursor jumps to the next/previous marker relative to its current position.
- [x] To Marker 1 through To Marker 9: with markers 1-9 present, confirm each button jumps directly to its corresponding marker.
- [x] Pressing a To Marker N button for a marker that doesn't exist does not error or crash Cubase (should simply do nothing).

### Both together

- [x] With Cubase actively playing/recording (Transport feedback lit), fire a Markers action and confirm Transport's feedback state is undisturbed — both phases share one script and one port, so this confirms they don't interfere with each other.

> **Status: fully verified against the consolidated script.** Getting here required two fixes beyond ADR-007's consolidation: reusing the existing Transport vendor/model registration since this install's Cubase would not discover a brand-new one ([ADR-008](adr/ADR-008-reuse-transport-registration-slot.md)), and switching the stale "Transport" Mapping Page selector to "Main" after deploying the merged script. With both fixes in place, every item in the checklist above passed a live pass against real Cubase 15 on 2026-07-10 — Transport and Markers both fully functional through one consolidated script, one port pair, with no interference between phases.
