# Ridgeline Story — Project Controls Training Tool

Single-file HTML narrative case study hosted on GitHub Pages. No build tools, no framework.
**Never push to GitHub** — the user handles all git/deploy themselves.

## File
`index.html` (~2,800 lines) — all CSS, HTML, and JS in one file.

### Section line ranges
| Section | Lines |
|---|---|
| CSS | 8–601 |
| Sidebar + Hero HTML | 602–655 |
| Beat 1–8 HTML | 656–1929 |
| Document modals HTML | 1930–2486 |
| Main `<script>` block | 2488–2755 |
| Folder panel HTML | 2757–2795 |
| Folder `<script>` block | 2797–2810 |

---

## Beat structure

| ID | Nav label | Approx. line |
|---|---|---|
| `beat1` | Project Controls Kickoff | 657 |
| `beat2` | WBS, Risks & PC Plan | 1030 |
| `beat3` | The First Monthly Report | 1400 |
| `beat4` | Months 1–3: Learning the Rhythm | 1498 |
| `beat5` | Month 5: Something Is Wrong | 1551 |
| `beat6` | Month 7: The Clearing Stop | 1651 |
| `beat7` | Month 9: Finding the Error | 1723 |
| `beat8` | Month 12: Closing the Books | 1811 |

All beats except `beat1` start locked (`beat-locked` class, `nav-locked` on sidebar item).
Each beat unlocks sequentially via `unlockNextBeat()` when its final scene completes.

---

## Scene system

Scenes are direct children of a beat with class `.scene-block`. JS (`initStoryBeats`) hides all but the first and appends a `.story-nav` Continue button at the bottom of the beat.

### Data attributes on `.scene-block`
| Attribute | Effect |
|---|---|
| `data-folder-unlock="key1,key2"` | Fires `_folderUnlock(key)` when **leaving** this scene (not when arriving) |
| `data-require-docs="doc-a,doc-b"` | Gates Continue until all listed docs are opened |
| `data-beat="beatId"` | Used with `data-require-docs` to match the doc-hint element |

### Current folder-unlock keys & triggers
| Key | Fires on leaving scene | Injects into folder |
|---|---|---|
| `handover-docs` | `#scene-email` (Sarah's kickoff email) | "Handover" subfolder under Documents |
| `kickoff-notes` | grid-note scene (line ~745) | "PC Kickoff Prep Notes" under Notes |
| `meeting-notes` | inner-voice scene (line ~913) | "Kickoff Meeting Notes" under Notes |
| `dan-email` | `#scene-dan-email` (line ~961) | "Project Controls" subfolder under Documents |

`handover-docs` also makes the folder tab visible (`folder-tab-visible` class).

---

## Dialogue system

`.dialogue` containers are processed by `initDialogues()` on load:
- All `.line` elements after the first are hidden (`line-hidden` = `opacity:0`)
- Lines are wrapped in `.dialogue-scroll` (max-height: 340px, internal scroll)
- Controls div appended: Next ›, progress counter, "show all"

Scroll logic in `dlgNext`: only scrolls if the new line falls below the visible area.

---

## Document modals

| ID | Description |
|---|---|
| `doc-contract` | Signed contract PDF mock |
| `doc-estimate` | Excel budget estimate mock |
| `doc-schedule` | Baseline schedule Gantt mock |
| `doc-brief` | Project brief Word doc mock |
| `doc-kickoff-notes` | Grid-paper notes — J. Okafor · Jan 16 |
| `doc-meeting-notes` | Grid-paper meeting notes — Sarah Chen · Jan 17 |
| `doc-dan-email` | Dan Reyes PC checklist email · Jan 20 |

Open/close: `openDoc(id)` / `closeDoc(el)`. Pattern: `.doc-overlay#doc-{name}` > `.doc-window`.

Doc tracking for gated scenes: `trackDocOpen(beatId, docId)` — records opens in `beatDocsReviewed`, updates hint bar.

---

## Project folder panel

Fixed right-side panel (`#folder-panel`). Tab button (`#folder-tab`) starts hidden; appears on `handover-docs` unlock.

| Container | Purpose |
|---|---|
| `#folder-docs` | Documents section — subfolders injected here |
| `#folder-docs-empty` | Placeholder (removed on first inject) |
| `#folder-notes` | Notes section — items injected here |
| `#folder-notes-empty` | Placeholder (removed on first inject) |
| `#folder-handover` | Handover subfolder (contract, estimate, schedule, brief) |
| `#folder-pc-controls` | Project Controls subfolder (Dan's email) |
| `#folder-item-kickoff` | Kickoff Prep Notes item |
| `#folder-item-meeting` | Kickoff Meeting Notes item |

Toggle: `toggleFolder()` / `toggleSubfolder(el)`.

---

## Key JS functions

| Function | What it does |
|---|---|
| `initStoryBeats()` | Locks beats 2+, hides non-first scenes, appends Continue navs |
| `beatNext(beatId)` | Advances scene; checks doc gate; fires folder unlocks; unlocks next beat on last scene |
| `unlockBeat(beat)` | Removes `beat-locked`, fades in, scrolls to it, unlocks nav item |
| `unlockNextBeat(beat)` | Finds next beat in DOM and calls `unlockBeat` |
| `initDialogues()` | Wraps dialogue lines, hides all but first, adds controls |
| `dlgNext(btn)` | Reveals next line, scrolls if needed, updates counter |
| `dlgShowAll(btn)` | Reveals all lines at once |
| `trackDocOpen(beatId, docId)` | Records doc open, updates hint bar |
| `handleFolderUnlock(keys)` | Splits comma-separated keys, calls `_folderUnlock` for each |
| `_folderUnlock(key)` | Injects folder items/subfolders by key |
| `openDoc(id)` / `closeDoc(el)` | Show/hide doc modal overlays |
| `toggleFolder()` | Toggle folder panel open/closed |
| `toggleSubfolder(el)` | Toggle subfolder expand/collapse |

---

## Design tokens (CSS variables)
```
--bg:#0f1117         --surface:#181c26    --surface2:#1e2333   --border:#2a3048
--amber:#f0a500      --red:#e05a4e        --green:#4caf82      --blue:#5b9bd5
--teal:#3eb8b8       --purple:#7b68ee     --text:#d4dae8       --text-dim:#7a8499
--text-bright:#eef2ff
--mono:'IBM Plex Mono'  --sans:'IBM Plex Sans'  --display:'Bebas Neue'
```

---

## Conventions
- Hidden scenes: `display:none` via `.scene-hidden` class
- Hidden dialogue lines: `opacity:0` via `.line-hidden` (no layout shift)
- Beat locking: `.beat-locked{display:none}` + `.nav-locked{opacity:0.35;pointer-events:none}`
- Folder tab hidden: `opacity:0;pointer-events:none` until `.folder-tab-visible` added
- Excel table mocks: `.xls-tbl` wrapper, explicit `background:#fff;color:#222` on cells to override dark theme
- Smooth scene reveal: `opacity 0.4s ease` + `translateY(10px→0)` inline style animation
