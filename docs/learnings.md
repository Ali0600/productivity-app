# Learnings

Running log of transferable concepts that came up while building this app.

## EAS Update: channels vs. branches

Your build embeds a **channel** (e.g. `production`), and you publish JS bundles to a **branch**. A channel is *subscribed* to a branch, and the app only sees updates on the branch its channel points to. They're decoupled on purpose, so you can re-point a channel at a different branch without rebuilding the app.

**Why it came up:** Our CI runs `eas update --auto`, which publishes to a branch named after the **git branch** (`main`). But the App Store build's `production` channel was subscribed to a branch literally called `production`. Nothing pointed at `main`, so every CI publish landed on a branch no build was reading — the OTA "succeeded" in CI but never reached the phone.

**Takeaway:** An OTA only arrives when channel → branch → update all line up. If publishes succeed but nothing shows up on device, run `eas channel:view <channel>` to see which branch that channel is actually subscribed to.

## EAS Update: runtimeVersion gates compatibility

An update is only delivered to a build whose **runtimeVersion matches** the update's. With `runtimeVersion: { policy: "appVersion" }`, the runtime is just the app `version` (e.g. `1.0.35`), so an update built at 1.0.35 only reaches installed 1.0.35 builds. This is the safety mechanism that stops you OTA-ing JS that expects native code the installed binary doesn't have.

**Why it came up:** Confirming the phone (App Store build v1.0.35) could even receive the new bundle — the runtime matched, so the only blocker was the channel/branch wiring above.

**Takeaway:** OTA = JS-only changes pushed to builds on the *same* runtimeVersion. Anything needing new native code needs a fresh build + version bump, not an update.
