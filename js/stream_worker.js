'use strict';

let encoder, decoder, pl, transport;

self.addEventListener('message', async function(e) {
  // In this demo, we expect at most two messages, one of each type.
  var type = e.data.type;

  if (type == "stop") {
    self.postMessage({text: 'Stop message received.'});
    pl.stop();
    return;
  } else if (type !== "stream"){
    self.postMessage({severity: 'fatal', text: 'Invalid message received.'});
    return;
  }
  // We received a "stream" event

  self.postMessage({text: 'Stream event received.'});

  // Create WebTransport
  try {
    transport = new WebTransport(e.data.url);
    self.postMessage({text: 'Initiating connection...'});
  } catch (e) {
    self.postMessage({severity: 'fatal', text: 'Failed to create connection object: ' + e.message});
    return;
  }

  try {
    await transport.ready;
    self.postMessage({text: 'Connection ready.'});
    pl = new pipeline(e.data, transport);
    pl.start(); 
  } catch (e) {
    self.postMessage({severity: 'fatal', text: 'Connection failed: ' + e.message})
    return;
  }

  try {
    await transport.closed;
    self.postMessage({text: 'Connection closed normally.'});
  } catch (e) {
    self.postMessage({severity: 'fatal', text: 'Connection closed abruptly: ' + e.message});
    pl.stop();
    return;
  } 

}, false);

class pipeline {
   constructor(eventData, transport)
   {
     this.stopped = false;
     this.transport = transport;
     this.inputStream = eventData.streams.input;
     this.outputStream = eventData.streams.output;
     this.config = eventData.config;
   }

/*
Header format:
                     1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|1 1 0 0 0 0 0 0|       PT      |S|E|I|D|B| TID |    LID        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      keyframe index                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      deltaframe index                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      timestamp...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      timestamp                                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         SSRC                                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Payload...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

PT = payload type:
  x00 = reserved
  x01 = H.264
  x02 = VP8
  x03 = VP9
  x04 = AV1
S, E, I, D, B, TID, LID defined in draft-ietf-avtext-framemarking
   I = 1 means chunk.type == 'key', 0 means chunk.type == 'delta'
   TID = chunk.temporalLayerId
   LID = 0 (no support for spatial scalability)
keyframe index = how many keyframes have been sent
deltaframe index = how many delta frames since the last keyframe
timestamp = chunk.timestamp
SSRC = this.config.ssrc
*/

   Serialize(self, config) {
     return new TransformStream({
       start (controller) {
       },
       transform(chunk, controller) {
/*
       const writeUInt32 = function(arr, pos, val)
       {
           let view = new DataView(arr);
           view.setUint32(pos, val, false);
       };
       const writeUInt64 = function(arr, pos, val)
       {
           let view = new DataView(arr);
           view.setBigUint64(pos, val, false);
       };
       //Serialize the chunk
       let hdr = new ArrayBuffer( 4 + 4 + 4 + 8 + 4);
       let tid = chunk.temporalLayerId;
       let i = (chunk.type == 'key' ? 1 : 0);
       let d = (chunk.temporalLayerId == 0 ? 0 : 1);
       let b = (chunk.temporalLayerId == 0 ? 1 : 0);
       let B0 = 0;
       let B1 = 3 | (i << 2) | (d << 3) | (b << 4) | (tid << 5);
       let B2 = config.pt;
       let B3 = 3;
       let first4 = B0 | (B1 << 8) | (B2 << 16) | (B3 << 24);
       let ssrc = config.ssrc;
       writeUInt32(hdr, 0, first4); 
       writeUInt32(hdr, 4, chunk.keyframeIndex);
       writeUInt32(hdr, 8, chunk.deltaframeIndex);
       writeUInt64(hdr, 12, BigInt(chunk.timestamp));
       writeUInt32(hdr, 20, ssrc);
       self.postMessage({text: 'hdr: ' + hdr.byteLength + ' chunk length: ' + chunk.byteLength});
       self.postMessage({text: 'B0: ' + B0 + ' B1: ' + B1 + ' B2: ' + B2 + ' B3: ' + B3});
       self.postMessage({text: 'Serial kf: ' + chunk.keyframeIndex + ' delta: ' + chunk.deltaframeIndex + ' dur: ' + chunk.duration + ' ts: ' + chunk.timestamp + ' ssrc: ' + ssrc +  ' pt: ' + config.pt + ' tid: ' + tid + ' type: ' + chunk.type + ' discard: ' + d + ' base: ' + b});
       let result = new Uint8Array( hdr.byteLength + chunk.byteLength);
       result.set(new Uint8Array(hdr), 0);
       result.set(new Uint8Array(chunk.data), hdr.byteLength);
       controller.enqueue(result.buffer);
 */
       controller.enqueue(chunk);
      }
     });
   }

