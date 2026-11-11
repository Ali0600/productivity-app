# Design Decisions

Forks where a real alternative existed, what was chosen, and what was left on the table.

## Backlog — alternatives worth trying later

- **`expo-system-ui` for an explicit root-view background** (from "Killing the white band under the app-picker sheet") — pins the root view regardless of what the system default resolves to. Revisit at `userInterfaceStyle` in `app.config.js`.
- **Manual-only Focus Gate arming** (from "How the Focus Gate re-arms") — an override for ad-hoc focus sessions, alongside the automatic daily re-arm. Revisit at the enable switch in `app/components/modals/FocusGateModal.js`.
- **An always-content pet as the default** (from "What the pet does when you're away") — shipped as the opt-in Calm mode; make it the default if the mild moods ever read as pressure. Revisit at `createPet` in `app/utils/pet.js`.

---

## 2026-11-10 — How finishing a task feeds the pet

Chosen by Claude from the research in [GAMIFICATION.md](GAMIFICATION.md); not yet reviewed by the owner.

**The fork:** whether a finished task feeds the pet directly, or earns food you then hand over.

| Option | Tradeoff |
| --- | --- |
| **A. Eaten on the swipe** | The reward lands inside the gesture, which matters most with ADHD's steeper delay discounting. Less to do in the pet's own space. |
| B. Earn treats, feed them by hand | An extra care ritual and a reason to visit the pet, but it delays the payoff, and banked treats leave a hungry pet beside finished tasks, which reads as unfair. |

**Chosen: A.** The research's strongest ADHD-specific finding is that the reward has to be immediate; B moves it to later.

- **B — rejected:** delays the payoff the whole feature depends on.

**Revisit hook:** the `snack` events from `feed` in `app/utils/pet.js`, and `reactionFor` in `app/utils/petMessages.js`.

## 2026-11-10 — What the pet does when you're away

Chosen by Claude from the research in [GAMIFICATION.md](GAMIFICATION.md); not yet reviewed by the owner.

**The fork:** how the pet reflects days with no finished tasks.

| Option | Tradeoff |
| --- | --- |
| **A. Mild daily needs, floored at a nap** | Peckish each morning, napping after two empty days, fixed by any one task. Responds to what you do (a happy-and-sad pet doubled compliance in one small study, [GAMIFICATION](GAMIFICATION.md) [20]) without ever punishing. Some days even "peckish" may feel like pressure. |
| B. Always content | Zero pressure, but a pet that never responds has little pull. |
| C. Real consequences (sick, dies, runs away, loses levels) | Strong loss aversion, but punishment teaches avoidance, more so with ADHD, and death turns into grief or indifference. |

**Chosen: A, with B as an opt-in Calm mode.** A is the version the research supports; B is one switch away for days that need it.

- **B — deferred, worth trying:** as the default, if A turns out to feel like pressure in daily use.
- **C — rejected:** every source on punishment points the same way.

**Revisit hook:** `moodFor` and `NAP_AFTER_EMPTY_DAYS` in `app/utils/pet.js`.

## 2026-11-10 — Where the pet's snacks come from in the code

Chosen by Claude while building the pet; not yet reviewed by the owner.

**The fork:** how a completion reaches the pet.

| Option | Tradeoff |
| --- | --- |
| **A. Read the completion log through a watermark** | Every completion path feeds the pet with no call site to remember (two handlers today, plus backup import for completions newer than the watermark). Deleting a task never takes a snack back, and a lost save heals on the next launch. Needs care with clock skew and ordering. |
| B. Award a snack from each completion handler | Simple and explicit, but every new way to complete a task has to remember the call, and the newest one is the one that forgets. |

**Chosen: A.** The completion log already exists and every path writes to it, so reading it is the one place that cannot miss a path.

- **B — rejected:** a hand-maintained "call this everywhere" list misses its newest member.

**Revisit hook:** `collectCompletions` and `feed` in `app/utils/pet.js`.

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

## 2026-09-01 — Killing the white band under the app-picker sheet

**The fork:** how to stop iOS light-mode system colours showing as a white band beneath Apple's presented Screen Time picker.

| Option | Tradeoff |
| --- | --- |
| **A. `userInterfaceStyle: "dark"`** | One line, no new dependency. Turns *both* white layers dark at once — the RN root view's `systemBackgroundColor` and the picker host's `systemGroupedBackground` — and makes `GlassView`'s `'auto'` resolve correctly, retiring a standing footgun. Changes system-drawn surfaces app-wide (Alerts, keyboard), which can only be checked on a device after a build. |
| B. `expo-system-ui` + `backgroundColor` | Keeps light mode and paints only the root view. Narrower blast radius, but adds a native dependency, does not touch the picker's own `#F2F2F7` container, and leaves the `colorScheme="dark"` hazard in place. |
| C. Both | Belt and braces: dark mode *and* an explicitly pinned root view. Strictly more than A needs, for one extra native dep. |

**Chosen: A.** The app is dark-only; forcing light was the root cause rather than something to work around, and A is also the only option that fixes the picker's own container.

- **B — deferred, worth trying:** valuable if a future surface needs the root view pinned to an exact colour rather than inheriting the system default.
- **C — rejected:** B's addition buys nothing once A resolves the system default correctly.

**Revisit hook:** `userInterfaceStyle` in `app.config.js`; the `GlassCard` rule in CLAUDE.md's UI Conventions depends on whatever it is set to.
