# Learnings

Running log of transferable concepts that came up while building this app.

## EAS Update: channels vs. branches

Your build embeds a **channel** (e.g. `production`), and you publish JS bundles to a **branch**. A channel is *subscribed* to a branch, and the app only sees updates on the branch its channel points to. They're decoupled on purpose, so you can re-point a channel at a different branch without rebuilding the app.

**Why it came up:** Our CI runs `eas update --auto`, which publishes to a branch named after the **git branch** (`main`). But the App Store build's `production` channel was subscribed to a branch literally called `production`. Nothing pointed at `main`, so every CI publish landed on a branch no build was reading — the OTA "succeeded" in CI but never reached the phone.

**Takeaway:** An OTA only arrives when channel → branch → update all line up. If publishes succeed but nothing shows up on device, run `eas channel:view <channel>` to see which branch that channel is actually subscribed to.

## EAS Update: runtimeVersion gates compatibility

An update is only delivered to a build whose **runtimeVersion matches** the update's. With `runtimeVersion: { policy: "appVersion" }`, the runtime is just the app `version` (e.g. `1.0.35`), so an update built at 1.0.35 only reaches installed 1.0.35 builds. This is the safety mechanism that stops you OTA-ing JS that expects native code the installed binary doesn't have.

**Why it came up:** Confirming the phone (TestFlight build v1.0.35) could even receive the new bundle — the runtime matched, so the only blocker was the channel/branch wiring above.

**Takeaway:** OTA = JS-only changes pushed to builds on the *same* runtimeVersion. Anything needing new native code needs a fresh build + version bump, not an update.

## TestFlight builds expire after 90 days, and no OTA can save them

A TestFlight build stops launching 90 days after upload — it shows "Beta has expired" and refuses to open. That gate lives in the installed binary and runs *before* your JS bundle loads, so an OTA update cannot revive it no matter how correct your channel wiring is.

**Why it came up:** v1.0.35 was built on 4 May 2026 and the app stopped opening on 3 August — exactly 91 days. All four feature packages were sitting correctly published on the `main` branch and completely unreachable. The only fix was a new native build (1.0.36) submitted to TestFlight.

**Takeaway:** TestFlight is a 90-day lease, not a distribution channel. Plan on a rebuild each quarter, or switch to internal/ad-hoc distribution (~1 year, governed by the provisioning profile) or an App Store release (no expiry). And note the sequencing: because `runtimeVersion` follows `appVersion`, bumping the version means OTAs now publish at a runtime that only the *new* build has — so the bump and the build must travel together.

## Some iOS capabilities are gated by Apple approval, not just by code

Most iOS features ship the moment you write them. A handful — Family Controls (Screen Time), CarPlay, HealthKit clinical records — require you to *apply* to Apple for the entitlement and wait for a human to approve it, per bundle ID. Until then, a distribution build (TestFlight or App Store) cannot be signed at all.

**Why it came up:** The Focus Gate needs `com.apple.developer.family-controls`. Our config generates three extensions on top of the main app, so **four** bundle IDs each need approval. The development entitlement keeps working meanwhile, so local/dev builds can proceed in parallel.

**Takeaway:** When scoping a feature against an unfamiliar iOS capability, check whether it needs an entitlement *request* before estimating anything — the approval wait can dwarf the implementation, so file it on day one and build against the development entitlement while you wait.

## Evaluate config plugins before you pay for a build

`npx expo config --type public` runs the config-plugin chain locally in seconds. `npx expo export` bundles the JS the same way a real build would. Between them they catch most "the build died 40 minutes in" failures for free.

**Why it came up:** Adding `react-native-device-activity` failed immediately with `Cannot find module '@expo/prebuild-config/...'` — its transitive `@kingstinct/expo-apple-targets` requires that package but declares it as neither a dependency nor a peer, relying on hoisting that SDK 54's nesting doesn't provide (the only copy lives under `expo/node_modules/@expo/cli/node_modules/`). Fix: install `@expo/prebuild-config` at top level, pinned to the version the SDK ships. Caught in ~30 seconds instead of after a queued cloud build.

