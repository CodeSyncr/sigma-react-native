# Changelog

## 1.0.0

The first release: Sigma's native spreadsheet editor in React Native apps, through the native SDKs (NimbusSigma 2.1.1 on iOS, sigma-android 1.0.2 on Android).

- `<SigmaSheet link={…}>` shows the editor: formula bar, format bar with the ⋮ More menu (freeze, rows, columns, fill, sort, paste values), grid, charts, find and replace, conditional formatting, notes, sheet tabs and sharing, saving as people edit; Vani AI floats over the grid as Website Studio's launcher and panel.
- Your `link` function is asked for a signed link when the sheet opens and whenever one expires; the `sgm_` key never enters the app.
- `onReady`, `onError`, `onSaveStateChange`, `onTitleChange` and `onSaved`, and a ref with `save()`, `export()`, `undo()`, `redo()`, `reload()` and `rename()`.
- Errors carry a `code` (`quota_exceeded`, `link_failed`, `link_expired`, …).
- Works on the old architecture and, through React Native's interop layer, the new one (tested on 0.76 with the new architecture).
