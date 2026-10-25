# Wanni Front for Android (Expo)

A small Expo app that shows the game (https://wanni-front.vercel.app) full screen in a WebView. Game updates on Vercel reach the app without a new build. It needs an internet connection.

- Landscape or portrait, status bar hidden, the Android back button goes back inside the game page.
- Co-op voice chat: the first time you turn on the microphone, Android asks for the microphone permission.

## Build an APK on the Expo servers (EAS Build)

From this folder, with an Expo account:

```bash
npm install
npx eas-cli login
npx eas-cli init                       # creates the Expo project and writes its id into app.json
npx eas-cli build -p android --profile preview
```

When the build finishes, EAS prints a link (and a QR code) to download the `.apk`. Open it on the phone and allow installing from that source.

`--profile production` builds an `.aab` for the Play Store instead.

To build from GitHub instead (for example with the Expo MCP server or the expo.dev dashboard), link the repository to the Expo project on expo.dev and set the base directory to `mobile`.

## Run in development

```bash
npm install
npx expo start
```