**Takeaway:** After adding any config plugin, run `expo config` then `expo export` before `eas build`. Also: a mod-based plugin's effects (`withEntitlementsPlist` and friends) do **not** appear in `expo config --type public` — mods only run during prebuild, so an entitlement missing from that output is not evidence of a bug.

## Swipeable gestures: `direction` means the swipe motion, not the panel

`react-native-gesture-handler` has two generations of swipe-row components with **opposite `onSwipeableOpen` semantics**. The legacy `Swipeable` reported which action *panel* opened ('left' = left panel, revealed by swiping right). The current `ReanimatedSwipeable` (what this app uses in `Task.js` / `List.js`) reports the swipe *motion* direction ('right' = user swiped right, which reveals `renderLeftActions`). Same argument name, inverted meaning.

**Why it came up:** A fresh-eyes review "found" the swipe handlers cross-wired — trash icon on complete, checkmark on delete — by reasoning with the legacy semantics. Checking the installed package's source (`node_modules/.../ReanimatedSwipeable.tsx`: `toValue > 0 ? RIGHT : LEFT`) disproved it: the code was correct all along, and the proposed "fix" would have introduced the exact bug being reported. Only CLAUDE.md's gesture description was actually backwards (now corrected).

**Takeaway:** Before declaring working code buggy against a remembered API contract, verify the semantics in the installed package's source or current docs — especially when a library ships a same-named successor component.

## EAS capability sync can't enable approval-gated capabilities

EAS Build auto-syncs ordinary capabilities (push, App Groups, Apple Pay…) onto your App IDs via the App Store Connect API. But approval-gated capabilities like Family Controls (Distribution) are not exposed by that API at all, so EAS silently can't enable them. The provisioning profiles then get generated *without* the entitlement, and the build dies in Xcode signing with "profile doesn't support the Family Controls capability" for every affected target.

**Why it came up:** First 1.0.37 production build failed exactly this way on all four targets, even though Apple had already approved the entitlement for the account. The approval unlocks the checkbox; it doesn't tick it. One consolation: the failed build still *registered* the three extension App IDs, which is what made ticking them possible at all.

