# Cubase Companion Script Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two independent Cubase MIDI Remote scripts (`CubaseCompanion_Transport.js`, `CubaseCompanion_Markers.js`) into one consolidated script, `CubaseCompanion.js`, per [ADR-007](../adr/ADR-007-single-consolidated-cubase-script.md) — one device driver, one MIDI port pair, per-phase MIDI channels kept internally. Consolidate the two setup docs into one. Deploy and live-verify against real Cubase 15.

**Architecture:** No Companion-side (TypeScript) code changes — `protocol.ts`/`connection.ts`/`actions.ts`/`presets.ts` were already built around one channel-aware `MidiConnection`, unaffected by this change. Only the Cubase-side script and docs change.

**Tech Stack:** ES5 JavaScript (Cubase's embedded `midiremote_api_v1` scripting engine, no build step, no test harness — syntax-checked with `node --check` only, functionally verified only by running inside real Cubase).

## Global Constraints

- The merged script registers as `midiremote_api.makeDeviceDriver('CubaseCompanion', 'Companion', 'companion-module-cubase')` — a new vendor+model combination Cubase has not seen before, so it will show up as a brand new controller to add in Studio Setup, not an automatic replacement of the existing "CubaseCompanion Transport" entry.
- Transport channel/notes and Markers channel/notes are unchanged from what's already implemented and reviewed: `TRANSPORT_CHANNEL = 15` (notes: Play=0, Stop=1, Record=2, ReturnToZero=3, Cycle=4, Click=5, Rewind=6, Forward=7, Heartbeat=9, PlayState=10, RecordState=11, CycleState=12, ClickState=13); `MARKERS_CHANNEL = 14` (notes: AddMarker=0, NextMarker=1, PreviousMarker=2, ToMarker1=3..ToMarker9=11).
- Both phases' bindings must live on the **same page** (`deviceDriver.mMapping.makePage('Main')`) — Steinberg MIDI Remote pages are for switching between alternate mappings and are not all simultaneously active by default; Transport and Markers must both always be live, not toggled between.
- Button grid positions (`surface.makeButton(x, y, w, h)`) must not collide between the two phases now that they share one surface — Transport on row `y=0` (x 0-7), Markers on row `y=1` (x 0-11).
- No unit tests exist or are added for this script (same documented limitation as before — see ARCHITECTURE.md). Verification is `node --check` (syntax only) plus a live walkthrough against real Cubase 15.

---

## File Structure

```
cubase-midi-remote/
  Local/
    CubaseCompanion/
      CubaseCompanion.js       # CREATE -- the merged script
      Transport/                # DELETE (folder + file)
        CubaseCompanion_Transport.js
      Markers/                  # DELETE (folder + file)
        CubaseCompanion_Markers.js

docs/
  cubase-companion-setup.md   # CREATE -- merged setup/verification doc
  cubase-companion-transport-setup.md   # DELETE
  cubase-companion-markers-setup.md      # DELETE

ROADMAP.md   # MODIFY -- both phases' setup-doc links point at the new merged doc
```

---

### Task 1: Merge the two Cubase scripts into one

**Files:**
- Create: `cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js`
- Delete: `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js` (and the now-empty `Transport/` folder)
- Delete: `cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js` (and the now-empty `Markers/` folder)

**Interfaces:**
- Consumes: nothing from the TypeScript side — this is a pure merge of two existing, already-reviewed ES5 files (`CubaseCompanion_Transport.js`, `CubaseCompanion_Markers.js`, both readable in git history / the current worktree before this task deletes them).
- Produces: one Cubase MIDI Remote device driver replacing the two it supersedes.

Not unit-testable (ES5, no test harness). Verified via `node --check` (syntax only) in this task; functional verification happens live in Task 3.

- [ ] **Step 1: Create the merged script**

```javascript
// cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js
var midiremote_api = require('midiremote_api_v1')

// Transport (Phase 1) -- MIDI channel 16, zero-indexed 15.
var TRANSPORT_CHANNEL = 15
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_RETURN_TO_ZERO = 3
var NOTE_CYCLE = 4
var NOTE_CLICK = 5
var NOTE_REWIND = 6
var NOTE_FORWARD = 7
var NOTE_HEARTBEAT = 9
// Dedicated state-feedback notes (Cubase -> Companion only), separate from the
// trigger notes above (Companion -> Cubase). Feedback used to share the same
// note as its trigger, which meant our own midiOutput.sendMidi() calls below
// looped back into THIS SCRIPT's own mMidiBinding input (same shared loopMIDI
// port), re-triggering .setTypeToggle() as if it were a fresh button press --
// confirmed by tracing the raw value seen by mOnProcessValueChange, which kept
// flipping back to 0 on its own a few ms after every real press. Splitting
// feedback onto its own notes means our own output can never match what its
// own input binding is listening for. See ADR-004.
var NOTE_PLAY_STATE = 10
var NOTE_RECORD_STATE = 11
var NOTE_CYCLE_STATE = 12
var NOTE_CLICK_STATE = 13
var HEARTBEAT_INTERVAL_MS = 2000

// Markers (Phase 3) -- MIDI channel 15, zero-indexed 14. Own dedicated channel
// per phase (ADR-006), kept even though all phases now live in one script
// (ADR-007) -- a single script author can trivially avoid note collisions by
// hand, but the per-phase channel still keeps each phase's note range
// self-contained and easy to reason about in isolation.
var MARKERS_CHANNEL = 14
var NOTE_ADD_MARKER = 0
var NOTE_NEXT_MARKER = 1
var NOTE_PREVIOUS_MARKER = 2
var NOTE_TO_MARKER_1 = 3
var NOTE_TO_MARKER_2 = 4
var NOTE_TO_MARKER_3 = 5
var NOTE_TO_MARKER_4 = 6
var NOTE_TO_MARKER_5 = 7
var NOTE_TO_MARKER_6 = 8
var NOTE_TO_MARKER_7 = 9
var NOTE_TO_MARKER_8 = 10
var NOTE_TO_MARKER_9 = 11

// One device driver for the whole project (ADR-007) -- Cubase's MIDI Remote
// will not bind two separate controllers to the same MIDI port pair, so every
// phase lives in this one script on one port pair, differentiated only by
// channel (see the per-phase channel constants above).
var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Companion', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion')
  .expectOutputNameEquals('CubaseCompanion')

var surface = deviceDriver.mSurface

function makeButton(x, y) {
  return surface.makeButton(x, y, 1, 1)
}

// Transport buttons -- row 0.
var btnPlay = makeButton(0, 0)
var btnStop = makeButton(1, 0)
var btnRecord = makeButton(2, 0)
var btnReturnToZero = makeButton(3, 0)
var btnCycle = makeButton(4, 0)
var btnClick = makeButton(5, 0)
var btnRewind = makeButton(6, 0)
var btnForward = makeButton(7, 0)

// Marker buttons -- row 1, so they don't collide with Transport's row-0 grid
// positions now that both phases share one surface.
var btnAddMarker = makeButton(0, 1)
var btnNextMarker = makeButton(1, 1)
var btnPreviousMarker = makeButton(2, 1)
var btnToMarker1 = makeButton(3, 1)
var btnToMarker2 = makeButton(4, 1)
var btnToMarker3 = makeButton(5, 1)
var btnToMarker4 = makeButton(6, 1)
var btnToMarker5 = makeButton(7, 1)
var btnToMarker6 = makeButton(8, 1)
var btnToMarker7 = makeButton(9, 1)
var btnToMarker8 = makeButton(10, 1)
var btnToMarker9 = makeButton(11, 1)

// Play/Record/Cycle/Click are input-only here (no .setOutputPort()) --
// Steinberg's automatic MIDI-mirror for .setTypeToggle() bindings turned out
// to send a noisy burst of 5-7 redundant, differently-encoded messages (mixed
// Note On/Off velocities plus an undocumented Polyphonic Aftertouch message)
// per single toggle, which the Companion module's simple state tracker can't
// reliably resolve to one clean value. See the explicit mOnProcessValueChange
// feedback below instead, which sends exactly one message per real change.
btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)
btnReturnToZero.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RETURN_TO_ZERO)
btnCycle.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_CYCLE)
btnClick.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_CLICK)
btnRewind.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_REWIND)
btnForward.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_FORWARD)

// Markers are all input-only (no .setOutputPort()) -- these are one-shot
// command triggers with no persistent state, so there's nothing to send
// feedback for (see the Markers design spec's Scope section).
btnAddMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_ADD_MARKER)
btnNextMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_NEXT_MARKER)
btnPreviousMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_PREVIOUS_MARKER)
btnToMarker1.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_1)
btnToMarker2.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_2)
btnToMarker3.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_3)
btnToMarker4.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_4)
btnToMarker5.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_5)
btnToMarker6.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_6)
btnToMarker7.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_7)
btnToMarker8.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_8)
btnToMarker9.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_9)

// One page for everything -- Steinberg MIDI Remote pages are for switching
// between alternate mappings (e.g. banks) and are not all simultaneously
// active by default. Transport and Markers must both always be live at once,
// not toggled between, so they share this single page rather than each
// getting their own.
var page = deviceDriver.mMapping.makePage('Main')

page.makeValueBinding(btnPlay.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
page.makeValueBinding(btnStop.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStop)
page.makeValueBinding(btnRecord.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()
// Return to Zero has no dedicated mTransport.mValue member (unlike Start/Stop/Record/
// Rewind/Forward/Cycle/Metronome) — it's a Transport menu key command, so it's bound
// via makeCommandBinding to Cubase's built-in "Return to Zero" key command instead.
page.makeCommandBinding(btnReturnToZero.mSurfaceValue, 'Transport', 'Return to Zero')
page.makeValueBinding(btnCycle.mSurfaceValue, page.mHostAccess.mTransport.mValue.mCycleActive).setTypeToggle()
page.makeValueBinding(btnClick.mSurfaceValue, page.mHostAccess.mTransport.mValue.mMetronomeActive).setTypeToggle()
page.makeValueBinding(btnRewind.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRewind)
page.makeValueBinding(btnForward.mSurfaceValue, page.mHostAccess.mTransport.mValue.mForward)

// Exact Cubase key command names, category 'Transport' for all -- pulled from
// this Cubase install's own key-command presets (Presets/KeyCommands/*.xml),
// not guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N'
// (not used here) assigns/overwrites one instead -- see the Markers design
// spec's decision log.
page.makeCommandBinding(btnAddMarker.mSurfaceValue, 'Transport', 'Insert Marker')
page.makeCommandBinding(btnNextMarker.mSurfaceValue, 'Transport', 'Locate Next Marker')
page.makeCommandBinding(btnPreviousMarker.mSurfaceValue, 'Transport', 'Locate Previous Marker')
page.makeCommandBinding(btnToMarker1.mSurfaceValue, 'Transport', 'To Marker 1')
page.makeCommandBinding(btnToMarker2.mSurfaceValue, 'Transport', 'To Marker 2')
page.makeCommandBinding(btnToMarker3.mSurfaceValue, 'Transport', 'To Marker 3')
page.makeCommandBinding(btnToMarker4.mSurfaceValue, 'Transport', 'To Marker 4')
page.makeCommandBinding(btnToMarker5.mSurfaceValue, 'Transport', 'To Marker 5')
page.makeCommandBinding(btnToMarker6.mSurfaceValue, 'Transport', 'To Marker 6')
page.makeCommandBinding(btnToMarker7.mSurfaceValue, 'Transport', 'To Marker 7')
page.makeCommandBinding(btnToMarker8.mSurfaceValue, 'Transport', 'To Marker 8')
page.makeCommandBinding(btnToMarker9.mSurfaceValue, 'Transport', 'To Marker 9')

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion: page activated')
}

// Explicit, single-message state feedback for the four bidirectional Transport
// toggles (Play/Record/Cycle/Click). Markers has no feedback -- see Scope in
// the Markers design spec.
//
// NOTE: a prior version of this bound the callback to the *host* value
// (page.mHostAccess.mTransport.mValue.mX.mOnProcessValueChange) instead of
// the surface value below. Steinberg's own API reference (README_v1.html /
// midiremote_factory_scripts/.api/v1/midiremote_api_v1.d.ts, and the
// ExampleCompany_RealWorldDevice.js factory script, which wires up this exact
// transport-toggle-plus-LED-feedback pattern) only documents
// mOnProcessValueChange on MR_SurfaceElementValue (i.e. mSurfaceValue) -- it
// isn't a real hook on host value objects at all, so that version silently
// did nothing. This is the object the API actually supports.
function bindStateFeedback(surfaceValue, note) {
  surfaceValue.mOnProcessValueChange = function (activeDevice, value) {
    var statusOn = 0x90 | TRANSPORT_CHANNEL
    var statusOff = 0x80 | TRANSPORT_CHANNEL
    if (value >= 0.5) {
      midiOutput.sendMidi(activeDevice, [statusOn, note, 127])
    } else {
      midiOutput.sendMidi(activeDevice, [statusOff, note, 0])
    }
  }
}

bindStateFeedback(btnPlay.mSurfaceValue, NOTE_PLAY_STATE)
bindStateFeedback(btnRecord.mSurfaceValue, NOTE_RECORD_STATE)
bindStateFeedback(btnCycle.mSurfaceValue, NOTE_CYCLE_STATE)
bindStateFeedback(btnClick.mSurfaceValue, NOTE_CLICK_STATE)

var lastHeartbeatSentAt = 0

deviceDriver.mOnIdle = function (activeDevice) {
  var now = Date.now()
  if (now - lastHeartbeatSentAt < HEARTBEAT_INTERVAL_MS) return
  lastHeartbeatSentAt = now

  var statusOn = 0x90 | TRANSPORT_CHANNEL
  var statusOff = 0x80 | TRANSPORT_CHANNEL
  midiOutput.sendMidi(activeDevice, [statusOn, NOTE_HEARTBEAT, 127])
  midiOutput.sendMidi(activeDevice, [statusOff, NOTE_HEARTBEAT, 0])
}
```

- [ ] **Step 2: Syntax-check the merged script**

Run: `node --check "cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js"` (from the repo root)
Expected: exits 0, no output.

- [ ] **Step 3: Delete the two superseded scripts and their folders**

```bash
git rm "cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js"
git rm "cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js"
```

(Removing the last tracked file from a directory removes the directory too; there is no other content in either `Transport/` or `Markers/`.)

- [ ] **Step 4: Commit**

```bash
git add "cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js"
git commit -m "feat: merge Transport and Markers Cubase scripts into one (ADR-007)"
```

---

### Task 2: Consolidate the setup docs

**Files:**
- Create: `docs/cubase-companion-setup.md`
- Delete: `docs/cubase-companion-transport-setup.md`
- Delete: `docs/cubase-companion-markers-setup.md`
- Modify: `ROADMAP.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Create the merged setup doc**

```markdown
# Cubase Companion — Setup & Verification

## Setup

1. Point your existing virtual/network MIDI port pair so both a "CubaseCompanion" input and output are visible to Cubase and to Node/Companion (loopMIDI locally, or rtpMIDI/AppleMIDI across machines). One port pair carries every phase (Transport, Markers, and future phases) — see [ADR-007](adr/ADR-007-single-consolidated-cubase-script.md).
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote. If you have an older "CubaseCompanion Transport" and/or "CubaseCompanion Markers" controller from a previous version of this setup, remove them — this script registers as a new controller (vendor `CubaseCompanion`, model `Companion`). Add it and bind its MIDI In/Out to your port pair.
4. Build the Companion module: `cd companion-module-cubase && npm install && npm run build`.
5. Load `companion-module-cubase` into a local Companion dev instance and add a Cubase instance, setting MIDI In/Out to the same port pair.

## Verification checklist

### Transport

- [ ] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [ ] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [ ] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), triggered from Companion.
- [ ] Same, triggered from Cubase's own UI.
- [ ] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [ ] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three; Rewind/Forward must be triggered via the preset buttons, whose release step sends the matching Note Off — a manually-built button using only the raw action will not stop on release).
- [ ] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [ ] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.

