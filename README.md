# Nimbus Sigma for React Native

Sigma's native spreadsheet editor in your React Native app, backed by [Sigma](https://nimbusgo.space/cloud/docs/sigma) on Nimbus Cloud. Upload a spreadsheet from your server, open it in the app, and people edit it with formulas, formatting, charts, several sheets and Vani AI. Every change saves back as they type, and your server downloads the edited `.xlsx` or CSV whenever it likes.

This package is a thin layer over the native SDKs, so the editor is the native one on each platform: [NimbusSigma](https://github.com/CodeSyncr/sigma-ios) on iOS and [sigma-android](https://github.com/CodeSyncr/sigma-android) on Android. There is no web view. The formulas are Sigma's own engine, which a session downloads from Sigma for a sheet opened through the API; it is not in this package, so the editor works only with a Nimbus Cloud account and a Sigma API key.

**Requirements:** React Native 0.71 or later (old or new architecture), iOS 16, Android 8.0 (API 26). Not Expo Go: use a development build.

## Install

```bash
npm install @codesyncr/sigma-react-native
```

### iOS

The native SDK comes from CocoaPods. Until `NimbusSigma` is on the CocoaPods trunk, point your `ios/Podfile` at its git tag (inside your app target), and raise the platform to iOS 16:

```ruby
platform :ios, '16.0'

target 'YourApp' do
  config = use_native_modules!
  pod 'NimbusSigma', :git => 'https://github.com/CodeSyncr/sigma-ios.git', :tag => '2.1.0'
  # …
end
```

Then `cd ios && pod install`.

### Android

Set `minSdkVersion = 26` in `android/build.gradle`. The native SDK is on [JitPack](https://jitpack.io/#CodeSyncr/sigma-android); the package adds that repository itself, but if your build refuses project repositories, add it to `android/build.gradle` or `settings.gradle`:

```gradle
allprojects { repositories { maven { url "https://jitpack.io" } } }
```

The library is built for Kotlin 1.9 and later.

### Expo

Use a [development build](https://docs.expo.dev/develop/development-builds/introduction/). With `expo-build-properties`, set `ios.deploymentTarget` to `16.0`, `android.minSdkVersion` to `26`, and add the pod with `ios.extraPods`: `[{ name: 'NimbusSigma', git: 'https://github.com/CodeSyncr/sigma-ios.git', tag: '2.1.0' }]`. In Expo Go the component shows a note and `onError` reports `native_module_unavailable`.

## How it fits together

```
your server ──(sgm_ key)──▶ Nimbus Cloud     upload sheets, mint signed links, download edits
     │
     └──(signed link)──▶ your app ──▶ <SigmaSheet>     edits save straight back
```

**Billing.** Sigma's API counts each time a sheet is opened in an editor (in your app or embedded on the web), not uploads; your plan includes an allowance each month. Test keys (`sgm_test_`) are for building: their opens are capped and their sheets are deleted after a week, and the editor shows "Test mode".

**Keep the `sgm_` key on your server.** A key in a JavaScript bundle can be read by anyone with the app, and it can read and delete every document on your account. The app only ever needs a link, which expires (fifteen minutes by default; one minute to seven days). Once a link opens a sheet, the editing session lasts eight hours.

On your server (any language; here, the REST API):

```bash
# Upload, or create a blank sheet with {"title": "Budget", "blank": "xlsx"}
curl -X POST "https://nimbusgo.space/api/v1/sigma/documents?mode=edit" \
  -H "Authorization: Bearer $SIGMA_KEY" -F file=@budget.xlsx

# A fresh link for the app
curl -X POST "https://nimbusgo.space/api/v1/sigma/documents/42/link?mode=edit" \
  -H "Authorization: Bearer $SIGMA_KEY"

# The edited file, later
curl "https://nimbusgo.space/api/v1/sigma/documents/42/content" \
  -H "Authorization: Bearer $SIGMA_KEY" -o budget.xlsx
```

## Use

```tsx
import { useRef } from 'react';
import { SigmaSheet, SigmaSheetHandle } from '@codesyncr/sigma-react-native';

export function SheetScreen({ sheetId }: { sheetId: number }) {
  const sheet = useRef<SigmaSheetHandle>(null);

  return (
    <SigmaSheet
      ref={sheet}
      style={{ flex: 1 }}
      // Asked when the sheet opens, and again whenever a link expires.
      link={async () => {
        const res = await fetch(`https://your.server/sheets/${sheetId}/link`, { method: 'POST' });
        return (await res.json()).url;
      }}
      onReady={(doc) => console.log('opened', doc.title, doc.test ? '(test key)' : '')}
      onError={(e) => console.warn(e.code, e.message)}
      onSaveStateChange={(state) => console.log(state)}
    />
  );
}
```

Your `link` function returns the URL your server got from `POST /documents/:id/link`. If it throws, the editor shows the error with a Try again button, and `onError` reports `link_failed`.

### Props

| Prop | |
|---|---|
| `link` | `() => string \| Promise<string>`: a fresh signed link from your server. Required. |
| `onReady(document)` | The sheet opened: `{ id, title, filename, format, mode, test }`. |
| `onError(error)` | It could not open or reopen. `error.code` is one of the codes below. |
| `onSaveStateChange(state, error?)` | `'saved'`, `'unsaved'`, `'saving'` or `'failed'`. |
| `onTitleChange(title)` | The sheet was renamed. |
| `onSaved(at)` | A save landed. |

### The handle

```ts
await sheet.current?.save();                  // save now, without waiting
const file = await sheet.current?.export('xlsx'); // { base64, filename, format, mimeType }
await sheet.current?.undo();
await sheet.current?.redo();
await sheet.current?.reload();                // open again from a fresh link
await sheet.current?.rename('Q4 budget');
```

### Errors

`SigmaError` has a `code`: `unauthorized`, `quota_exceeded` (the month's allowance of opens, or a test key's cap, is used up), `not_found`, `link_expired`, `link_invalid`, `link_failed` (your `link` function threw), `engine`, `not_ready`, `editor` (for example saving through a view-only link), `server` (with `status`), `network` or `native_module_unavailable`.

### What people get

The same editor as the native SDKs: a grid with frozen panes, selection handles, in-cell and formula-bar editing and column resizing; a format bar (bold, italic, underline, strikethrough, colours, alignment, number formats, borders, text size); find and replace; sort that keeps a header row; conditional formatting; notes; charts bound to their cells; Vani AI when your account is on Pro; sharing as Excel or CSV.

## Example

[`example`](example) is a small app: list your sheets, create one, edit it, export it. Like the native demos, it keeps a test key on the device so it runs on its own; a real app asks its server for links.

```bash
cd example && npm install
cd ios && pod install && cd ..
npx react-native run-ios      # or run-android
```

## License

Proprietary. The SDK may be used only with Nimbus Cloud's Sigma API under your Nimbus Cloud account; see [LICENSE](LICENSE).
