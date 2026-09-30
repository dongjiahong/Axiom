# Axiom – app icons

Made with APPLORE (https://applore.app).

## iOS / iPadOS (Xcode)

1. In Xcode, open `Assets.xcassets` and delete the existing `AppIcon`.
2. Drag `ios/AppIcon.appiconset` into `Assets.xcassets`.
3. Xcode creates every other size from the 1024 × 1024 image.

`ios/AppStore-1024.png` is the same image, if App Store Connect asks for it.

## macOS

Drag `macos/AppIcon.appiconset` into the Mac target's `Assets.xcassets`. The artwork is already drawn as a rounded square with margin and shadow, as macOS expects.

## Android

Copy the folders in `android/res` into `app/src/main/res` (replace the existing `mipmap-*` files).
`AndroidManifest.xml` should use:

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

The adaptive icon (Android 8+) shows the whole icon inside every launcher shape.

`ic_launcher_monochrome` is the one-color layer for themed icons (Android 13+), and `ic_stat_notification` is the white status-bar icon for notifications (`NotificationCompat.Builder.setSmallIcon(R.drawable.ic_stat_notification)`): a VectorDrawable in `drawable-anydpi-v24` for Android 7.0+ and PNGs in `drawable-*dpi` for older versions. Both are made from the one-color SVG mark.

`android/PlayStore-512.png` is the Google Play store icon.

## Website / PWA

Put the files in `web/` at the root of your site and add this to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#101112">
```

## SVG (vector)

Redrawn as vectors by AI, so small details may differ slightly from the original.

- `svg/logo.svg` – the full icon, for your website header, Figma or print
- `svg/logo-symbol.svg` – just the graphic, transparent background (when available)
- `svg/logo-mono-black.svg` / `svg/logo-mono-white.svg` – one-color mark for light / dark backgrounds
