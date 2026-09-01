# Design Decisions

Forks where a real alternative existed, what was chosen, and what was left on the table.

## Backlog — alternatives worth trying later

- **Manual-only Focus Gate arming** (from "How the Focus Gate re-arms") — an override for ad-hoc focus sessions, alongside the automatic daily re-arm. Revisit at the enable switch in `app/components/modals/FocusGateModal.js`.

---

## 2026-08-03 — What unlocks the Focus Gate

**The fork:** which completion condition lifts the app block.

| Option | Tradeoff |
| --- | --- |
| **A. One designated side list fully completed today** | A clear daily contract; reuses existing per-day completion semantics. Requires finishing a whole list, which is stricter on heavy days. |
| B. Any N tasks in a main list | Flexible, but trivially gamed by knocking out the N shortest tasks — the gate stops meaning anything. |
| C. One specific keystone task | Simplest to reason about, but the weakest friction: one tap and everything unlocks all day. |

**Chosen: A.** The whole point is friction that correlates with actually having done the day's work; B and C both decouple the reward from that.

- **B — rejected:** gameable in a way that quietly erodes the feature's value.
- **C — rejected:** friction too weak to be worth the Screen Time complexity.

**Revisit hook:** `isGateSatisfied` in `app/utils/focusGate.js` is the single predicate — a different rule is a change to that one function plus its tests.

## 2026-08-03 — How the Focus Gate re-arms

**The fork:** how blocking comes back after a day's tasks are done.

| Option | Tradeoff |
| --- | --- |
| **A. Automatic daily re-arm at a chosen hour** | Runs in the native DeviceActivity extension, so it works even if ADHDone is never opened. More native surface area to get right. |
| B. Manual arming from the app | Simpler (no DeviceActivity schedule at all), but depends on the user remembering to re-arm. |

**Chosen: A.** Manual arming depends on exactly the executive function the feature exists to support — a gate you have to remember to switch on is a gate that quietly stops being used.

- **B — deferred, worth trying:** valuable *in addition* to A, as an "start a focus session now" override rather than as the only mode.

**Revisit hook:** the enable switch in `app/components/modals/FocusGateModal.js`, plus `scheduleDailyRearm`/`cancelDailyRearm` in `app/services/focusGateService.js`.

## 2026-09-01 — How the user picks which apps to block

**The fork:** the first on-device use of the Focus Gate found the "Apps to Block" step cramped and unusable.

| Option | Tradeoff |
| --- | --- |
| **A. Apple's native picker sheet** (`DeviceActivitySelectionSheetViewPersisted`) | Full screen, with Apple's own search and Cancel/Done. Selection is persisted natively, so the app never handles a selection token. Presentation is Apple's to control — no styling to match our glass UI. |
| B. Enlarge the inline picker | Keeps the picker in our own visual language and inside the settings flow. **Impossible in v0.6.1:** the library's native view sets `isUserInteractionEnabled = false` on the inline hosting view, so the picker is inert at any size; it also nests a scroll view inside our modal's ScrollView. |
| C. Give the inline picker its own full-screen modal | Solves the scroll conflict and the cramping, but not the inertness — same dead end as B, with more code. |

**Chosen: A.** It is the only option that actually produces a usable picker without patching the package, and it inherits Apple's search — which matters most for exactly the users who need this feature.

- **B — rejected:** non-interactive by construction in the installed version.
- **C — rejected:** inherits B's blocker.

**Revisit hook:** the `DeviceActivitySelectionSheet` export in `app/services/focusGateService.js`. If a future package version makes the inline view interactive, B becomes viable and would let the picker sit inline with the other steps.
