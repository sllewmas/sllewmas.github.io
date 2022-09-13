var device;
async function setup() {
    // Create AudioContext
    const WAContext = window.AudioContext || window.webkitAudioContext;
    const context = new WAContext();

    // Create gain node and connect it to audio output
    const outputNode = context.createGain();

    //outputNode.gain.value = 0.1;
    outputNode.connect(context.destination);


    // Fetch the exported patcher
    const response = await fetch("export/granular-synth_v3.rnbopat.export.json");
    const patcher = await response.json();

    // (Optional) Fetch the dependencies
    let dependencies = [];
    try {
        const dependenciesResponse = await fetch("export/dependencies.json");
        dependencies = await dependenciesResponse.json();

        //Prepend "export" to any file dependenciies
        dependencies.forEach(d => { if (!!d.file) d.file = "export/" + d.file });
    } catch (e) { }

    // Create the device
    device = await RNBO.createDevice({ context, patcher });


    console.log(dependencies.length)
    // (Optional) Load the samples
    if (dependencies.length)
        await device.loadDataBufferDependencies(dependencies);

    const results = await device.loadDataBufferDependencies(dependencies);
    results.forEach(result => {
        if (result.type === "success") {
            console.log(`Successfully loaded buffer with id ${result.id}`);
        } else {
            console.log(`Failed to load buffer with id ${result.id}, ${result.error}`);
        }
    });


    device.node.connect(outputNode);

    var myMeterElement = document.getElementById('my-peak-meter');
    var meterNode = webAudioPeakMeter.createMeterNode(outputNode, context);
    webAudioPeakMeter.createMeter(myMeterElement, meterNode, {});


    // (Optional) Extract the name of the patcher from the description
    if (patcher.desc.meta && patcher.desc.meta.filename)
        document.getElementById("patcher-title").innerText = patcher.desc.meta.filename;

    // (Optional) Automatically create sliders for the device parameters
    makeSliders(device);

    // (Optional) Create a form to send messages to RNBO inputs
    makeBufferSelector(device);

    // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
    attachOutports(device);

    // (Optional) Load presets, if any
    loadPresets(device, patcher);



    // (Optional) Connect MIDI inputs
    setupMIDI(device);
    keyboard(device);

    file_buffer_load(device, context)


    document.body.onclick = () => {
        context.resume();
        //console.log("I'm hEre")
    }
}
/**
 * 
 * @param {*} device 
 */
function makeSliders(device) {
    let pdiv = document.getElementById("rnbo-parameter-sliders");
    let noParamLabel = document.getElementById("no-param-label");
    if (noParamLabel && device.numParameters > 0) pdiv.removeChild(noParamLabel);

    // This will allow us to ignore parameter update events while dragging the slider.
    let isDraggingSlider = false;
    let uiElements = {};

    device.parameters.forEach(param => {
        // Subpatchers also have params. If we want to expose top-level
        // params only, the best way to determine if a parameter is top level
        // or not is to exclude parameters with a '/' in them.
        // You can uncomment the following line if you don't want to include subpatcher params

        //if (param.id.includes("/")) return;

        // Create a label, an input slider and a value display
        let label = document.createElement("label");
        let slider = document.createElement("input");
        let text = document.createElement("input");
        let sliderContainer = document.createElement("div");
        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(text);

        // Add a name for the label
        label.setAttribute("name", param.name);
        label.setAttribute("for", param.name);
        label.setAttribute("class", "param-label");
        label.textContent = `${param.name} (${param.unit}): `;

        // Make each slider reflect its parameter
        slider.setAttribute("type", "range");
        slider.setAttribute("class", "param-slider");
        slider.setAttribute("id", param.id);
        slider.setAttribute("name", param.name);
        slider.setAttribute("min", param.min);
        slider.setAttribute("max", param.max);
        if (param.steps > 1) {
            slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
        } else {
            slider.setAttribute("step", (param.max - param.min) / 1000.0);
        }
        slider.setAttribute("value", param.value);

        // Make a settable text input display for the value
        text.setAttribute("value", param.value.toFixed(1));
        text.setAttribute("type", "text");

        // Make each slider control its parameter
        slider.addEventListener("pointerdown", () => {
            isDraggingSlider = true;
        });
        slider.addEventListener("pointerup", () => {
            isDraggingSlider = false;
            slider.value = param.value;
            text.value = param.value.toFixed(1);
        });
        slider.addEventListener("input", () => {
            let value = Number.parseFloat(slider.value);
            param.value = value;
        });

        // Make the text box input control the parameter value as well
        text.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                let newValue = Number.parseFloat(text.value);
                if (isNaN(newValue)) {
                    text.value = param.value;
                } else {
                    newValue = Math.min(newValue, param.max);
                    newValue = Math.max(newValue, param.min);
                    text.value = newValue;
                    param.value = newValue;
                }
            }
        });

        // Store the slider and text by name so we can access them later
        uiElements[param.name] = { slider, text };

        // Add the slider element
        pdiv.appendChild(sliderContainer);
    });

    // Listen to parameter changes from the device
    device.parameterChangeEvent.subscribe(param => {
        if (!isDraggingSlider)
            uiElements[param.name].slider.value = param.value;
        uiElements[param.name].text.value = param.value.toFixed(1);
    });

    // device.messageEvent.subscribe((ev) => {

    //     // Message events have a tag as well as a payload
    //     console.log(`${ev.tag}: ${ev.payload}`);

    //     document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    // });
}

