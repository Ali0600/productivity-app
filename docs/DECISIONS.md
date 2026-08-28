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
