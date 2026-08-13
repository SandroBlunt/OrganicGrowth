# Producer offers a Camera Hub teleprompter upload for News Short Script Assets

**Status:** accepted — extends the News Short Script Recipe (ADR-0021). Captured in the 2026-08-12
issue #189 triage grilling.

Straw Motion's Unhypped Daily Format already produces a clean, copy-paste-ready `script.txt` for every
`news-short-script` Asset (ADR-0021), but the Operator still opens it and pastes it into Elgato Camera
Hub's teleprompter panel by hand, every time. A smoke test (2026-08-12, Camera Hub v2.3.0 / macOS 26.5.2)
proved Camera Hub reads its teleprompter library from two local files under
`~/Library/Application Support/Elgato/Camera Hub/`: one JSON file per script (`Texts/<GUID>.json`) and a
flat GUID array in `AppSettings.json` (`applogic.prompter.libraryList`) that actually makes an entry
appear in the library.

## Decision

- **In-conversation offer only, mirroring Schedule Batch (ADR-0008, issue #148).** There is no
  standalone command. Once one or more `news-short-script` Assets exist without an upload marker —
  whether just produced this session or left over from any earlier run — the producer offers to upload
  them and proceeds only after the Operator approves, in that same conversation.
- **No silent drops.** Because there is no manual command to fall back on, every offer sweeps for ALL
  un-uploaded `news-short-script` Assets, not only ones just produced. Once the Operator approves a
  script, the producer is responsible for actually completing its upload, not merely making the offer.
- **Quit is semi-manual, not automated.** The smoke test's attempt to script Camera Hub's quit
  (`osascript`) failed on a confirmation dialog the app shows. Rather than pursue an Accessibility-
  permission workaround, the producer asks the Operator to quit Camera Hub themselves, then verifies via
  a process check before touching any files — if it's still running, it asks again instead of
  proceeding. It relaunches the app itself afterward (a plain relaunch needs no special permission).
- **Scoped to the `news-short-script` Recipe only.** It is the only Recipe that produces a plain script
  today; this is not built as a generic hook for any Recipe.
- **One tested capability, not ad-hoc shell commands.** The quit-check → write → backup → rewrite →
  relaunch sequence lives behind one function, tested against an injectable fake root directory and a
  fake app-lifecycle — the real Camera Hub install and the real app process are never touched by tests,
  mirroring the fake-Magnific-Space convention already used for Recipe tests.
- **Tracked with a plain field, not a new lifecycle status.** A `news-short-script` Asset gets a new
  optional field recording when its script was uploaded — same pattern as `scheduled_at`: it "carries no
  lifecycle meaning of its own." This is what lets the sweep (above) avoid re-uploading the same script.
- **The WebSocket route is deliberately deferred.** Camera Hub also listens on two local ports that
  might allow a live update without any quit/relaunch — unexplored, undocumented, not part of this
  decision. The proven file-edit approach ships now; the WebSocket idea is a possible future spike, not
  a blocker.

## Why

Quitting and relaunching a real desktop app and editing its private on-disk storage is a new class of
action for the producer — until now it has only ever called the Magnific and Zoho APIs. This is accepted
deliberately, kept tightly scoped (one Recipe, one tested function, the real app never touched by any
test) and kept as a pure convenience step: a failed upload never fails or blocks the Asset's produce/save
step, and `script.txt` stays available for manual copy-paste regardless of outcome.

## Consequences

- This is undocumented, private app storage, not a public API — a Camera Hub update could change the
  schema or storage mechanism without notice. A failed upload must degrade to "reported, not blocking."
- The Operator remains present for every quit/confirm step, consistent with the rest of the pipeline's
  attended-only model (ADR-0008) — there is no unattended path that quits or relaunches a desktop app
  on the Operator's behalf.