**Takeaway:** For an approval-gated capability the real flow is: request → wait for approval → **manually tick the capability on every affected App ID** (main app + each extension — in the identifier's regular *Capabilities* tab, via its search icon if the list is long; despite some docs, there may be no separate "Additional Capabilities" tab) → rebuild so the invalidated provisioning profiles regenerate. Don't assume "EAS syncs capabilities" covers the gated ones — and if a rebuild reuses stale profiles, delete them via `eas credentials --platform ios` and build again.

## A repeated manual config change fails silently on exactly one item

When you tick the same box across N items in a web console, a save that doesn't take looks identical to one that did — the UI returns you to the list either way. The only honest verification is re-opening each item.

**Why it came up:** Family Controls (Distribution) was ticked and saved on all four App IDs, but `.ActivityMonitorExtension` silently didn't persist. The next build got three of four targets signing and failed only on that one. Re-auditing all four in the portal found exactly one unticked box — a full build cycle (~30 min) spent to learn what a 60-second audit would have shown.

**Takeaway:** After a repeated manual change across N items, re-read all N before triggering the expensive job that depends on them. "I did all of them" is a memory of intent, not a measurement of state.

## Read a signing error as naming what the profile HAS, not what it needs

Xcode's *"provisioning profile doesn't support the Family Controls (Development) capability"* reads like a demand for the Development variant. It isn't — it's naming the variant the profile actually carries. Development was the only box ticked, so it was the only entitlement in the profile, and an App Store build needs Distribution.

**Why it came up:** The word "Development" in the error sent the first reading in the wrong direction, toward "why is it asking for a dev entitlement on a release build?" The paired second line — *"doesn't include the com.apple.developer.family-controls entitlement"* — is the one that says what's missing.

**Takeaway:** When a capability has Development/Distribution variants, an error naming one variant is describing the current state, not the requirement. Check the box for the build type you're producing, and trust the "doesn't include" line over the "doesn't support" line.

## A view can be inert by construction, not just too small

A UI control that's hard to use looks like a sizing problem, so the reflex is to give it more room. But a native view can be built to refuse touches entirely, in which case no amount of space helps.

**Why it came up:** The Focus Gate's app picker sat in a 260pt box and felt impossible to navigate. `react-native-device-activity`'s `ReactNativeDeviceActivityView.swift` sets `isUserInteractionEnabled = false` on the inline hosting view unconditionally — the embedded picker could never have received a tap. The library's supported path is a separate sheet component that has Apple present the picker as a real modal. Enlarging the box would have shipped a still-broken screen and looked like a fix.

**Takeaway:** Before treating a cramped control as a layout bug, read the component's own source for whether it's meant to be embedded at all. A wrapper library often ships several variants (inline / sheet / persisted) where only some are interactive — the README's "which one should I use?" section is load-bearing, not marketing.

## A package's declared `engines` can be narrower than its dependency tree's

`eas-cli@23.2.0` declares `engines: { node: ">=20.0.0" }`, but pulls `@oclif/plugin-autocomplete@3.3.0`, which requires `>=22.0.0`. Under npm that's a warning; under yarn — which `expo/expo-github-action` uses — engine mismatches are hard errors, so the install fails outright.

**Why it came up:** Every push to `main` since 2026-08-28 failed at "Setup EAS" on Node 20, so **no OTA update published for four days** while Lint and Test kept reporting green. The failure was visible as a red run on `main`, but nothing looked at `main` runs — PR checks were the only thing being read, and the OTA job doesn't run on PRs.

**Takeaway:** Trust a package's transitive tree over its own `engines` field when picking a CI runtime, and treat a strict installer (yarn/pnpm) as the thing that decides. More generally: a job that only runs on the default branch is unverified by every PR that precedes it — after merging, confirm the run *concluded* success on the branch that actually publishes, because "the PR was green" and "the release shipped" are different claims.

## Forcing a UI style makes you inherit every system colour you never named

Setting `userInterfaceStyle: "light"` (iOS `UIUserInterfaceStyle`) doesn't only affect components you style — it pins *every* semantic system colour to its light value: `systemBackgroundColor`, `systemGroupedBackground`, and whatever the OS paints on your behalf. A dark-themed app that forces light inherits white for all of them.

**Why it came up:** ADHDone forced light while painting a dark gradient over everything, so the mismatch was invisible for months. It only surfaced when Apple's Screen Time picker was presented as a sheet: React Native 0.81 assigns `rootView.backgroundColor = systemBackgroundColor` unconditionally (there is no `RCTRootViewBackgroundColor` Info.plist override any more), and the picker's host view uses `systemGroupedBackground` — white and `#F2F2F7` respectively under forced light. Both sit *outside* our view tree, so our gradient could never cover them.

**Takeaway:** your styles only reach the views you render; a forced UI style governs everything else the OS draws — sheets, alerts, keyboards, the root view behind a transform. Set the style to match your design rather than overriding its symptoms one surface at a time, and be suspicious of any "just this one element is the wrong colour" bug that appears only when the OS presents something.

## A change-subscription never tells you the current state — and neither does the first read of an async-settling value

Two separate blind spots that combine badly. A listener for state *changes* only fires on transitions, so it can never report the state something already had when you subscribed. And a platform value that resolves asynchronously will return its "unknown" default if you read it too early.

**Why it came up:** The Focus Gate always asked for Screen Time access the user had already granted. Apple's `AuthorizationCenter.shared.authorizationStatus` returns `notDetermined` for a short while after launch (documented in `react-native-device-activity`'s README), so the one synchronous read at mount recorded "not authorized". The `AppState` listener that would have corrected it never ran, because `'change'` only fires on a transition and the app launches *into* `active` — there is no `inactive → active` event at cold start. So the wrong value stuck for the whole session, and only tapping "Grant" fixed it, because that was the single code path that re-read the status after awaiting a native call.