### Markers

- [ ] Add Marker: press in Companion, confirm a new marker appears at the current cursor/playhead position in Cubase.
- [ ] Next Marker / Previous Marker: with at least two markers present, confirm the cursor jumps to the next/previous marker relative to its current position.
- [ ] To Marker 1 through To Marker 9: with markers 1-9 present, confirm each button jumps directly to its corresponding marker.
- [ ] Pressing a To Marker N button for a marker that doesn't exist does not error or crash Cubase (should simply do nothing).

### Both together

- [ ] With Cubase actively playing/recording (Transport feedback lit), fire a Markers action and confirm Transport's feedback state is undisturbed — both phases share one script and one port, so this confirms they don't interfere with each other.

> **Status: not yet verified against this consolidated script.** Both phases were separately verified working under the prior two-script architecture (see git history / ADR-004's and the Markers design spec's amendments for that record) before hitting the port-sharing limitation that prompted this consolidation (ADR-007). This checklist needs a fresh full run against the merged `CubaseCompanion.js` before either phase can be considered verified again.
```

- [ ] **Step 2: Delete the two superseded setup docs**

```bash
git rm docs/cubase-companion-transport-setup.md
git rm docs/cubase-companion-markers-setup.md
```

- [ ] **Step 3: Update ROADMAP.md's setup-doc links**

Find (in Phase 1's section):

```markdown
- [x] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-transport-setup.md](docs/cubase-companion-transport-setup.md)'s checklist.
```

Replace with:

```markdown
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. Previously verified under the prior two-script architecture; needs re-verification against the consolidated script (see [ADR-007](docs/adr/ADR-007-single-consolidated-cubase-script.md)).
```

Find (in Phase 3's section):

```markdown
- [ ] **BLOCKED: live verification against real Cubase 15.** Found that Cubase will not bind two MIDI Remote controllers to the same port pair, invalidating this phase's "share Transport's MIDI port" design decision. See the design spec's 2026-07-09 amendment for the resume plan (Markers needs its own dedicated MIDI port pair and its own `MidiConnection` in the module, not a shared one). Not yet implemented.
```

Replace with:

```markdown
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. The port-sharing blocker is resolved by consolidating to one script ([ADR-007](docs/adr/ADR-007-single-consolidated-cubase-script.md)); pending a live verification pass.
```

Also change the Phase 3 heading from `## Phase 3: Markers & locators — Blocked on architecture rework` to `## Phase 3: Markers & locators — In progress`.

