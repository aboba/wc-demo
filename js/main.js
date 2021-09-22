'use strict';

var preferredResolution;
var preferredCodec ="VP8";
var mode = "L1T3";
var hw = "no-preference";
var streamWorker;
var constraints;
var log = document.querySelector('textarea');  
var connectButton = document.querySelector('#connect');
var stopButton = document.querySelector('#stop');
var codecButtons = document.querySelector('#codecButtons');
var resButtons = document.querySelector('#resButtons');
var modeButtons = document.querySelector('#modeButtons');
var hwButtons = document.querySelector('#hwButtons');
connectButton.disabled = false;
stopButton.disabled = true;

function getResValue(radio) {
  preferredResolution = radio.value;
  log.value += ' Resolution selected: ' + preferredResolution + '\n';
}

function getCodecValue(radio) {
  preferredCodec = radio.value;
  log.value += ' Codec selected: ' + preferredCodec + '\n';
}

function getModeValue(radio) {
  mode = radio.value;
  log.value += ' Mode selected: ' + mode + '\n';
}

function getHwValue(radio) {
  hw = radio.value;
  log.value += ' Hardware Acceleration preference: ' + hw + '\n';
}

function stop() {
  stopButton.disabled = true;
  connectButton.disabled = true;
  streamWorker.postMessage({ type: "stop" });
}

document.addEventListener('DOMContentLoaded', function(event) {
  log.value += 'DOM Content Loaded\n' ;

  if (typeof MediaStreamTrackProcessor === 'undefined' ||
      typeof MediaStreamTrackGenerator === 'undefined') {
    log.value +=
        'Your browser does not support the experimental Mediacapture-transform API.\n' +
        'Please launch with the --enable-blink-features=WebCodecs,MediaStreamInsertableStreams flag\n';
    return;
  }

  if (typeof WebTransport === 'undefined') {
    log.value +=
        'Your browser does not support the WebTransport API.\n';
    return;
  }

  // Create a new worker.
  streamWorker = new Worker("js/stream_worker.js");

  // Print messages from the worker in the text area.
  streamWorker.addEventListener('message', function(e) {
    log.value += 'Worker msg: ' + e.data + '\n';
  }, false);

  const qvgaConstraints   = { video: {width: {exact: 320},  height: {exact: 240}}};
  const vgaConstraints    = { video: {width: {exact: 640},  height: {exact: 480}}};
  const hdConstraints     = { video: {width: {exact: 1280}, height: {exact: 720}}};
  const fullHdConstraints = { video: {width: {exact: 1920}, height: {exact: 1080}}};
  const tv4KConstraints   = { video: {width: {exact: 3840}, height: {exact: 2160}}};
  const cinema4KConstraints = { video: {width: {exact: 4096}, height: {exact: 2160}}};
  const eightKConstraints = { video: {width: {exact: 7680}, height: {exact: 4320}}};

  stopButton.onclick = () => {
    log.value += 'Stop button clicked.\n';
    stop();
  }

  connectButton.onclick = () => {
    connectButton.disabled = true;
    stopButton.disabled = false;
    hwButtons.style.display = "none";
    codecButtons.style.display = "none";
    resButtons.style.display = "none";
    modeButtons.style.display = "none";

    switch(preferredResolution) {
       case "qvga":
         constraints = qvgaConstraints;
         log.value += "QVGA selected\n";
         break;
       case "vga":
         constraints = vgaConstraints;
         log.value += "VGA selected\n";
         break;
       case "hd":
         constraints = hdConstraints;
         log.value += "HD selected\n";
         break;
       case "full-hd":
         constraints = fullHdConstraints;
         log.value += "Full HD selected\n";
         break;
       case "tv4K":
         constraints = tv4KConstraints;
         log.value += "4K TV selected\n";
         break;
       case "cinema4K":
         constraints = cinema4KConstraints;
         log.value += "Cinema 4K selected\n";
         break;
       case "eightK":
         constraints = eightKConstraints;
         log.value += "8K selected\n";
         break;
       default:
         constraints = qvgaConstraints;
         log.value += "Default (QVGA) selected\n";
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

    // Create a MediaStreamTrackProcessor, which exposes frames from the track
    // as a ReadableStream of VideoFrames.
    var [track] = mediaStream.getVideoTracks();
    var ts = track.getSettings();
    var processor = new MediaStreamTrackProcessor(track);
    var inputStream = processor.readable;


    // Create a MediaStreamTrackGenerator, which exposes a track from a
    // WritableStream of VideoFrames.
    const generator = new MediaStreamTrackGenerator({kind: 'video'});
    const outputStream = generator.writable;
    document.getElementById('outputVideo').srcObject = new MediaStream([generator]);

    //Create video Encoder configuration
    const vConfig = {
       keyInterval: 150,
       resolutionScale: 1,
       framerateScale: 1.0,
       bitrate: 100000
    };

    const config = {
      alpha: "discard",
      latencyMode: "realtime",
      bitrateMode: "variable",
      codec: preferredCodec,
      width: ts.width/vConfig.resolutionScale,
      height: ts.height/vConfig.resolutionScale,
      hardwareAcceleration: hw,
      bitrate: vConfig.bitrate,
      framerate: ts.frameRate/vConfig.framerateScale,
      keyInterval: vConfig.keyInterval
    };

    if (mode != "L1T1") {
       config.scalabilityMode = mode;
    }

    switch(preferredCodec){
       case "H264":
          config.codec = "avc1.42001E";
          config.avc = { format: "annexb" };
          break;
       case "VP8":
          config.codec = "vp8";
          break;
       case "VP9":
           config.codec = "vp09.00.10.08";
           break;
       case "AV1":
           config.codec = "av01."
           log.value += ('AV1 Encoding not supported yet\n');
           stop();
           return;
    }

    // Transfer the readable stream to the worker, as well as other info from the user interface.
    // NOTE: transferring frameStream and reading it in the worker is more
    // efficient than reading frameStream here and transferring VideoFrames individually.
    streamWorker.postMessage({ type: "stream", config: config, url: url, streams: {input: inputStream, output: outputStream}}, [inputStream, outputStream]);

  } catch(e) {
     log.value += e.name + ": " + e.message; 
  }
}

}, false);
