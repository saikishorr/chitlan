# 💬 ChitLAN – Real-Time Collaboration On Your Local Network

**Latest Version:** **v3.0.0 – Ultimate Real-Time Workspace & Video Collaboration Edition**

**ChitLAN** is a lightweight, browser-based **peer-to-peer collaboration workspace** designed for Local Area Networks (LAN) and direct browser mesh networks. It combines group messaging, camera video meetings, voice chat, live screen sharing, searchable emoji/GIF broadcasting, and high-speed file transfers into a single application—all without requiring servers, cloud services, or user accounts.

Built entirely with **WebRTC** and **PeerJS**, ChitLAN enables secure, direct communication between devices on the same network.

---

![License](https://img.shields.io/badge/license-MIT-green)
![PeerJS](https://img.shields.io/badge/peerjs-1.5.5-yellow)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Version](https://img.shields.io/badge/version-v3.0.0-blue)
![Platform](https://img.shields.io/badge/platform-browser-lightgrey)
![WebRTC](https://img.shields.io/badge/technology-WebRTC-red)
![PWA](https://img.shields.io/badge/PWA-supported-blue)
![Responsive](https://img.shields.io/badge/mobile-friendly-orange)

---

# ✨ Features in Version 3.0.0

## 💬 Real-Time Workspace Chat & Emojis/GIFs
- ⚡ Peer-to-peer group chat powered by WebRTC (PeerJS)
- 👥 Supports up to **10 users** per workspace room
- 🎨 High-contrast dark glassmorphism design with color options
- 😀 **WhatsApp / Snapchat Style Emoji Picker**: Keyword search engine with direct text cursor insertion
- 🎬 **Searchable Animated GIF Catalog**: Search and broadcast animated GIFs directly into chat streams
- ⌨️ Live typing indicators & message timestamps
- 🔔 Audio alerts for new messages

## 📹 Camera Video Meetings & Voice
- 🎥 **Real-Time Camera Video Calls**: Multi-peer WebRTC video stream calls with participant grid tiles
- 🏷️ Live participant video name badges (`.video-tile-badge`)
- 📷 On-the-fly camera toggle on/off & mic mute/unmute
- 🎧 High quality Web Audio streaming with acoustic feedback protection

## 🖥️ Screen Sharing & Takeover Resolution
- 🖥️ Share desktop, app windows, or browser tabs in real time
- ⚔️ **Takeover Conflict Resolution**: Interactive prompt when a participant requests to share over an active stream
- 🏷️ **Active Sharer Title Badges**: Dynamic badges displaying who is currently sharing (`🖥️ Sharavani is sharing screen`)
- 🍿 Theater mode full-screen overlay modal

## 🔀 Smart Room Auto-Redirection & Mesh Architecture
- 🔀 **Auto-Redirection Handshake**: If a user attempts to join a non-host peer's local ID, the peer automatically redirects them to the main Host room
- 🛡️ **10-Member Capacity Limit Enforcement**: Prevents room overload and sends friendly full-room notifications (`⚠️ Room Full 10/10`)

## 👑 Host Control Suite
- ❌ **Remove / Kick Participant**: Host can remove unwanted or uninvited participants with a single click
- 🔇 **Mute All**: Host can mute all room microphones simultaneously
- 🔒 **Lock Room**: Host can lock the workspace room against new joiners

## 📁 Advanced High-Speed File Transfer
- 📤 Direct peer-to-peer file transfer up to **100 GB**
- 📊 Monotonic **0–100% progress tracking** with real-time throughput speed (`MB/s`)
- 🖼️ Inline image previews & direct download links

---

# 🌐 Live Demo & Getting Started

### 🚀 Launch ChitLAN
https://saikishorr.github.io/chitlan/

> **Note:** All participants must be connected to the same Local Area Network (LAN) or accessible WebRTC network.

### Clone & Run Locally
```bash
git clone https://github.com/saikishorr/chitlan.git
cd chitlan
```
Open `app.html` or `index.html` directly in your Web Browser.

---

# 🛠️ Technology Stack
- **HTML5 & Vanilla CSS3** (Custom Glassmorphism Design System)
- **JavaScript (ES6+ Modular Architecture)**
- **WebRTC DataChannels & MediaStreams**
- **PeerJS 1.5.5**
- **Service Workers (PWA Support)**

---

# 📜 Version History

| Version | Highlights |
|----------|------------|
| **v3.0.0** | 📹 Camera Video Meetings, 🖥️ Screen Takeover & Sharer Badges, 🔀 Smart Auto-Redirection, 👑 Host Control Suite (Kick, Mute All, Lock Room), 😀 WhatsApp Emoji Picker, 🎬 GIF Search Catalog, 📁 Monotonic Progress (0-100% fix) |
| **v2.0.0** | 🎤 Voice Chat, 🖥️ Screen Sharing, 📁 Advanced File Sharing, 📲 PWA Support, 🌍 Public IP Detection, 💾 Chat History |
| **v1.2.0** | File sharing, image previews, acknowledgements, large file support |
| **v1.1.0** | Multi-user support, improved UI, dark mode |
| **v1.0.0** | Initial release |

---

# 📄 License
Licensed under the **MIT License**.
