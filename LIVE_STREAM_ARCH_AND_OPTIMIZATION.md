# TeamLens Live Screen — Current Architecture & 1080p Optimization Plan

## Current architecture (how it works today)

```
Manager browser (Chrome)
   ↓ 1. clicks "Live" on an employee card
   ↓ 2. POST live:view-request via Socket.IO to backend-ws
   ↓ 3. backend-ws forwards request to employee's agent socket room

Employee agent (Tauri WebView)
   ↓ 4. receives live:view-request
   ↓ 5. starts a capture pump:
        a. Rust native command `capture_screen_frame()` captures a screenshot
           (PNG/JPEG bytes) at ~8 FPS
        b. JS decodes bytes with ImageDecoder (or createImageBitmap fallback)
        c. draw to double-buffer canvas (MAX_W=1280, MAX_H=720)
        d. canvas.captureStream(0) → MediaStreamTrack
        e. WebRTC RTCPeerConnection adds track, encodes VP8
   ↓ 6. ICE with STUN/TURN, signaling through backend-ws Socket.IO
   ↓ 7. Manager browser receives video track → <video>
```

Key files today:
- Viewer (manager browser): `frontend/components/LiveScreenViewer.tsx`
- Agent capture/encode: `teamlens-linux-agent/src/liveScreen.ts` (also used by Windows agent)
- Native frame capture: `agent/src-tauri/src/lib.rs` → `capture_screen_frame()` (Windows) and `teamlens-linux-agent/src-tauri/src/lib.rs` → `capture_screen_frame_x11()` (Linux)
- Signaling server: `backend-ws/src/socket.ts` (live:* events)
- Fallback: if WebRTC fails, manager polls latest screenshot every 500 ms

Current quality caps:
- Resolution: 1280 × 720
- FPS: 8
- Max bitrate: 1.8 Mbps
- Codec: VP8 (software encoder in WebView)
- Capture model: screenshot frames, not a native video stream

---

## Why it is not Netflix-quality today

| Netflix / good live stream | TeamLens today |
|----------------------------|----------------|
| 1920×1080 @ 30-60 FPS | 1280×720 @ 8 FPS |
| 5-8 Mbps video bitrate | 1.8 Mbps max |
| H.264 / H.265 hardware encode | VP8 software encode |
| Continuous video frames | Still screenshots stitched into video |
| Adaptive bitrate (ABR) | Fixed bitrate cap |
| CDN / media server for scale | P2P WebRTC (one viewer per agent) |
| Jitter buffer, forward error correction | Basic WebRTC defaults |

---

## Optimization roadmap

### Phase 1 — Tune current pipeline to its limits (quick win)
Change constants in `teamlens-linux-agent/src/liveScreen.ts` (and matching Windows agent copy):

```ts
const TARGET_FPS = 8;          // → 15 or 24
const MAX_BITRATE_BPS = 1_800_000;  // → 4_000_000 or 6_000_000
const MAX_W = 1280;            // → 1920
const MAX_H = 720;             // → 1080
```

Also bump encoder hints in the same file:
```ts
new MediaRecorder(stream, {
  mimeType: "video/webm;codecs=vp9",
  videoBitsPerSecond: 6_000_000,
});
```

And in `frontend/components/LiveScreenViewer.tsx`, loosen incoming constraints if any.

Caveats:
- Higher FPS/screenshot rate = more CPU on employee device.
- VP8 software encoder at 1080p/24 FPS is heavy; frame drops likely on low-end machines.
- Network upload bandwidth on employee side must sustain the new bitrate.

### Phase 2 — Replace screenshot pump with a real screen capture stream (biggest quality gain)