**Takeaway:** seed state from an explicit read *and* subscribe to changes — neither alone is sufficient. When the underlying value settles asynchronously, poll until it does rather than trusting the first read. And whenever a bug's workaround is "do the thing again", suspect a stale snapshot: the second attempt is usually just the first code path that re-reads.

## Feed a new feature from the log the app already writes, through a watermark

When a new feature must react to an event (here: a task being completed), the obvious move is to call it from every place the event happens. That list is maintained by hand, and the newest place is the one that forgets. If the event already leaves a record, the feature can read the record instead: remember the newest timestamp it has processed (the watermark), and on every change take only what is newer.

**Why it came up:** the pet eats a snack for every completion. Completions happen in two Homepage handlers and can also arrive in bulk from a backup import (only those newer than the watermark count). Reading each task's `completions` log with a watermark covers all three with no call site, never takes a snack back when a task is deleted later, and heals a save lost to a crash, because the unprocessed completions are still in the log next launch. Three details make it safe: process new entries in time order (lists are not); never advance the watermark past "now" plus a little grace; and clamp a stored or imported watermark the same way on load. Otherwise one wrong clock stamp freezes the feature until that date.

**Takeaway:** prefer deriving from an existing append-only record over adding calls at every producer. Store only the watermark and the running totals, and make the derivation return the same object when nothing changed, so replays are free.

## Pin the test timezone to one with daylight saving

`new Date(y, m, d)` maths is only interesting on days that are 23 or 25 hours long. CI runners default to UTC, which has no DST, so a day-boundary bug (flooring hours ÷ 24 across a spring-forward night, say) passes there and only fails for real users twice a year.

**Why it came up:** the pet's moods count calendar days between snacks. A deliberate sabotage swapping `Math.round` for `Math.floor` in `dayDiff` survived every test until the suite was pinned to `America/New_York` (CET, this Mac's zone, has no DST change on the US date the test uses either). `jest.globalSetup.js` sets `process.env.TZ` once, before any worker starts, and a test asserts the pin is active so removing it fails loudly instead of quietly turning the DST tests into no-ops.

**Takeaway:** set `TZ` in Jest's `globalSetup` (workers inherit it), pick a zone with DST, and write one test that fails if the pin is missing.

## Unexpected rewards motivate; announced ones can undermine

Rewards promised in advance for something people already want to do ("1 task = 1 coin") can reduce how often they choose to do it later: the overjustification effect. Unexpected rewards don't have that cost, and feedback that informs ("Laundry: done") works better than feedback that controls ("you should").

**Why it came up:** designing the pet's economy. The Deci, Koestner & Ryan meta-analysis found expected tangible rewards undermined free-choice behaviour (d = −.36) while unexpected ones didn't (d = .01). So surprise gifts are never announced and come at most once a day, and the status lines say what happened ("Mochi had a snack today.") rather than counting down to the next reward. What is shown in advance is progress: the bowl, the trick bar ("4 more snacks to learn Spin", goal-gradient by design) and growth. A test bans blame words from every line.

**Takeaway:** in any reward system, make the routine feedback informational, keep the extras unannounced, and never phrase a reward as a wage.

## Plant a bug on purpose to find out whether a test would catch it

Coverage tells you which lines ran during the tests, not whether any test would notice those lines being wrong. Mutation testing checks that directly: change one thing the code relies on (a constant, a `<` turned into `<=`, a deleted line), run the tests, and see whether anything goes red. A change that nothing notices, a "survivor", marks a rule no test protects.

