let debugMessage = "";
let midiInputID = -1;
let midiOutputID = -1;

let selectedSceneNumber = 0;
let activeSceneNumber = 0;

let printMidiToConsole = 1;

let secondsSinceLastRecall = 0;
let lastRecallTimestamp = new Date();

let outputHandle = null;
let inputHandle = null;

let currentTapHandleStack = [];

let config = {
    channel_in: 1,
    channel_out: 1,
    taps: 5
}

let globalBPM = {
    lastTapButtonTap: 0,
    interval: 0,
    min: 30,
    max: 300,
    default: 60,
    bpm: 30
};

let beaconTimeoutHandle = null;

function loadStoredMidiIO() {
    let storedInputIdString = localStorage.getItem('midiInputID');
    if(storedInputIdString !== null) {
        midiInputID = storedInputIdString;
        conditionalLog("found stored input " + storedInputIdString + " and parsed it to " + midiInputID);
    }
    let storedOutputIdString = localStorage.getItem('midiOutputID');
    if(storedOutputIdString !== null) {
        midiOutputID = storedOutputIdString;
        conditionalLog("found stored output " + storedOutputIdString + " and parsed it to " + midiOutputID);
    }
}

function setMidiIOAndRun() {
    let selectedIn = document.getElementById("midiInput").value;
    let selectedOut = document.getElementById("midiOutput").value;
    conditionalLog("selected in " + selectedIn + ", out " + selectedOut);

    if(selectedIn !== -1 || selectedOut !== -1) {
        midiInputID = selectedIn;
        midiOutputID = selectedOut;
        localStorage.setItem('midiInputID', midiInputID);
        localStorage.setItem('midiOutputID', midiOutputID);
        conditionalLog("stored midi input: " + midiInputID +", output: " + midiOutputID);
        WebMidi.disable();
        runWebMidi();
    }
}

function conditionalLog(msg) {
    if(printMidiToConsole)
        console.log(msg);
}

function runWebMidi() {
    WebMidi.enable(function(err) {useWebMidi();});
}

function useWebMidi() {
    let inputList = WebMidi.inputs;
    let outputList = WebMidi.outputs;

    conditionalLog(inputList);
    conditionalLog(outputList);

    document.getElementById("midiInput").innerHTML = "";
    document.getElementById("midiOutput").innerHTML = "";
    let foundInput = false;
    let foundOutput = false;

    let defaultInOpt = new Option("-select MIDI input-", "-1");
    defaultInOpt.setAttribute("selected", "selected");
    defaultInOpt.setAttribute("disabled", "disabled");

    let defaultOutOpt = new Option("-select MIDI output-", "-1");
    defaultOutOpt.setAttribute("selected", "selected");
    defaultOutOpt.setAttribute("disabled", "disabled");

    inputList.forEach(function(midiInput) {
        let itemName = "";
        if(midiInput.state !== "connected")
            itemName = "("+midiInput.state + ") "+midiInput.name;
        else
            itemName = "(" + String.fromCharCode(10004) + ") "+midiInput.name;
        let opt = new Option(itemName, ""+midiInput.id);
        if(midiInputID === midiInput.id) {
            opt.setAttribute("selected", "selected");
            foundInput = true;
        }
        document.getElementById("midiInput").append(opt);
    });

    outputList.forEach(function(midiOutput) {
        let itemName = "";
        if(midiOutput.state !== "connected")
            itemName = "("+midiOutput.state + ") "+midiOutput.name;
        else
            itemName = "(" + String.fromCharCode(10004) + ") "+midiOutput.name;
        let opt = new Option(itemName, midiOutput.id);
        if(midiOutputID === midiOutput.id) {
            opt.setAttribute("selected", "selected");
            foundOutput = true;
        }
        document.getElementById("midiOutput").append(opt);
    });

    if(foundInput && foundOutput)
        hideFooter();

    if(!foundInput)
        localStorage.removeItem('midiInputID');
    if(midiInputID === -1 || !foundInput)
        document.getElementById("midiInput").append(defaultInOpt);

    if(!foundOutput)
        localStorage.removeItem('midiOutputID');
    if(midiOutputID === -1 || !foundOutput)
        document.getElementById("midiOutput").append(defaultOutOpt);

    if(midiInputID !== -1 && foundInput) {
        let input = WebMidi.getInputById(midiInputID);
        if(input === false || input === undefined) {
            console.log("ERR: input get by ID failed!");
        }
        inputHandle = input;
        inputHandle.removeListener(); //remove all listeners

        inputHandle.addListener("pitchbend", config.channel_in, pitchBendListener);
        // input.addListener('programchange', "all", progChgListener);
        // input.addListener('controlchange', "all", ctrlChgListener);
        // input.addListener('sysex', "all", sysexListener);
    }

    if(midiOutputID !== -1 && foundOutput) {
        let output = WebMidi.getOutputById(midiOutputID);
        if(output === false || output === undefined) {
            console.log("ERR: output get by ID failed!");
        }
        // console.log(output);
        outputHandle = output;
    }
}

