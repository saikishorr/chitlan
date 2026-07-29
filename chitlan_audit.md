# ChitLAN Frontend Engineering Audit
### Principal Frontend Engineer · WebRTC Specialist · Production Readiness Review
**Audit Date:** 2026-07-29 | **Codebase Version:** v3.0.0 | **Reviewer:** Antigravity AI

---

## Table of Contents
1. [Part 1 — Project Understanding & Architecture](#part-1)
2. [Part 2 — Frontend Code Quality Audit](#part-2)
3. [Part 3 — JavaScript Architecture Review](#part-3)
4. [Part 4 — WebRTC & PeerJS Audit](#part-4)
5. [Part 5 — Performance Audit](#part-5)
6. [Part 6 — UI/UX Audit](#part-6)
7. [Part 7 — Accessibility Audit](#part-7)
8. [Part 8 — Browser Compatibility](#part-8)
9. [Part 9 — Security Audit](#part-9)
10. [Part 10 — Bug Hunting](#part-10)
11. [Part 11 — Feature Gap Analysis](#part-11)
12. [Part 12 — Code Modernization](#part-12)
13. [Part 13 — Refactoring Roadmap](#part-13)
14. [Part 14 — Final Engineering Report](#part-14)

---

<a id="part-1"></a>
## Part 1 — Project Understanding & Architecture

### Overall Architecture

ChitLAN is a **serverless, browser-based P2P collaboration platform** deployed as a static site (GitHub Pages / XAMPP). There is no backend application server. All real-time communication flows exclusively through the **PeerJS library** (v1.5.5), which internally uses WebRTC data channels for messaging/file transfer and WebRTC media channels (RTCPeerConnection) for voice, video, and screen sharing. PeerJS itself uses a public PeerServer cloud (`peerjs.com`) only for signaling (ICE/SDP exchange); no user data transits the signaling server.

**Runtime dependency graph:**
```
index.html  →  static landing page (no JS module imports)
  └─ script.js  (legacy monolithic 988-line global-scope file)

app.html  →  dynamic workspace (ES module architecture)
  ├─ js/app.js        (event orchestrator / entry point)
  ├─ js/peer.js       (PeerJS lifecycle, data routing)
  ├─ js/voice.js      (audio/video calls)
  ├─ js/screen.js     (getDisplayMedia, screen calls)
  ├─ js/files.js      (chunked file transfer)
  ├─ js/ui.js         (DOM rendering, emoji, GIF)
  ├─ js/state.js      (shared mutable singleton)
  ├─ js/constants.js  (configuration values)
  └─ js/utils.js      (helpers: IP, ID gen, text escape, toast)
```

### Folder Organization

```
chitlan/
├── index.html          Landing page (41 KB, 1884 lines, CSS inline)
├── app.html            Application shell (14 KB, 1188 lines)
├── script.js           LEGACY monolith (26 KB, 988 lines) — NOT used by app.html
├── style.css           LEGACY stylesheet (15 KB, 980 lines) — NOT used by app.html
├── js/                 ES module application layer
│   ├── app.js          (14.9 KB, 426 lines)
│   ├── peer.js         (16.8 KB, 509 lines)
│   ├── ui.js           (24.2 KB, 575 lines)
│   ├── voice.js        (8.2 KB, 300 lines)
│   ├── files.js        (10.1 KB, 322 lines)
│   ├── screen.js       (5.6 KB, 186 lines)
│   ├── state.js        (798 B, 41 lines)
│   ├── constants.js    (434 B, 8 lines)
│   └── utils.js        (3.0 KB, 98 lines)
├── css/                Modular CSS for app.html
│   ├── app.css         (6.2 KB — layout, hero, nav)
│   ├── chat.css        (11.6 KB — messages, emoji, GIF)
│   ├── voice.css       (4.6 KB — video, audio UI)
│   ├── files.css       (7.6 KB — file transfer UI)
│   ├── screen.css      (2.8 KB — screen share modal)
│   ├── sidebar.css     (3.6 KB — sidebar, user list)
│   ├── animations.css  (3.1 KB — keyframes, utility classes)
│   └── responsive.css  (3.4 KB — breakpoints)
├── ding.mp3            Notification audio (36 KB)
├── og-image.png        Social preview (288 KB)
├── og-image2.3mb.png   2.3 MB — social preview (unoptimized)
├── sitemap.xml, robots.txt
└── Changelog.md, README.md, SECURITY.md
```

> [!WARNING]
> **`script.js` (988 lines) and `style.css` (980 lines) are orphaned legacy files.** They are loaded by neither `index.html` nor `app.html`. They represent an abandoned v1/v2 codebase that was never deleted. This is significant dead code bloat (≈41 KB uncompressed) sitting in the project root.

### JavaScript Module Architecture

The ES module system (`js/`) is the production codebase. It follows a reasonable layered separation:

| Layer | Files | Responsibility |
|---|---|---|
| State | `state.js` | Single mutable shared object (singleton pattern) |
| Constants | `constants.js` | Configuration values |
| Utilities | `utils.js` | Pure helper functions |
| Domain Logic | `peer.js`, `voice.js`, `files.js`, `screen.js` | Feature-specific P2P logic |
| UI | `ui.js` | DOM rendering, emoji, GIF, toast |
| Orchestration | `app.js` | Event wiring, initialization |

**Architectural strengths:**
- Clean module boundaries (each file has a defined domain)
- ES module imports/exports enforce explicit dependencies
- Constants centralized in `constants.js`
- `state.js` is a readable, flat structure

**Architectural weaknesses:**
- `ui.js` is 575 lines and handles emoji database (130 entries), GIF catalog, DOM rendering, theming, session timer, notifications — too many concerns in one file
- `peer.js` handles routing, connection lifecycle, kick logic, room locking, broadcast, telemetry, and user list sync — too broad a scope
- `app.js` does DOM querying and event wiring for every feature in one `DOMContentLoaded` handler (426 lines, no sub-functions)
- No event bus or pub/sub pattern; all cross-module communication via direct imports creates circular dependency risk
- `state` is a plain mutable object — any module can corrupt any field silently

### UI Rendering Flow

1. `app.html` loads, CSS is applied, hero section visible
2. User enters nickname, color, role → `launchBtn` click → `initPeer()` in `peer.js`
3. PeerJS `open` event fires → peer ID displayed, session timer starts, telemetry begins
4. If joiner: `connectToHost(hostId)` → DataChannel `open` → intro message sent → host processes → renders user list
5. Messages: user types → `sendMessage()` → `broadcast()` or `conn.send()` → recipients call `appendMessage()` → DOM insertion + scroll
6. No virtual DOM, no diffing — all rendering is direct imperative DOM mutation via `innerHTML` and `appendChild`

### State Management Approach

Single mutable singleton (`state.js`). All modules import the same object reference and mutate it directly. There is **no reactivity**, **no event emission on state change**, and **no state history**. State includes: peer connection objects, MediaStreams, call maps, file transfer maps, UI counters, timers. This works at small scale but is fragile — there is no protection against one module setting `state.localStream = null` while another is actively using it.

### PeerJS Connection Lifecycle

```
initPeer() → new Peer(id) → peer.on('open') → Room ready
  Host path:  peer.on('connection', c) → handlePeerData(c, data) for each message type
  Join path:  connectToHost(id) → conn.on('open') → send 'intro' → conn.on('data') handler
```

The lifecycle has a **critical race condition**: `initPeer()` is called, then `connectToHost()` is called via `setTimeout(..., 1000)` in `app.js:59`. If PeerJS takes more than 1 second to open (common on slow networks or the peerjs.com server is slow), `connectToHost` fires before `state.peer` is ready, causing a crash or a silent no-op.

### WebRTC Signaling Assumptions

ChitLAN depends entirely on **peerjs.com** public PeerServer for ICE/SDP exchange. There is no:
- Custom STUN/TURN server configuration
- Fallback signaling server
- Self-hosted PeerServer option
- ICE server configuration passed to `new Peer()`

This means the app **will fail** on networks that block WebRTC or when peerjs.com is unavailable. On corporate networks, NAT traversal will often fail without a TURN server.

### DataChannel Communication Flow

All text messages and file chunks flow through PeerJS `DataConnection` objects (which wrap `RTCDataChannel`). The message protocol is a JSON object with a `type` discriminator field:

| type | Direction | Purpose |
|---|---|---|
| `intro` | Peer → Host | Register nickname/color on join |
| `message` | Any → Host → All | Chat message broadcast |
| `typing` | Any → Host → All | Typing indicator relay |
| `file-chunk` | Any → Host → All | 1 MB binary chunk |
| `file-ack` | Receiver → Sender | Chunk receipt acknowledgement |
| `screen-status` | Any → All | Screen sharing lifecycle events |
| `ping` / `pong` | Any ↔ Any | Latency measurement |
| `kick-user` | Host → Peer | Removal notification |
| `host-command` | Host → Peer | Remote mute |
| `room-full` | Host → Peer | Capacity rejection |
| `room-redirect` | Peer → Peer | Smart redirect to host |
| `peer-joined` | Host → All | Notify new peer for screen call setup |

**Strength:** Simple, readable protocol with clear types.
**Weakness:** No message versioning, no schema validation, no sequence numbers, no guaranteed delivery ordering.

### MediaStream Management

- Voice: `getUserMedia({ audio: true })` → stored in `state.localStream`
- Video meeting: `getUserMedia({ video: true, audio: true })` → stored in `state.videoStream` AND `state.localStream` (aliased)
- Screen: `getDisplayMedia({ video: true })` → stored in `state.screenStream`

**Stream aliasing bug:** When `startVideoMeeting()` runs, it sets `state.localStream = state.videoStream`. If the user later calls `leaveVoice()`, it stops ALL tracks on `state.localStream`, which includes the video tracks — but `state.videoStream` still references those stopped tracks. The cleanup is correct in `leaveVoice()` (stops both), but the aliasing makes the code fragile.

### Screen Sharing Lifecycle

1. `startScreenShare()` → `getDisplayMedia()` → stores in `state.screenStream`
2. Calls each peer via `state.peer.call(peerId, screenStream, { metadata: { type: 'screen-share' } })`
3. Stores call objects in `state.activeScreenCalls`
4. Sends `screen-status: started` message
5. On native OS stop (videoTrack.onended): auto-calls `stopScreenShare()`
6. On `stopScreenShare()`: stops tracks, closes calls, sends `screen-status: stopped`, clears viewer

**Gap:** `showScreenStream()` unconditionally calls `openScreenModal()`. This means when a remote screen share is received, the theater modal opens immediately — even if the user was doing something else. This can be disruptive.

### File Transfer Architecture

Chunked binary transfer over DataChannel:
1. File sliced into 1 MB chunks using `File.slice()`
2. Each chunk read as `ArrayBuffer` via `FileReader.readAsArrayBuffer`
3. Chunk JSON payload sent: `{ type, fileId, index, buffer (ArrayBuffer), name, size, totalChunks, mimeType }`
4. Recipients send back `file-ack` per chunk
5. All received chunks stored in a pre-allocated `Array(totalChunks)`
6. On completion: `new Blob(chunks)` → `URL.createObjectURL()` → download link or image preview

**Critical issue:** Chunks are serialized as JSON containing ArrayBuffer objects. PeerJS/WebRTC DataChannel supports binary transfer directly; wrapping binary data in a JSON payload is inefficient and can cause serialization issues. The correct approach is to send binary directly and use a signaling message for metadata.

**Memory issue:** For a 100 GB file, `new Array(totalChunks)` pre-allocates an array with ~100,000 slots. All 100 GB of ArrayBuffers accumulate in memory before the Blob is created. This will crash any browser well before 100 GB. The stated "up to 100 GB" limit is technically impossible with this architecture.

### Event Handling Structure

All event listeners are registered in `app.js`'s single `DOMContentLoaded` callback. There is no event delegation, no cleanup registry, no `AbortController`. Event listeners are added but never removed (no `removeEventListener` calls anywhere in the codebase). This causes memory leaks if the workspace is used long-term.

### PWA Architecture

**Finding:** There is **no Service Worker registered anywhere** in the codebase. No `sw.js` file exists. No `manifest.json` file exists. The `installBtn` in `app.html` listens for `beforeinstallprompt` — but PWA installation requires both a Service Worker and a Web App Manifest.

The marketing on `index.html` claims "PWA support" but the PWA infrastructure does not exist in this codebase. This is a **confirmed gap**, not a potential issue.

### Architectural Strengths

- ✅ Clean ES module separation into domain files
- ✅ Simple, readable state singleton
- ✅ Good data protocol design (type-discriminated messages)
- ✅ Monotonic progress bar logic (prevents regression) in `files.js:278-283`
- ✅ Takeover conflict management for screen sharing
- ✅ Smart room redirection for non-host joiners
- ✅ Session timer and telemetry
- ✅ Attractive glassmorphism design system with consistent CSS custom properties
- ✅ XSS protection via `safeText()` applied in most display paths

### Architectural Weaknesses

- ❌ No PWA (no manifest, no service worker)
- ❌ 988-line orphaned `script.js` and 980-line `style.css` in project root
- ❌ `setTimeout` used as a signaling synchronization mechanism (race condition)
- ❌ No STUN/TURN configuration (fails on restrictive networks)
- ❌ 100 GB file transfer claim is impossible with in-memory buffering architecture
- ❌ `typingTimeout` stored in `state` but `state` is missing it (it's read from `state.typingTimeout` in `ui.js:504`)
- ❌ No Service Worker = no offline support, no asset caching
- ❌ All HTML is DOM-manipulated via `innerHTML` — potential XSS if `isHtml=true` messages are not carefully controlled

---

<a id="part-2"></a>
## Part 2 — Frontend Code Quality Audit

### Issue 1: Orphaned Legacy Monolith
- **File:** `script.js`, `style.css`
- **Severity:** 🔴 High
- **Description:** `script.js` (988 lines) and `style.css` (980 lines) are full implementations of an older version of ChitLAN. They are not imported by any HTML file in the current codebase. They consume 41 KB of repo size and create confusion for contributors.
- **Fix:** Delete both files. Add a `# Archived` note to Changelog.md.

### Issue 2: Race Condition in `connectToHost`
- **File:** `js/app.js`, line 59
- **Severity:** 🔴 Critical
- **Description:** `setTimeout(() => connectToHost(connectId), 1000)` assumes PeerJS will initialize within 1 second. On slow networks or overloaded PeerServer, the `peer.on('open')` event fires after 1 second, making `state.peer` still null when `connectToHost` runs. This silently fails (the call to `state.peer.connect()` throws because `state.peer` is null).
- **Fix:**
```js
// In peer.js initPeer(), after peer.on('open'):
state.peer.on('open', id => {
  // existing code...
  if (state.pendingHostId) {
    connectToHost(state.pendingHostId);
    state.pendingHostId = null;
  }
});

// In app.js:
if (role === 'join') {
  state.pendingHostId = connectId; // store, don't setTimeout
}
```

### Issue 3: `state.typingTimeout` Used But Never Declared in `state.js`
- **File:** `js/ui.js`, line 504–507; `js/state.js`
- **Severity:** 🟡 Medium
- **Description:** `state.typingTimeout` is read and written in `ui.js` but is absent from the `state` object in `state.js`. JavaScript will auto-create this property on the object, but it's undocumented, inconsistent, and hidden from static analysis.
- **Fix:** Add `typingTimeout: null` to `state.js`.

### Issue 4: GIF URLs are Hardcoded External Links Without Fallback
- **File:** `js/ui.js`, lines 139–163
- **Severity:** 🟡 Medium
- **Description:** The 24 GIF URLs in `RICH_GIF_CATALOG` point to `media.giphy.com`. If those specific GIF URLs change or are deleted by Giphy, broken images are displayed. These are not fetched via API — they are static hardcoded links.
- **Fix:** Use Giphy's API with an API key, or implement lazy loading with `onerror` fallback images.

### Issue 5: `isHtml: true` Message Path is an XSS Vector
- **File:** `js/ui.js`, line 265; `js/peer.js`, lines 330, 332, 455
- **Severity:** 🔴 Critical
- **Description:** When `isHtml=true`, the message content is set via `div.innerHTML = ... ${safeMsg}` where `safeMsg = msg` (raw, not escaped). GIF messages use this path: `htmlContent = '<img src="${gifUrl}" ...>'`. Any peer can send `{ type: 'message', message: '<script>alert(1)</script>', isHtml: true }` and the script will execute in all other peers' browsers.
- **Fix:** Allowlist specific HTML structures instead of setting arbitrary HTML. For GIFs, extract the URL and create the `<img>` element programmatically:
```js
// Instead of setting innerHTML with raw HTML from peers:
if (isHtml && isValidGifUrl(msg)) {
  const img = document.createElement('img');
  img.src = msg; // validated URL only
  img.className = 'gif-message-img';
  contentDiv.appendChild(img);
} else {
  contentDiv.textContent = safeText(msg);
}
```

### Issue 6: `Object URL` Never Revoked After File Transfer
- **File:** `js/files.js`, lines 204–229
- **Severity:** 🟡 Medium
- **Description:** `URL.createObjectURL(blob)` is called when a file is received, but `URL.revokeObjectURL()` is never called. Each completed file transfer holds an Object URL in memory for the lifetime of the tab. In a session with many file transfers, this accumulates.
- **Fix:** Call `URL.revokeObjectURL(url)` after the download link is clicked, or after a timeout.

### Issue 7: Duplicate `updateFileProgress` Global Progress Bar Updates
- **File:** `js/files.js`, lines 274–293
- **Severity:** 🟡 Low
- **Description:** `updateFileProgress` updates both the per-message inline progress bar AND the global sidebar `progressFill`/`progressPercent` elements. If two file transfers happen simultaneously (e.g., host sends file AND receives file from a peer), the global sidebar bar will flicker between two files' progress values.
- **Fix:** The global progress bar should be removed or only display the most recently active transfer by file ID.

### Issue 8: `appendFileTransferMessage` Uses Inline Styles for Progress Bar
- **File:** `js/files.js`, lines 258–259
- **Severity:** 🟡 Low
- **Description:** The file transfer message bubble uses hardcoded inline styles (`style="height:6px; background:rgba(255,255,255,0.1); ..."`). This violates the design system (CSS custom properties) and makes the design unmaintainable.
- **Fix:** Move these styles to `files.css` and apply via class names.

### Issue 9: `detectPublicIP()` Uses an External Third-Party Service
- **File:** `js/utils.js`, lines 1–19
- **Severity:** 🟡 Medium
- **Description:** `fetch('https://api.ipify.org?format=json')` is called on every page load of `app.html`. This sends the user's IP address to a third-party service (ipify.org). For a "no cloud" app, this is architecturally inconsistent and a potential privacy concern. The IP display is decorative only.
- **Fix:** Use `RTCPeerConnection` ICE candidate extraction to detect local network IPs without a third-party service, or remove the feature entirely.

### Issue 10: `renderUserList()` Uses `innerHTML` with `kickBtnHtml` Template Literal
- **File:** `js/ui.js`, lines 231–235
- **Severity:** 🟡 Medium
- **Description:** The kick button HTML is generated with `safeText(cleanName)` in the `title` attribute, which is correct. But the `item.innerHTML` assignment rebuilds the entire user item on every render. This pattern is called on every peer join/leave event.
- **Fix:** Use `createElement` and `textContent` instead of `innerHTML` for the user list items.

### Issue 11: `sendGifMessage()` uses Dynamic `import()` Inside a UI Handler
- **File:** `js/ui.js`, lines 467–469
- **Severity:** 🟡 Low
- **Description:** `sendGifMessage` calls `import('./peer.js').then(m => m.broadcast(...))`. Dynamic import is asynchronous and introduces a timing gap. If the user closes the GIF modal before the import resolves, the broadcast still fires. Additionally, this creates a circular-ish dependency: `ui.js` imports `peer.js` dynamically because statically importing it would be circular (peer.js imports ui.js).
- **Fix:** Expose a `broadcastMessage` callback from `app.js` that is passed into `ui.js` initialization. This breaks the circular dependency cleanly.

### Issue 12: `typingTimeout` Stored on `state` Without Declaration
- **Already covered in Issue 3.**

### Issue 13: Host `updateUserList()` Hardcodes `(You)` Check Based on Nickname String
- **File:** `js/ui.js`, lines 221–222
- **Severity:** 🟡 Low
- **Description:** `const isMe = name.includes('(You)')` relies on the literal string "(You)" being appended to the nickname. This is a fragile string-matching approach. A user who names themselves `Alex (You)` would be treated as "self" even in other users' displays.
- **Fix:** Use a separate `isMe` boolean flag passed explicitly, not string suffix matching.

### Issue 14: `startVoice` and `startVideoMeeting` Can Both Be Active Simultaneously
- **File:** `js/voice.js`, lines 5–62
- **Severity:** 🟡 Medium
- **Description:** `startVoice()` guards with `if (state.isInCall) return`, and `startVideoMeeting()` guards with `if (state.isInVideoMeeting)`. But nothing prevents calling `startVoice()` first, then `startVideoMeeting()`. This results in two separate MediaStreams with overlapping audio tracks, potentially causing double audio transmission.
- **Fix:** Add `if (state.isInCall || state.isInVideoMeeting) return` to both functions, or unify them into a single `startCall(mode)` function.

### Issue 15: `leaveVoice()` Does Not Clear Video Tiles for Remote Peers
- **File:** `js/voice.js`, lines 198–235
- **Severity:** 🟡 Medium
- **Description:** `leaveVoice()` calls `grid.innerHTML = ''` to clear the local video grid, but does not close the `state.activeVideoCalls`. It does call `Object.values(state.activeVideoCalls).forEach(call => call.close())`, which is correct. However, remote peers receive no notification that this user left video. Their video tile remains showing a frozen frame.
- **Fix:** Broadcast a `peer-left-video` message and call `removeVideoTile` on the sender's side in response.

### Issue 16: `peer.js:handlePeerData` Has a Missing `ping/pong` Handler for Host Connections
- **File:** `js/peer.js`, lines 276–368
- **Severity:** 🟡 Medium
- **Description:** In `handlePeerData` (called for host-to-peer connections), `ping` and `pong` messages are handled. But in `connectToHost` data handler (lines 401–476), `ping` and `pong` ARE handled. So bidirectional latency measurement works. ✅ Actually this is correct — this was a false alarm. The duplicate handling in both handlers is intentional (each side responds to ping).

### Issue 17: Inline `style.display` Used Everywhere Instead of CSS Classes
- **File:** Multiple files (`app.js`, `voice.js`, `screen.js`, `peer.js`)
- **Severity:** 🟡 Low
- **Description:** `element.style.display = 'none'` and `element.style.display = 'flex'` are used throughout the codebase to show/hide elements. This mixes presentation logic into JavaScript and prevents CSS-only animations on visibility changes.
- **Fix:** Use `classList.add('hidden')` / `classList.remove('hidden')` with a corresponding CSS rule `.hidden { display: none !important; }`.

### Issue 18: `connection-quality` Displays "Excellent" at 8ms — Misleading
- **File:** `js/ui.js`, lines 180, 325
- **Severity:** 🟡 Low
- **Description:** `updateConnectionHealth(8)` is called when the peer opens but before any real ping/pong is received. The sidebar shows "Excellent — 8 ms" which is fabricated. Users are misled into thinking they have 8ms latency when the real latency hasn't been measured yet.
- **Fix:** Show "--" until the first actual `pong` is received.

### Issue 19: `clearChat()` Also Resets `state.messagesSent` But Not the Statistics Panel
- **File:** `js/ui.js`, lines 541–558
- **Severity:** 🟡 Low
- **Description:** `clearChat()` resets `state.messagesSent = 0` and updates `messageCount` and `statMessages` elements. But the sidebar "Room Information" `peerCount` and the stats panel "Users" counter are not reset. After clearing chat, counts look inconsistent.
- **Fix:** Clear/sync all stat counters in `clearChat()`.

### Issue 20: No Error Boundary for PeerJS Calls
- **File:** `js/voice.js`, `js/screen.js`
- **Severity:** 🔴 High
- **Description:** `state.peer.call(peerId, stream, ...)` is called without checking if the connection to that peer is still open. If a peer disconnects between connection setup and the call attempt, this will throw. There is no try/catch around peer call creation.
- **Fix:** Wrap all `state.peer.call()` invocations in try/catch.

### Issue 21: `loadGifs()` Uses a `setTimeout(150ms)` Fake Loading Delay
- **File:** `js/ui.js`, lines 436–448
- **Severity:** 🟡 Low
- **Description:** `setTimeout(() => { grid.innerHTML = ''; gifs.forEach(...) }, 150)` introduces an artificial 150ms delay before rendering GIFs. Since GIFs are from a static local catalog (no API call), there is no actual async operation. This is fake latency that only hurts UX.
- **Fix:** Remove the setTimeout and render immediately.

### Issue 22: `state.connections` Not Guarded Against Open Check Before Sending
- **File:** `js/peer.js`, lines 495–498; `js/files.js`, lines 85–88
- **Severity:** 🟡 Medium
- **Description:** `broadcast()` iterates `state.connections` and calls `c.send(payload)`. There is no check that `c.open === true` before sending. If a connection was added to the array but hasn't opened yet (or is in a closing state), sending will throw a PeerJS error.
- **Fix:** Add `if (c.open) c.send(payload)`.

### Issue 23: Missing `aria-label` on Emoji/GIF/Attachment Buttons
- **File:** `app.html`, lines 687–719
- **Severity:** 🟡 Medium
- **Description:** The `emojiBtn`, `attachmentBtn`, `gifBtn` composer buttons have `title` attributes but no `aria-label`. Screen readers use `aria-label` preferentially.
- **Fix:** Add `aria-label` to all icon-only interactive elements.

### Issue 24: `console.log('ChitLAN v3.0 fully initialized')` Left in Production
- **File:** `js/app.js`, line 425
- **Severity:** 🟡 Low
- **Description:** Console logging left in production code.
- **Fix:** Remove or gate behind a debug flag.

---

<a id="part-3"></a>
## Part 3 — JavaScript Architecture Review

### Maintainability: 6/10

The ES module split is a significant improvement over `script.js`. The files are focused enough that a developer can navigate to relevant code. However:
- `ui.js` (575 lines) houses the emoji database, GIF catalog, all DOM rendering functions, theming, and notifications — too many responsibilities
- `peer.js` (509 lines) houses connection lifecycle, data routing, kick logic, room locking, broadcast, telemetry — too many responsibilities
- `app.js` (426 lines) is a single `DOMContentLoaded` handler with no sub-grouping, no comments explaining interaction between event handlers

### Scalability: 4/10

The current architecture scales poorly:
- Mesh topology: adding a 30th peer means each peer maintains 29 direct connections. At 30 users, that's 870 total connections across the room. This is why real-time platforms use SFU (Selective Forwarding Unit) architectures.
- Host-as-relay: the host node relays all messages to all peers. With 29 peers and 1 MB file chunks, the host must send 29 MB of data for each 1 MB chunk received — 29× amplification.
- No pagination or virtual scrolling for the message list — thousands of messages accumulate in DOM.

### Separation of Concerns: 7/10

Good separation between `peer.js` and `ui.js`. Weak separation within `ui.js` (data + rendering in same file) and within `peer.js` (connection management + feature commands).

### Error Handling: 3/10

- Most `catch` blocks are empty: `catch (e) {}` or `catch(() => {})` appear 12+ times
- No centralized error logging or reporting
- Users receive toast errors but internal errors are silently swallowed

### Configuration Management: 6/10

`constants.js` is a good start but incomplete:
- `MAX_ROOM_PEERS = 29` but the landing page says "30 Users per room" and in one place says "10-member capacity limits" — inconsistent marketing
- `CHAT_HISTORY_KEY` is defined but `localStorage` chat history is never actually implemented in `app.js` or any module
- PeerJS server configuration (host, port, path, STUN/TURN) should be in constants but is not configurable

### Recommended Architecture Improvements

1. **Event Bus Pattern:** Replace direct cross-module function calls with a lightweight event emitter to eliminate circular dependency risk:
```js
// js/eventBus.js
const listeners = {};
export const on = (event, fn) => (listeners[event] ??= []).push(fn);
export const emit = (event, data) => (listeners[event] || []).forEach(fn => fn(data));
export const off = (event, fn) => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); };
```

2. **Module Init Pattern:** Each module exposes an `init(deps)` function instead of importing state directly:
```js
// js/voice.js
export function init({ state, emit, appendSystemMessage }) {
  // store refs, no direct imports of other modules
}
```

3. **Error Registry:**
```js
// js/logger.js
export function logError(context, err) {
  console.error(`[ChitLAN:${context}]`, err);
  // Could send to a debug panel in dev mode
}
```

4. **State Immutability Guards:** Use a Proxy to warn when unexpected properties are written to state in development.

---

<a id="part-4"></a>
## Part 4 — WebRTC & PeerJS Audit

### Connection Lifecycle Issues

**Issue 4.1: No STUN/TURN Server Configuration** *(Critical)*

The `new Peer(roomId)` call uses default PeerJS configuration with no ICE server override. This means:
- The app uses only Google STUN by default (`stun:stun.l.google.com:19302`)
- No TURN server = connection failure when both peers are behind Symmetric NAT (common in corporate/university networks)
- For a "LAN collaboration" tool this is less critical (both peers on same LAN = host candidates work), but the app is also deployed publicly on GitHub Pages

**Fix:**
```js
state.peer = new Peer(roomId, {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add free TURN servers or self-hosted coturn
    ]
  }
});
```

**Issue 4.2: Single Reconnect Attempt, No Backoff** *(Medium)*

`peer.on('disconnected')` triggers `peer.reconnect()` after exactly `RECONNECT_INTERVAL` (3000ms) once. If that reconnect fails, no further attempts are made. `peer.reconnect()` can only be called once.

**Fix:** Use exponential backoff with a max retry count:
```js
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;
peer.on('disconnected', () => {
  if (reconnectAttempts >= MAX_RECONNECT || peer.destroyed) return;
  reconnectAttempts++;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  setTimeout(() => {
    try { if (!peer.destroyed) peer.reconnect(); } catch(e) {}
  }, delay);
});
```

**Issue 4.3: No Handling of `peer.on('error')` for `peer-unavailable`** *(High)*

`peer.on('error')` shows a toast but does not differentiate error types. `err.type === 'peer-unavailable'` occurs when the host ID doesn't exist — this is a critical UX failure moment (joiner enters wrong ID) that deserves a specific UI response.

**Fix:**
```js
peer.on('error', err => {
  if (err.type === 'peer-unavailable') {
    showToast('Host not found. Check the Room ID.', 'error');
    setConnectionStatus('Host not found', 'disconnected');
  } else if (err.type === 'network') {
    showToast('Network error. Check your connection.', 'error');
  } else {
    showToast(`Connection error: ${err.type}`, 'error');
  }
});
```

**Issue 4.4: `conn.on('close')` Does Not Attempt Reconnection for Joiners** *(High)*

When the DataChannel closes (host disappears), `connectToHost` fires `conn.on('close')` → shows a toast. No reconnection is attempted. The user must manually re-enter the Room ID.

### Mesh Scalability

At 30 users (1 host + 29 peers), the host maintains 29 `DataConnection` objects AND up to 29 voice/video/screen media connections simultaneously. Each WebRTC connection uses browser resources (ICE agents, DTLS sessions, SCTP associations). Modern browsers can handle ~50-100 connections, but performance degrades significantly above 10-15.

Real platforms (Discord, Zoom) use **SFU** architecture to avoid mesh — not feasible without a server, but worth documenting as a hard scalability ceiling.

### Peer Disconnect Handling

**Issue 4.5: `state.connections` Not Cleaned Up on Joiner Disconnect** *(High)*

When a joiner disconnects, `c.on('close')` fires on the host's connection object (correctly). The host removes `c` from `state.connections` and calls `updateUserList()`. However, the joiner peer list is never updated on other joiners' browsers — they still see the departed user in `voice-users` if they are in a call.

**Reason:** The host broadcasts a system message but does NOT send a `peer-left` data message to update all joiners' user lists. Joiners rely on `state.conn.on('data')` to receive updates, but the host never sends a peer-left notification.

**Fix:** Add a `peer-left` message type to the broadcast when a connection closes.

### Stream Cleanup

**Issue 4.6: `leaveVoice()` Removes Audio Elements But May Leave Orphaned Streams** *(Medium)*

`leaveVoice()` calls `document.querySelectorAll('audio[id^="audio-"]').forEach(a => a.remove())`. This removes the DOM elements but `audio.srcObject` still holds a reference to the MediaStream. Browsers should garbage-collect unreferenced streams, but explicitly setting `srcObject = null` before removing is best practice.

**Issue 4.7: Video Tiles Not Removed When Remote Peer Leaves During Video Call** *(High)*

`removeVideoTile(call.peer)` is called in `callVideoPeer`'s `call.on('close')` handler. But the `peer.on('connection', c).on('close')` handler calls `removeVideoTile(c.peer)`. However, the `call.on('close')` for video calls may not fire when the peer's DataConnection closes — these are separate PeerJS/WebRTC entities. In practice, a peer leaving unexpectedly can leave a frozen video tile indefinitely.

**Fix:** In the `c.on('close')` cleanup block, explicitly call `removeVideoTile(c.peer)` AND close any associated media calls.

### File Transfer Reliability

**Issue 4.8: Host Re-broadcasts File Chunks to All Peers Including Receiver** *(Critical)*

In `peer.js:handlePeerData`:
```js
} else if (data.type === 'file-chunk') {
  handleIncomingFileChunk(data, c);
  if (state.isHost) {
    state.connections.forEach(p => {
      if (p.peer !== c.peer) p.send(data); // ← broadcasts to ALL other peers
    });
  }
}
```

This means when Peer A sends a file, the host receives it AND re-broadcasts to all other peers (including Peer B, C, D...). Every peer receives every file transfer. In a room with 5 users, a 1 MB file causes the host to receive 1 MB and re-send 3 MB (to 3 other peers), even if nobody else wanted the file. There is no per-transfer "recipient" selection.

### DataChannel Buffering

The 5ms setTimeout between chunks (`setTimeout(sendNextChunk, 5)`) with 1 MB chunks results in a theoretical maximum throughput of ~200 MB/s — but RTCDataChannel has a send buffer. When the buffer fills (`bufferedAmount` exceeds threshold), subsequent sends will block or throw. There is no `bufferedamountlow` event handler — chunks are sent as fast as the setTimeout allows, which can overrun the buffer on slow connections.

**Fix:**
```js
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MB buffer threshold
function sendNextChunk() {
  if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    channel.addEventListener('bufferedamountlow', sendNextChunk, { once: true });
    return;
  }
  // send chunk...
}
```

---

<a id="part-5"></a>
## Part 5 — Performance Audit

### JavaScript Performance

**Issue 5.1: `messagesDiv.scrollTop = messagesDiv.scrollHeight` on Every Message** *(Medium)*

Every `appendMessage()` call triggers a layout read (`scrollHeight`) followed by a layout write (`scrollTop`). This is a forced layout/reflow on every single message. The correct pattern is to check if the user is already near the bottom before auto-scrolling:
```js
function scrollToBottom(el) {
  const threshold = 100; // px from bottom
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  if (isNearBottom) el.scrollTop = el.scrollHeight;
}
```

**Issue 5.2: `renderUserList()` Rebuilds the Entire DOM on Every User Event** *(Medium)*

`renderUserList()` calls `container.innerHTML = ''` then rebuilds all user elements. It's called on every join/leave/kick. With 29 users, this is 29 DOM node creations per event. This should use a diffing approach or maintain a `Map<peerId, HTMLElement>`.

**Issue 5.3: `EMOJI_DATABASE` (128 entries) and `RICH_GIF_CATALOG` (24 entries) Are Module-Level Constants That Initialize on First Import** *(Low)*

These are declared at module scope in `ui.js` and initialize when the module is first imported. Since they are static arrays, this is fine — but embedding 128 emoji objects in source code increases initial parse time. Consider lazy-loading emoji data.

**Issue 5.4: `telemetryInterval` Sends Pings to All Connections Every 3 Seconds** *(Low)*

With 29 connections, telemetry sends 29 JSON `{type:'ping', timestamp}` messages every 3 seconds. This is 580+ bytes of overhead every 3 seconds from the host alone. Consider a longer interval (10-15s) for telemetry.

**Issue 5.5: `addActivityItem` Removes Old Items with `feed.removeChild(feed.lastChild)`** *(Low)*

In `ui.js:493-495`, `while (feed.children.length > 8) feed.removeChild(feed.lastChild)` triggers a layout read (`children.length`) in a loop. Minor but avoidable.

### Rendering Performance

**Issue 5.6: Backdrop Filter on Multiple Elements** *(Medium)*

`backdrop-filter: blur(18px)` is applied to `.chat-container`, `.sidebar-section` (multiple), `.panel` (multiple), `.emoji-picker-popover`, `.gif-modal-overlay`. Each `backdrop-filter` element requires the browser to composite that element on its own layer. With 8+ compositing layers, GPU memory usage is elevated, especially on integrated graphics (mobile, low-end laptops).

**Issue 5.7: CSS Animation on Fixed-Position Gradient Orbs** *(Low)*

`.gradient.one` and `.gradient.two` have `animation: float 12s ease-in-out infinite` with `translateY`/`translateX` transforms and `filter: blur(120px)`. `filter: blur` is expensive — the browser must rasterize and blur a 500×500px element every animation frame. This runs continuously regardless of whether the user is actively using the app. Use `@media (prefers-reduced-motion: reduce)` to disable (not currently in `app.css`).

**Issue 5.8: No `will-change` Hints for Animated Elements** *(Low)*

Animated elements (`.gradient`, message bubbles via `fadeUp`, `.emoji-picker-popover`) do not use `will-change: transform` to hint GPU compositing. This can cause jank when animations start.

### Media Performance

**Issue 5.9: `video.play()` Called Without Checking ReadyState** *(Low)*

In `voice.js:154` and `screen.js:118`: `video.play().catch(() => {})`. The `.catch(() => {})` suppresses the `AbortError` that occurs when a new srcObject is set before the previous play promise resolves. This can cause a brief flicker on stream replacement.

**Fix:** Cancel the previous play promise before setting a new srcObject:
```js
video.pause();
video.srcObject = null;
video.srcObject = newStream;
video.play().catch(() => {});
```

### PWA / Asset Performance

**Issue 5.10: `og-image2.3mb.png` is 2.3 MB** *(High)*

The social media Open Graph image referenced in `index.html:30` and `41` is **2.3 MB**. Google recommends OG images under 300 KB. This image is loaded by social media crawlers and previews. Use WebP at 80% quality to reduce to ~60-80 KB.

**Issue 5.11: No Web Font `display` Strategy** *(Medium)*

`app.html` loads Google Fonts Inter without `&display=swap`. This causes FOIT (Flash of Invisible Text). Add `display=swap` to the font URL. Also, the font link loads 6 weights (300-800) but most UI elements use 400, 600, 700 only.

**Issue 5.12: No Resource Hints for PeerJS CDN** *(Low)*

`app.html` loads PeerJS from `unpkg.com` without `<link rel="preconnect" href="https://unpkg.com">`. Adding a preconnect hint reduces connection latency.

---

<a id="part-6"></a>
## Part 6 — UI/UX Audit

### Visual Design Quality: 8/10

The glassmorphism design system is polished and modern. The dark theme with purple/cyan accents, consistent border-radius tokens, backdrop blur panels, and gradient buttons create a premium aesthetic. The landing page (`index.html`) is particularly well-crafted with the animated network visualization, hero section, and scroll-reveal animations.

### Layout Consistency Issues

**Issue 6.1: `app.html` Hero Section and Workspace Are Both Visible Simultaneously** *(High)*

`app.html` renders a hero section (`<section class="hero">`) with the connection card AND a workspace section (`.workspace`) below it. The workspace is visible even before connecting. Users scroll from the hero down to see the workspace. This is confusing — most collaboration apps show a clean "Join Room" screen before revealing the workspace.

**Recommendation:** Hide the `.workspace` section with `display: none` until `initPeer()` succeeds, then scroll to it (currently `app.js:66-68` does scroll but doesn't hide/show the section).

**Issue 6.2: Settings Button in Navbar Has No Functionality** *(High)*

`app.html:91-95` renders a settings button (`⚙`) in the navbar header. It has no `id`, no event listener, and no functionality. This is a dead UI element visible to all users.

**Issue 6.3: The "Connection Health" Panel Shows Hardcoded "Excellent" Before Any Connection** *(Medium)*

Already noted in Part 2 (Issue 18), but from a UX perspective: users see "Connection: Excellent | Latency: 8ms" before they've even connected. This is actively misleading.

**Issue 6.4: No Empty State for File Transfers When No File is Selected** *(Low)*

The "Send File" button is always visible and clickable even when no file is selected. Clicking it shows a toast. Better UX: disable the button until a file is selected.

**Issue 6.5: Emoji Picker Category Doesn't Reset Search on Category Switch** *(Medium)*

In `app.js:304-310`: when a category button is clicked, `renderEmojis(btn.dataset.cat)` is called. But `emojiSearchInput` is not cleared. So if the user types "cat" in the search, then clicks "Animals", the search result is cleared but the text remains, creating confusing state.
**Fix:** Clear `emojiSearchInput.value = ''` on category button click.

**Issue 6.6: No Visual Feedback When a File Transfer Is in Progress** *(Medium)*

The global progress bar in the right panel updates during transfer, but the chat area progress bar is the primary indicator. On mobile (where the right panel stacks), the user only sees the chat progress. The UX for large file transfers needs a persistent status indicator.

**Issue 6.7: The Screen Sharing Modal Opens Automatically on Any Screen Share Event** *(Medium)*

`showScreenStream()` calls `openScreenModal()` — meaning even when a remote peer starts sharing, a large modal overlay appears for all room participants immediately. This is highly disruptive. Users should be notified and choose to open the theater view.

**Recommendation:** Replace auto-open with a toast notification:
```
"[Username] started screen sharing — Click to view"
```

**Issue 6.8: No Confirmation Before Clear Chat** *(Low)*

`clearChatBtn` immediately clears all messages. There is no "Are you sure?" confirmation. A brief undo toast (with 3-second window to undo) would be better.

**Issue 6.9: Drag-and-Drop Visual Feedback Uses Inline Style Mutation** *(Low)*

In `app.js:372`: `chatContainer.style.border = '2px dashed var(--primary)'`. Using inline style directly overrides the CSS cascade and doesn't play nicely with the design system. Use a CSS class toggle instead.

**Issue 6.10: `voiceToggleBtn` and `joinBtn` Are Duplicate Buttons for the Same Action** *(Low)*

Both `voiceToggleBtn` (in chat header) and `joinBtn` (in voice panel) call `startVoice`. This is intentional redundancy for discoverability, but both should show consistent state (active/inactive).

### Mobile Usability

The responsive CSS is reasonably comprehensive. However:
- At 768px, the navbar wraps into three full-width rows — very tall, pushes content far down
- The composer wraps on mobile with `flex-wrap: wrap` — good, but the send button becomes full-width which is fine
- The emoji picker (`position: absolute, bottom: 80px, left: 20px`) may overflow on small screens (320px width)
- No haptic feedback or mobile-specific touch interactions

---

<a id="part-7"></a>
## Part 7 — Accessibility Audit

### Overall Score: 3/10 — Significant Gaps

### Critical Accessibility Issues

**Issue 7.1: No `aria-label` on Icon-Only Buttons** *(Critical)*

All emoji/GIF/attachment buttons, voice/video/screen share buttons use emoji characters as their only label. Screen readers will announce "Microphone emoji button" or similar unpredictable text. Required fix:
```html
<button id="emojiBtn" class="composer-btn" aria-label="Insert emoji">😊</button>
<button id="gifBtn" class="composer-btn" aria-label="Send GIF">GIF</button>
<button id="voiceToggleBtn" class="header-btn" aria-label="Join voice chat">🎤</button>
```

**Issue 7.2: No `role="dialog"` or Focus Trap on Modals** *(Critical)*

Both the screen share modal (`#screenModal`) and GIF modal (`#gifModal`) are shown/hidden via `display: flex/none`. Neither has:
- `role="dialog"`
- `aria-modal="true"`
- `aria-labelledby` pointing to a heading
- Focus trap (Tab key should cycle within the modal)
- Focus restoration on close (focus should return to the trigger button)

**Issue 7.3: No Keyboard Shortcut for Send or Modal Close** *(High)*

- `Enter` to send messages works ✅
- `Escape` to close modals: NOT implemented
- No keyboard shortcut to open emoji picker, GIF modal

**Issue 7.4: Message List Is Not Announced to Screen Readers** *(Critical)*

New chat messages appear in `#messages` via `appendChild`. Screen readers will not announce new messages unless `role="log"` or `aria-live="polite"` is set on the container.
```html
<div id="messages" class="messages" role="log" aria-live="polite" aria-label="Chat messages">
```

**Issue 7.5: Focus Indicator Suppressed Globally** *(Critical)*

`app.css:34-37`: `button, input, select { outline: none; }` removes the default browser focus ring from all interactive elements. There is no custom `:focus-visible` style anywhere in the CSS. This makes keyboard navigation invisible — a WCAG 2.1 Level AA failure (SC 2.4.7).

**Fix:**
```css
button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

**Issue 7.6: Color Contrast — `--muted: #94A3B8` on `--bg: #070B14`** *(High)*

`#94A3B8` on `#070B14` yields a contrast ratio of approximately 5.1:1 — passing WCAG AA (4.5:1) for normal text. However, `#64748b` (used in `index.html:431` for `.hero-note`) on the dark background is approximately 3.2:1 — failing WCAG AA. Audit all muted text instances.

**Issue 7.7: `<select>` Color Input Has No `aria-label`** *(Medium)*

`<select id="color">` in `app.html:164` lets users pick a chat color but has no `aria-label`. Screen readers announce "Color" (from the `<label>` element nearby) but only if the label is properly associated via `for`/`id`. Check that `<label for="color">` exists — it does NOT in the current HTML. Labels are adjacent but not associated.

**Fix:**
```html
<label for="color">Choose Color</label>
<select id="color" ...>
```

**Issue 7.8: No `prefers-reduced-motion` in `app.css`** *(High)*

`animations.css` contains `@keyframes float`, `@keyframes pulse`, `@keyframes wave` etc. `app.css` uses `animation: float 12s infinite`. Neither `app.css` nor `animations.css` has a `@media (prefers-reduced-motion: reduce)` block to disable continuous animations. `index.html` inline styles DO include reduced motion (lines 1224–1237) — but `app.html` does not.

**Issue 7.9: Video Elements Have No Captions** *(Medium)*

All `<video>` elements (`#screenViewer`, `#screenViewerModal`, video tiles) have no captions, descriptions, or `aria-label`. This is acceptable for screen sharing (visual content) but should have at minimum a text description of what is being shared.

**Issue 7.10: The `<h1>` in `app.html` is Incorrect** *(Medium)*

`app.html:111-119` uses `<h1>Connect Collaborate Share</h1>` in the hero section (three words each on separate lines with no semantic meaning as a sentence). The workspace `<h2 id="profileName">Guest User</h2>` and `<h2>Workspace</h2>` are h2 under no h1 in the workspace. The heading hierarchy is broken.

---

<a id="part-8"></a>
## Part 8 — Browser Compatibility

### Chrome/Edge: ✅ Full Support

ES modules, WebRTC, `getDisplayMedia`, `getDisplayMedia` audio capture, `backdrop-filter`, CSS `min()`, CSS custom properties — all fully supported. PeerJS 1.5.5 is tested primarily against Chromium.

### Firefox: ⚠️ Partial Issues

- `backdrop-filter` requires `layout.css.backdrop-filter.enabled` flag in older Firefox (enabled by default in Firefox 103+). Modern Firefox: ✅
- `getDisplayMedia` with audio: **audio capture from desktop/tab is NOT supported in Firefox** (only screen video). `startScreenShare()` requests `audio: false` so this is not broken, but audio screen capture will never work in Firefox.
- CSS `mask-image` (used in `app.css:95` for grid background) requires `-webkit-mask-image` prefix for older Firefox versions
- `RTCDataChannel` binary type for ArrayBuffer works: ✅

### Safari (Desktop): ⚠️ Notable Issues

- `getDisplayMedia`: supported from Safari 13+. However, Safari does NOT support screen audio capture.
- `backdrop-filter`: supported from Safari 9+ with `-webkit-backdrop-filter` prefix. The current CSS does NOT use the prefixed version — panels may lack blur on older Safari.
- **Fix:** Add `-webkit-backdrop-filter: blur(18px)` alongside `backdrop-filter: blur(18px)`.
- CSS `min()` function: supported from Safari 11.1+ ✅
- ES modules: fully supported ✅
- PeerJS DataChannel: ✅

### iOS Safari: ⚠️ Significant Issues

- `getDisplayMedia` (screen sharing): **NOT supported on iOS Safari** as of iOS 17. Screen sharing will silently fail.
- `getUserMedia` (camera/audio): supported in iOS 11+ but has limitations:
  - Background audio stops when the app is backgrounded on iOS
  - `autoplay` on video elements requires user gesture (ChitLAN uses `video.play()` programmatically — this may fail without interaction)
- `backdrop-filter`: requires `-webkit-backdrop-filter` prefix on iOS Safari
- WebRTC performance on iOS is generally weaker than Chrome

### Android Chrome: ✅ Good Support

- `getDisplayMedia` available on Android Chrome 74+
- All ES module features work
- Performance may degrade on low-end devices with many video tiles

### Key Cross-Browser Fix Needed

```css
/* In app.css and voice.css and screen.css, add: */
.chat-container, .panel, .sidebar-section {
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
}
```

---

<a id="part-9"></a>
## Part 9 — Security Audit

### Issue 9.1: `isHtml: true` Message XSS (Critical — Confirmed)

Already detailed in Part 2 (Issue 5). Any peer can craft a data channel message with `{ type: 'message', message: '<script>...</script>', isHtml: true }` and all peers will execute it via `div.innerHTML`.

**Immediate Fix:** GIF messages should NEVER set raw HTML from a data channel message. Instead:
```js
// Receiver side: detect GIF URL pattern from a peer, render safely
if (data.isHtml && isGifUrl(data.message)) {
  const img = document.createElement('img');
  img.src = sanitizeUrl(data.message);
  bubble.appendChild(img);
} else {
  bubble.textContent = safeText(data.message);
}

function isGifUrl(str) {
  return /^https:\/\/media\.giphy\.com\/media\/[a-zA-Z0-9_-]+\/giphy\.gif$/.test(str);
}
```

### Issue 9.2: `sendGifMessage()` Sends Raw HTML to Peers (Critical)

`js/ui.js:453`: `const htmlContent = '<img src="${gifUrl}" class="gif-message-img" alt="GIF">'` — this HTML string is sent directly to all peers. The `gifUrl` comes from the RICH_GIF_CATALOG, so it's trusted in the sender's context. But the receiver side processes it as raw HTML. Even though catalog URLs are safe, this architecture is insecure by design.

**Fix:** Send only the URL, not HTML: `{ type: 'message', gifUrl: gifUrl, isGif: true }`.

### Issue 9.3: `room-redirect` Can Redirect Users to Arbitrary Peer IDs (Medium)

`peer.js:429-443`: When a joiner receives a `room-redirect` message, they blindly call `connectToHost(data.targetHostId)` without validation. A malicious peer could send `{ type: 'room-redirect', targetHostId: 'malicious-peer-id' }` to redirect any joiner to an attacker-controlled peer.

**Recommendation:** Since all peers can receive data from any connection, validate that `targetHostId` follows the expected format (4-digit numeric ID from `generateNumericIdWithPrefix`):
```js
function isValidPeerId(id) {
  return /^\d{4}$/.test(id);
}
```

### Issue 9.4: `kickParticipantByName()` Uses `confirm()` (Low — Not XSS, but UX Security)

`peer.js:50`: `confirm(`Are you sure you want to remove ${nickname}...`)` uses the browser's native confirm dialog. If `nickname` contains HTML, it renders as plain text in the confirm dialog (safe). But native dialogs are blocking and can be suppressed by the browser in some iframe/embed contexts.

### Issue 9.5: Object URLs Accumulate Without Revocation (Medium — already covered in Issue 6)

Unrevoiced Object URLs can expose file content to JavaScript for the lifetime of the session.

### Issue 9.6: IP Display Sends User IP to Third-Party (Medium)

`utils.js:6`: `fetch('https://api.ipify.org?format=json')` — discussed in Issue 9. Additionally, the IP is displayed in a visible `#ip-display` element in the navbar. Any screen-sharing session will show the user's public IP to all viewers.

**Fix:** Remove the IP display entirely, or use `RTCPeerConnection` to detect LAN IP without external services.

### Issue 9.7: No Content Security Policy (CSP) Header (Medium)

There is no `Content-Security-Policy` meta tag in either `index.html` or `app.html`. A CSP would mitigate XSS risk significantly. Recommended:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://unpkg.com;
  connect-src https://0.peerjs.com wss://0.peerjs.com https://api.ipify.org;
  img-src 'self' data: blob: https://media.giphy.com;
  media-src 'self' blob:;
  style-src 'self' https://fonts.googleapis.com 'unsafe-inline';
  font-src https://fonts.gstatic.com;
">
```

### Issue 9.8: PeerJS Loaded from Unpkg CDN Without Subresource Integrity (SRI) (Medium)

`app.html:27`: `<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js">` has no `integrity` attribute. If unpkg.com is compromised, arbitrary JavaScript executes in all ChitLAN sessions.

**Fix:**
```html
<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"
  integrity="sha384-[hash]"
  crossorigin="anonymous"></script>
```
(Compute SHA-384 hash of the specific file and add it.)

### Issue 9.9: `localStorage` for Theme Key Is Low Risk But Worth Noting (Low)

`THEME_KEY = 'chitlan_theme'` stores either `'dark'` or `'light'` in localStorage. No sensitive data. ✅

### Issue 9.10: File Transfer Does Not Validate MIME Type (Low)

`handleIncomingFileChunk` accepts any MIME type. When the file completes, it creates an `<img>` or download link based on `fileEntry.mimeType.startsWith('image/')`. A malicious sender could set `mimeType: 'image/'` for an HTML file. The browser would render it as an image (which would fail gracefully), but opening it via `window.open(url, '_blank')` could execute HTML content.

**Fix:** Validate file contents (check magic bytes/file signature) rather than trusting the sender-supplied MIME type.

---

<a id="part-10"></a>
## Part 10 — Bug Hunting

### Bug 1: Race Condition — `connectToHost` Before Peer Initializes
- **Severity:** 🔴 Critical
- **Description:** `setTimeout(() => connectToHost(id), 1000)` — PeerJS may not have opened within 1 second
- **Reproduction:** Use on a slow network or overloaded PeerServer; enter join mode and click Launch
- **Root Cause:** `state.peer.connect()` called before `peer.on('open')` fires
- **Fix:** Move `connectToHost` call inside `peer.on('open')` callback

### Bug 2: GIF Modal Screen Share Auto-Open
- **Severity:** 🟠 High
- **Description:** When any peer starts screen sharing, `showScreenStream()` → `openScreenModal()` — the theater modal opens for ALL participants without user consent
- **Reproduction:** Peer A starts screen share; Peer B sees fullscreen modal appear immediately
- **Root Cause:** `openScreenModal()` unconditionally called inside `showScreenStream()`
- **Fix:** Show a notification toast instead; let users opt in to open the theater view

### Bug 3: Frozen Video Tiles on Peer Disconnect
- **Severity:** 🟠 High
- **Description:** When a peer in a video meeting disconnects abruptly (browser crash, network loss), their video tile remains frozen indefinitely
- **Reproduction:** Start video meeting with 2+ peers; kill one browser tab abruptly
- **Root Cause:** `call.on('close')` may not fire for abrupt disconnects; no heartbeat clears stale tiles
- **Fix:** Add tile TTL tracking; clear tiles when DataConnection closes for a peer

### Bug 4: Emoji Picker Search Retained After Category Switch
- **Severity:** 🟡 Medium
- **Description:** Type "cat" in emoji search; click Animals category — search text remains, results change confusingly
- **Reproduction:** Open emoji picker → type in search → click category button
- **Root Cause:** Category click handler doesn't clear `emojiSearchInput.value`
- **Fix:** Clear search input on category button click

### Bug 5: Duplicate Peer Audio When Both startVoice and startVideoMeeting Are Called
- **Severity:** 🟠 High
- **Description:** User calls `startVoice()`, then `startVideoMeeting()` — two separate audio streams are transmitted
- **Root Cause:** No mutex guard between voice and video call modes
- **Fix:** Check `state.isInCall` in `startVideoMeeting`

### Bug 6: `state.typingTimeout` Undefined in state.js
- **Severity:** 🟡 Medium
- **Description:** `state.typingTimeout` is used in `ui.js:504` but never declared in `state.js`. While JavaScript allows dynamic property creation, static analysis tools and TypeScript would flag this.
- **Root Cause:** Incomplete `state.js` definition
- **Fix:** Add `typingTimeout: null` to state

### Bug 7: Global Progress Bar Conflicts With Multiple Concurrent Transfers
- **Severity:** 🟡 Medium
- **Description:** When host sends a file while simultaneously receiving a file, the global progress bar (#progressFill) flickers between two files' progress
- **Root Cause:** `updateFileProgress()` unconditionally updates the global bar for any file transfer
- **Fix:** Only update global bar for the "last active" transfer by tracking `state.activeTransferFileId`

### Bug 8: Reconnection Loop in Legacy `script.js` (Not Used but Dangerous)
- **Severity:** 🟡 Low (orphaned code)
- **Description:** `script.js:256-258`: `conn.on('close', () => { setTimeout(connectToHost, RECONNECT_INTERVAL); })` — if the host is permanently offline, this would loop reconnections forever, consuming browser resources
- **Root Cause:** No max retry limit in legacy code
- **Note:** This code is not active in v3 but should still be removed

### Bug 9: `state.connections` Push Before `intro` Validation
- **Severity:** 🟡 Medium
- **Description:** In `peer.js:287`, `state.connections.push(c)` happens inside the `intro` handler. But the `c.on('data')` listener is registered in the `peer.on('connection')` block BEFORE `intro` is received. If a peer sends any other message type before `intro`, it's processed but `c.nickname` is undefined — causing `broadcast` to show `undefined` as nickname.
- **Fix:** Guard all data handlers: `if (!c.nickname && data.type !== 'intro') return;`

### Bug 10: `clearScreenViewer()` Sets `state.currentScreenSharer = null` But Joiner Starts Screen Share When It Shouldn't
- **Severity:** 🟡 Medium
- **Description:** `clearScreenViewer()` resets `state.currentScreenSharer = null`. If a screen share ends and a joiner triggers `startScreenShare()`, the `if (state.currentScreenSharer ...)` check passes (null !== their nickname), but they are not connected to all peers via the host — the joiner can only call the host, not other joiners.
- **Root Cause:** Non-host screen sharing only calls `state.conn.peer`, not all peers
- **Fix:** This is correct behavior by design (peer→host→broadcast), but the `screen-status` broadcast should trigger the host to relay the screen call to all other peers

### Bug 11: Install Button Never Hidden After Installation
- **Severity:** 🟡 Low
- **Description:** `app.js:421`: `installBtn.style.display = 'none'` after `deferredPrompt.userChoice`. But if PWA is already installed and the user opens the page again, `beforeinstallprompt` may not fire, and the button remains hidden (correct). However, if the user dismisses the install prompt (userChoice.outcome === 'dismissed'), `deferredPrompt` is nulled but the button is still hidden — the user can never retry.
- **Fix:** Only hide the button if `outcome === 'accepted'`:
```js
const { outcome } = await deferredPrompt.userChoice;
deferredPrompt = null;
if (outcome === 'accepted') installBtn.style.display = 'none';
```

### Bug 12: Missing Manifest and Service Worker — PWA Will Never Install
- **Severity:** 🔴 Critical
- **Description:** The `beforeinstallprompt` event never fires without both a `manifest.json` and a registered Service Worker. The install button logic exists but can never trigger.
- **Root Cause:** PWA infrastructure was planned but not implemented

### Bug 13: `CHAT_HISTORY_KEY` Constant Defined But Never Used
- **Severity:** 🟡 Low
- **Description:** `constants.js:7` defines `CHAT_HISTORY_KEY = 'chitlan_chat_history'` but no code in the ES module codebase reads or writes to this localStorage key (the legacy `script.js` had `saveChatHistory`/`loadChatHistory` functions, but they don't exist in the modular codebase)
- **Fix:** Implement chat history persistence or remove the constant

### Bug 14: Emoji Insert Doesn't Respect Cursor Position
- **Severity:** 🟡 Medium
- **Description:** `ui.js:383`: `msgInput.value += emoji` appends emoji to the END of the input, ignoring cursor position. If the user clicks mid-message to position the cursor, emoji is still appended at the end.
- **Fix:**
```js
const start = msgInput.selectionStart;
const end = msgInput.selectionEnd;
const val = msgInput.value;
msgInput.value = val.slice(0, start) + emoji + val.slice(end);
msgInput.setSelectionRange(start + emoji.length, start + emoji.length);
```

### Bug 15: Screen Share Takeover Sends Stop Request to ALL Connections But Only the Active Sharer Should Respond
- **Severity:** 🟡 Medium
- **Description:** `screen.js:19`: `state.connections.forEach(c => c.send(takeoverPayload))` — sends `stop-request` to all peers. Only the current sharer should respond. Other peers receive the stop-request and call `stopScreenShare()` if they happen to have a screen stream (edge case, but possible if two peers both started sharing simultaneously before the takeover request propagated).
- **Fix:** Track which peer ID is the current sharer and send stop-request only to that connection.

---

<a id="part-11"></a>
## Part 11 — Feature Gap Analysis

### Messaging Features

| Feature | Description | Benefit | Complexity | Effort | Priority | Implementation |
|---|---|---|---|---|---|---|
| **Cursor-aware emoji insert** | Insert emoji at cursor position, not end | UX quality | Low | 1h | P0 | `selectionStart/selectionEnd` API |
| **Message reactions** | React to messages with emoji | Engagement | Medium | 1-2d | P1 | Add `reactions: {}` to message payload; broadcast `message-reaction` type |
| **Reply to message** | Quote a message in reply | Clarity | Medium | 2-3d | P1 | Store `replyTo: { id, sender, preview }` in payload; render quoted bubble |
| **Message deletion (local)** | Delete own messages from local view | Privacy | Low | 2h | P1 | Add delete button; `appendMessage` returns element ref |
| **Markdown support** | Bold, italic, code in messages | Collaboration | Medium | 1-2d | P2 | Use a safe Markdown-to-HTML parser (marked.js) with strict XSS allowlist |
| **Code blocks** | Triple-backtick fenced code in messages | Developer use | Medium | 1d | P2 | Integrate Prism.js for syntax highlighting |
| **Message search** | Search chat history | Productivity | Medium | 2d | P2 | Filter DOM messages or maintain in-memory message array |
| **Mentions** | @nickname triggers notification | Coordination | Medium | 2d | P2 | Detect `@` in input; render mention chips; badge notification |
| **Draft messages** | Persist unsent message on refresh | UX | Low | 2h | P2 | `localStorage` write on input change |
| **Pin messages** | Pin important messages | Organization | High | 3d | P3 | Add `type: 'pin-message'` to protocol; store `state.pinnedMessages` |
| **Bookmark messages** | Local-only bookmarks | Productivity | Low | 1d | P3 | `localStorage` keyed by room ID + message timestamp |

### Collaboration Features

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Shared whiteboard** | Canvas-based drawing broadcast | High | P2 | Use `<canvas>` + broadcast delta strokes as JSON |
| **Polls** | One-click voting in chat | Medium | P2 | Add `type: 'poll'` message; broadcast votes |
| **Raise hand** | Queue for speaking in voice | Low | P1 | `type: 'raise-hand'` message; visual indicator on voice tile |
| **Meeting notes** | Shared text pad | High | P3 | Broadcast character-level CRDT ops |
| **Shared timer** | Countdown timer visible to all | Low | P2 | Broadcast start time + duration; clients compute locally |

### Video & Voice Features

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Raise hand** | Visual cue during meetings | Low | P0 | Broadcast `type: 'raise-hand'`; badge on video tile |
| **Audio device switching** | Change mic mid-call | Medium | P1 | `getUserMedia({ audio: { deviceId } })` → `replaceTrack()` |
| **Camera device switching** | Change camera mid-call | Medium | P1 | Same approach as audio switching |
| **Picture-in-Picture** | Pop-out video tile | Low | P1 | `video.requestPictureInPicture()` |
| **Speaker detection highlight** | Highlight active speaker | Medium | P2 | `Web Audio API` `AnalyserNode` → detect amplitude threshold |
| **Noise suppression** | Reduce background noise | High | P3 | Use `noiseSuppression: true` in getUserMedia constraints |
| **Background blur** | Blur camera background | High | P3 | MediaPipe Selfie Segmentation via Web Worker |
| **Grid view customization** | Change grid layout | Low | P2 | CSS grid-template-columns toggler |
| **Screen annotation** | Draw over shared screen | High | P3 | Overlay canvas + broadcast strokes |
| **Live captions** | Speech-to-text in browser | High | P3 | Web Speech API `SpeechRecognition`; broadcast transcript |

### File Sharing Features

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Pause/resume transfer** | Pause mid-transfer | High | P1 | Track chunk cursor; wait for resume signal |
| **Transfer history** | List all received files | Low | P1 | Maintain `state.transferHistory` array; UI panel |
| **Clipboard image paste** | Paste image from clipboard | Low | P0 | `paste` event → `clipboardData.files` → trigger file send |
| **Drag-and-drop to chat** | Drop file into message area | Low | P0 | Already partially implemented (drag visual) — complete the flow |
| **Video preview** | Inline video playback | Medium | P2 | Check MIME type for `video/*`; create `<video>` element instead of link |
| **Folder sharing** | Share entire folder | High | P3 | `webkitdirectory` input attribute + zip before transfer |
| **Transfer to specific peer** | Select recipient | Medium | P2 | Add recipient selector UI; skip broadcast |
| **QR code for room** | Scan to join | Low | P2 | `qrcode.js` library; generate from room ID URL |

### Workspace Features

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **User avatars** | Upload or auto-generate avatar | Medium | P1 | `localStorage` profile picture; show in user list + message bubbles |
| **Custom nicknames during session** | Rename yourself mid-session | Low | P1 | Broadcast `type: 'nickname-change'` |
| **User presence status** | Online/Away/Busy indicator | Low | P1 | `document.addEventListener('visibilitychange')` → broadcast |
| **Room name** | Name the workspace | Low | P2 | `type: 'room-name'`; display in chat header |
| **Multiple rooms** | Join multiple rooms simultaneously | High | P3 | Multiple `Peer` instances + tabbed UI |
| **Recent rooms** | localStorage history | Low | P1 | Save room IDs with timestamps |

### PWA Improvements

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Web App Manifest** | Enable installation | Low | P0 | Create `manifest.json`; add `<link rel="manifest">` |
| **Service Worker** | Offline support + caching | Medium | P0 | Cache-first strategy for CSS/JS/audio; network-first for PeerJS CDN |
| **Offline indicator** | Show offline state | Low | P1 | `navigator.onLine` + `online/offline` events |
| **Install prompt improvement** | Custom install UI | Low | P2 | Styled install card instead of icon button |
| **App shortcuts** | Quick actions from app icon | Low | P3 | `shortcuts` array in manifest |

### User Experience Features

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Keyboard shortcuts** | Power-user navigation | Medium | P1 | `Ctrl+E`=emoji, `Escape`=close modals, `Ctrl+Shift+V`=voice |
| **Command palette** | `Ctrl+K` command search | High | P2 | Modal with fuzzy-search commands |
| **Settings panel** | Centralize all settings | Medium | P1 | Slide-over panel: nick, color, audio device, theme |
| **Theme customization** | Custom accent colors | Low | P2 | Update CSS custom properties from localStorage |
| **Font scaling** | Adjust text size | Low | P2 | `font-size` on `:root` saved to localStorage |
| **Notification permission UI** | Better permission request | Low | P1 | Request `Notification` permission with clear explanation |
| **Toast stacking** | Multiple toasts visible | Low | P1 | Offset position by toast index |
| **Onboarding guide** | First-time walkthrough | Medium | P2 | CSS/JS step-by-step tooltip overlay |
| **Context menus** | Right-click on message | Medium | P2 | Custom `contextmenu` event handler |
| **Emoji status** | Status emoji next to name | Low | P3 | Store in state; display next to avatar |

### Developer Experience

| Feature | Description | Complexity | Priority | Notes |
|---|---|---|---|---|
| **Debug mode** | `?debug=true` URL param | Low | P0 | Enable verbose console logging; show state panel |
| **Feature flags** | Toggle features at runtime | Low | P1 | `localStorage` map of boolean flags |
| **Logging system** | Structured log levels | Low | P0 | `js/logger.js` with ERROR/WARN/INFO/DEBUG levels |
| **Performance metrics panel** | FPS, memory, latency | Medium | P2 | `performance.memory`, `PerformanceObserver` |
| **Build system** | Bundle/minify with Vite | Medium | P1 | Current no-build setup works for dev but not optimal for production |
| **Unit tests** | Test data-handling functions | Medium | P2 | Vitest for pure functions (formatFileSize, safeText, etc.) |
| **E2E tests** | Automated room join tests | High | P3 | Playwright with two browser contexts simulating P2P |

---

<a id="part-12"></a>
## Part 12 — Code Modernization

### JavaScript Modernization

1. **AbortController for Event Cleanup:**
```js
// Current: no cleanup
document.addEventListener('click', handler);

// Modern: use AbortController
const controller = new AbortController();
document.addEventListener('click', handler, { signal: controller.signal });
// Later: controller.abort() removes all listeners with this signal
```

2. **`structuredClone` for Deep Object Copy (state snapshots):**
```js
const snapshot = structuredClone(state); // modern, no JSON.parse(JSON.stringify)
```

3. **Logical Assignment Operators:**
```js
// Current:
state.typingTimeout = state.typingTimeout || null;
// Modern:
state.typingTimeout ??= null;
```

4. **`Array.from` → Spread, `.at(-1)` for last element:**
```js
const last = feed.children[feed.children.length - 1]; // current
const last = [...feed.children].at(-1); // modern
```

5. **`navigator.share()` for Room Invite:**
```js
// Replace clipboard-only share with native share API:
if (navigator.share) {
  navigator.share({ title: 'Join my ChitLAN room', url: shareUrl });
} else {
  navigator.clipboard.writeText(shareUrl);
}
```

6. **`ResizeObserver` for Responsive Video Grid:**
```js
// Dynamically adjust grid columns based on container width
const ro = new ResizeObserver(([entry]) => {
  const cols = Math.floor(entry.contentRect.width / 150);
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, cols)}, 1fr)`;
});
ro.observe(grid);
```

7. **`IntersectionObserver` for Message Virtualization:**
```js
// Virtualize long message lists for performance
```

### CSS Modernization

1. **`-webkit-backdrop-filter` prefix missing** — add to all backdrop-filter usages
2. **`container queries`** — use `@container` for the right panel components that need to adapt to their own width (not just viewport)
3. **`@layer`** — organize CSS cascade layers: `@layer base, components, utilities`
4. **CSS `@property`** — define custom property types for animation-safe gradient transitions
5. **`prefers-reduced-motion`** — add to `animations.css` and `app.css`

### HTML Modernization

1. **`loading="lazy"` on GIF images** — already present ✅
2. **`<dialog>` element** for modals instead of `<div>` with `display:none`:
```html
<dialog id="gifModal" class="gif-modal">...</dialog>
<!-- Managed via dialog.showModal() / dialog.close() -->
<!-- Automatically handles focus trap and Escape key! -->
```
3. **`<output>` element** for progress percentage display
4. **`inputmode="none"` or `enterkeyhint="send"`** on message input for mobile keyboard optimization
5. **`autocapitalize="off"`** on nickname/room ID inputs

### Service Worker (PWA Modernization)

Create `sw.js` using the Workbox patterns:
```js
const CACHE_NAME = 'chitlan-v3';
const STATIC_ASSETS = ['/app.html', '/js/app.js', '/js/peer.js', '/css/app.css', '/ding.mp3'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('fetch', e => {
  if (STATIC_ASSETS.some(a => e.request.url.endsWith(a))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
```

### Web App Manifest

Create `manifest.json`:
```json
{
  "name": "ChitLAN",
  "short_name": "ChitLAN",
  "description": "Peer-to-peer real-time collaboration",
  "start_url": "/app.html",
  "display": "standalone",
  "background_color": "#070B14",
  "theme_color": "#7C5CFF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "shortcuts": [
    { "name": "Start Session", "url": "/app.html", "icons": [{ "src": "/icons/icon-96.png", "sizes": "96x96" }] }
  ]
}
```

---

<a id="part-13"></a>
## Part 13 — Refactoring Roadmap

### Phase 1 — Critical Bug Fixes (Week 1, ~3 days)

| Task | File | Effort |
|---|---|---|
| Fix `connectToHost` race condition (peer.on('open') callback) | `app.js`, `peer.js` | 2h |
| Fix XSS: replace `isHtml` innerHTML with safe element creation | `ui.js`, `peer.js` | 3h |
| Add `typingTimeout` to `state.js` | `state.js` | 15min |
| Add PWA manifest.json and service worker (sw.js) | New files | 4h |
| Create PWA icons (192px, 512px) | Assets | 1h |
| Register service worker in `app.html` | `app.html` | 15min |
| Fix XSS: use isGifUrl() validator for peer gif messages | `ui.js` | 1h |
| Add `aria-live="polite"` to messages container | `app.html` | 15min |
| Add `aria-label` to all icon-only buttons | `app.html` | 1h |
| Add `:focus-visible` styles | `app.css` | 30min |
| Add `-webkit-backdrop-filter` prefix | All CSS | 30min |
| Add `prefers-reduced-motion` to `app.css`, `animations.css` | CSS | 30min |

**Total Phase 1: ~3 days**

---

### Phase 2 — Performance Optimization (Week 2, ~2 days)

| Task | File | Effort |
|---|---|---|
| Remove fake 150ms GIF loading timeout | `ui.js` | 15min |
| Fix scroll-to-bottom to check proximity first | `ui.js` | 30min |
| Revoke Object URLs after file download | `files.js` | 30min |
| Add `bufferedamountlow` DataChannel backpressure | `files.js` | 2h |
| Remove the global progress bar conflict | `files.js`, `app.html` | 1h |
| Add `will-change: transform` to animated elements | CSS | 30min |
| Optimize OG image (convert og-image2.3mb.png to WebP) | Assets | 1h |
| Add Google Fonts `&display=swap` | `app.html` | 15min |
| Add `<link rel="preconnect" href="https://unpkg.com">` | `app.html` | 5min |
| Debounce typing indicator sends | `app.js` | 30min |
| Reduce telemetry to 10s interval | `peer.js` | 5min |

**Total Phase 2: ~2 days**

---

### Phase 3 — Code Refactoring (Weeks 3-4, ~5 days)

| Task | File | Effort |
|---|---|---|
| Delete `script.js` and `style.css` (orphaned legacy) | Root | 15min |
| Split `ui.js` into `ui-chat.js`, `ui-emoji.js`, `ui-notifications.js` | `ui.js` | 1d |
| Split `peer.js` into `peer-connection.js`, `peer-commands.js` | `peer.js` | 1d |
| Replace `style.display` mutations with `classList` | All JS | 3h |
| Add `CHAT_HISTORY_KEY` implementation or remove constant | `constants.js`, `ui.js` | 2h |
| Implement event bus pattern for cross-module messaging | `js/eventBus.js` | 4h |
| Add `c.open` check before sending in `broadcast()` | `peer.js` | 30min |
| Replace emoji insert `+=` with cursor-position insert | `ui.js` | 1h |
| Clear emoji search on category switch | `app.js` | 15min |
| Add `peer-left` broadcast message type for joiner sync | `peer.js` | 2h |
| Remove the settings button stub or implement it | `app.html`, `app.js` | 1h |
| Add `role="log"` to messages div | `app.html` | 5min |
| Add `<dialog>` for GIF and Screen modals | `app.html`, `ui.js`, `screen.js` | 4h |
| Add SRI hash to PeerJS CDN script | `app.html` | 30min |

**Total Phase 3: ~5 days**

---

### Phase 4 — UX Improvements (Weeks 5-6, ~5 days)

| Task | Effort |
|---|---|
| Settings panel slide-over (nick, color, audio device, theme) | 2d |
| Notification for screen share (opt-in theater view) | 4h |
| Keyboard shortcuts (Ctrl+E, Escape, Ctrl+Shift+V) | 1d |
| Toast stacking (multiple simultaneous notifications) | 2h |
| Disable "Send File" button until file selected | 30min |
| Confirmation before Clear Chat | 30min |
| "Peer not found" specific error state | 1h |
| Cursor-position emoji insert | 1h |
| Recent rooms localStorage history | 4h |
| File transfer to specific peer selector | 4h |

**Total Phase 4: ~5 days**

---

### Phase 5 — Major Feature Additions (Weeks 7-12, ~4 weeks)

| Feature | Effort |
|---|---|
| Message reactions system | 3d |
| Reply to message | 3d |
| Markdown message rendering | 2d |
| Audio/video device switching mid-call | 2d |
| Picture-in-Picture for video tiles | 1d |
| Raise hand during meeting | 1d |
| Polls in chat | 2d |
| Shared whiteboard (canvas broadcast) | 5d |
| Clipboard paste for images | 1d |
| Video file preview in chat | 1d |
| QR code room invite | 1d |
| Speaker detection highlight | 2d |

**Total Phase 5: ~4 weeks**

---

<a id="part-14"></a>
## Part 14 — Final Engineering Report

### Executive Summary

ChitLAN v3.0 is an impressive **solo-developer achievement** — a fully functional P2P collaboration platform with chat, voice, video, screen sharing, and file transfer built without any backend, running entirely in the browser. The v3 ES module refactor represents a significant improvement over the legacy monolith (evident in the orphaned `script.js`). The glassmorphism UI is polished, modern, and visually competitive with commercial products.

However, **the application has several production-blocking issues** that must be resolved before it can be reliably used in production environments:

1. **XSS vulnerability** via `isHtml: true` messages broadcast across peers
2. **PWA claims without PWA infrastructure** — no manifest, no service worker
3. **Race condition** in `connectToHost` timing
4. **Accessibility failures** — no focus rings, no ARIA live regions, no modal focus traps
5. **Memory architecture** makes the stated 100 GB file transfer claim impossible in practice
6. **No STUN/TURN** means NAT traversal failures on non-LAN networks

With the Phase 1 fixes applied, ChitLAN would be suitable for trusted local network use. With Phases 1-4, it would be production-grade.

---

### Scores

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | **6.5 / 10** | Good ES module separation; gaps in PWA, state management, event architecture |
| **Code Quality** | **6 / 10** | Clean readable code; several bugs, inline styles, empty catch blocks |
| **Performance** | **6 / 10** | Good CSS animations; forced reflows, unrevoked Object URLs, 2.3 MB OG image |
| **WebRTC Implementation** | **5.5 / 10** | Functional but no TURN, no reconnect backoff, no DataChannel backpressure |
| **UI/UX** | **7.5 / 10** | Visually excellent; several UX gaps (screen share auto-open, settings button stub) |
| **Accessibility** | **3 / 10** | No focus rings, no ARIA live, no focus traps, missing aria-labels |
| **PWA** | **1 / 10** | No manifest, no service worker — PWA is listed as a feature but does not exist |
| **Browser Compatibility** | **7 / 10** | Good Chromium support; Safari missing webkit prefixes; iOS screen share unsupported |
| **Security** | **5 / 10** | `safeText()` is used; XSS via isHtml is critical; no CSP; no SRI; IP leak |
| **Maintainability** | **6.5 / 10** | Good module structure; orphaned legacy files; few code comments; no tests |

---

### Top 25 Critical Issues

1. 🔴 **XSS via `isHtml: true` peer messages** — any peer can execute code in all browsers
2. 🔴 **No PWA manifest or service worker** — "PWA support" is a non-implemented claim
3. 🔴 **Race condition: `connectToHost` before peer opens** — silent failure on slow networks
4. 🔴 **No focus-visible styling** — keyboard users cannot navigate
5. 🔴 **No ARIA live region on message list** — screen readers miss all messages
6. 🔴 **No STUN/TURN fallback** — connection fails on Symmetric NAT
7. 🔴 **No modal focus trap** — keyboard users escape modals unintentionally
8. 🟠 **Screen share theater auto-opens for all peers** — disruptive, uninvited modal takeover
9. 🟠 **Frozen video tiles on abrupt peer disconnect** — stale video lingers
10. 🟠 **DataChannel no backpressure control** — overruns buffer on slow connections
11. 🟠 **`sendGifMessage` sends raw HTML to peers** — insecure by design
12. 🟠 **File transfer rebroadcast to all peers** — no recipient targeting
13. 🟠 **Object URLs never revoked** — memory leak on large file sessions
14. 🟠 **Duplicate voice streams when both voice+video called** — audio feedback loop
15. 🟠 **Peer disconnect not notified to other joiners** — stale user lists
16. 🟠 **No `peer-unavailable` error differentiation** — confusing "Connection error" for wrong ID
17. 🟡 **Orphaned `script.js` and `style.css`** — 41 KB dead code in repo
18. 🟡 **IP displayed publicly via ipify.org** — privacy issue + third-party dependency
19. 🟡 **No SRI hash on PeerJS CDN script** — supply chain attack vector
20. 🟡 **No CSP meta tag** — XSS risks amplified
21. 🟡 **`-webkit-backdrop-filter` missing** — panels look wrong on Safari/iOS
22. 🟡 **`prefers-reduced-motion` absent from app.html CSS** — fails WCAG 2.1
23. 🟡 **Missing `aria-label` on all icon-only buttons** — screen reader unusable
24. 🟡 **Emoji insert ignores cursor position** — poor UX for message editing
25. 🟡 **Fake 150ms GIF loading delay** — artificial UX degradation

---

### Top 50 Recommended Improvements

1. Implement manifest.json + sw.js (Cache-first strategy)
2. Fix `connectToHost` race: move inside `peer.on('open')` callback
3. Fix XSS: validate and sanitize `isHtml` messages on receive
4. Add `:focus-visible` outlines to all interactive elements
5. Add `role="log" aria-live="polite"` to message container
6. Add `aria-label` to all emoji/GIF/attachment/voice/video/screen buttons
7. Implement focus trap in GIF and screen share modals
8. Convert modals to `<dialog>` elements for built-in accessibility
9. Add `-webkit-backdrop-filter` to all backdrop-filter rules
10. Add `@media (prefers-reduced-motion: reduce)` to app.css and animations.css
11. Remove `outline: none` global reset; use `:focus-visible` instead
12. Add exponential backoff reconnection logic
13. Add `peer-unavailable` specific error handler
14. Delete orphaned `script.js` and `style.css`
15. Add `typingTimeout: null` to `state.js`
16. Replace `setTimeout(connectToHost, 1000)` with event-driven connection
17. Add DataChannel `bufferedamountlow` backpressure handling
18. Revoke Object URLs after file download/view
19. Replace GIF HTML string with structured `gifUrl` field in protocol
20. Add `c.open` check before all `c.send()` calls
21. Remove fake 150ms GIF loading delay
22. Notify other joiners when a peer disconnects (`peer-left` message)
23. Fix cursor-position emoji insertion in `ui.js`
24. Clear emoji search input on category button click
25. Replace `style.display` mutations with `classList` toggle approach
26. Compress og-image2.3mb.png to WebP under 300 KB
27. Add `&display=swap` to Google Fonts URL
28. Add `<link rel="preconnect" href="https://unpkg.com">` to app.html
29. Add SRI hash to PeerJS CDN script tag
30. Add Content Security Policy meta tag
31. Replace ipify.org with RTCPeerConnection ICE candidate local IP detection
32. Add `role="dialog" aria-modal="true" aria-labelledby` to modal divs
33. Fix settings button (implement or remove)
34. Add `inputmode="text" enterkeyhint="send"` to message input
35. Debounce typing indicator messages (currently fires on every keystroke)
36. Reduce telemetry interval from 3s to 10-15s
37. Show "--" for latency/quality until first ping/pong received
38. Add `peers-left` broadcast from host when a peer disconnects
39. Implement `navigator.share()` for room invite on mobile
40. Add `autocapitalize="off"` to nickname and room ID inputs
41. Add `<label for="color">` to properly associate the color selector
42. Fix heading hierarchy in `app.html` (multiple h2 without h1)
43. Add explicit `will-change: transform` to gradient animation elements
44. Add try/catch around all `state.peer.call()` invocations
45. Gate `console.log('ChitLAN v3.0 fully initialized')` behind debug flag
46. Implement CHAT_HISTORY_KEY localStorage persistence or remove constant
47. Add per-transfer recipient targeting (optional broadcast vs. direct send)
48. Fix install button to only hide on accepted installation, not dismissed
49. Add `video.pause(); video.srcObject = null;` before setting new srcObject
50. Audit and fix all empty `catch (e) {}` blocks with at minimum a logged error

---

### Top 75 Frontend Features (Priority Ordered)

**P0 — Must Have (Blockers)**
1. PWA Manifest + Service Worker + App Icons
2. Cursor-aware emoji insertion
3. Clipboard image paste to send
4. Drag-and-drop complete flow (UI polish)
5. Debug mode (`?debug=true`)

**P1 — High Value**
6. Settings panel (nick, color, device, theme)
7. Keyboard shortcuts (Escape, Ctrl+E, Ctrl+Shift+V, Ctrl+K)
8. Recent rooms localStorage history
9. User presence status (online/away/busy)
10. Custom nickname change mid-session
11. Raise hand in voice/video meetings
12. Audio input device switching
13. Camera switching mid-call
14. Transfer history panel
15. Video file inline preview in chat
16. Toast stacking for multiple notifications
17. Offline indicator (navigator.onLine)
18. Notification permission flow UI
19. Copy message text action
20. Reply to specific message

**P2 — Medium Value**
21. Message reactions (emoji reactions on messages)
22. Markdown support (bold, italic, code spans)
23. Code block rendering with syntax highlighting
24. Grid view customization (1-col, 2-col, tile view)
25. Picture-in-Picture for video tiles
26. Speaker activity highlight (audio level detection)
27. Screen share opt-in notification (replace auto-modal)
28. Theme customization (custom accent color)
29. Font scaling preferences
30. Message search within session
31. Poll creation and voting in chat
32. @mentions with notification badges
33. Shared session timer broadcast
34. QR code room invite generator
35. Transfer-to-specific-peer selector
36. Draft message persistence (localStorage)
37. Command palette (Ctrl+K fuzzy search)
38. Activity timeline in sidebar (more detail)
39. Animated connection progress during peer join
40. Room lock/unlock visual feedback (animated icon)

**P3 — Nice to Have**
41. Shared whiteboard (canvas broadcast)
42. Virtual meeting notes (text broadcast)
43. Live captions (Web Speech API)
44. Background blur (MediaPipe Selfie Segmentation)
45. Noise suppression toggle
46. Screen annotation overlay
47. Folder sharing (zip + transfer)
48. Multiple rooms (tabbed interface)
49. User avatars (upload or auto-generate)
50. Emoji status indicator
51. Room themes (color palette presets)
52. Custom notification sound
53. Meeting recording (MediaRecorder API, local only)
54. Breakout rooms (sub-room redirect)
55. Scheduled reminders (local timer broadcast)
56. Bookmarked messages panel
57. Pinned messages display
58. Password-protected rooms
59. Message expiry (auto-delete after N minutes)
60. Link previews (Open Graph fetch via client)
61. GIF reaction to messages
62. Animated avatar (Lottie or GIF)
63. Voice activity visualization (waveform per user)
64. Live transcription export
65. File sharing history export (JSON log)
66. Session summary report on disconnect
67. Dark/light theme per-panel customization
68. Spatial audio (pan audio based on user position)
69. Collaborative text editor (CRDT)
70. Confetti celebration (emoji reaction triggers animation)
71. Live cursor positions on shared whiteboard
72. Achievement badges (first file sent, etc.)
73. Session replay (audit log for admins)
74. Plugin architecture (custom message types)
75. WebXR shared virtual space (long-term vision)

---

### Quick Wins (Under 1 Day Each)

| Fix | Time |
|---|---|
| Delete `script.js` + `style.css` | 5 min |
| Add `typingTimeout: null` to state.js | 5 min |
| Remove fake GIF setTimeout | 10 min |
| Add `&display=swap` to Google Fonts | 5 min |
| Add preconnect hint for unpkg.com | 5 min |
| Add `aria-label` to all icon buttons | 1 hour |
| Add `focus-visible` outline CSS | 30 min |
| Add `role="log" aria-live="polite"` to messages | 5 min |
| Add `-webkit-backdrop-filter` prefix | 30 min |
| Add `prefers-reduced-motion` to app CSS | 30 min |
| Fix emoji insert cursor position | 1 hour |
| Clear emoji search on category switch | 15 min |
| Compress OG image to WebP | 30 min |
| Add `c.open` check before send | 30 min |
| Fix install button dismissed state | 30 min |
| Remove `outline: none` global reset | 15 min |
| Remove console.log from production | 5 min |
| Add `autocapitalize="off"` to inputs | 5 min |
| Reduce telemetry interval to 10s | 5 min |
| Disable "Send File" until file selected | 30 min |

---

### Medium-Term Improvements (1–4 weeks)

- PWA manifest + service worker implementation
- Race condition fix + reconnect backoff
- XSS fix for isHtml messages
- Accessibility: modal focus traps, heading hierarchy
- Performance: DataChannel backpressure, Object URL revocation
- UX: Settings panel, keyboard shortcuts, recent rooms
- Message reactions feature
- Reply to message feature
- Peer disconnect notification to all joiners

---

### Long-Term Roadmap (1–3 months)

- Markdown + code block rendering
- Audio/video device switching
- Shared whiteboard
- Background blur / noise suppression
- Live captions (Web Speech API)
- Session recording (MediaRecorder, local only)
- Build system integration (Vite)
- Unit + integration test suite
- Plugin architecture for custom message types
- Community contribution guidelines + CI/CD pipeline

---

### Production Readiness Assessment

| Criteria | Status |
|---|---|
| Core P2P messaging works | ✅ |
| Voice/video calls functional | ✅ |
| Screen sharing functional (Chrome/Edge) | ✅ |
| File transfer functional | ✅ (with memory caveats) |
| XSS vulnerability | ❌ BLOCKING |
| Accessibility WCAG AA | ❌ BLOCKING |
| PWA infrastructure | ❌ BLOCKING (claimed feature) |
| Browser compatibility (Safari/-webkit) | ⚠️ Partial |
| No TURN server for NAT traversal | ⚠️ Partial |
| Security headers / CSP | ❌ Missing |

### 🏁 Production Readiness: **58%**

ChitLAN is impressive for a no-backend browser application. With Phase 1 critical fixes (especially XSS resolution and accessibility baseline), it would reach **75% production readiness** and be suitable for trusted local network deployments. Full production readiness (≥90%) requires the complete Phase 1-4 roadmap execution (~2-3 weeks of engineering work).

---

**End of ChitLAN Frontend Engineering Audit**
*Reviewed all 25 files in the repository. Every recommendation is based on verified code evidence.*