- [ ] **Step 4: Commit**

```bash
git add docs/cubase-companion-setup.md ROADMAP.md
git commit -m "docs: consolidate Transport and Markers setup docs into one"
```

---

### Task 3: Deploy and live-verify against real Cubase

**Files:** none (deployment + manual verification only).

**Interfaces:**
- Consumes: Task 1's `CubaseCompanion.js`, Task 2's `docs/cubase-companion-setup.md` checklist.

This task requires a human with a real, running Cubase 15 instance and cannot be delegated to a subagent — it is manual coordination between the controller and the project owner, same as the live-verification portions of the original Markers plan.

- [ ] **Step 1: Deploy the merged script**

Copy `cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js` to `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\CubaseCompanion.js`. Remove the old deployed `Transport/` and `Markers/` subfolders from that same Driver Scripts location if still present (from the prior two-script setup) so Cubase's script scan doesn't pick up stale copies alongside the new one.

- [ ] **Step 2: Deploy the Companion module**

Build (`npm run build`) and mirror `companion-module-cubase` to wherever Companion loads it from as a dev module. No source changes are needed here (per this plan's Global Constraints, the Companion-side module is unaffected by this consolidation) — this step exists only in case the deployed copy has drifted from the worktree since the module was last verified.

- [ ] **Step 3: Walk through `docs/cubase-companion-setup.md`'s verification checklist for real**

Coordinate with the project owner: remove any old "CubaseCompanion Transport" / "CubaseCompanion Markers" controller entries in Cubase's Studio Setup, add the new consolidated "CubaseCompanion" controller, bind it to the port pair, and run through every checkbox in the doc from Task 1. Check off each item as it passes; if any item fails, diagnose and fix before proceeding (matching the debugging approach used throughout this project's earlier live-verification passes — gather evidence via direct MIDI capture rather than guessing, consult Cubase's own bundled API reference/factory scripts before assuming API behavior).

- [ ] **Step 4: Update the setup doc's status line and commit**

Once the checklist passes, update `docs/cubase-companion-setup.md`'s closing status blockquote to reflect what was actually verified (matching the pattern used in the prior Transport-only setup doc), and update ROADMAP.md's Phase 1 and Phase 3 checkboxes to `[x]` for the verification items.

```bash
git add docs/cubase-companion-setup.md ROADMAP.md
git commit -m "docs: confirm consolidated Cubase script verified end-to-end"
```