   Deserialize(self) {
     return new TransformStream({
       start (controller) {
       },
       transform(chunk, controller) {
/*       const readUInt32 = function(arr, pos)
         {
           let view = new DataView(arr);
           return view.getUint32(pos, false);
         };
         const readUInt64 = function(arr, pos)
         {
           let view = new DataView(arr);
           return Number(view.getBigUint64(pos, false));
         };
         const first4 = readUInt32(chunk, 0);
         const B0 =  first4 & 0x000000FF;
         const B1 = (first4 & 0x0000FF00) >> 8;
         const B2 = (first4 & 0x00FF0000) >> 16;
         const B3 = (first4 & 0xFF000000) >> 24;
         self.postMessage({text: 'B0: ' + B0 + ' B1: ' + B1 + ' B2: ' + B2 + ' B3: ' + B3});
         const lid = B0;
         const pt =  B2;
         const tid = (B1 & 0xE0) >> 5;
         const i = (B1 & 0x04) >> 2;
         const keyframeIndex   = readUInt32(chunk, 4);
         const deltaframeIndex = readUInt32(chunk, 8);
         const timestamp = readUInt64(chunk, 12);
         const ssrc = readUInt32(chunk, 20);
         const hydChunk = new EncodedVideoChunk ({
              type: (i == 1 ? 'key' : 'delta'),
              duration: 0,
              timestamp: timestamp,
              data: new Uint8Array(chunk, 24)
         });
         hydChunk.temporalLayerId = tid;
         hydChunk.ssrc = ssrc;
         hydChunk.pt = pt;
         hydChunk.keyframeIndex = keyframeIndex;
         hydChunk.deltaframeIndex = deltaframeIndex;
         self.postMessage({text: 'hdr: 24' + ' chunk length: ' + chunk.byteLength + ' -24 = ' + hydChunk.byteLength});
         self.postMessage({text: 'Deserial kf: ' + hydChunk.keyframeIndex + ' delta: ' + hydChunk.deltaframeIndex + ' dur: ' + hydChunk.duration + ' ts: ' + hydChunk.timestamp + ' ssrc: ' + hydChunk.ssrc + ' pt: ' + hydChunk.pt + ' tid: ' + tid + ' type: ' + hydChunk.type});
         controller.enqueue(hydChunk);
*/
         controller.enqueue(chunk);
       }
     });
   }   

   DecodeVideoStream(self) {
     return new TransformStream({
       start(controller) {
         this.decoder = decoder = new VideoDecoder({
           output: frame => controller.enqueue(frame),
           error: (e) => {
              self.postMessage({severity: 'fatal', text: `Decoder error: ${e.message}`});
           }
         });
       },
       transform(chunk, controller) {
         if (this.decoder.state != "closed") {
           try {
             this.decoder.decode(chunk);
           } catch (e) {
             self.postMessage({text: 'Derror size: ' + chunk.byteLength + ' kf: ' + chunk.keyframeIndex + ' delta: ' + chunk.deltaframeIndex + ' dur: ' + chunk.duration + ' ts: ' + chunk.timestamp + ' ssrc: ' + chunk.ssrc + ' pt: ' + chunk.pt + ' tid: ' + chunk.temporalLayerId+ ' type: ' + chunk.type});
              self.postMessage({severity: 'fatal', text: `Decode error: ${e.message}`});
           }
         }
       }
     });
   }

