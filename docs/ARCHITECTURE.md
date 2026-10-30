# Architecture

Sisu TV is deliberately small: one HTML screen, three JavaScript modules, zero
runtime dependencies, and a packager written in plain Node. This page explains
how the pieces fit and why each decision was made.

---

## Layers

```
                index.html  (one screen + one overlay)
                     |
      +--------------+---------------+
      |              |               |
  catalog.js     platform.js       ui.js
  data + pure    Luna adapter,    focus model,
  helpers        launching,      rendering,
                 mock data       diagnostics
                     |               |
                     +-------+-------+
                             |
                          main.js
                             |
                    webOS Luna bus / browser
```

| Module | Knows about | Testable in Node |
| --- | --- | --- |
| `catalog.js` | services, categories, region bit decoding | yes (pure) |
| `platform.js` | Luna calls, app/browser launching, mock TV | no (needs a browser) |
| `ui.js` | DOM, focus, keyboard, diagnostics layout | no |
| `main.js` | boot order | no |

`catalog.js` uses a small UMD wrapper so the same file is a browser global
(`window.SisuCatalog`) and a CommonJS module for `node:test`.

---

## Focus model

Three zones, one index each. The grid's column count is measured from
`gridTemplateColumns`, so the media queries stay authoritative.

```
   chips ──down──▶ grid ──down──▶ info bar
     ▲              │  ▲             │
     └────up────────┘  └─────up──────┘

   left/right: within a row (chips: change category immediately)
   OK:         chips → enter grid | tile → launch | info bar → open panel
   BACK:       panel → close | home → ignored (prevents accidental exit)
```

`BACK` is routed through `webOS.platformBack()` so the platform does not close
the app underneath us; on the home screen the key is swallowed on purpose.

Number keys `1`–`9` launch the first nine tiles of the current category — a
shortcut the stock launcher cannot offer.

---

## Launch strategy

```
               ┌───────────────────────────┐
 tile pressed  │ service.nativeId present? │
               └───────────┬───────────────┘
                    yes    │    no
             ┌─────────────▼─────────────┐  │
             │ launch(id)                │  │
             │  ok      → done           │  │
             │  failed  → browser        │  │
             └─────────────┬─────────────┘  │
                           ▼                ▼
             ┌─────────────────────────────────────┐
             │ launch browser with params.target   │
             │  failed → params.url                │
             │  failed → window.open               │
             │  failed → toast "Ei voitu avata"    │
             └─────────────────────────────────────┘
```

Why not ask the TV which apps are installed? Because `listApps` is refused for
web apps by ACG policy (see [RESEARCH.md](RESEARCH.md#4-how-apps-talk-to-the-tv-luna)).
Trying the id directly costs one failure and needs no permission.

---

## Luna calls used

| Purpose | Service | Method | Failure mode |
| --- | --- | --- | --- |
| Model, firmware, SDK | `tv.systemproperty` | `getSystemInfo` | row shows `—` |
| Country, region, time zone | `settings` | `getSystemSettings` | row shows `—` |
| NVRAM area code (read only) | `lowlevelstorage` | `getData` | "Ei luettavissa ilman rootia" |
| Dev Mode state | `devmode` | `getDevMode` | "Tuntematon" |
| Launch app | `applicationManager` | `launch` | fall through to browser |

Every call is wrapped in `request()` which resolves `{ ok, data }` or
`{ ok: false, error }` and always settles: a 6-second timeout (4 s for NVRAM,
3 s for Dev Mode) guarantees the UI never hangs on a service that does not
answer.

---

## Diagnostics screen

`diagnose()` runs the five probes in parallel and returns a flat object; the
renderer turns it into four sections plus an explainer. Design rules:

- A denied call is information, not an error: the row explains *why* it is
  unavailable and how the app works without it.
- The `contiArea2All` value is decoded client-side (`decodeArea`) into
  continent / country group / hardware group.
- The panel is scrollable with ▲▼ because on a 1080p panel the content can
  exceed the safe area with large system fonts.
- Mock mode labels every fabricated row as "Demo" so a screenshot can never be
  mistaken for a real reading.

---

## Mock mode

`platform.js` switches to mock data when `window.webOS` is missing or
`?mock=1` is present. That is what makes `npm run preview` useful: the same
build that ships to the TV also renders on a laptop, which is how the
screenshots in this repository were verified (headless Chromium, 1920×1080).

Launching a tile in mock mode returns `{ how: "demo" }` and shows a toast with
the URL instead of navigating away.

---

## Packaging pipeline

```
app/  ──walk──▶  usr/palm/applications/<id>/...
                 usr/palm/packages/<id>/packageinfo.json
                        │
                 ustar tar (512-byte headers, octal fields)
                        │
                     gzip -9
                        │
   ar: debian-binary + control.tar.gz + data.tar.gz
                        │
      build/com.syntaxsaboteur.sisutv_1.0.0_all.ipk
```

Everything is written by `tools/build-ipk.mjs` using `node:zlib`: no `tar`, no
`ares-package`, no webOS SDK. The test suite asserts the ar member order, the
`2.0\n` magic and the gzip streams, so a regression in the packer fails CI
rather than the TV.

Deterministic builds are possible with `SOURCE_DATE_EPOCH`, which is used for
the mtime in tar and ar headers.

---

## Compatibility choices

| Risk | Mitigation |
| --- | --- |
| webOS 4/5 (Chromium 53/68) | No optional chaining, no `??`, ES5-friendly syntax in `js/` |
| Chromium 79 (webOS 6) | No flex `gap`, no `aspect-ratio`, no `inset`, no `color-mix()` |
| Missing Luna permissions | Every call handled; no unhandled rejections |
| Accidental app exit | BACK swallowed on the home screen |
| Long paths in ustar | Prefix splitting implemented |

---

## Testing

```bash
npm test   # node:test, no dependencies
```

- `test/catalog.test.mjs` — region decoding, category filtering, record shape,
  unique ids, live badges.
- `test/ipk.test.mjs` — builds a real IPK into a temp dir and parses the ar
  container back: member order, `debian-binary`, gzip magic, hash format.

UI behaviour is verified by rendering the app in headless Chromium at
1920×1080 and checking for console errors; the resulting screenshots are in
`docs/assets/`.
