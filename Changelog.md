# Changelog
All notable changes to **ChitLAN** will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [3.0.0] – 2026-07-27
### Added
- 📹 **Camera Video Meetings**: Multi-peer WebRTC video stream calls with interactive participant video grid tiles and user name badges.
- 🖥️ **Screen Share Conflict Takeover & Active Sharer Title Badges**: Conflict resolution prompts when another participant shares, plus active title badges on sidebar panel and theater view modal.
- 🔀 **Smart Room Auto-Redirection & P2P Mesh Architecture**: Automatically redirects joiners of non-host peers to the main Host room, alongside 10-member room capacity enforcement.
- 👑 **Host Control Suite**: `❌ Kick/Remove Participant`, `🔇 Mute All`, and `🔒 Lock Room` controls exclusive to the Host.
- 😀 **WhatsApp / Snapchat Style Keyword Emoji Picker Engine**: Fast search dictionary mapping keywords to emojis with direct cursor insertion.
- 🎬 **Searchable Animated GIF Catalog Modal**: Searchable GIF lightbox modal with direct WebRTC GIF broadcasting.
- 🧱 **Modular ES Architecture**: Refactored monolithic script into 9 clean ES modules (`constants.js`, `state.js`, `utils.js`, `ui.js`, `voice.js`, `files.js`, `screen.js`, `peer.js`, `app.js`).

### Changed
- Re-architected file chunk ACK tracking to drive smooth 0–100% progress without looping reset.
- Updated file transfer UI to calculate and display real-time throughput transfer speed (`MB/s`).
- Improved high-contrast color token selection in dark mode for self and peer message bubbles.

### Fixed
- Unreadable washed-out options in the Choose Color select dropdown menu across browsers.
- File transfer progress bar resetting back to 0% after reaching 100%.
- Host-to-Client and Client-to-Host file transfer acknowledgment packet routing.
- Late-joiner screen share synchronization issue (5th+ person now automatically receives live screen stream).

---

## [2.0.0] – 2026-06-15
### Added
- Voice Chat, Screen Sharing, Advanced File Sharing up to 100GB, PWA Support, Public IP Detection, Chat History, Auto Reconnection.

---

## [1.2.0] – 2026-01
### Added
- Peer-to-peer file sharing over WebRTC with no server or cloud dependency
- Support for large file transfers (up to 100GB)
- Real-time file transfer progress indicators
- Inline image previews within chat messages
- Chunk-based file transfer with acknowledgement and retry support

---

## [1.1.0] – 2025-06-26
### Added
- Increased room capacity to a maximum of 10 users
- Real-time online users list with live user count
- Dark mode toggle for improved accessibility

---

## [1.0.0] – 2025-05
### Added
- Initial release of the peer-to-peer LAN chat application