function sendTap() {
    if(outputHandle === null || outputHandle === undefined) {
        console.log("ERR: no output handle");
        return 0;
    }
    else {
        outputHandle.playNote(60, config.channel_out);
    }
    flashBeacon("green");
    return 1;
}

function sendTaps(n) {
    let ret = Array(n);
    let interval = globalBPM.interval;
    for(let tap= 0; tap < n; tap++) {
        ret[tap] = Math.round(tap * interval);
    }
    sendTapsWithDelay(ret);
}

function sendTapsWithDelay(delays) {
    let topHandle;
    while (topHandle = currentTapHandleStack.shift()) {
        window.clearTimeout(topHandle);
        // console.log("cleared "+topHandle);
    }
    let lastDelay = 0;
    delays.forEach((val)=>{
        let handle = window.setTimeout(()=>{outputHandle.playNote(60, config.channel_out); currentTapHandleStack.shift();}, val);
        currentTapHandleStack.push(handle);
        lastDelay = val;
    });
    flashBeacon("red", lastDelay);
}



function tap() {
    sendTap();
    let now = performance.now();
    let timeDiff_ms = now - globalBPM.lastTapButtonTap;
    globalBPM.lastTapButtonTap = now;
    if(Math.abs(timeDiff_ms - globalBPM.interval) < globalBPM.interval * 0.2) { //for close taps round multiple taps
        timeDiff_ms = (globalBPM.interval + timeDiff_ms) / 2;
    }
    setBPMbyInterval(timeDiff_ms);
}

function setBPM(bpm, quiet=false) {
    if(bpm <= globalBPM.max && bpm >= globalBPM.min) {
        globalBPM.bpm = bpm;
        globalBPM.interval = (60 / bpm * 1000);
    }
    refreshBPMdisplays();
    if(!quiet) {
        sendTaps(config.taps);
        // flashBeacon("red");
    }

}

function setBPMbyInterval(ms) {
    let bpm = Math.round(60 * 1000 / ms);
    if(bpm <= globalBPM.max && bpm >= globalBPM.min) {
        globalBPM.interval = ms;
        globalBPM.bpm = bpm;
    }
    refreshBPMdisplays();
}

