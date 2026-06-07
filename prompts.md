You are working on the JDrakoon3 project – a couch console / smart TV media & gaming hub.
The project has a Node.js backend (Express, Socket.IO, raw WebSocket), a React TV dashboard, and a mobile companion app.

Important rules:

- Before writing any code, explain what you're about to change and why.
- If you are unsure about a detail (e.g., variable name, server URL, data shape), ASK me instead of guessing.
- After making changes that affect the system's behavior, API, or architecture, propose an update to the relevant README (backend, frontend, or phone app). I'll decide whether to apply it.
- Keep everything simple – no over-engineering.

Current task: [describe your task here]

---

I'm working on JDrakoon3 – a couch console with a Node.js backend and React frontend.
Backend: Express on port 3001, serves TV UI (/) and phone UI (/phone). Socket.IO for real-time state, raw WebSocket for legacy input. Media playback via yt-dlp streaming.
Frontend: TV Dashboard (React) with app launcher, media player footer, lobby. Phone app (React) with remote, touchpad, media tabs.
Key files: src/index.ts (Express), src/socketio_server.ts (Socket.IO), src/websocket/ (raw WS), src/services/ (Lobby, Input, Media). Frontend in separate build folders or proxied in dev.
Goal: [explain your current task]

---

Project: JDrakoon3. I have a bug.

- What I did: [steps]
- What I expected: [expected]
- What actually happened: [error message, behavior]
- Relevant logs/screenshots: [attach if possible]
  Please ask clarifying questions before proposing a fix. Do NOT assume code you haven't seen.
