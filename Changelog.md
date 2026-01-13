# Changelog
All notable changes to **ChitLAN** will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

---

## [1.2.0] – 2026-01
### Added
- Peer-to-peer file sharing over WebRTC with no server or cloud dependency
- Support for large file transfers (up to 100GB)
- Real-time file transfer progress indicators
- Inline image previews within chat messages
- Chunk-based file transfer with acknowledgement and retry support
- Auto-reconnect logic for dropped peer connections
- Sound notification for completed incoming file transfers

### Changed
- Improved reliability and performance of peer message forwarding
- Optimized memory usage during large file transfers
- Enhanced mobile responsiveness for chat and file messages
- Improved message spacing, alignment, and layout consistency
- Extended dark mode styling to file transfer components

### Fixed
- Slow file receiving compared to sending
- Missing or duplicate file chunks during transfers
- Message alignment inconsistencies between sender and receiver
- Stability issues when broadcasting files to multiple users

---

## [1.1.0] – 2025-06-26
### Added
- Increased room capacity to a maximum of 10 users
- Real-time online users list with live user count
- Green status indicators for connected users
- Notification sound for incoming messages
- Dark mode toggle for improved accessibility
- Predefined high-contrast color selection for users
- Redesigned nickname, role (Host/Join), and color selection UI

### Changed
- Improved mobile responsiveness for chat layout and inputs
- Refined message alignment for clearer conversation flow

### Fixed
- Joiners not seeing their nickname in the user list
- Incorrect live user count display for connected users
- Sender message alignment issues on desktop browsers

---

## [1.0.0] – 2025-05
### Added
- Initial release of the peer-to-peer LAN chat application
- Real-time messaging using WebRTC
- Manual signaling via copy-paste offer/answer
- Custom nicknames and message colors
- Sound alerts for new messages
- Mobile-responsive layout
- Fully static deployment compatible with GitHub Pages

---

