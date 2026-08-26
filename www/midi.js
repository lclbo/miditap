const config = {
  channelIn: 1, // 1–16
  channelOut: 1,
  taps: 5,
  tapNote: 60, // C3
  noteVelocity: 100,
  noteDurationMs: 20,
};

const globalBPM = {
  lastTapButtonTap: 0,
  interval: 0,
  min: 30,
  max: 300,
  default: 60,
  bpm: 60,
};

/** @type {MIDIAccess | null} */
let midiAccess = null;
/** @type {MIDIInput | null} */
let inputHandle = null;
/** @type {MIDIOutput | null} */
let outputHandle = null;

let midiInputID = "";
let midiOutputID = "";
let printMidiToConsole = true;
let beaconTimeoutHandle = null;
/** @type {number[]} */
let currentTapHandleStack = [];

function conditionalLog(...args) {
  if (printMidiToConsole) console.log(...args);
}

function loadStoredMidiIO() {
  midiInputID = localStorage.getItem("midiInputID") ?? "";
  midiOutputID = localStorage.getItem("midiOutputID") ?? "";
}

function channelStatus(base, channel) {
  return base | ((channel - 1) & 0x0f);
}

function sendNotePulse(note = config.tapNote) {
  if (!outputHandle) {
    console.error("ERR: no MIDI output");
    return false;
  }
  const on = [channelStatus(0x90, config.channelOut), note & 0x7f, config.noteVelocity & 0x7f];
  const off = [channelStatus(0x80, config.channelOut), note & 0x7f, 0];
  outputHandle.send(on);
  window.setTimeout(() => {
    try {
      outputHandle?.send(off);
    } catch {
      /* port may have closed */
    }
  }, config.noteDurationMs);
  return true;
}

function clearPendingTaps() {
  let handle;
  while ((handle = currentTapHandleStack.shift())) {
    window.clearTimeout(handle);
  }
}

function sendTaps(n) {
  const interval = globalBPM.interval;
  const delays = Array.from({ length: n }, (_, tap) => Math.round(tap * interval));
  clearPendingTaps();
  let lastDelay = 0;
  for (const delay of delays) {
    const handle = window.setTimeout(() => {
      sendNotePulse();
      currentTapHandleStack.shift();
    }, delay);
    currentTapHandleStack.push(handle);
    lastDelay = delay;
  }
  flashBeacon("red", Math.max(lastDelay, 500));
}

function sendTap() {
  const ok = sendNotePulse();
  if (ok) flashBeacon("green");
  return ok;
}

function refreshLeft() {
  document.getElementById("beatBeacon").style.setProperty("--interval", `${Math.round(globalBPM.interval)}ms`);
}

function refreshCenter() {
  document.getElementById("midicenter").textContent = String(globalBPM.bpm);
}

function refreshBPMdisplays() {
  refreshCenter();
  refreshLeft();
}

function setBPM(bpm, quiet = false) {
  if (bpm <= globalBPM.max && bpm >= globalBPM.min) {
    globalBPM.bpm = bpm;
    globalBPM.interval = (60 / bpm) * 1000;
  }
  refreshBPMdisplays();
  if (!quiet) sendTaps(config.taps);
}

function setBPMbyInterval(ms) {
  const bpm = Math.round((60 * 1000) / ms);
  if (bpm <= globalBPM.max && bpm >= globalBPM.min) {
    globalBPM.interval = ms;
    globalBPM.bpm = bpm;
  }
  refreshBPMdisplays();
}

function tap() {
  sendTap();
  const now = performance.now();
  let timeDiffMs = now - globalBPM.lastTapButtonTap;
  globalBPM.lastTapButtonTap = now;
  // Smooth consecutive taps that are close to the current interval
  if (Math.abs(timeDiffMs - globalBPM.interval) < globalBPM.interval * 0.2) {
    timeDiffMs = (globalBPM.interval + timeDiffMs) / 2;
  }
  setBPMbyInterval(timeDiffMs);
}

function flashBeacon(col, clearAfterMs = 500) {
  const beacon = document.getElementById("beatBeacon");
  beacon.style.setProperty("--fill", col);
  if (beaconTimeoutHandle !== null) window.clearTimeout(beaconTimeoutHandle);
  beaconTimeoutHandle = window.setTimeout(() => {
    beacon.style.setProperty("--fill", "var(--defaultfill)");
  }, clearAfterMs);
}

function printMsg(data) {
  document.getElementById("midimsg").textContent = Array.from(data).join();
}

function isPitchBend(status) {
  return (status & 0xf0) === 0xe0;
}