**Why it came up:** the pet engine is almost all small rules: when the bowl counts as full, how often a surprise gift can drop, how many quiet days come before the welcome-back gift. `npm run test:mutations` (`scripts/mutation-check.js`) applies the 56 mutations in `scripts/pet-mutations.json` one at a time, runs that file's Jest suite, then puts the original bytes back and checks their hash. It refuses to start while a target file has uncommitted changes, so a crash mid-run can never leave a planted bug mixed into real work. Early runs had survivors: the gift chance and the 7-day welcome-back threshold, among others, could be changed with every test still green, and each survivor became a new test. Every mutation also names the test that must catch it, because a mutant that only an unrelated test catches can hide that the test written for that rule checks nothing.

**Takeaway:** for code that is mostly rules, run a mutation pass before trusting the tests. Each survivor is a missing test, and naming the test that should catch each mutation keeps the harness honest.

## A screenshot is one frame: record the animation and lay its frames out in a grid

Animation bugs (an overshoot, a flash, a jump at the end) live between the frames a screenshot happens to catch. Recording the simulator and tiling the video's frames into one image shows the whole motion at once, and two grids side by side compare a change before and after.

**Why it came up:** the pet's speech bubble entered with a spring. Every screenshot looked right, but the frame grid showed the bubble swelling to about twice its size before it settled, so it now uses a plain 200 ms zoom (`ZoomIn.duration(200)`). The same grids checked the hatch, eating, trick, nap and welcome-back animations.

```bash
xcrun simctl io booted recordVideo --codec=h264 --force clip.mp4   # Ctrl-C stops it and writes the file
ffmpeg -v error -y -i clip.mp4 -vf "fps=8,scale=260:-2,tile=6x3:padding=4:color=white" -frames:v 1 sheet.png
```

**Takeaway:** check motion with a frame grid, not a still. A 6×3 grid at 8 fps covers the first 2¼ seconds of the clip (`-ss 1.5` before `-i` starts later), and `crop=w:h:x:y` before `scale` zooms in on one element.

## Keep a ticking clock in its own React context

Every component that reads a React context re-renders whenever the context's value changes. If one context carries both data that rarely changes and a clock that ticks every minute, everything that reads it re-renders every minute, including screens that never show the time.

**Why it came up:** the pet's mood and status line depend on the time, so its provider keeps a clock that ticks every 60 seconds. At first the clock sat in the same context as everything else: a probe that read only the pet record rendered 5 times in 5 idle minutes, and the whole task-list screen, which never shows the time, re-rendered with it. The provider now offers two contexts: `PetContext` (the saved pet and its actions, which change only when something happens) and `PetViewContext` (the derived mood plus the clock). `Homepage` reads only the first, through `usePetRecord()`. The same review found `memo(PetAvatar)` doing nothing, because each parent passed a new inline `onPress` function on every render; a stable `useCallback` fixed that.

**Takeaway:** split a context by how often its parts change, and give anything time-driven its own value. `memo` only helps when the props really stay the same: a function created during render is a new prop every time.

## Fire once-per-event side effects where the event is made, not in each view

A haptic or a screen-reader announcement placed in each component that shows an event fires once per mounted component, including components that are mounted but not on screen.

**Why it came up:** at first each pet view handled the reaction to a finished task, haptic and VoiceOver line included. The pet page is a modal that stays mounted while closed, so on the list screen a probe counted 2 announcements and 2 haptics per event instead of 1, and still 2 with the pet switched off, where 0 was expected. Now the provider works out one reaction per batch of events and fires the haptic and the announcement there, skipping both while the pet is hidden; the views only animate.

**Takeaway:** put once-per-event effects (haptics, sounds, announcements, analytics) where the event is produced, and let the views that subscribe handle only what they draw. A closed modal that stays mounted still counts as a subscriber.
