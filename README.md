# ADHDone

[![CI](https://github.com/Ali0600/ProductivityApp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ali0600/ProductivityApp/actions/workflows/ci.yml)

A productivity & habit app for iOS, designed around how an ADHD brain actually works:
low-friction capture, a visual "what's gone stale" home screen, and a notification engine
that nudges without nagging. Built with React Native + Expo and shipped to TestFlight via EAS.

> Branded **ADHDone** in the UI; package name `adhd-habits`.

---

## Highlights

Résumé-ready summaries of what's in here:

- **Designed and shipped a notification engine** with per-message reminder intervals, "pause" rules
  (mute reminders once a task / list / main-list is completed for the day), quiet hours, and
  even staggering of same-interval messages — all within iOS's 64-scheduled-notification limit.
- **Built a CI/CD pipeline with GitHub Actions** that lints every push/PR and publishes
  over-the-air (OTA) updates to users via EAS Update on merges to `main`, plus a manual-dispatch
  EAS Build workflow for App Store binaries.
- **Implemented an OTA update flow** with `expo-updates`, including an in-app "update ready" prompt
  and version-pinned runtime so JS-only changes ship in seconds without an App Store review.
- **Engineered a local-first data layer** over AsyncStorage with debounced auto-persistence and a
  3-level data model (main lists → side lists → tasks) driving a staleness-aware bento home screen.
- **Crafted a Liquid Glass UI** (`expo-glass-effect`) on a dark gradient with haptics, swipe-to-
  complete/delete gestures, and drag-to-reorder lists.
- **Automated dependency hygiene** with Dependabot (grouped Expo/React Native updates) and
  enforced code quality with ESLint (flat config) + Prettier.

## Tech Stack

| Area | Tools |
| --- | --- |
| App | React Native 0.81, Expo SDK 54 (dev client), React Context |
| Native modules | expo-notifications, expo-updates, expo-glass-effect, expo-symbols, reanimated, gesture-handler, draggable-flatlist |
| Persistence | `@react-native-async-storage/async-storage` |
| Build & deploy | EAS Build / Update / Submit |
| CI/CD & quality | GitHub Actions, Dependabot, ESLint, Prettier |

## Getting Started

**Prerequisites:** Node 20+, Xcode (iOS), and the EAS CLI (`npm install -g eas-cli`).
This is a **development-build** project (not Expo Go) — it uses `expo-dev-client`.

```bash
npm install
npx expo start          # dev server (add --tunnel from WSL)
```

You'll need a development build installed on a device/simulator to load the dev server:

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

`runtimeVersion` is pinned to `appVersion`, so a **native** change (new native module, SDK bump,
Info.plist/entitlement edit) requires a new build **and** a version bump in `app.config.js`,
`package.json`, and `package-lock.json`. JS-only changes ship via `eas update`.

## CI/CD

Two workflows under [`.github/workflows`](.github/workflows):

- **`ci.yml`** — runs ESLint on every push and pull request; on pushes to `main`, publishes an OTA
  update with `eas update --auto`. The EAS step is skipped (not failed) until an `EXPO_TOKEN`
  repo secret is configured.
- **`eas-build.yml`** — manual (`workflow_dispatch`) EAS Build with platform/profile inputs.

**To enable EAS steps:** add an `EXPO_TOKEN` secret
(Settings → Secrets and variables → Actions). Generate one at
<https://expo.dev/accounts/[account]/settings/access-tokens>.

[Dependabot](.github/dependabot.yml) opens weekly dependency PRs (npm + GitHub Actions), with
Expo/React Native packages grouped so partial SDK bumps don't create unmergeable PRs.

## Scripts

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint with autofix
npm run format        # Prettier write
npm run format:check  # Prettier check (no writes)
```

## Project Structure

```
App.js                      # Root: notification init, OTA check, renders TileGrid or Homepage
app/
  components/               # Tile, Task, List, GlassCard, IntervalSlider
  context/AppStateContext   # All app state + AsyncStorage persistence
  hooks/useAppState         # Thin hooks over the context
  screens/                  # TileGrid (home), Homepage (list view)
  services/                 # StorageService, NotificationService, haptics, logger
  utils/                    # id generator
.github/                    # CI workflows + Dependabot
```

See [CLAUDE.md](CLAUDE.md) for the full architecture, data model, and UI conventions.

## License

Private project.
