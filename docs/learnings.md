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

## EAS capability sync can't enable approval-gated "Additional Capabilities"

EAS Build auto-syncs ordinary capabilities (push, App Groups, Apple Pay…) onto your App IDs via the App Store Connect API. But approval-gated capabilities — Family Controls (Distribution) lives under a separate **Additional Capabilities** tab — are not exposed by that API at all, so EAS silently can't enable them. The provisioning profiles then get generated *without* the entitlement, and the build dies in Xcode signing with "profile doesn't support the Family Controls capability" for every affected target.

**Why it came up:** First 1.0.37 production build failed exactly this way on all four targets, even though Apple had already approved the entitlement for the account. The approval unlocks the checkbox; it doesn't tick it. One consolation: the failed build still *registered* the three extension App IDs, which is what made ticking them possible at all.

**Takeaway:** For an approval-gated capability the real flow is: request → wait for approval → **manually tick the capability under Additional Capabilities for every affected App ID** (main app + each extension) → rebuild so the invalidated provisioning profiles regenerate. Don't assume "EAS syncs capabilities" covers the gated ones — and if a rebuild reuses stale profiles, delete them via `eas credentials --platform ios` and build again.
