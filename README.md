# Chat17 – Persistent Rooms Fix

Rooms are now persisted instead of living only in RAM.

### Fixed
- Rooms survive Node.js process restarts/redeploys when the filesystem is persistent.
- Messages, read receipts and personal room names are saved.
- Closing/refreshing/disconnecting/logging out does not delete a room.
- A room remains until the owner explicitly uses **Delete Room**.
- Temporary Socket.IO reconnect failures no longer clear the saved room; the client retries automatically.

### Run
```bash
npm install
npm start
```

### Hosting
This project needs a long-running Node.js/WebSocket server for Socket.IO and a persistent filesystem for `data/rooms.json`.

If your host provides a persistent disk, set:
```text
CHAT17_DATA_DIR=/path/to/persistent/storage
```

If your current host is serverless/ephemeral, its filesystem may be wiped on restart. In that case use its persistent disk or an external database. No local-file implementation can guarantee persistence on an ephemeral filesystem.
