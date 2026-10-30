# Research: what is actually running on the TV

This document records how the TV's software was taken apart, what was measured,
and which conclusions are evidence versus inference. It is the background for
every design decision in Sisu TV.

Target: an **LG C-series OLED bought in Bangkok** and running in Finland.
Model year is unconfirmed between two close variants:

| Variant | Year | webOS | Engine | Note |
| --- | --- | --- | --- | --- |
| OLED77C2 | 2022 | 22 (SDK 7.x) | Chromium 87+ | original assumption |
| OLED77C3 | 2023 | 23 (SDK 7.x+) | Chromium 87+ | reported later by the owner |

Nothing in this research depends on which one it is — the packaging format,
Luna surface and region mechanism are shared — but the Home-screen replacement
in [TAKE-OVER-THE-UI.md](TAKE-OVER-THE-UI.md) **is** firmware-specific, so the
exact model string and firmware build must be read before that step.

---

## 1. Method

Three sources were combined:

| Source | What it gave us |
| --- | --- |
| [morluto/rea](https://github.com/morluto/rea) | Static reconstruction of webOS app bundles: file inventory, module graph, endpoints, child-process and environment facts |
| Real IPK packages | The actual packaging format and the platform contract (`appinfo.json`, `packageinfo.json`, Luna service layout) |
| [webosbrew](https://www.webosbrew.org/) docs | Engine versions per webOS release, Dev Mode limits, rooting methods |

The packages inspected were:

- `org.webosbrew.regionchanger_1.0.2_all.ipk` — 7 KB, a web app plus a Node
  Luna service that rewrites the TV's region in NVRAM.
- `com.breezyfin.app_0.2.1_all.ipk` — 19.7 MB, a real third-party webOS app
  built with Enact/React, used as a control sample for bundle size and
  structure.

Both were hash-checked against their published manifests before analysis.

---

## 2. Using REA

REA is an MCP/CLI toolkit for reverse engineering. Installation:

```bash
npx -y rea-agents@latest --version     # 6.8.0 in this run
```

Static JavaScript analysis of an extracted app directory:

```bash
npx -y rea-agents@latest analyze-javascript-application \
  ./usr/palm/applications/com.breezyfin.app --json > evidence.json

# Large evidence is read through a projected view, not by hand:
echo '{"source":{"kind":"evidence-file","path":"evidence.json"},"view":{"kind":"summary"}}' > view.json
rea inspect-analysis-view view.json
```

### What it produced

The Breezyfin run inventoried **6,548 files / 63.8 MB of text** and selected 20
JavaScript bundles for parsing before it stopped. The small Region Changer web
app completed cleanly: 2 relevant files, 3,766 bytes, 1 finding, 0 modules —
correct, because that app's logic is not in the web layer at all, it is in a
sibling Node service.

### Limitation hit on this machine

REA's JavaScript pipeline compiles a small macOS "process ownership" helper with
`xcrun clang` before it will analyse child-process behaviour. On this sandbox
clang cannot write its module cache to `/var/folders/...`, so the full run exits
with:

```
macOS process ownership helper compilation failed via xcrun ...
unable to open output file '.../C/clang/ModuleCache/.../SwiftShims.pcm':
Operation not permitted
```

The inventory and partial observation were still written (that is where the
6,548-file figure comes from), but the module graph did not materialise. The
region logic below therefore comes from reading the shipped service sources
directly — REA told us *where* to look, the source told us *what* it does. This
is recorded as a limitation rather than papered over.

---

## 3. What a webOS app actually is

An IPK is a Debian `ar` archive with three members:

```
debian-binary      "2.0\n"
control.tar.gz     ./control  (Package, Version, Installed-Size, webOS-Package-Format-Version)
data.tar.gz        payload
```

The payload paths are fixed:

```
usr/palm/applications/<app-id>/         appinfo.json, index.html, js/, icon.png ...
usr/palm/packages/<app-id>/packageinfo.json
usr/palm/services/<service-id>/         optional Node service (services.json, service.js)
```

`appinfo.json` is the contract: `id`, `version`, `type: "web"`, `main`,
`icon`, `largeIcon`, `requiredPermissions`, and flags such as
`disableBackHistoryAPI`.

A minimal `packageinfo.json` is just:

```json
{ "id": "com.syntaxsaboteur.sisutv", "version": "1.0.0", "app": "com.syntaxsaboteur.sisutv" }
```

Services may declare extra entries (`"services": ["<service-id>"]`), which is how
Region Changer ships a privileged Node helper next to its UI.

### Consequences for Sisu TV

- No bundler is required; a plain `index.html` + `js/` tree is a valid app.
- The packager can be implemented in ~200 lines of Node (see
  `tools/build-ipk.mjs`), which is what this repo does.
- Permissions are declared up front. Declaring a permission name the platform
  does not recognise breaks installation, so Sisu TV declares only the three
  names proven by a shipping app: `time.query`, `activity.operation`,
  `network.operation`.

---

## 4. How apps talk to the TV: Luna

Apps call services over the Luna bus (`luna://<service-id>`), either from the
web layer (`webOS.service.request`) or from a Node service
(`webos-service` / `palmbus`).

Access is governed by ACG (Access Control Group) permissions. This matters
because a natural idea — "list the installed apps and launch the right one" —
does not work for an ordinary web app. LG's own forum has the exact failure:

> `Denied Method call "listApps" for category "/"` — even with
> `requiredPermissions` and an `acg` block declared, `listApps` stays refused
> for webOS TV web apps.
> ([forum.webostv.developer.lge.com](https://forum.webostv.developer.lge.com/t/denied-method-call-listapps-for-category/8572))

Sisu TV therefore never tries to enumerate apps. It attempts `launch` on a known
app id and falls back to the browser — one denied call instead of a broken
feature.

---

## 5. The region lock, in detail

### 5.1 The value

The market is stored as a packed integer in factory NVRAM:

```
dbgroup: factory
key:     contiArea2All
```

Read path (`region-read.js`, Region Changer 1.0.2):

```
luna://com.webos.service.lowlevelstorage/getData
  { dbgroups: [ { dbid: "factory", items: ["contiArea2All"] } ] }
```

### 5.2 The bit layout

```js
continentIdx    = area & 0x7f;          // 7 bits
languageCountry = (area >> 7) & 0x1f;   // 5 bits, indexes a country-group table
hwSettingGroup  = (area >> 12) & 0xf;   // 4 bits, indexes a hardware table
```

The country-group table begins:

```
0 NORDIC   1 NON NORDIC   2 EAST EU   3 WEST EU   4 ETC EU   5 AJ
6 JA       7 IL          8 TW        9 CO        10 PA      11 CN
12 HK      13 KR         14 US       15 CA        16 MX      17 HN
18 BR      19 CL         20 PE       21 AR        22 EC      23 JP
24 EU      25 IR         26 PH       27 BW        28 CS
```

Known area values from the same source: **EU = 19461**, **US = 22282**.

Worked examples:

| Area | Continent | Country group | HW group | Meaning |
| --- | --- | --- | --- | --- |
| 19461 | 5 | `EU` | `KR` | European market |
| 22282 | 10 | `US` | `US` | United States |
| 4741 | 5 | `AJ` | `AJ JA IL` | Asia/Pacific packaging |

`4741` is what Sisu TV uses as *mock* data so the diagnostics screen can be
demonstrated off-device. It is a plausible APAC packing, not a reading from the
user's TV.

### 5.3 What a region change touches

Writing only the NVRAM value is not enough; three stores have to agree
(`region-write.js`):

```js
// 1. NVRAM
luna://com.webos.service.lowlevelstorage/setData
  { dbgroups: [ { dbid: "factory", items: { contiArea2All: "19461" } } ] }

// 2. configd
luna://com.webos.service.config/setConfigs
  { configs: {
      "tv.model.languageCountrySel": "EU",
      "tv.model.hwSettingGroup":     "KR",
      "tv.model.continentIndx":      5 } }

// 3. settings database
luna://com.webos.service.settings/setSystemSettings
  { category: "option", settings: {
      country: "DEU",
      smartServiceCountryCode3: "DEU",
      localeCountryGroup: "langSelEU" } }
```

Then reboot.

Two things stand out:

1. `lowlevelstorage/setData` bypasses factory management — that is precisely why
   it needs elevated privileges. A developer-mode app cannot call it.
2. The routine hardcodes a *representative* country per group (`EU → DEU`,
   `US → USA`). A Finnish household would still have to set `country: "FIN"`
   afterwards, or accept Germany as the store region.

### 5.4 Why the user sees "no updates"

Firmware and catalogue follow the packed market. An APAC unit asks the APAC
update service and the APAC catalogue, which is why a Finnish household sees no
Finnish apps and no updates it cares about. *(Observed behaviour: the TV reports
no updates. The serving logic is LG-side and is inferred, not measured.)*

### 5.5 Who is allowed to write

| Path | Needs | Risk |
| --- | --- | --- |
| Developer Mode app (no root) | LG developer account | Cannot write NVRAM; 1000-hour sessions |
| Rooted TV + Region Changer | Homebrew Channel | Medium: wrong area value can leave the TV in a bad state |
| LG service menu (Instart) | Service remote / key sequence | Medium: undocumented, can reset calibration |
| Mainboard swap to EU part | Hardware | Highest cost |

---

## 6. Engine and rooting landscape

LG ships a frozen browser engine per release, and the oldest release you support
sets your syntax floor:

| webOS | Engine |
| --- | --- |
| 4.x | Chromium 53 |
| 5.x | Chromium 68 |
| 6.x | Chromium 79 |
| 7.x and later (webOS 22 / 23 on C2 / C3) | Chromium 87+ |

Sisu TV targets the Chromium 79 floor so the same build also runs on older
panels; the stylesheet avoids `aspect-ratio`, `color-mix()` and flex `gap`.

Rooting, per [webosbrew.org/rooting](https://www.webosbrew.org/rooting/):

| Method | Reach | Status |
| --- | --- | --- |
| faultmanager | webOS 4.0+ | No patched firmware as of Jan 2025 |
| DejaVuln | webOS 3.5+ | Patches rolling out from recent models |
| WTA / crashd / RootMy.TV | webOS 3–6 | Patched (2022–2024) |

So a C2/C3 is likely rootable via faultmanager, which is what would make a region
change possible. Sisu TV does not require it.

---

## 7. What is verified vs inferred

| Claim | Status |
| --- | --- |
| IPK = ar(debian-binary, control.tar.gz, data.tar.gz); payload under `usr/palm/...` | **Verified** against two shipping IPKs |
| `contiArea2All` layout and tables | **Verified** in Region Changer source |
| EU = 19461, US = 22282 | **Verified** in Region Changer source (comment + decode) |
| Region writes need `lowlevelstorage/setData` (elevated) | **Verified** by the service's own design and comments |
| `listApps` denied to web apps | **Verified** via LG forum report |
| webOS 22/23 = Chromium 87+ | **Verified** in webosbrew's engine table |
| Dev Mode = 1000 h, apps removed on expiry | **Verified** in webosbrew's Dev Mode guide |
| faultmanager unpatched for webOS 4+ | **Verified** as of the cited doc (Jan 2025) |
| LG serves firmware per market | **Inferred** from the region mechanism and observed "no updates" |
| A Finnish browser session satisfies Yle/Ruutu geo-checks | **Inferred** from those services' normal geo-IP behaviour; not tested on the TV |

---

## 8. Design consequences

1. **Do not fight the region.** The launcher opens Finnish services over the
   network, which works regardless of what the Content Store believes.
2. **Do not ask the TV what is installed.** `listApps` is refused; attempt
   launch and fall back.
3. **Read `contiArea2All` only if allowed.** It needs elevation, so the
   diagnostics screen treats "denied" as a normal answer, not an error.
4. **Own the clock.** If the TV is still on Bangkok time, the launcher shows
   Helsinki time from `Intl` rather than trusting the device.
5. **Keep the package tiny and dependency-free.** 36 KB installs fast over Dev
   Mode's adb channel and is trivial to audit.
