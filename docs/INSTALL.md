# Installing Sisu TV

Sisu TV installs through LG's official **Developer Mode**, so the TV stays
unmodified: no root, no firmware patching, no region change. It costs nothing
and is reversible (uninstall removes the app).

You need:

- the TV and a computer on the same network,
- a free LG developer account,
- ~15 minutes.

---

## 1. Create a developer account

1. Open <https://webostv.developer.lge.com/> and choose **Sign In**.
2. Create an LG account if you do not have one. Pick the country you are in
   (Finland) — this is your developer profile, it does **not** change the TV's
   store region.
3. Verify the email address.

## 2. Enable Developer Mode on the TV

1. On the TV, open the **LG Content Store** and search for **Developer Mode**.
2. Install it, launch it, and sign in with the account from step 1.
3. Turn **Dev Mode Status** on. The TV restarts.
4. Open Developer Mode again and confirm the status is ON.
5. Enable **Key Server**. You will need the passphrase it shows in a moment.

> The app may be listed in the Asian catalogue as "Developer Mode" — it is a
> global LG app, not a region-locked one.

## 3. Find the TV's IP address

TV: **Settings → Connection → Wired/Wireless Connection (Network) → Connection
info**. It looks like `192.168.1.42`.

Set a static DHCP lease for the TV if you can; Developer Mode devices are bound
by address.

## 4. Install the CLI

```bash
npm install -g @webos-tools/cli
ares --version
```

## 5. Register the TV

```bash
ares-setup-device
```

Answer the prompts:

| Prompt | Value |
| --- | --- |
| Device name | `tv` |
| host | the TV's IP |
| port | `9922` |
| username | `prisoner` |

Then fetch the SSH key, entering the passphrase shown by Key Server:

```bash
ares-novacom --device tv --getkey
```

## 6. Build and install

```bash
git clone https://github.com/SyntaxSaboteur/sisu-tv.git
cd sisu-tv
npm test
npm run package        # build/com.syntaxsaboteur.sisutv_1.0.0_all.ipk

ares-install --device tv build/com.syntaxsaboteur.sisutv_1.0.0_all.ipk
ares-launch  --device tv com.syntaxsaboteur.sisutv
```

Sisu TV also appears in the TV's launcher like any other app.

---

## Alternative: webOS Dev Manager (no terminal)

[webosbrew/dev-manager-desktop](https://github.com/webosbrew/dev-manager-desktop)
does the same job with a GUI: sign in, add the TV by IP, install the `.ipk` from
`build/`, launch it. Useful if `ares-setup-device` fights you.

---

## Keeping it installed

Developer Mode is a 1000-hour lease:

- The developer account may only be attached to **one TV at a time**.
- When the lease expires, **apps installed through Developer Mode are removed**.
- Open the Developer Mode app and reset the timer before that happens; the
  countdown is visible in the app.

This is an LG platform rule. There is no supported way around it without
rooting.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ares-novacom: error: ... authentication failed` | Key Server was toggled off after a reboot; re-enable it in Developer Mode, then `ares-novacom --device tv --getkey` again |
| `Cannot connect to the device` | TV and computer on different subnets, VPN active, or the TV's IP changed |
| Install works but no icon appears | Reboot the TV, or start it with `ares-launch`; the launcher list refreshes on boot |
| App opens, tiles do nothing | The TV browser refused the launch; the app shows a toast. Open the TV browser and bookmark the service instead |
| Everything is denied in TV-tiedot | Expected on an unrooted TV: NVRAM and some service reads are privileged |
| "No updates available" | Not a Sisu TV problem; see [REGION.md](REGION.md) |

## Uninstall

```bash
ares-install --device tv --remove com.syntaxsaboteur.sisutv
```
