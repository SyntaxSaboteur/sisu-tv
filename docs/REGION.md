# The region lock, and what to do about it

Short version: **you do not have to change the region to watch Finnish
television.** Sisu TV opens the services over the network, which is independent
of the store region. Changing the region is a separate project with real risk.

This page explains what the lock is, what each fix costs, and what to check
before you touch anything.

---

## What is actually locked

Three things follow one factory value, `contiArea2All`, stored in NVRAM:

1. **LG Content Store catalogue** — the apps the TV is offered.
2. **Firmware update channel** — which build the TV is allowed to download.
3. **Defaults** — time zone, tuner channel plan, service-country codes.

A Bangkok unit is packed for the Asia/Pacific market. That is why the Finnish
catalogue is absent and updates look empty: the TV is asking a different server
than a Helsinki unit would.

The technical layout of the value, the exact Luna calls, and the evidence for
each claim are in [RESEARCH.md](RESEARCH.md#5-the-region-lock-in-detail).

---

## The four options

| Option | Effort | Risk | Gets Finnish apps | Gets EU firmware |
| --- | --- | --- | --- | --- |
| **1. Sisu TV** (this repo) | 15 min | None | Yes, via browser | No |
| **2. Developer Mode + homebrew apps** | 15 min | Low | Adds what homebrew ships | No |
| **3. Root + Region Changer** | 1–2 h | Medium | Yes, native apps | Yes |
| **4. LG service centre** | Days | Low (for you) | Maybe, at your cost | Maybe |

### Option 1 — Sisu TV

Install the launcher, open Yle Areena / MTV Katsomo / Ruutu / Viaplay in the TV
browser. Video is fetched from Finland, so geo-restricted content behaves
normally. Nothing on the TV changes. See [INSTALL.md](INSTALL.md).

Limits: the services run in a browser (no native 4K/HDR app integration), and
the LG store still shows the Asian catalogue.

### Option 2 — Developer Mode + homebrew apps

Developer Mode is already required for Sisu TV, and it also unlocks homebrew
apps from the [webosbrew app store](https://repo.webosbrew.org/): media players,
Kodi, IPTV clients, and remote-control tweaks. No root needed. Apps disappear
when the 1000-hour lease lapses.

### Option 3 — Root, then change the region

Rooting a C2/C3 is feasible: the `faultmanager` method covers webOS 4.0 and later
and, as of January 2025, had no patched firmware
([webosbrew.org/rooting](https://www.webosbrew.org/rooting/)).

After rooting, install the Homebrew Channel, then the **Region Changer** app
([Acur4cy/regionchanger-repo](https://github.com/Acur4cy/regionchanger-repo)):

1. Read the current value first (Region Changer → *read*) and **write it down**.
   This is your rollback number.
2. Apply **EU = 19461**.
3. Reboot.
4. Set the country to Finland in the TV settings (Region Changer writes a
   representative country per group — `DEU` for the EU preset — so `FIN` must
   be set afterwards).
5. Check the Content Store and the update menu.

What the app does under the hood (three stores must agree, then reboot):

```js
// NVRAM
luna://com.webos.service.lowlevelstorage/setData
  { dbgroups: [{ dbid: "factory", items: { contiArea2All: "19461" } }] }

// configd
luna://com.webos.service.config/setConfigs
  { configs: { "tv.model.languageCountrySel": "EU",
               "tv.model.hwSettingGroup":     "KR",
               "tv.model.continentIndx":      5 } }

// settings database
luna://com.webos.service.settings/setSystemSettings
  { category: "option",
    settings: { country: "DEU", smartServiceCountryCode3: "DEU",
                localeCountryGroup: "langSelEU" } }
```

Risks worth taking seriously:

- A wrong area value can leave the TV unable to boot into a usable state. It is
  usually recoverable through the service menu, but not guaranteed.
- Warranty: software modification generally voids it.
- The EU **hardware group** differs from the APAC one. The EU preset above maps
  to hardware group `KR`, which is what the community tool ships; a mismatch
  between hardware group and panel can affect tuner behaviour.
- Your LG account's country and the store region should agree, or the store may
  still refuse.
- The DVB tuner: Thailand and Finland both use DVB-T2, so the hardware is
  usually capable, but the channel plan and CAM support are set by region. Do
  not assume antenna TV will work perfectly after a region change.

### Option 4 — LG service

An LG service centre can change the region on the bench. Ask for a written
quote and confirm in advance that they will change the *store region*, not just
the language. This is the only option that keeps the warranty intact.

---

## What Sisu TV will never do

- It does **not** write `contiArea2All`, `configd`, or the settings database.
- It only *reads* the region (and reports "ei luettavissa" when the TV refuses,
  which is normal without root).
- It does not attempt to bypass DRM or geo-blocking of the streaming services
  themselves; it simply opens them from a Finnish connection, which is what any
  browser on that network would do.

## Pre-flight checklist before any region change

- [ ] Current `contiArea2All` value recorded
- [ ] Stable power (a failed write during a brownout is the bad case)
- [ ] Homebrew Channel and Region Changer versions noted
- [ ] LG account country checked
- [ ] A way to reach the service menu documented for your model
- [ ] Acceptance that this is unsupported and at your own risk