function pitchBendListener(msg) {
    printMsg(msg);
    let msb = msg.data[2] & 0x7F;
    let lsb = msg.data[1] & 0x7F;
    let num = ((msb << 7) + lsb) - 8192;
    console.log("num: "+num);
    setBPM(num);
}
function progChgListener(msg) {
    printMsg(msg);
    conditionalLog("Received PROGCH message.", msg);
    let sceneRecalled = (128 * (msg.channel - 1)) + msg.data[1] + 1;
    if(sceneRecalled > 0 && sceneRecalled <= 300) {
        conditionalLog("valid");
        activeSceneNumber = sceneRecalled;
        refreshCenter();
        secondsSinceLastRecall = 0;
        lastRecallTimestamp = Date.now();
    }
}
function ctrlChgListener(msg) {
    conditionalLog("Received CTRLCH message.", msg);
}
function sysexListener(msg) {
    printMsg(msg);
    let sceneNumber = 0;
    conditionalLog("Received SYSEX message.", msg);
    if (msg.data[0] === 0xF0 && msg.data[1] === 0x43) {
        conditionalLog("Yamaha");
        if (msg.data[2] === 0x10) {
            conditionalLog("parameter change");
            if (msg.data[3] === 0x3E) {
                conditionalLog("digital Mixer");
                if (msg.data[4] === 0x19) {
                    conditionalLog("QL/CL");
                    if (msg.data[5] === 0x01 && msg.data[6] === 0x03 && msg.data[7] === 0x1F) {
                        conditionalLog("is Scene number");
                        if (msg.data[8] === 0x00 && msg.data[9] === 0x00 && msg.data[10] === 0x00 && msg.data[11] === 0x00 && msg.data[12] === 0x00 && msg.data[13] === 0x00 && msg.data[14] === 0x00) {
                            conditionalLog("additional bytes are empty");
                            sceneNumber = (msg.data[15] << 7) + msg.data[16];
                            if(sceneNumber >= 0 && sceneNumber <= 300) {
                                selectedSceneNumber = sceneNumber;
                                conditionalLog("valid");
                                refreshLeft();
                                conditionalLog("Scene: " + sceneNumber);
                            }

                        }

                    }
                }
            }
        }

    }
}
function printMsg(msg) {
    document.getElementById("midimsg").innerText = msg.data.join();
}

function refreshBPMdisplays() {
    refreshCenter();
    refreshLeft();
}
function refreshLeft() {
    document.getElementById("beatBeacon").style.setProperty("--interval", ""+Math.round(globalBPM.interval)+"ms");
}

function refreshCenter() {
    document.getElementById("midicenter").innerText = globalBPM.bpm.toString();
}

function flashBeacon(col, clearAfter_ms=500) {
    document.getElementById("beatBeacon").style.setProperty("--fill", ""+col)
    if(beaconTimeoutHandle !== null)
        window.clearTimeout(beaconTimeoutHandle);
    beaconTimeoutHandle = window.setTimeout(()=>{document.getElementById("beatBeacon").style.setProperty("--fill", "var(--defaultfill)");}, clearAfter_ms);
}

function toggleFooter() {
    if(document.getElementById("settingsFooterContent").classList.contains("hidden")) {
        printMidiToConsole = true;
        document.getElementById("settingsFooterContent").classList.remove("hidden");
        document.getElementById("footerToggle").innerHTML = "&#10004;";
    }
    else {
        document.getElementById("settingsFooterContent").classList.add("hidden");
        printMidiToConsole = false;
        document.getElementById("footerToggle").innerHTML = "&#9881;";
    }
}

function hideFooter() {
    document.getElementById("settingsFooterContent").classList.add("hidden");
    printMidiToConsole = false;
    document.getElementById("footerToggle").innerHTML = "&#9881;";
}

function setupListeners() {
    document.getElementById("footerToggle").addEventListener("click", toggleFooter);
    document.getElementById("settings-confirm-start-button").addEventListener("click", setMidiIOAndRun);
    document.getElementById("tapButton").addEventListener("click", tap);
}

document.addEventListener('DOMContentLoaded', function () {
    // ready function
    conditionalLog("execute ready function");
    setupListeners();
    loadStoredMidiIO();
    runWebMidi();
    setBPM(globalBPM.default, true);
    refreshBPMdisplays();
    document.getElementById("beatBeacon").style.animationPlayState = "running";
    // startSecondsCounter();
});