

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
    const response = await fetch("export/granular-synth_v4.1.rnbopat.export.json");
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


    // (Optional) Automatically create sliders for the device parameters
    makeSliders(device);

    // (Optional) Create a form to send messages to RNBO inputs
    makeBufferSelector(device);

    // (Optional) Attach listeners to outports so you can log messages from the RNBO patcher
    // attachOutports(device);

    // (Optional) Load presets, if any
    // loadPresets(device, patcher);



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
    var i = 0;
    device.parameters.forEach(param => {
        //console.log(param.meta.hidden)
        for (i = 0; i < 10; i++) { //to only display first ten parameters
            ///i++;
            //console.log(param.steps)
            // Subpatchers also have params. If we want to expose top-level
            // params only, the best way to determine if a parameter is top level
            // or not is to exclude parameters with a '/' in them.
            // You can uncomment the following line if you don't want to include subpatcher params

            //if (param.id.includes("/")) return;

            // Create a label, an input slider and a value display
            let label = document.createElement("label");
            const knob = pureknob.createKnob(300, 300);
            let text = document.createElement("input");
            let sliderContainer = document.createElement("div");
            sliderContainer.appendChild(label);
            sliderContainer.appendChild(knob);
            sliderContainer.appendChild(text);

            // Add a name for the label
            label.setAttribute("name", param.name);
            label.setAttribute("for", param.name);
            label.setAttribute("class", "param-label");
            label.textContent = `${param.name} (${param.unit}): `;

            // Make each slider reflect its parameter
            knob.setProperty('angleStart', -0.75 * Math.PI);
            knob.setProperty('angleEnd', 0.75 * Math.PI);
            knob.setProperty('colorFG', '#88ff88');
            knob.setProperty('trackWidth', 0.4);
            knob.setProperty('valMin', param.min);
            knob.setProperty('valMax', param.max);

            // Set initial value.
            knob.setValue(param.min);
            // slider.setAttribute("type", "range");
            // slider.setAttribute("class", "param-slider");
            // slider.setAttribute("id", param.id);
            // slider.setAttribute("name", param.name);
            // slider.setAttribute("min", param.min);
            // slider.setAttribute("max", param.max);
            // if (param.steps > 1) {
            //     slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
            // } else {
            //     slider.setAttribute("step", (param.max - param.min) / 1000.0);
            // }
            // slider.setAttribute("value", param.value);

            // Make a settable text input display for the value
            text.setAttribute("value", param.value.toFixed(1) + ` ${param.unit}`);
            text.setAttribute("type", "text");

            // Make each slider control its parameter
            slider.addEventListener("pointerdown", () => {
                isDraggingSlider = true;
            });
            slider.addEventListener("pointerup", () => {
                isDraggingSlider = false;
                slider.value = param.value;
                text.value = param.value.toFixed(1) + ` ${param.unit}`;
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
                        text.value = param.value + ` ${param.unit}`;
                    } else {
                        newValue = Math.min(newValue, param.max);
                        newValue = Math.max(newValue, param.min);
                        text.value = newValue + ` ${param.unit}`;
                        param.value = newValue;
                    }
                }
            });


            // Store the slider and text by name so we can access them later
            //uiElements[param.name] = { slider, text };

            // Add the slider element
            pdiv.appendChild(sliderContainer);
        }
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
    // let inportTag = null;

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
        input.onmidimessage = getMIDIMessage;
    }

}
/**
 * 
 * @param {*} midiMessage 
 */
