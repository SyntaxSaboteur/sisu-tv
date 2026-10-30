# Taking over the UI (the closest thing to replacing the OS)

You asked to replace the OS. This page is honest about the ceiling and precise
about everything below it.

## The ceiling

| Goal | Possible? | Why |
| --- | --- | --- |
| Flash Linux/Android TV onto the TV | **No** | Signed verified boot, no bootloader unlock, no mainline drivers for the Alpha 9 SoC, Widevine lives in LG's stack |
| Run a different UI from power-on | **Yes**, with root | The Home screen is an app (`com.webos.app.home`); it can be replaced |
| Remove LG's store, bloat and update checks | **Yes**, with root | Bootstrap and package services are replaceable/servicable |
| Keep the panel, tuner, HDR and DRM working | **Yes** | They keep running on LG's kernel — which is the point |

The end state people actually want is this: **power on → your interface → your
apps**, with LG's shelves never appearing. That is achievable. The kernel
underneath stays LG's, and that is a feature, not a compromise: it is what makes
the tuner, HDR pipeline and Netflix DRM work.

## The three pieces

| Piece | Project | Role |
| --- | --- | --- |
| Root | [faultmanager-autoroot](https://github.com/throwaway96/faultmanager-autoroot) | webOS 4.0–10.0, **but most webOS 5+ firmware is patched as of Aug 2025** — a per-firmware question, checked at [CanI.RootMy.TV](https://cani.rootmy.tv/) |
| Package manager | [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) | Installs and updates homebrew apps, including the Home replacements |
| New Home | [Lumaglass](https://github.com/federi95/lumaglass), [webos-home](https://github.com/Mr-Neutr0n/webos-home) | Replaces `com.webos.app.home`'s view |
| De-bloat (optional) | [lgtv-tbc](https://github.com/zopieux/lgtv-tbc) | Replaces LG's bootstrap HTTP server: blocks forced updates, disables bloatware, stops device-ID phoning home |

### Choosing a Home

| | Lumaglass (fork of Luma) | webos-home |
| --- | --- | --- |
| Stack | Rust + SDL2 + OpenGL ES 2 | QML |
| Scope | Full launcher: app grid, favourites, hidden apps, recents, wallpapers, weather, screensaver, TV info, app management | Minimal: pixel room, clock, quote, four shortcuts |
| Reversibility | Firmware guards + rollback | Hash-checks stock Home/QML before changing |
| Tested on | webOS Hub22, SDK 7.5.9-36, firmware 04.56.75, aarch64 | webOS Hub22, similar |
| Good fit if | You want a real replacement UI | You want a small, auditable change |

**Neither has been validated on an APAC C2 firmware.** Both projects ship
compatibility inspection precisely because the Home binary and QML differ per
firmware. Treat "not tested on your build" as the default, and run their
inspection before installing.

## Order of operations

Do these in this order. Each step has an exit criterion; do not proceed on a
failed check.

### 0. Preflight (do not skip)

- [ ] Firmware version and SDK recorded (`TV-tiedot` in Sisu TV, or
      *Settings → General → About this TV*)
- [ ] Model string recorded (`OLED77C2…` or `OLED77C3…`)
- [ ] You accept: warranty void, small brick risk, no LG support
- [ ] Stable power; do not do this during a thunderstorm or on a flaky socket
- [ ] Nothing else changed in the same session — no region change at the same
      time. One variable at a time.

## "It can't update in Europe" — read this before anything else

An imported C2 that has not taken an update in a year is in an unusual position,
and both halves of that position matter.

**Why it cannot update** (LG-side mechanics; inferred, not measured):

1. The update service keys off the packed market in `contiArea2All`, so a Thai
   unit asks the Asia/Pacific channel — which has nothing useful for a European
   network.
2. The product code of an APAC SKU may simply not exist in the EU firmware
   matrix.
3. The 2022 build is old enough that the regional branch may be end-of-life.

**What that buys you:** a year without updates means a year of patches not
applied. If the faultmanager fix landed in a firmware you never received, the
TV is still exploitable. That is the good case for this project.

**What it costs you:** the same fact, seen from the network. webOS has had
serious remotely-reachable bugs — including a 2026 zero-click chain (pairing
bypass → unsigned IPK install) that LG patched in August 2026. A television
that has not been patched in a year should be treated as an untrusted device on
your LAN:

- put it on a guest/IoT SSID or a separate VLAN,
- do not port-forward anything to it,
- if you root it, use root to *reduce* exposure (block outbound telemetry and
  the second-screen services you do not use).

**Sequencing rule:** do not "fix" the update problem before you have decided
about root. An update may close the door you are about to walk through.

```
CanI.RootMy.TV says vulnerable?
|
+-- yes --> install Sisu TV first
|           --> faultmanager root
|           --> Homebrew Channel
|           --> freeze updates (lgtv-tbc or never accept OTA)
|           --> replace Home
|
+-- no  --> external box (Apple TV / Shield / LibreELEC)
            or LG service-centre region change
```

### 1. Root

**First**: look up your model + firmware on [CanI.RootMy.TV](https://cani.rootmy.tv/).
If it says patched, stop — nothing below applies, and the honest options are an
external box or a mainboard swap.

If it is vulnerable, faultmanager-autoroot does the work over the Developer
Mode SSH connection you already have. It is not a firmware flash and needs no
serial console. Things the README is emphatic about:

- The exploit **intentionally triggers a segfault**. That is expected.
- On webOS 7+ you may need **several attempts** before `devmode_enabled` is
  detected.
- After `Payload complete`, **uninstall the LG Developer Mode app before
  rebooting**, and do not reinstall it while the TV is rooted.
- Disable **Quick Start+**, or Homebrew Channel may not appear after the reboot.
- A wrong TV clock can make the IPK install fail (`errorCode -5`).

> Practical consequence for this project: while rooted, apps are installed
> through the **Homebrew Channel**, not Developer Mode. Install Sisu TV *before*
> rooting, or rebuild it as a homebrew package afterwards.

Exit criteria:
- `ssh root@<tv-ip>` works (root shell)
- Homebrew Channel appears in the launcher
- `/var/luna/preferences/webosbrew` (or the marker named by the README) exists

If any of that fails, stop and roll back before touching the Home screen.

### 2. Decide about updates — before the Home replacement

Two schools:

- **Freeze updates** (`lgtv-tbc`, or simply never accept OTA). Root survives
  only until a firmware update rewrites the partitions it lives in. Freezing is
  what most people do after rooting.
- **Keep updates** and re-root after each one. Acceptable if you enjoy the
  ritual and the exploit stays unpatched for your model.

Freeze *after* you have confirmed root works, not before — you want a known-good
firmware that the exploits and Home replacements have actually been tested
against.

### 3. Back up what you are about to replace

Before any Home replacement:

```sh
# on the TV, as root
cp -a /usr/palm/applications/com.webos.app.home ~/home-backup
cp -a /usr/palm/applications/com.webos.app.home/… /…   # whatever the project's docs list
```

Both projects hash-check the stock files and keep their own rollback; keep an
independent copy anyway. The backup is the difference between "I don't like this
UI" and "I have a 77-inch paperweight".

### 4. Install the Home replacement

Follow the project's setup doc. Both work by changing the view the *stock* Home
process renders, not by deleting the Home service — that is why the remote and
app launching keep working.

Exit criteria:
- Power cycle lands on the new Home
- Remote (including Magic Remote pointer if you use it) navigates the new Home
- Apps launch from the new Home
- BACK/HOME still behave sanely
- Tuner and an HDR source still work

### 5. Only then: de-bloat

`lgtv-tbc` is powerful and easy to over-apply. Do it last, one change at a time,
and verify the TV still updates its clock, resolves DNS and plays DRM content
after each change.

## Rollback

Every layer has one:

| Layer | Rollback |
| --- | --- |
| Home replacement | Project's own rollback / restore the backup from step 3 |
| Bloat / update blocker | Restore the original bootstrap files (`lgtv-tbc` documents the paths) |
| Root | Uninstall the Homebrew Channel and remove the root marker; a factory reset also clears it (and everything else) |

Homebrew Channel ships a **failsafe mode**: if the TV crashes on boot it exposes
an emergency shell over telnet, and normal boot resumes once
`/var/luna/preferences/webosbrew_failsafe` is removed. Know this path *before*
you need it.

If you land on webOS 22 and your Homebrew Channel is older than v0.6.3, update
through the **Homebrew Channel Updater** app: updating in place from an older
build can cost you root ([repo note](https://repo.webosbrew.org/apps/org.webosbrew.hbchannel/)).

Keep the backup *and* a note of the exact firmware version you were on when it
worked. If you ever update, your rollback target is no longer the same build.

## Where Sisu TV fits

Sisu TV is an ordinary app, so it keeps working under any Home:

- **As a tile** in Lumaglass / webos-home: it becomes the Finnish section of
  your new interface.
- **As the Home itself**: possible by pointing the Home replacement at Sisu TV,
  but you then lose app discovery and the tuner entry points unless you build
  them. Not recommended as a first step — walk before running.

A sensible target state for this TV:

```
power on
  └─ Lumaglass (or webos-home)
       ├─ Yle Areena / MTV Katsomo / Ruutu   (Sisu TV web launch)
       ├─ Netflix / YouTube                  (native apps)
       ├─ Live TV / tuner                    (LG stack, still working)
       └─ TV-tiedot                          (Sisu TV diagnostics)
```

## What I would not do

- Flash firmware images from forums to "enable" something. That is how these
  TVs actually die.
- Change the region and root in the same session. Two risky operations, one
  rollback point.
- Install a Home replacement on a firmware nobody has tested without reading
  its inspection output first.
- Assume the APAC build behaves like the EU one. It has a different Home
  version and a different service set.

## Next concrete step

Report the firmware + SDK from `TV-tiedot`. That single number decides:

1. whether faultmanager applies to your build,
2. which Home replacement has a compatible profile,
3. whether you should freeze updates at the version you are on.
