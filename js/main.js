'use strict';

var preferredResolution;
let bitrate = 1000000;
var preferredCodec ="VP8";
var mode = "L1T3";
var hw = "no-preference";
var streamWorker;
var constraints;
var inputStream, outputStream;
var rate = document.querySelector('#rate');
var connectButton = document.querySelector('#connect');
var stopButton = document.querySelector('#stop');
var codecButtons = document.querySelector('#codecButtons');
var resButtons = document.querySelector('#resButtons');
var modeButtons = document.querySelector('#modeButtons');
var hwButtons = document.querySelector('#hwButtons');
connectButton.disabled = false;
stopButton.disabled = true;

function addToEventLog(text, severity = 'info') {
  let log = document.querySelector('textarea');
  log.value += 'log-' + severity + ': ' + text + '\n';
}

function getResValue(radio) {
  preferredResolution = radio.value;
  addToEventLog('Resolution selected: ' + preferredResolution);
}

function getCodecValue(radio) {
  preferredCodec = radio.value;
  addToEventLog('Codec selected: ' + preferredCodec);
}

function getModeValue(radio) {
  mode = radio.value;
  addToEventLog('Mode selected: ' + mode);
}

function getHwValue(radio) {
  hw = radio.value;
  addToEventLog('Hardware Acceleration preference: ' + hw);
}

function stop() {
  stopButton.disabled = true;
  connectButton.disabled = true;
  streamWorker.postMessage({ type: "stop" });
  inputStream.cancel();
  outputStream.abort(); 
  addToEventLog('stop(): input stream cancelled and output stream aborted');
}

document.addEventListener('DOMContentLoaded', function(event) {
  addToEventLog('DOM Content Loaded');

  if (typeof MediaStreamTrackProcessor === 'undefined' ||
      typeof MediaStreamTrackGenerator === 'undefined') {
    addToEventLog('Your browser does not support the experimental Mediacapture-transform API.\n' +
        'Please launch with the --enable-blink-features=WebCodecs,MediaStreamInsertableStreams flag','fatal');
    return;
  }

  if (typeof WebTransport === 'undefined') {
    addToEventLog('Your browser does not support the WebTransport API.', 'fatal');
    return;
  }

  // Create a new worker.
  streamWorker = new Worker("js/stream_worker.js");

  // Print messages from the worker in the text area.
  streamWorker.addEventListener('message', function(e) {
    addToEventLog('Worker msg: ' + e.data.text, e.data.severity);
  }, false);

  const qvgaConstraints   = { video: {width: {exact: 320},  height: {exact: 240}}};
  const vgaConstraints    = { video: {width: {exact: 640},  height: {exact: 480}}};
  const hdConstraints     = { video: {width: {exact: 1280}, height: {exact: 720}}};
  const fullHdConstraints = { video: {width: {exact: 1920}, height: {exact: 1080}}};
  const tv4KConstraints   = { video: {width: {exact: 3840}, height: {exact: 2160}}};
  const cinema4KConstraints = { video: {width: {exact: 4096}, height: {exact: 2160}}};
  const eightKConstraints = { video: {width: {exact: 7680}, height: {exact: 4320}}};

  stopButton.onclick = () => {
    addToEventLog('Stop button clicked.');
    stop();
  }

  connectButton.onclick = () => {
    connectButton.disabled = true;
    stopButton.disabled = false;
    hwButtons.style.display = "none";
    codecButtons.style.display = "none";
    resButtons.style.display = "none";
    modeButtons.style.display = "none";
    rateInput.style.display = "none";

    switch(preferredResolution) {
       case "qvga":
         constraints = qvgaConstraints;
         addToEventLog('QVGA selected');
         break;
       case "vga":
         constraints = vgaConstraints;
         addToEventLog('VGA selected');
         break;
       case "hd":
         constraints = hdConstraints;
         addToEventLog('HD selected');
         break;
       case "full-hd":
         constraints = fullHdConstraints;
         addToEventLog('Full HD selected');
         break;
       case "tv4K":
         constraints = tv4KConstraints;
         addToEventLog('4K TV selected');
         break;
       case "cinema4K":
         constraints = cinema4KConstraints;
         addToEventLog('Cinema 4K selected');
         break;
       case "eightK":
         constraints = eightKConstraints;
         addToEventLog('8K selected');
         break;
       default:
         constraints = qvgaConstraints;
         addToEventLog('Default (QVGA) selected');
         break;
    }
    getMedia(constraints);
}

async function getMedia(constraints) {
  try {
    // Get a MediaStream from the webcam.
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Connect the webcam stream to the video element.
    document.getElementById('inputVideo').srcObject = mediaStream;

    // Collect the WebTransport URL
    const url = document.getElementById('url').value;

    // Collect the bitrate
    const rate = document.getElementById('rate').value;

    // Create a MediaStreamTrackProcessor, which exposes frames from the track
    // as a ReadableStream of VideoFrames.
    let [track] = mediaStream.getVideoTracks();
    let ts = track.getSettings();
    const processor = new MediaStreamTrackProcessor(track);
    inputStream = processor.readable;

    // Create a MediaStreamTrackGenerator, which exposes a track from a
    // WritableStream of VideoFrames.
    const generator = new MediaStreamTrackGenerator({kind: 'video'});
    outputStream = generator.writable;
    document.getElementById('outputVideo').srcObject = new MediaStream([generator]);

    //Create video Encoder configuration
    const vConfig = {
       keyInterval: 140,
       resolutionScale: 1,
       framerateScale: 1.0,
    };
   
    let ssrcArr = new Uint32Array(1);
    window.crypto.getRandomValues(ssrcArr);
    const ssrc = ssrcArr[0];
  
    const config = {
      alpha: "discard",
      latencyMode: "realtime",
      bitrateMode: "variable",
      codec: preferredCodec,
      width: ts.width/vConfig.resolutionScale,
      height: ts.height/vConfig.resolutionScale,
      hardwareAcceleration: hw,
      bitrate: rate, 
      framerate: ts.frameRate/vConfig.framerateScale,
      keyInterval: vConfig.keyInterval,
      ssrc:  ssrc
    };

    if (mode != "L1T1") {
       config.scalabilityMode = mode;
    }

    switch(preferredCodec){
       case "H264":
          config.codec = "avc1.42001E";
          config.avc = { format: "annexb" };
          config.pt = 1;
          break;
       case "VP8":
          config.codec = "vp8";
          config.pt = 2;
          break;
       case "VP9":
           config.codec = "vp09.00.10.08";
           config.pt = 3;
           break;
       case "AV1":
           config.codec = "av01."
           config.pt = 4;
           addToEventLog('AV1 Encoding not supported yet', 'fatal');
           stop();
           return;
    }
    

    // Transfer the readable stream to the worker, as well as other info from the user interface.
    // NOTE: transferring frameStream and reading it in the worker is more
    // efficient than reading frameStream here and transferring VideoFrames individually.
    streamWorker.postMessage({ type: "stream", config: config, url: url, streams: {input: inputStream, output: outputStream}}, [inputStream, outputStream]);

  } catch(e) {
     addToEventLog(e.name + ": " + e.message, 'fatal');
  }
}

}, false);