/**
 * 
 * @param {*} device 
 * @returns 
 */
function makeBufferSelector(device) {
    const idiv = document.getElementById("rnbo-buff-sel");
    const buffSelect = document.getElementById("buff-select");
    // const buffRadio = document.getElementById("buff-radio");
    const buffForm = document.getElementById("buff-form");
    let inportTag = null;

    const messages = device.messages;
    const inports = messages.filter(message => message.type === RNBO.MessagePortType.Inport);

    inports.forEach(i => {
        console.log(i.tag)
    })


    const buffDescriptions = device.dataBufferDescriptions;

    if (buffDescriptions.length === 0) {
        idiv.removeChild(document.getElementById("buff-form"));
        return;
    } else {
        // idiv.removeChild(document.getElementById("no-buffs-label"));
        while (buffSelect.firstChild) {
            buffSelect.removeChild(buffSelect.firstChild);
        }
        buffDescriptions.forEach(desc => {
            const option = document.createElement("option");
            option.innerText = desc.id;
            buffSelect.appendChild(option);
        });
        buffSelect.onchange = () => inportTag = buffSelect.value;
        inportTag = buffSelect.value;

        buffForm.onsubmit = (ev) => {
            // Do this or else the page will reload
            ev.preventDefault();
            console.log(buffSelect.selectedIndex)
            // Turn the text into a list of numbers (RNBO messages must be numbers, not text)
            //const values = buffSelect.value.split(/\s+/).map(s => parseFloat(s));

            // Send the message event to the RNBO device
            let messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, 'in1', buffSelect.selectedIndex);
            device.scheduleEvent(messageEvent);
        }
    }

}

/**
 * 
 * @param {*} device 
 * @returns 
 */
function attachOutports(device) {
    const outports = device.messages.filter(message => message.type === RNBO.MessagePortType.Outport);
    if (outports.length < 1) {
        document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
        return;
    }

    document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
    device.messageEvent.subscribe((ev) => {

        // Message events have a tag as well as a payload
        console.log(`${ev.tag}: ${ev.payload}`);

        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}

// function attachOutports(device) {
//     const outports = device.messages.filter(message => message.type === RNBO.MessagePortType.Outport);
//     if (outports.length < 1) {
//         document.getElementById("rnbo-console").removeChild(document.getElementById("rnbo-console-div"));
//         return;
//     }

//     document.getElementById("rnbo-console").removeChild(document.getElementById("no-outports-label"));
//     device.messageEvent.subscribe((ev) => {

//         // Message events have a tag as well as a payload
//         console.log(`${ev.tag}: ${ev.payload}`);

//         document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
//     });
// }

// function loadPresets(device, patcher) {
//     let presets = patcher.presets || [];
//     if (presets.length < 1) {
//         document.getElementById("rnbo-presets").removeChild(document.getElementById("preset-select"));
//         return;
//     }

//     document.getElementById("rnbo-presets").removeChild(document.getElementById("no-presets-label"));
//     let presetSelect = document.getElementById("preset-select");
//     presets.forEach((preset, index) => {
//         const option = document.createElement("option");
//         option.innerText = preset.name;
//         option.value = index;
//         presetSelect.appendChild(option);
//     });
//     presetSelect.onchange = () => device.setPreset(presets[presetSelect.value]);
// }

/**
 * 
 * @param {*} device 
 * @param {*} patcher 
 * @returns 
 */
function loadPresets(device, patcher) {

    let presets = patcher.presets || [];
    if (presets.length < 1) {
        document.getElementById("rnbo-presets").removeChild(document.getElementById("preset-select"));
        return;
    }

    document.getElementById("rnbo-presets").removeChild(document.getElementById("no-presets-label"));
    let presetSelect = document.getElementById("preset-select");
    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.innerText = preset.name;
        option.value = index;
        presetSelect.appendChild(option);
    });

    presetSelect.onchange = () => device.setPreset(presets[presetSelect.value]);
    presetSelect.onchange = () => console.log(presets[presetSelect.value]);
}

function setupMIDI(device) {
    navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure);



};

function onMIDISuccess(midiAccess) {
    //console.log(midiAccess);



    var inputs = midiAccess.inputs;

    var outputs = midiAccess.outputs;


    for (var input of midiAccess.inputs.values()) {
        // console.log(input.name)
        // var opt = input.name;
        // var el = document.createElement("option");
        // el.textContent = opt;
        // el.value = opt;
        // select.appendChild(el);
        input.onmidimessage = getMIDIMessage;
    }

}
/**
 * 
 * @param {*} midiMessage 
 */
function getMIDIMessage(midiMessage) {
    let midiPort = 0;
    //console.log(midiMessage.data)
    let me = new RNBO.MIDIEvent(device.context.currentTime, midiPort, midiMessage.data);
    device.scheduleEvent(me);

}
/**
 * 
 */
