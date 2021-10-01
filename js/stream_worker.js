'use strict';

var encoder;
var decoder;
var pl;

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
  var transport;

  try {
    transport = new WebTransport(e.data.url);
    self.postMessage({text: 'Initiating connection...'});
  } catch (e) {
    self.postMessage({severity: 'fatal', text: 'Failed to create connection object: ' + e.message});
    return;
  }

  transport.ready
    .then(() => {
       self.postMessage({text: 'Connection ready.'});
       pl = new pipeline(e.data, transport, self);
       pl.start(self);
    })
    .catch((e) => {
       self.postMessage({severity: 'fatal', text: 'Connection failed: ' + e.message})
       return;
    })

  transport.closed
    .then(()   => self.postMessage({text: 'Connection closed normally.'}))
    .catch((e) => {
      self.postMessage({severity: 'fatal', text: 'Connection closed abruptly: ' + e.message});
      pl.stop();
      return;
    })

}, false);

class pipeline {
   constructor(eventData, transport, context)
   {
     this.stopped = false;
     this.context = context;
     this.transport = transport;
     this.inputStream = eventData.streams.input;
     this.outputStream = eventData.streams.output;
     this.config = eventData.config;
   }

   Serialize() {
     return new TransformStream({
       start (controller) {
         this.chunk_counter = 0;
       },
       transform(chunk, controller) {
       //Serialize the chunk
       this.chunk_counter++;
       let frame = 
       {
         seqNo: this.chunk_counter,
         isKey: chunk.type == 'key',
         tid: chunk.temporalLayerId,
         timestamp: chunk.timestamp,
         duration: chunk.duration,
         length: chunk.byteLength,
         data: new Uint8Array(chunk.data)
       };
       //TODO: Serialize the frame
       //TODO: Null transform for now.  Replace this with the binary wireformat
         controller.enqueue(chunk);
       }
     });
   }

   Deserialize() {
     return new TransformStream({
       start (controller) {
       },
       transform(chunk, controller) {
         //Deserialize the chunk
         //TODO: Null tranform for now. Replace this with wire format transformation
         let deSerializedChunk = chunk;
         controller.enqueue(deSerializedChunk);
       }
     });
   }   

   DecodeVideoStream(context) {
     return new TransformStream({
       start(controller) {
         this.context = context;
         this.decoder = decoder = new VideoDecoder({
           output: frame => controller.enqueue(frame),
           error: (e) => {
              this.context.postMessage({severity: 'fatal', text: `Decoder error: ${e.message}`});
           }
         });
       },
       transform(chunk, controller) {
         if (this.decoder.state != "closed") {
           this.decoder.decode(chunk);
         }
       }
     });
   }

   EncodeVideoStream(config, context) {
     return new TransformStream({
       start(controller) {
         this.context = context;
         this.frame_counter = 0;
         this.pending_outputs = 0;
         this.encoder = encoder = new VideoEncoder({
           output: (chunk, cfg) => {
             if (cfg.decoderConfig) {
               this.context.postMessage({text: 'Decoder reconfig!'});
               this.context.postMessage({text: 'Configuration: ' + JSON.stringify(cfg.decoderConfig)});
               decoder.configure(cfg.decoderConfig);
             }
             chunk.temporalLayerId = 0;
             if (cfg.temporalLayerId) {
               chunk.temporalLayerId = cfg.temporalLayerId;
             }
             this.pending_outputs--;
             controller.enqueue(chunk);
           },
           error: (e) => {
             this.context.postMessage({severity: 'fatal', text: `Encoder error: ${e.message}`});
           }
         });
         VideoEncoder.isConfigSupported(config).then((encoderSupport) => {
           if(encoderSupport.supported) {
             this.encoder.configure(encoderSupport.config);
             this.context.postMessage({text: 'Encoder successfully configured:\n' + JSON.stringify(encoderSupport.config)});
             this.context.postMessage({text: 'Encoder state: ' + JSON.stringify(this.encoder.state)});
           } else {
             this.context.postMessage({severity: 'fatal', text: 'Config not supported:\n' + JSON.stringify(encoderSupport.config)});
             this.stop();
           }
         })
         .catch((e) => {
            this.context.postMessage({severity: 'fatal', text: 'Configuration error: ' + e.message});
         })
       },
       transform(frame, controller) {
         if (this.pending_outputs <= 30) {
           if (++this.frame_counter % 20 == 0) {
             this.context.postMessage({text: 'Encoded 20 frames'});
           }
           this.pending_outputs++;
           const insert_keyframe = (this.frame_counter % config.keyInterval) == 0;
           try {
             if (this.encoder.state != "closed") {
               this.encoder.encode(frame, { keyFrame: insert_keyframe });
             }
           } catch(e) {
             this.context.postMessage({severity: 'fatal', text: 'Encoder Error: ' + e.message});
           }
         }
         frame.close();
       }
     });
   }

   stop() {
     this.stopped = true;
     this.context.postMessage({text: 'stop() called'});
     // TODO: There might be a more elegant way of closing a stream, or other
     // events to listen for.
     if (encoder.state != "closed") encoder.close();
     if (decoder.state != "closed") decoder.close();
     this.transport.close();
     this.context.postMessage({text: "stop(): transport, frame, encoder and decoder closed"});
     return;
   }

   start()
   {
     try { 
       this.inputStream
           .pipeThrough(this.EncodeVideoStream(this.config, this.context))
           .pipeThrough(this.Serialize())
           .pipeThrough(this.Deserialize())
           .pipeThrough(this.DecodeVideoStream(this.context))
           .pipeTo(this.outputStream);
     } catch (e) {
       this.context.postMessage({severity: 'fatal', text: 'start error: ' + e.message});
     }
   }
}
