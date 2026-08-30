# HIS OPS Android

HIS OPS uses Capacitor so the existing web application remains the shared source for Netlify, Android, and a future iOS build.

## Application identity

- App name: HIS OPS
- Application ID: `com.avgguysbs.hisops`
- Publisher: Average Guys Business Services
- Production API: `https://dqops.net`

The application ID cannot be changed after the app is published in Google Play without creating a separate store listing.

## Update the Android project

After changing files in `app/`:

1. Run `npm install` when dependencies change.
2. Run `npm run android:sync` to copy the current web application and update native dependencies.
3. Run `npm run android:open` to open the project in Android Studio.

## Test on a connected Galaxy tablet

1. Enable Developer options and USB debugging on the tablet.
2. Connect it using a USB data cable and approve the debugging prompt.
3. Open the Android project with `npm run android:open`.
4. Select the tablet in Android Studio and press Run.

The bundled Android application sends API traffic to `https://dqops.net`. The Netlify web application continues to deploy from the `app/` directory as before.

## Command-line debug build

The included build script automatically uses the portable Java 21 toolchain under `%LOCALAPPDATA%\HISOps\jdk21` and the Android SDK installed by Android Studio. Run:

```powershell
npm run android:sync
npm run android:build:debug
```

The debug APK is written under `android/app/build/outputs/apk/debug/`.

Never commit signing keys, keystores, passwords, or `android/local.properties`.
