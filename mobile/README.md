# TeamLens Mobile

Expo app for field staff: geofenced clock-in, background route tracking, step
counting, and offline-tolerant breadcrumb upload.

See [`docs/field-tracking.md`](../docs/field-tracking.md) for how the feature
works end to end.

## Running it

```bash
cd mobile
npm install
npx expo start
```

Point the app at your API. Without this it infers the Metro host, which works
when your phone and dev machine are on the same LAN:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.17 npx expo start
```

Sign in with the same employee credentials the desktop agent uses —
`/api/mobile/auth/login` reuses the agent auth service.

## Expo Go vs a development build

**Background location does not work in Expo Go.** `expo-location`'s background
task and the Android foreground service both need native configuration, so Expo
Go can demo login, the geofence check, clock-in, and foreground tracking, but it
will not keep recording once the app is backgrounded.

For real shift tracking, build a development client:

```bash
npx expo run:android    # or: npx expo run:ios
```

or use EAS:

```bash
eas build --profile development --platform android
```

## Permissions

The app requests, in this order — both platforms require it, and Android will
not show the background prompt otherwise:

1. **Foreground location** — required to clock in at all.
2. **Background location** ("Allow all the time") — required to record a route
   while the phone is in a pocket. If declined, clock-in still works and the app
   says tracking is limited to when it is open.
3. **Motion / activity recognition** — for step counting. Declining costs the
   step count only; route tracking is unaffected.

## Layout

```
src/
  services/api.ts        API client and response types mirroring the Go handlers
  services/storage.ts    Keychain token, tracking state, disk-backed ping queue
  tracking/tracker.ts    Background location task, permissions, flush loop
  tracking/pedometer.ts  Step counting across the iOS/Android split
  tracking/geofence.ts   On-device copy of the server's geofence maths
  contexts/AuthContext.tsx
  screens/               LoginScreen, ClockScreen
```

The background task in `tracker.ts` runs **outside React** — the OS wakes it
even when the app is backgrounded or killed — so it reads its state from storage
rather than from context. Anything it needs must be persisted, not held in a
hook.

## Before shipping to a store

- [ ] Replace the placeholder bundle IDs in `app.json` (`co.teamlens.mobile`).
- [ ] Add app icons and a splash screen.
- [ ] Set up EAS credentials and a production build profile.
- [ ] Write the App Store / Play Store privacy disclosure for background
      location — both stores review this closely, and Google requires a
      demonstration video for `ACCESS_BACKGROUND_LOCATION`.
- [ ] Add crash reporting to match the rest of the stack (Sentry).