   EncodeVideoStream(self, config) {
     return new TransformStream({
       start(controller) {
         this.keyframeIndex = 0;
         this.deltaframeIndex = 0;
         this.pending_outputs = 0;
         this.encoder = encoder = new VideoEncoder({
           output: (chunk, cfg) => {
             if (cfg.decoderConfig) {
               self.postMessage({text: 'Decoder reconfig!'});
               self.postMessage({text: 'Configuration: ' + JSON.stringify(cfg.decoderConfig)});
               decoder.configure(cfg.decoderConfig);
             }
             chunk.temporalLayerId = 0;
             if (cfg.temporalLayerId) {
               chunk.temporalLayerId = cfg.temporalLayerId;
             }
             if (chunk.type == 'key') {
                this.keyframeIndex++;
                this.deltaframeIndex = 0;
             }
             this.pending_outputs--;
             chunk.keyframeIndex = this.keyframeIndex;
             chunk.deltaframeIndex = this.deltaframeIndex;
             controller.enqueue(chunk);
           },
           error: (e) => {
             self.postMessage({severity: 'fatal', text: `Encoder error: ${e.message}`});
           }
         });
         VideoEncoder.isConfigSupported(config).then((encoderSupport) => {
           if(encoderSupport.supported) {
             this.encoder.configure(encoderSupport.config);
             self.postMessage({text: 'Encoder successfully configured:\n' + JSON.stringify(encoderSupport.config)});
             self.postMessage({text: 'Encoder state: ' + JSON.stringify(this.encoder.state)});
           } else {
             self.postMessage({severity: 'fatal', text: 'Config not supported:\n' + JSON.stringify(encoderSupport.config)});
           }
         })
         .catch((e) => {
            self.postMessage({severity: 'fatal', text: 'Configuration error: ' + e.message});
         })
       },
       transform(frame, controller) {
         if (this.pending_outputs <= 30) {
           if (++this.deltaframeIndex % 20 == 0) {
             self.postMessage({text: 'Encoded 20 frames'});
           }
           this.pending_outputs++;
           const insert_keyframe = (this.deltaframeIndex % config.keyInterval) == 0;
           try {
             if (this.encoder.state != "closed") {
               this.encoder.encode(frame, { keyFrame: insert_keyframe });
             }
           } catch(e) {
             self.postMessage({severity: 'fatal', text: 'Encoder Error: ' + e.message});
           }
         }
         frame.close();
       }
     });
   }

   stop() {
     this.stopped = true;
     self.postMessage({text: 'stop() called'});
     // TODO: There might be a more elegant way of closing a stream, or other
     // events to listen for.
     if (encoder.state != "closed") encoder.close();
     if (decoder.state != "closed") decoder.close();
     this.transport.close();
     self.postMessage({text: "stop(): transport, frame, encoder and decoder closed"});
     return;
   }

   async start()
   {
     let duplexStream, readStream, writeStream;
     // Open a bidirectional stream
     try {
        duplexStream = await this.transport.createBidirectionalStream();
        readStream = duplexStream.readable;
        writeStream = duplexStream.writable;
        self.postMessage ({text: 'Bidirectional stream created.'});
     } catch (e) {
       self.postMessage({severity: 'fatal', text: 'Bidirectional stream creation failed: ' + e.message});
       stop();
       return;
     }
     try { 
       this.inputStream
           .pipeThrough(this.EncodeVideoStream(self,this.config))
           .pipeThrough(this.Serialize(self,this.config))
           .pipeThrough(this.Deserialize(self))
           .pipeThrough(this.DecodeVideoStream(self))
           .pipeTo(this.outputStream);
     } catch (e) {
       self.postMessage({severity: 'fatal', text: 'start error: ' + e.message});
     }
   }
}
