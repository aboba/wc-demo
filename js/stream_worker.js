'use strict';

var encoder;
var decoder;

self.addEventListener('message', async function(e) {
  // In this demo, we expect at most two messages, one of each type.
  var type = e.data.type;

  if (type == "stop") {
    self.postMessage('Stop message received.');
    if (typeof(pl)  !== 'undefined') {
      self.postMessage("Cleaning up pipeline.");
      pl.stop();
    }
    return;
  } else if (type !== "stream"){
    self.postMessage("Invalid message received.");
    return;
  }
  // We received a "stream" event

  self.postMessage("Stream event received.");

  // Create WebTransport
  var transport;

  try {
    transport = new WebTransport(e.data.url);
    self.postMessage('Initiating connection...');
  } catch (e) {
    self.postMessage('Failed to create connection object: ' + e.message);
    return;
  }

  transport.ready
    .then(() => {
       self.postMessage('Connection ready.');
       var pl = new pipeline(e.data, transport, self);
       pl.start(self);
    })
    .catch((e) => {
       self.postMessage('Connection failed: ' + e.message)
       return;
    })

  transport.closed
    .then(()   => self.postMessage('Connection closed normally.'))
    .catch((e) => {
      self.postMessage('Connection closed abruptly: ' + e.message);
      if (typeof(pl)  !== 'undefined') pl.stop();
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
              this.context.postMessage(`Decoder error: ${e.message}`);
              this.stop();
           }
         });
       },
       transform(chunk, controller) {
         this.decoder.decode(chunk);
       }
     });
   }

   EncodeVideoStream(config, context) {
     return new TransformStream({
       start(controller) {
         this.context = context;
         this.frame_counter = 0;
         this.pending_outputs = 0;
         this.encoder = new VideoEncoder({
           output: (chunk, cfg) => {
             if (cfg.decoderConfig) {
               this.context.postMessage('Decoder reconfig!');
               this.context.postMessage('Configuration: ' + JSON.stringify(cfg.decoderConfig));
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
             this.context.postMessage(`Encoder error: ${e.message}`);
             this.stop();
           }
         });
         VideoEncoder.isConfigSupported(config).then((encoderSupport) => {
           if(encoderSupport.supported) {
             this.encoder.configure(encoderSupport.config);
             this.context.postMessage('Encoder successfully configured:\n' + JSON.stringify(encoderSupport.config));
             this.context.postMessage('Encoder state: ' + JSON.stringify(this.encoder.state));
           } else {
             this.context.postMessage('Config not supported:\n' + JSON.stringify(encoderSupport.config));
             this.stop();
           }
         })
         .catch((e) => {
            this.context.postMessage('Configuration error: ' + e.message);
            this.stop();
         })
       },
       transform(frame, controller) {
         if (this.pending_outputs <= 30) {
           if (++this.frame_counter % 20 == 0) {
             this.context.postMessage("Encoded 20 frames");
           }
           this.pending_outputs++;
           const insert_keyframe = (this.frame_counter % config.keyInterval) == 0;
           try {
             this.encoder.encode(frame, { keyFrame: insert_keyframe });
           } catch(e) {
             this.context.postMessage("Encoder Error: " + e.message);
             this.stop();
           }
         }
         frame.close();
       }
     });
   }

   stop() {
     this.stopped = true;
     this.context.postMessage('stop() called');
     // TODO: There might be a more elegant way of closing a stream, or other
     // events to listen for.
     this.frameReader.releaseLock();
     this.inputStream.cancel();
     this.frameWriter.releaseLock();
     this.outputStream.abort();
     if (this.encoder.state != "closed") this.encoder.close();
     if (this.decoder.state != "closed") this.decoder.close();
     this.transport.close();
     this.context.postMessage("stop(): streams, reader, writer, frame, transport and encoder closed");
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
       this.context.postMessage('start error: ' + e.message);
     }
   }
}