Use `navigator.mediaDevices.getDisplayMedia()` or agent-native APIs to get a real `MediaStream`, then send it directly over WebRTC:

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: false,
});
stream.getVideoTracks()[0].applyConstraints({
  width: 1920,
  height: 1080,
  frameRate: 24,
});
peerConnection.addTrack(stream.getVideoTracks()[0], stream);
```

Pros:
- True 1080p 30 FPS capture.
- Browser/Chromium can use hardware-accelerated encoder if available.

Cons:
- `getDisplayMedia()` shows a browser picker on Linux/Windows. For silent capture you need native Tauri/Rust APIs.
- On Windows: Tauri can use `windows-capture` or similar crate.
- On Linux: `pipewire` portals work for Wayland; X11 can use `ximagesrc` (GStreamer) or FFmpeg.
- On macOS: `CGDisplayStream`.

For X11 (Prem), a GStreamer pipeline is the cleanest:
```bash
gst-launch-1.0 ximagesrc ! video/x-raw,framerate=30/1 ! videoconvert ! vp8enc target-bitrate=6000000 ! webmmux ! filesink location=...
```
Then feed it to WebRTC or segment it and serve HLS.

### Phase 3 — Switch to H.264 with hardware acceleration

VP8 software encoding is the main CPU/battery killer. WebRTC in modern browsers supports H.264 via:

```ts
const transceiver = pc.addTransceiver(track, {
  direction: "sendonly",
  sendEncodings: [
    {
      maxBitrate: 6_000_000,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFps: 30,
      degradationPreference: "maintain-resolution",
    },
  ],
});

// Offer SDP will negotiate H.264 if both sides support it.
```

Also prefer `captureStream()` from a `<video>` element for hardware-decoded screen content, but for employee device capture you still need a source stream.

On the agent side, using native H.264 encode (MediaCodec on Android, VideoToolbox on macOS, Media Foundation on Windows, VAAPI on Linux) requires dropping browser WebRTC and using a native WebRTC library (libwebrtc, Pion, GStreamer webrtcbin). This is a larger refactor.

### Phase 4 — Adaptive bitrate & congestion control

Netflix-like experience requires the stream to degrade gracefully on bad networks. WebRTC already has bandwidth estimation, but you can tune it:

```ts
const sender = pc.getSenders().find(s => s.track?.kind === "video");
const params = sender.getParameters();
params.encodings[0].maxBitrate = 8_000_000;      // when network is good
params.encodings[0].minBitrate = 500_000;        // floor
params.encodings[0].maxFramerate = 30;
params.encodings[0].scaleResolutionDownBy = 1;     // 1 = full, 2 = 960x540
params.encodings[0].degradationPreference = "maintain-resolution";
sender.setParameters(params);
```

Add sender-side stats loop to monitor `outbound-rtp` and adjust bitrate on CPU/network limits.

### Phase 5 — Media server for scale and reliability (optional, but needed for many viewers)

Current design is P2P: one manager ↔ one employee. If you ever want a manager to watch multiple employees, or multiple managers to watch one employee, use:

- **mediasoup** (Node/Rust/C++) — best control, low latency.
- **LiveKit** ( managed or self-hosted) — easiest deployment.
- **Janus** — mature, C-based.

Architecture with media server:
```
Agent → WebRTC publish → Media Server → WebRTC subscribe → Manager browser
```

This lets you transcode, record, and serve many subscribers without killing the employee's machine.

### Phase 6 — Recording = retain quality

Today when a manager records the live stream via `MediaRecorder` on the receiving browser, it re-encodes the already-decoded video:

```ts
new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 5_000_000 })
```

For 1080p archival, record the original encoded chunks server-side via the media server instead of re-encoding in the browser.

---

## Recommended quick path to "Netflix-like"

If you want 1080p/24 FPS within the existing WebRTC P2P design:

1. **Capture source**: replace the screenshot pump with a real screen capture stream.
   - Windows agent: use `navigator.mediaDevices.getDisplayMedia()` or native Windows.Graphics.Capture.
   - Linux agent: use PipeWire (Wayland) or ximagesrc (X11) via a small native helper.
2. **Bump caps**: 1920×1080, 24 FPS, 6 Mbps.
3. **Codec**: force H.264 if the WebRTC stack supports hardware encode on the agent.
4. **TURN**: ensure your TURN server (coturn) has enough bandwidth and is geographically close to employees + managers.
5. **Fallback**: keep the screenshot polling fallback for when real stream is blocked.

If this sounds like what you want, tell me which agent platform to optimize first (Windows, Linux, or both) and I can implement the native 1080p capture path and the viewer/encoder tuning.