function onMIDIFailure() {
    console.log('Could not access your MIDI devices.');
}

/**
 * Creates event listeneg
 * @function file_buffer_load
 * @param {RNBO.device}
 * @param {AudioContext}
 * @return {void}
 */
function file_buffer_load(device, context) {
    const file_uploader = document.getElementById('recorder');

    file_uploader.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        //const url = URL.createObjectURL(file);

        const arrayBuf = await file.arrayBuffer();

        const audioBuf = await context.decodeAudioData(arrayBuf);

        await device.setDataBuffer('usr_buff', audioBuf)


    })

}

/**
 * 
 * @param {*} device 
 */
function keyboard(device) {
    // const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let midiPort = 0;
    const getElementByNote = (note) =>
        note && document.querySelector(`[note="${note}"]`);

    const keys = {
        A: { element: getElementByNote("C"), note: 60, octaveOffset: 0 },
        W: { element: getElementByNote("C#"), note: 61, octaveOffset: 0 },
        S: { element: getElementByNote("D"), note: 62, octaveOffset: 0 },
        E: { element: getElementByNote("D#"), note: 63, octaveOffset: 0 },
        D: { element: getElementByNote("E"), note: 64, octaveOffset: 0 },
        F: { element: getElementByNote("F"), note: 65, octaveOffset: 0 },
        T: { element: getElementByNote("F#"), note: 66, octaveOffset: 0 },
        G: { element: getElementByNote("G"), note: 67, octaveOffset: 0 },
        Y: { element: getElementByNote("G#"), note: 68, octaveOffset: 0 },
        H: { element: getElementByNote("A"), note: 69, octaveOffset: 1 },
        U: { element: getElementByNote("A#"), note: 70, octaveOffset: 1 },
        J: { element: getElementByNote("B"), note: 71, octaveOffset: 1 },
        K: { element: getElementByNote("C2"), note: 72, octaveOffset: 1 },
        O: { element: getElementByNote("C#2"), note: 73, octaveOffset: 1 },
        L: { element: getElementByNote("D2"), note: 74, octaveOffset: 1 },
        P: { element: getElementByNote("D#2"), note: 75, octaveOffset: 1 },
        semicolon: { element: getElementByNote("E2"), note: 76, octaveOffset: 1 }
    };

    const getMN = (note = "A", octave = 4) => {
        const A4 = 440;
        let N = 0;
        switch (note) {
            default:
            case "A":
                N = 0;
                break;
            case "A#":
            case "Bb":
                N = 1;
                break;
            case "B":
                N = 2;
                break;
            case "C":
                N = 3;
                break;
            case "C#":
            case "Db":
                N = 4;
                break;
            case "D":
                N = 5;
                break;
            case "D#":
            case "Eb":
                N = 6;
                break;
            case "E":
                N = 7;
                break;
            case "F":
                N = 8;
                break;
            case "F#":
            case "Gb":
                N = 9;
                break;
            case "G":
                N = 10;
                break;
            case "G#":
            case "Ab":
                N = 11;
                break;
        }
        N += 12 * (octave - 4);
        return A4 * Math.pow(2, N / 12);
    };

    const pressedNotes = new Map();
    let clickedKey = "";

    const playKey = (key) => {
        if (!keys[key]) {
            return;
        }

        //const freq = getHz(keys[key].note, (keys[key].octaveOffset || 0) + 3);

        // if (Number.isFinite(freq)) {
        //     osc.frequency.value = freq;
        // }
        console.log(keys[key].note)
        keys[key].element.classList.add("pressed");
        pressedNotes.set(key, keys[key].note);
        let me = new RNBO.MIDIEvent(device.context.currentTime, midiPort, [144, keys[key].note, 80]);
        device.scheduleEvent(me);
        //pressedNotes.get(key).start();
    };

    const stopKey = (key) => {
        if (!keys[key]) {
            return;
        }
        let me = new RNBO.MIDIEvent(device.context.currentTime, midiPort, [128, keys[key].note, 0]);
        device.scheduleEvent(me);

        keys[key].element.classList.remove("pressed");
        pressedNotes.delete(key);
        //const osc = pressedNotes.get(key);

        // if (osc) {
        //     setTimeout(() => {
        //         //osc.stop();
        //     }, 2000);

        //     
        // }
    };

    document.addEventListener("keydown", (e) => {
        const eventKey = e.key.toUpperCase();
        const key = eventKey === ";" ? "semicolon" : eventKey;

        if (!key || pressedNotes.get(key)) {
            return;
        }
        playKey(key);
    });

    document.addEventListener("keyup", (e) => {
        const eventKey = e.key.toUpperCase();
        const key = eventKey === ";" ? "semicolon" : eventKey;

        if (!key) {
            return;
        }
        stopKey(key);
    });

    for (const [key, { element }] of Object.entries(keys)) {
        element.addEventListener("mousedown", () => {
            playKey(key);
            clickedKey = key;
        });
    }

    document.addEventListener("mouseup", () => {
        stopKey(clickedKey);
    });

}


setup();