function getMIDIMessage(midiMessage) {
    let midiPort = 0;
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

        console.log(keys[key].note)
        keys[key].element.classList.add("pressed");
        pressedNotes.set(key, keys[key].note);
        let me = new RNBO.MIDIEvent(device.context.currentTime, midiPort, [144, keys[key].note, 80]);
        device.scheduleEvent(me);

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


function PureKnob() {

    /*
     * Creates a bar graph element.
     */
    this.createBarGraph = function (width, height) {
        const heightString = height.toString();
        const widthString = width.toString();
        const canvas = document.createElement('canvas');
        const div = document.createElement('div');
        div.style.display = 'inline-block';
        div.style.height = heightString + 'px';
        div.style.position = 'relative';
        div.style.textAlign = 'center';
        div.style.width = widthString + 'px';
        div.appendChild(canvas);

        /*
         * The bar graph object.
         */
        const graph = {
            '_canvas': canvas,
            '_div': div,
            '_height': height,
            '_width': width,

            /*
             * Properties of this bar graph.
             */
            '_properties': {
                'colorBG': '#181818',
                'colorFG': '#ff8800',
                'colorMarkers': '#888888',
                'markerStart': 0,
                'markerEnd': 100,
                'markerStep': 20,
                'trackWidth': 0.5,
                'valMin': 0,
                'valMax': 100,
                'valPeaks': [],
                'val': 0
            },

            /*
             * Returns the peak values for this bar graph.
             */
            'getPeaks': function () {
                const properties = this._properties;
                const peaks = properties.valPeaks;
                const numPeaks = peaks.length;
                const peaksCopy = [];

                /*
                 * Iterate over the peak values and copy them.
                 */
                for (let i = 0; i < numPeaks; i++) {
                    const peak = peaks[i];
                    peaksCopy.push(peak);
                }

                return peaksCopy;
            },

            /*
             * Returns the value of a property of this bar graph.
             */
            'getProperty': function (key) {
                const properties = this._properties;
                const value = properties[key];
                return value;
            },

            /*
             * Returns the current value of the bar graph.
             */
            'getValue': function () {
                const properties = this._properties;
                const value = properties.val;
                return value;
            },

            /*
             * Return the DOM node representing this bar graph.
             */
            'node': function () {
                const div = this._div;
                return div;
            },

            /*
             * Redraw the bar graph on the canvas.
             */
            'redraw': function () {
                this.resize();
                const properties = this._properties;
                const colorTrack = properties.colorBG;
                const colorFilling = properties.colorFG;
                const colorMarkers = properties.colorMarkers;
                const markerStart = properties.markerStart;
                const markerEnd = properties.markerEnd;
                const markerStep = properties.markerStep;
                const trackWidth = properties.trackWidth;
                const valMin = properties.valMin;
                const valMax = properties.valMax;
                const peaks = properties.valPeaks;
                const value = properties.val;
                const height = this._height;
                const width = this._width;
                const lineWidth = Math.round(trackWidth * height);
                const halfWidth = 0.5 * lineWidth;
                const centerY = 0.5 * height;
                const lineTop = centerY - halfWidth;
                const lineBottom = centerY + halfWidth;
                const relativeValue = (value - valMin) / (valMax - valMin);
                const fillingEnd = width * relativeValue;
                const numPeaks = peaks.length;
                const canvas = this._canvas;
                const ctx = canvas.getContext('2d');

                /*
                 * Clear the canvas.
                 */
                ctx.clearRect(0, 0, width, height);

                /*
                 * Check if markers should be drawn.
                 */
                if ((markerStart !== null) & (markerEnd !== null) & (markerStep !== null) & (markerStep !== 0)) {
                    ctx.lineCap = 'butt';
                    ctx.lineWidth = '2';
                    ctx.strokeStyle = colorMarkers;

                    /*
                     * Draw the markers.
                     */
                    for (let v = markerStart; v <= markerEnd; v += markerStep) {
                        const relativePos = (v - valMin) / (valMax - valMin);
                        const pos = Math.round(width * relativePos);
                        ctx.beginPath();
                        ctx.moveTo(pos, 0);
                        ctx.lineTo(pos, height);
                        ctx.stroke();
                    }

                }

                /*
                 * Draw the track.
                 */
                ctx.beginPath();
                ctx.rect(0, lineTop, width, lineWidth);
                ctx.fillStyle = colorTrack;
                ctx.fill();

                /*
                 * Draw the filling.
                 */
                ctx.beginPath();
                ctx.rect(0, lineTop, fillingEnd, lineWidth);
                ctx.fillStyle = colorFilling;
                ctx.fill();

                /*
                 * Prepare for drawing the peaks.
                 */
                ctx.strokeStyle = colorFilling;

                /*
                 * Draw the peaks.
                 */
                for (let i = 0; i < numPeaks; i++) {
                    const peak = peaks[i];
                    const relativePeak = (peak - valMin) / (valMax - valMin);
                    const pos = Math.round(width * relativePeak);
                    ctx.beginPath();
                    ctx.moveTo(pos, lineTop);
                    ctx.lineTo(pos, lineBottom);
                    ctx.stroke();
                }

            },

            /*
             * This is called as the canvas or the surrounding DIV is resized.
             */
            'resize': function () {
                const canvas = this._canvas;
                const ctx = canvas.getContext('2d');
                const scale = window.devicePixelRatio;
                canvas.style.height = this._height + 'px';
                canvas.style.width = this._width + 'px';
                canvas.height = Math.floor(this._height * scale);
                canvas.width = Math.floor(this._width * scale);
                ctx.scale(scale, scale);
            },

            /*
             * Sets the peak values of this bar graph.
             */
            'setPeaks': function (peaks) {
                const properties = this._properties;
                const peaksCopy = [];
                const numPeaks = peaks.length;

                /*
                 * Iterate over the peak values and append them to the array.
                 */
                for (let i = 0; i < numPeaks; i++) {
                    const peak = peaks[i];
                    peaksCopy.push(peak);
                }

                this.setProperty('valPeaks', peaksCopy);
            },

            /*
             * Sets the value of a property of this bar graph.
             */
            'setProperty': function (key, value) {
                this._properties[key] = value;
                this.redraw();
            },

            /*
             * Sets the value of this bar graph.
             */
            'setValue': function (value) {
                const properties = this._properties;
                const valMin = properties.valMin;
                const valMax = properties.valMax;

                /*
                 * Clamp the actual value into the [valMin; valMax] range.
                 */
                if (value < valMin) {
                    value = valMin;
                } else if (value > valMax) {
                    value = valMax;
                }

                value = Math.round(value);
                this.setProperty('val', value);
            }

        };

        /*
         * This is called when the size of the canvas changes.
         */
        const resizeListener = function (e) {
            graph.redraw();
        };

        /*
         * Listen for device pixel ratio changes.
         */
        const updatePixelRatio = function () {
            const pixelRatio = window.devicePixelRatio;
            graph.redraw();
            const pixelRatioString = pixelRatio.toString();
            const matcher = '(resolution:' + pixelRatioString + 'dppx)';

            const params = {
                'once': true
            };

            window.matchMedia(matcher).addEventListener('change', updatePixelRatio, params);
        }

        canvas.addEventListener('resize', resizeListener);
        updatePixelRatio();
        return graph;
    }

    /*
     * Creates a knob element.
     */
    this.createKnob = function (width, height) {
        const heightString = height.toString();
        const widthString = width.toString();
        const smaller = width < height ? width : height;
        const fontSize = 0.2 * smaller;
        const fontSizeString = fontSize.toString();
        const canvas = document.createElement('canvas');
        const div = document.createElement('div');

        div.style.display = 'inline-block';
        div.style.height = heightString + 'px';
        div.style.position = 'relative';
        div.style.textAlign = 'center';
        div.style.width = widthString + 'px';
        div.appendChild(canvas);

        const input = document.createElement('input');
        input.style.appearance = 'textfield';
        input.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        input.style.border = 'none';
        input.style.color = '#ff8800';
        input.style.fontFamily = 'sans-serif';
        input.style.fontSize = fontSizeString + 'px';
        input.style.height = heightString + 'px';
        input.style.margin = 'auto';
        input.style.padding = '0px';
        input.style.textAlign = 'center';
        input.style.width = widthString + 'px';

        const inputMode = document.createAttribute('inputmode');
        inputMode.value = 'numeric';
        input.setAttributeNode(inputMode);

        const inputDiv = document.createElement('div');
        inputDiv.style.bottom = '0px';
        inputDiv.style.display = 'none';
        inputDiv.style.left = '0px';
        inputDiv.style.position = 'absolute';
        inputDiv.style.right = '0px';
        inputDiv.style.top = '0px';
        inputDiv.appendChild(input);
        div.appendChild(inputDiv);

        /*
         * The knob object.
         */
        const knob = {
            '_canvas': canvas,
            '_div': div,
            '_height': height,
            '_input': input,
            '_inputDiv': inputDiv,
            '_listeners': [],
            '_mousebutton': false,
            '_previousVal': 0,
            '_timeout': null,
            '_timeoutDoubleTap': null,
            '_touchCount': 0,
            '_width': width,

            /*
             * Notify listeners about value changes.
             */
            '_notifyUpdate': function () {
                const properties = this._properties;
                const value = properties.val;
                const listeners = this._listeners;
                const numListeners = listeners.length;

                /*
                 * Call all listeners.
                 */
                for (let i = 0; i < numListeners; i++) {
                    const listener = listeners[i];

                    /*
                     * Call listener, if it exists.
                     */
                    if (listener !== null) {
                        listener(this, value);
                    }

                }

            },

            /*
             * Properties of this knob.
             */
            '_properties': {
                'angleEnd': 2.0 * Math.PI,
                'angleOffset': -0.5 * Math.PI,
                'angleStart': 0,
                'colorBG': '#181818',
                'colorFG': '#ff8800',
                'colorLabel': '#ffffff',
                'fnStringToValue': function (string) { return parseInt(string); },
                'fnValueToString': function (value) { return value.toString(); },
                'label': null,
                'needle': false,
                'readonly': false,
                'textScale': 1.0,
                'trackWidth': 0.4,
                'valMin': 0,
                'valMax': 100,
                'val': 0
            },

            /*
             * Abort value change, restoring the previous value.
             */
            'abort': function () {
                const previousValue = this._previousVal;
                const properties = this._properties;
                properties.val = previousValue;
                this.redraw();
            },

            /*
             * Adds an event listener.
             */
            'addListener': function (listener) {
                const listeners = this._listeners;
                listeners.push(listener);
            },

            /*
             * Commit value, indicating that it is no longer temporary.
             */
            'commit': function () {
                const properties = this._properties;
                const value = properties.val;
                this._previousVal = value;
                this.redraw();
                this._notifyUpdate();
            },

            /*
             * Returns the value of a property of this knob.
             */
            'getProperty': function (key) {
                const properties = this._properties;
                const value = properties[key];
                return value;
            },

            /*
             * Returns the current value of the knob.
             */
            'getValue': function () {
                const properties = this._properties;
                const value = properties.val;
                return value;
            },

            /*
             * Return the DOM node representing this knob.
             */
            'node': function () {
                const div = this._div;
                return div;
            },

            /*
             * Redraw the knob on the canvas.
             */
            'redraw': function () {
                this.resize();
                const properties = this._properties;
                const needle = properties.needle;
                const angleStart = properties.angleStart;
                const angleOffset = properties.angleOffset;
                const angleEnd = properties.angleEnd;
                const actualStart = angleStart + angleOffset;
                const actualEnd = angleEnd + angleOffset;
                const label = properties.label;
                const value = properties.val;
                const valueToString = properties.fnValueToString;
                const valueStr = valueToString(value);
                const valMin = properties.valMin;
                const valMax = properties.valMax;
                const relValue = (value - valMin) / (valMax - valMin);
                const relAngle = relValue * (angleEnd - angleStart);
                const angleVal = actualStart + relAngle;
                const colorTrack = properties.colorBG;
                const colorFilling = properties.colorFG;
                const colorLabel = properties.colorLabel;
                const textScale = properties.textScale;
                const trackWidth = properties.trackWidth;
                const height = this._height;
                const width = this._width;
                const smaller = width < height ? width : height;
                const centerX = 0.5 * width;
                const centerY = 0.5 * height;
                const radius = 0.4 * smaller;
                const labelY = centerY + radius;
                const lineWidth = Math.round(trackWidth * radius);
                const labelSize = Math.round(0.8 * lineWidth);
                const labelSizeString = labelSize.toString();
                const fontSize = (0.2 * smaller) * textScale;
                const fontSizeString = fontSize.toString();
                const canvas = this._canvas;
                const ctx = canvas.getContext('2d');

                /*
                 * Clear the canvas.
                 */
                ctx.clearRect(0, 0, width, height);

                /*
                 * Draw the track.
                 */
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, actualStart, actualEnd);
                ctx.lineCap = 'butt';
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = colorTrack;
                ctx.stroke();

                /*
                 * Draw the filling.
                 */
                ctx.beginPath();

                /*
                 * Check if we're in needle mode.
                 */
                if (needle) {
                    ctx.arc(centerX, centerY, radius, angleVal - 0.1, angleVal + 0.1);
                } else {
                    ctx.arc(centerX, centerY, radius, actualStart, angleVal);
                }

                ctx.lineCap = 'butt';
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = colorFilling;
                ctx.stroke();

                /*
                 * Draw the number.
                 */
                ctx.font = fontSizeString + 'px sans-serif';
                ctx.fillStyle = colorFilling;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(valueStr, centerX, centerY);

                /*
                 * Draw the label
                 */
                if (label !== null) {
                    ctx.font = labelSizeString + 'px sans-serif';
                    ctx.fillStyle = colorLabel;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, centerX, labelY);
                }

                /*
                 * Set the color and font size of the input element.
                 */
                const elemInput = this._input;
                elemInput.style.color = colorFilling;
                elemInput.style.fontSize = fontSizeString + 'px';
            },

            /*
             * This is called as the canvas or the surrounding DIV is resized.
             */
            'resize': function () {
                const canvas = this._canvas;
                const ctx = canvas.getContext('2d');
                const scale = window.devicePixelRatio;
                canvas.style.height = this._height + 'px';
                canvas.style.width = this._width + 'px';
                canvas.height = Math.floor(this._height * scale);
                canvas.width = Math.floor(this._width * scale);
                ctx.scale(scale, scale);
            },

            /*
             * Sets the value of a property of this knob.
             */
            'setProperty': function (key, value) {
                this._properties[key] = value;
                this.redraw();
            },

            /*
             * Sets the value of this knob.
             */
            'setValue': function (value) {
                this.setValueFloating(value);
                this.commit();
            },

            /*
             * Sets floating (temporary) value of this knob.
             */
            'setValueFloating': function (value) {
                const properties = this._properties;
                const valMin = properties.valMin;
                const valMax = properties.valMax;

                /*
                 * Clamp the actual value into the [valMin; valMax] range.
                 */
                if (value < valMin) {
                    value = valMin;
                } else if (value > valMax) {
                    value = valMax;
                }

                value = Math.round(value);
                this.setProperty('val', value);
            }

        };

        /*
         * Convert mouse event to value.
         */
        const mouseEventToValue = function (e, properties) {
            const canvas = e.target;
            const width = canvas.scrollWidth;
            const height = canvas.scrollHeight;
            const centerX = 0.5 * width;
            const centerY = 0.5 * height;
            const x = e.offsetX;
            const y = e.offsetY;
            const relX = x - centerX;
            const relY = y - centerY;
            const angleStart = properties.angleStart;
            const angleEnd = properties.angleEnd;
            const angleDiff = angleEnd - angleStart;
            let angle = Math.atan2(relX, -relY) - angleStart;
            const twoPi = 2.0 * Math.PI;

            /*
             * Make negative angles positive.
             */
            if (angle < 0) {

                if (angleDiff >= twoPi) {
                    angle += twoPi;
                } else {
                    angle = 0;
                }

            }

            const valMin = properties.valMin;
            const valMax = properties.valMax;
            let value = ((angle / angleDiff) * (valMax - valMin)) + valMin;

            /*
             * Clamp values into valid interval.
             */
            if (value < valMin) {
                value = valMin;
            } else if (value > valMax) {
                value = valMax;
            }

            return value;
        };

        /*
         * Convert touch event to value.
         */
        const touchEventToValue = function (e, properties) {
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            const offsetX = rect.left;
            const offsetY = rect.top;
            const width = canvas.scrollWidth;
            const height = canvas.scrollHeight;
            const centerX = 0.5 * width;
            const centerY = 0.5 * height;
            const touches = e.targetTouches;
            let touch = null;

            /*
             * If there are touches, extract the first one.
             */
            if (touches.length > 0) {
                touch = touches.item(0);
            }

            let x = 0.0;
            let y = 0.0;

            /*
             * If a touch was extracted, calculate coordinates relative to
             * the element position.
             */
            if (touch !== null) {
                const touchX = touch.clientX;
                x = touchX - offsetX;
                const touchY = touch.clientY;
                y = touchY - offsetY;
            }

            const relX = x - centerX;
            const relY = y - centerY;
            const angleStart = properties.angleStart;
            const angleEnd = properties.angleEnd;
            const angleDiff = angleEnd - angleStart;
            const twoPi = 2.0 * Math.PI;
            let angle = Math.atan2(relX, -relY) - angleStart;

            /*
             * Make negative angles positive.
             */
            if (angle < 0) {

                if (angleDiff >= twoPi) {
                    angle += twoPi;
                } else {
                    angle = 0;
                }

            }

            const valMin = properties.valMin;
            const valMax = properties.valMax;
            let value = ((angle / angleDiff) * (valMax - valMin)) + valMin;

            /*
             * Clamp values into valid interval.
             */
            if (value < valMin) {
                value = valMin;
            } else if (value > valMax) {
                value = valMax;
            }

            return value;
        };

        /*
         * Show input element on double click.
         */
        const doubleClickListener = function (e) {
            const properties = knob._properties;
            const readonly = properties.readonly;

            /*
             * If knob is not read-only, display input element.
             */
            if (!readonly) {
                e.preventDefault();
                const inputDiv = knob._inputDiv;
                inputDiv.style.display = 'block';
                const inputElem = knob._input;
                inputElem.focus();
                knob.redraw();
            }

        };

        /*
         * This is called when the mouse button is depressed.
         */
        const mouseDownListener = function (e) {
            const btn = e.buttons;

            /*
             * It is a left-click.
             */
            if (btn === 1) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read-only, process mouse event.
                 */
                if (!readonly) {
                    e.preventDefault();
                    const val = mouseEventToValue(e, properties);
                    knob.setValueFloating(val);
                }

                knob._mousebutton = true;
            }

            /*
             * It is a middle click.
             */
            if (btn === 4) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read-only, display input element.
                 */
                if (!readonly) {
                    e.preventDefault();
                    const inputDiv = knob._inputDiv;
                    inputDiv.style.display = 'block';
                    const inputElem = knob._input;
                    inputElem.focus();
                    knob.redraw();
                }

            }

        };

        /*
         * This is called when the mouse cursor is moved.
         */
        const mouseMoveListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Only process event, if mouse button is depressed.
             */
            if (btn) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read-only, process mouse event.
                 */
                if (!readonly) {
                    e.preventDefault();
                    const val = mouseEventToValue(e, properties);
                    knob.setValueFloating(val);
                }

            }

        };

        /*
         * This is called when the mouse button is released.
         */
        const mouseUpListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Only process event, if mouse button was depressed.
             */
            if (btn) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read only, process mouse event.
                 */
                if (!readonly) {
                    e.preventDefault();
                    const val = mouseEventToValue(e, properties);
                    knob.setValue(val);
                }

            }

            knob._mousebutton = false;
        };

        /*
         * This is called when the drag action is canceled.
         */
        const mouseCancelListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Abort action if mouse button was depressed.
             */
            if (btn) {
                knob.abort();
                knob._mousebutton = false;
            }

        };

        /*
         * This is called when a user touches the element.
         */
        const touchStartListener = function (e) {
            const properties = knob._properties;
            const readonly = properties.readonly;

            /*
             * If knob is not read-only, process touch event.
             */
            if (!readonly) {
                const touches = e.targetTouches;
                const numTouches = touches.length;
                const singleTouch = (numTouches === 1);

                /*
                 * Only process single touches, not multi-touch
                 * gestures.
                 */
                if (singleTouch) {
                    knob._mousebutton = true;

                    /*
                     * If this is the first touch, bind double tap
                     * interval.
                     */
                    if (knob._touchCount === 0) {

                        /*
                         * This is executed when the double tap
                         * interval times out.
                         */
                        const f = function () {

                            /*
                             * If control was tapped exactly
                             * twice, enable on-screen keyboard.
                             */
                            if (knob._touchCount === 2) {
                                const properties = knob._properties;
                                const readonly = properties.readonly;

                                /*
                                 * If knob is not read-only,
                                 * display input element.
                                 */
                                if (!readonly) {
                                    e.preventDefault();
                                    const inputDiv = knob._inputDiv;
                                    inputDiv.style.display = 'block';
                                    const inputElem = knob._input;
                                    inputElem.focus();
                                    knob.redraw();
                                }

                            }

                            knob._touchCount = 0;
                        };

                        let timeout = knob._timeoutDoubleTap;
                        window.clearTimeout(timeout);
                        timeout = window.setTimeout(f, 500);
                        knob._timeoutDoubleTap = timeout;
                    }

                    knob._touchCount++;
                    const val = touchEventToValue(e, properties);
                    knob.setValueFloating(val);
                }

            }

        };

        /*
         * This is called when a user moves a finger on the element.
         */
        var touchMoveListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Only process event, if mouse button is depressed.
             */
            if (btn) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read-only, process touch event.
                 */
                if (!readonly) {
                    const touches = e.targetTouches;
                    const numTouches = touches.length;
                    const singleTouch = (numTouches === 1);

                    /*
                     * Only process single touches, not multi-touch
                     * gestures.
                     */
                    if (singleTouch) {
                        e.preventDefault();
                        const val = touchEventToValue(e, properties);
                        knob.setValueFloating(val);
                    }

                }

            }

        };

        /*
         * This is called when a user lifts a finger off the element.
         */
        const touchEndListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Only process event, if mouse button was depressed.
             */
            if (btn) {
                const properties = knob._properties;
                const readonly = properties.readonly;

                /*
                 * If knob is not read only, process touch event.
                 */
                if (!readonly) {
                    const touches = e.targetTouches;
                    const numTouches = touches.length;
                    const noMoreTouches = (numTouches === 0);

                    /*
                     * Only commit value after the last finger has
                     * been lifted off.
                     */
                    if (noMoreTouches) {
                        e.preventDefault();
                        knob._mousebutton = false;
                        knob.commit();
                    }

                }

            }

            knob._mousebutton = false;
        };

        /*
         * This is called when a user cancels a touch action.
         */
        const touchCancelListener = function (e) {
            const btn = knob._mousebutton;

            /*
             * Abort action if mouse button was depressed.
             */
            if (btn) {
                knob.abort();
                knob._touchCount = 0;
                const timeout = knob._timeoutDoubleTap;
                window.clearTimeout(timeout);
            }

            knob._mousebutton = false;
        };

        /*
         * This is called when the size of the canvas changes.
         */
        const resizeListener = function (e) {
            knob.redraw();
        };

        /*
         * This is called when the mouse wheel is moved.
         */
        const scrollListener = function (e) {
            const readonly = knob.getProperty('readonly');

            /*
             * If knob is not read only, process mouse wheel event.
             */
            if (!readonly) {
                e.preventDefault();
                const delta = e.deltaY;
                const direction = delta > 0 ? 1 : (delta < 0 ? -1 : 0);
                let val = knob.getValue();
                val += direction;
                knob.setValueFloating(val);

                /*
                 * Perform delayed commit.
                 */
                const commit = function () {
                    knob.commit();
                };

                let timeout = knob._timeout;
                window.clearTimeout(timeout);
                timeout = window.setTimeout(commit, 250);
                knob._timeout = timeout;
            }

        };

        /*
         * This is called when the user presses a key on the keyboard.
         */
        const keyDownListener = function (e) {
            const k = e.key;

            /*
             * Hide input element when user presses enter or escape.
             */
            if ((k === 'Enter') || (k === 'Escape')) {
                const inputDiv = knob._inputDiv;
                inputDiv.style.display = 'none';
                const input = e.target;

                /*
                 * Only evaluate value when user pressed enter.
                 */
                if (k === 'Enter') {
                    const properties = knob._properties;
                    const value = input.value;
                    const stringToValue = properties.fnStringToValue;
                    const val = stringToValue(value);
                    const valid = isFinite(val);

                    /*
                     * Check if input is a valid number.
                     */
                    if (valid) {
                        knob.setValue(val);
                    }

                }

                input.value = '';
            }

        };

        /*
         * Listen for device pixel ratio changes.
         */
        const updatePixelRatio = function () {
            const pixelRatio = window.devicePixelRatio;
            knob.redraw();
            const pixelRatioString = pixelRatio.toString();
            const matcher = '(resolution:' + pixelRatioString + 'dppx)';

            const params = {
                'once': true
            };

            window.matchMedia(matcher).addEventListener('change', updatePixelRatio, params);
        }

        canvas.addEventListener('dblclick', doubleClickListener);
        canvas.addEventListener('mousedown', mouseDownListener);
        canvas.addEventListener('mouseleave', mouseCancelListener);
        canvas.addEventListener('mousemove', mouseMoveListener);
        canvas.addEventListener('mouseup', mouseUpListener);
        canvas.addEventListener('resize', resizeListener);
        canvas.addEventListener('touchstart', touchStartListener);
        canvas.addEventListener('touchmove', touchMoveListener);
        canvas.addEventListener('touchend', touchEndListener);
        canvas.addEventListener('touchcancel', touchCancelListener);
        canvas.addEventListener('wheel', scrollListener);
        input.addEventListener('keydown', keyDownListener);
        updatePixelRatio();
        return knob;
    };

}


setup();


