# wc-demo
This is a demo of a WHATWG Streams-based media pipeline including capture, encode, decode and render. 
APIs utilized include WHATWG Streams, Media Capture & Streams, Mediacapture-transform and WebCodecs.
In the demo, the main thread handles the UI and capture, and a worker thread is utilized for the media pipeline. 
To see the demo live, point your browser to:  https://webrtc.internaut.com/wc/wcWorker2/

Note: One use of this demo (which does not include network transport) is to compare the performance to the
demo that adds serialization + sending to the send pipeline and reception + deserialization to the receive
pipeline.  The demo with transport is in the "wt-demo" repo.
