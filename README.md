# Productivity App

[![CI](https://github.com/Ali0600/productivity-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Ali0600/productivity-app/actions/workflows/ci.yml)

A daily habit and task tracker for iOS. Adding something takes two taps, the home screen sorts
everything by how long it's been neglected so whatever you've been avoiding is the first thing
you see, and a notification engine reminds you without nagging. Built with React Native + Expo
and shipped to TestFlight via EAS.

---

## Highlights

- **Designed and shipped a notification engine** with a reminder interval per message, "pause"
  rules (mute reminders once a task, list, or main list is done for the day), quiet hours, and
  even spacing of messages that share an interval — all inside iOS's 64-scheduled-notification limit.
- **Built a CI/CD pipeline with GitHub Actions** that lints and unit-tests every push and PR, and
  publishes over-the-air (OTA) updates via EAS Update when a merge lands on `main` — only after
  both checks pass — plus a manual-dispatch EAS Build workflow for App Store binaries.
- **Implemented an OTA update flow** with `expo-updates`, including an in-app "update ready" prompt
  and a version-pinned runtime, so JS-only changes ship in seconds without an App Store review.
- **Built a local-first data layer** over AsyncStorage with debounced auto-save and a
  3-level data model (main lists → side lists → tasks) that drives a home screen sorted by how stale each item is.
- **Made a Liquid Glass UI** (`expo-glass-effect`) on a dark gradient, with haptics, swipe-to-
  complete/delete gestures, and drag-to-reorder lists.
- **Integrated Apple's Screen Time APIs** (FamilyControls / ManagedSettings / DeviceActivity) to
  build a "Focus Gate" that blocks chosen apps until a task list is done for the day. A native
  background schedule re-arms the block each morning without the app being opened.
- **Automated dependency upkeep** with Dependabot (grouped Expo/React Native updates), and
  enforced code quality with ESLint (flat config) + Prettier, plus a Jest suite that gates OTA releases
  in CI.

## Tech Stack

| Area | Tools |
| --- | --- |
| App | React Native 0.81, Expo SDK 54 (dev client), React Context |
| Native modules | expo-notifications, expo-updates, expo-glass-effect, expo-symbols, reanimated, gesture-handler, draggable-flatlist, react-native-device-activity (Screen Time) |
| Persistence | `@react-native-async-storage/async-storage` |
| Build & deploy | EAS Build / Update / Submit |
| CI/CD & quality | GitHub Actions, Dependabot, ESLint, Prettier, Jest (`jest-expo`) |

## Getting Started

**Prerequisites:** Node 20+, Xcode (iOS), and the EAS CLI (`npm install -g eas-cli`).
This is a **development-build** project (not Expo Go) — it uses `expo-dev-client`.

```bash
npm install
npx expo start          # dev server (add --tunnel from WSL)
```

To load the dev server, you need a development build installed on a device or simulator:

```bash
eas build --profile development --platform ios
```

## Build & Deploy

```bash
# Production build for the App Store
eas build --profile production --platform ios

# Submit to App Store / TestFlight
eas submit --platform ios

# Ship a JS-only change over-the-air (no rebuild)
eas update
```

`runtimeVersion` is pinned to `appVersion`. So a **native** change (a new native module, an SDK
bump, an Info.plist or entitlement edit) needs a new build **and** a version bump in `app.config.js`,
`package.json`, and `package-lock.json`. JS-only changes ship via `eas update`.

## CI/CD

Two workflows live under [`.github/workflows`](.github/workflows):

- **`ci.yml`** — runs ESLint and the Jest suite on every push and pull request. On a push to
  `main`, it publishes an OTA update with `eas update --auto`, but only after **both** jobs pass
  (`needs: [lint, test]`). The EAS step is skipped (not failed) until you add an `EXPO_TOKEN` repo
  secret.
- **`eas-build.yml`** — a manual (`workflow_dispatch`) EAS Build with platform and profile inputs.

**To enable the EAS steps:** add an `EXPO_TOKEN` secret
(Settings → Secrets and variables → Actions). Generate one at
<https://expo.dev/accounts/[account]/settings/access-tokens>.

[Dependabot](.github/dependabot.yml) opens weekly dependency PRs (npm + GitHub Actions). Expo and
React Native packages are grouped, so a partial SDK bump cannot create an unmergeable PR.

## Scripts

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint with autofix
npm run format        # Prettier write
npm run format:check  # Prettier check (no writes)
npm test              # Jest unit tests (jest-expo)
```

## Project Structure

```
App.js                      # Root: notification init, OTA check, renders TileGrid or Homepage
app/
  components/               # Tile, Task, List, GlassCard, IntervalSlider, CompletionBurst
    modals/                 # TaskEditor, Messages, FocusGate (extracted from Homepage)
  context/AppStateContext   # All app state + AsyncStorage persistence
  hooks/useAppState         # Thin hooks over the context
  screens/                  # TileGrid (home), Homepage (list view)
  services/                 # StorageService, NotificationService, focusGateService, haptics, logger
  utils/                    # Pure helpers: id, dayKey, streaks, tagStats, focusGate, notificationRules
    __tests__/              # Jest suites for the pure helpers
targets/                    # Generated Screen Time extensions (Shield*, ActivityMonitor)
.github/                    # CI workflows + Dependabot
```

See [CLAUDE.md](CLAUDE.md) for the full architecture, data model, and UI conventions.

## Experience Gained

Skills and practices this project shows:

- **Mobile CI/CD** — a GitHub Actions pipeline that lints and unit-tests every push and PR, and
  lets an over-the-air release through only when both pass, with EAS Build/Update/Submit for shipping binaries.
- **Release engineering on a locked-down platform** — runtime-version pinning so OTA bundles only
  reach builds that can run them, plus treating TestFlight's 90-day build expiry and Apple's
  approval-gated entitlements as scheduling constraints rather than surprises.
- **Native platform integration** — Apple Screen Time (FamilyControls, ManagedSettings,
  DeviceActivity) through an Expo config plugin with app-group-shared extensions, loaded defensively so
  a build without the native module degrades instead of crashing.
- **Test design** — pure decision logic pulled out of the UI and native side effects, then proven by
  breaking each guard on purpose and confirming the suite catches it.
- **Fail-safe defaults** — enforcement paths that fail open, so a deleted or renamed dependency can
  never leave a user stuck behind a block they cannot clear.
- **Local-first data engineering** — an AsyncStorage-backed model with debounced saving, schema
  normalization on load, checked backup import/export, and an append-only completion history
  that drives streaks and analytics.

## License

Private project.
