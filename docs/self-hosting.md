# Self-hosting signaling

ChitLAN is a static site, so GitHub Pages cannot host its signaling service. By default, browsers use the public PeerJS signaling server to find one another. You can run PeerServer on a LAN machine and point ChitLAN clients at it to keep signaling on your network.

## Run PeerServer

Install Node.js on a machine that stays available on the LAN, then start PeerServer:

```sh
npx peerjs --port 9000 --path /chitlan
```

Put a TLS reverse proxy such as Caddy or nginx in front of port 9000. Expose HTTPS/WSS on port 443, forward the `/chitlan` path to PeerServer, and enable WebSocket upgrades. Keep port 9000 reachable only from the proxy or trusted LAN. The hostname entered in ChitLAN must resolve to the LAN machine for each device and its TLS certificate must be trusted by those devices. For a private LAN, local DNS can map a domain covered by your certificate to the machine's private address.

Because the ChitLAN page is served over HTTPS, its signaling connection also needs WSS and a valid certificate. In **Connection settings**, choose **Custom**, enter the hostname without `https://`, set the external TLS port (usually `443`), and use the PeerServer path (for the command above, `/chitlan`). Keep **Use secure WebSocket (wss)** enabled, then test the connection. The host's invite link carries these signaling fields, so joiners can reach the same PeerServer. TURN credentials are never included in that link.

PeerServer only brokers the initial connection. Chat, files, and media travel between browsers. A LAN-only network can use direct local ICE candidates; strict NATs may need a TURN relay.

## Optional TURN with coturn

Run [coturn](https://github.com/coturn/coturn) on a reachable machine and configure its UDP/TCP relay ports and firewall for your network. Use authenticated, time-limited TURN credentials where possible. In each ChitLAN browser, open **Connection settings**, add a `turn:` or `turns:` URL, and enter the username and credential locally. Add a STUN URL too if your network uses one.

ICE settings are saved in that browser's local storage. WebRTC credentials are available to the browser using them, so avoid putting permanent TURN secrets into shared machines. ChitLAN does not place these credentials in invite URLs.
