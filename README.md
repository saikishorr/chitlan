# ChitLAN

ChitLAN is a static, browser-based chat and meeting app. It supports rooms of up to 10 people, including the host, with chat, GIFs, file transfers, voice, video, and screen sharing. It uses vanilla HTML, CSS, and JavaScript ES modules, with no build step.

## Features

- Room codes and optional room passcodes
- Room chat, typing indicators, chat history, GIFs, and chat export
- Voice calls, video meetings, and screen sharing
- Host controls for locking rooms and removing participants
- Peer-to-peer file transfers, with a maximum supported file size of 100 GiB
- Progressive Web App shell and install support

Receiving files larger than 64 MiB requires browser support for the Origin Private File System and enough available local storage. Without that support, a browser can receive files up to 64 MiB.

## How it connects

Peers find each other through the public PeerJS signaling server, so an internet connection is needed to establish connections. The signaling server helps browsers connect; WebRTC then carries data and media between browsers. Room chat and file chunks are relayed by the host over browser-to-browser data channels, while voice, video, and screen sharing use direct participant connections. A LAN-only setup without internet access needs a self-hosted PeerServer. The app's Connection settings can point rooms to one; see the [self-hosting guide](docs/self-hosting.md) for setup details.

## Run locally

ES modules and camera, microphone, and screen sharing do not work from `file://`. Serve the project over HTTP instead:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080/app.html> in a browser. The landing page is at <http://localhost:8080/>.

## Deployment

GitHub Pages deploys only the static app shell and public assets from the `main` branch. The app uses relative paths and is published at <https://saikishorr.github.io/chitlan/>. A deploy runs automatically after CI passes on `main`; to deploy by hand, open the Actions tab, choose **Deploy to GitHub Pages** and click **Run workflow**.

For every release, bump `APP_VERSION` in `js/constants.js`. The service worker names its cache after that version, so the bump is what makes returning visitors' browsers drop the old cached files.

## Documentation

- [Version 3.0.0 release notes](docs/release-notes/v3.0.0.md)
- [Version 2.0.0 release notes](docs/release-notes/v2.0.0.md)
- [Project audit (July 2026)](docs/audit-2026-07.md)
- [Security policy](SECURITY.md)

## License

ChitLAN is licensed under the MIT License. See [LICENSE](LICENSE).