function pitchBendToCentered(data) {
  const lsb = data[1] & 0x7f;
  const msb = data[2] & 0x7f;
  return (msb << 7) + lsb - 8192;
}

function onMidiMessage(event) {
  const data = event.data;
  if (!data || data.length < 3) return;
  const status = data[0];
  const channel = (status & 0x0f) + 1;
  if (!isPitchBend(status) || channel !== config.channelIn) return;

  printMsg(data);
  const num = pitchBendToCentered(data);
  conditionalLog("pitchbend centered value:", num);
  setBPM(num);
}

function detachInput() {
  if (inputHandle) {
    inputHandle.onmidimessage = null;
    inputHandle = null;
  }
}

function portLabel(port) {
  const mark = port.state === "connected" ? "✓" : `(${port.state})`;
  return `${mark} ${port.name}`;
}

function fillSelect(selectEl, ports, selectedId, placeholder) {
  selectEl.replaceChildren();
  let found = false;
  for (const port of ports) {
    const opt = document.createElement("option");
    opt.value = port.id;
    opt.textContent = portLabel(port);
    if (port.id === selectedId) {
      opt.selected = true;
      found = true;
    }
    selectEl.append(opt);
  }
  if (!found) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    opt.selected = true;
    opt.disabled = true;
    selectEl.append(opt);
  }
  return found;
}

function bindSelectedPorts() {
  detachInput();
  outputHandle = null;

  const inputSelect = document.getElementById("midiInput");
  const outputSelect = document.getElementById("midiOutput");
  const foundInput = fillSelect(
    inputSelect,
    [...(midiAccess?.inputs.values() ?? [])],
    midiInputID,
    "-select MIDI input-",
  );
  const foundOutput = fillSelect(
    outputSelect,
    [...(midiAccess?.outputs.values() ?? [])],
    midiOutputID,
    "-select MIDI output-",
  );

  if (foundInput && foundOutput) hideFooter();

  if (!foundInput) {
    localStorage.removeItem("midiInputID");
    midiInputID = "";
  }
  if (!foundOutput) {
    localStorage.removeItem("midiOutputID");
    midiOutputID = "";
  }

  if (foundInput && midiInputID) {
    inputHandle = midiAccess.inputs.get(midiInputID) ?? null;
    if (!inputHandle) {
      console.error("ERR: input get by ID failed");
    } else {
      inputHandle.onmidimessage = onMidiMessage;
    }
  }

  if (foundOutput && midiOutputID) {
    outputHandle = midiAccess.outputs.get(midiOutputID) ?? null;
    if (!outputHandle) console.error("ERR: output get by ID failed");
  }
}

function setMidiIOAndRun() {
  const selectedIn = document.getElementById("midiInput").value;
  const selectedOut = document.getElementById("midiOutput").value;
  conditionalLog("selected in", selectedIn, "out", selectedOut);

  if (!selectedIn && !selectedOut) return;

  midiInputID = selectedIn;
  midiOutputID = selectedOut;
  if (midiInputID) localStorage.setItem("midiInputID", midiInputID);
  if (midiOutputID) localStorage.setItem("midiOutputID", midiOutputID);
  bindSelectedPorts();
}

function onStateChange() {
  conditionalLog("MIDI port state change");
  bindSelectedPorts();
}

async function runWebMidi() {
  if (!navigator.requestMIDIAccess) {
    console.error("Web MIDI API is not available in this runtime");
    document.getElementById("midimsg").textContent = "Web MIDI unavailable";
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  } catch (err) {
    console.error("Failed to open MIDI access", err);
    document.getElementById("midimsg").textContent = "MIDI permission denied";
    return;
  }
  midiAccess.onstatechange = onStateChange;
  bindSelectedPorts();
}

function toggleFooter() {
  const panel = document.getElementById("settingsFooter");
  const toggle = document.getElementById("footerToggle");
  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !opening);
  printMidiToConsole = opening;
  toggle.textContent = opening ? "✓" : "⚙";
}

function hideFooter() {
  document.getElementById("settingsFooter").classList.add("hidden");
  printMidiToConsole = false;
  document.getElementById("footerToggle").textContent = "⚙";
}

function setupListeners() {
  document.getElementById("footerToggle").addEventListener("click", toggleFooter);
  document.getElementById("settings-confirm-start-button").addEventListener("click", setMidiIOAndRun);
  document.getElementById("tapButton").addEventListener("click", tap);
}

document.addEventListener("DOMContentLoaded", () => {
  setupListeners();
  loadStoredMidiIO();
  setBPM(globalBPM.default, true);
  refreshBPMdisplays();
  document.getElementById("beatBeacon").style.animationPlayState = "running";
  runWebMidi();
});
