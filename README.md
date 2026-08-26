# MIDItap — set tap tempo via MIDI

Electron utility that turns a single MIDI pitch-bend value into a train of tap-tempo `noteOn` pulses. Use it to push a pre-programmed delay tempo from a cue system (e.g. QLab) into hosts that only accept live tap input (e.g. Waves SuperRack).

## Behavior

- Listens for **pitch bend** on the selected input (default channel 1).
- Interprets the centered 14-bit value (`value − 8192`) as **BPM**.
- Emits `config.taps` (default **5**) consecutive note pulses on MIDI note **60 (C3)**, spaced at that BPM.
- Manual **TAP** button updates the displayed BPM from successive presses and sends a single pulse.

## Quickstart

```bash
npm install
npm start
```

Pick MIDI in/out in the settings panel (⚙), then **select and start**. Choices are remembered in `localStorage`.

Build installers:

```bash
npm run pack   # macOS + Windows
npm run dist   # current platform defaults
```

## Timing stability

The main process disables background throttling and holds a `prevent-app-suspension` power-save blocker so tap trains stay accurate when the window is minimized or occluded.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ with **npm 11.10+** (required for dependency release-age policy)

## Supply-chain policy

This project enforces a **14-day minimum release age** on registry dependencies to reduce exposure to freshly published compromised packages:

| Ecosystem | Enforcement | Config |
|-----------|-------------|--------|
| **npm** | Install-time | `.npmrc` → `min-release-age=14` |
| **CI / audit** | Lockfile check | `npm run check:supply-chain` |
| **Dependabot** | PR cooldown | `.github/dependabot.yml` → `cooldown.default-days: 14` |

One-off override when urgently needed:

```bash
npm install <package> --min-release-age=0
```

## Stack notes (v2)

- Native **Web MIDI API** (no jQuery / Bootstrap / WebMidi.js vendor bundle)
- Electron with `contextIsolation`, sandbox, and CSP on the renderer
- Pinned, cooldown-eligible Electron / electron-builder versions
