# Pointing Poker

A self-hosted planning poker app for agile estimation sessions.

**Key features**

- Real-time voting via WebSockets — votes stay hidden until the host reveals them
- Host-controlled voting periods (lobby → voting → reveal → new round)
- Attention checks — random prompts keep participants engaged; non-responders are flagged inactive
- Hold music — plays the Jeopardy "Think!" theme during voting; drop in your own MP3 to override the built-in synthesizer
- Host can reassign the host role to any player
- Short room codes for easy invite links

---

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + TanStack Router (file-based routing) |
| Meta-framework | TanStack Start + Nitro (nightly) |
| Styling | Tailwind CSS v4 |
| Build | Vite 7 |
| Language | TypeScript 5 |
| Real-time | WebSockets via `crossws` |
| Tests | Vitest |
| Deploy | Railway / Docker |

---

## Getting started

**Prerequisites**: Node.js 22+

```bash
npm install
npm run dev        # starts on http://localhost:3000
```

Open two browser tabs to the same room to test the multi-player flow.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build → `.output/` |
| `npm run start` | Serve the production build |
| `npm test` | Run all tests once |
| `npm run test:watch` | Tests in watch mode |

---

## Hold music

The music player tries to load `/audio/hold-music.mp3` at runtime:

- **File found** → plays the MP3 on loop (use any royalty-free track you like)
- **File missing** → falls back to a built-in Web Audio synthesizer that plays an approximation of the Jeopardy "Think!" theme in Bb major

To use your own track, place an MP3 at:

```
public/audio/hold-music.mp3
```

The file is gitignored so it won't be committed accidentally.

---

## Project structure

```
├── src/
│   ├── components/       # React components (CardDeck, PlayerList, MusicPlayer, …)
│   ├── hooks/            # useRoom — WebSocket connection + state
│   ├── lib/              # Shared types, jeopardyMusic synthesizer data
│   ├── routes/           # File-based routes (index, room.$roomId, room.join)
│   └── __tests__/        # Frontend unit tests
├── server/
│   ├── roomStore.ts      # In-memory room state + attention-check timers
│   ├── wsHooks.ts        # WebSocket message handlers
│   ├── routes/api/ws.ts  # WebSocket endpoint (/api/ws)
│   └── __tests__/        # Server unit tests
├── public/
│   └── audio/            # Drop hold-music.mp3 here (gitignored)
├── Dockerfile
└── railway.toml
```

---

## Deployment

### Railway (recommended)

1. Push to GitHub and connect the repo in Railway
2. Railway auto-detects `nixpacks.toml` — no extra config needed
3. Set `PORT=3000` and `NODE_ENV=production` environment variables (defaults in `railway.toml`)

### Docker

```bash
docker build -t pointingpoker .
docker run -p 3000:3000 pointingpoker
```

---

## Architecture notes

- **State**: rooms live in a single in-memory `Map` in the Nitro server process. Railway runs one instance so this is fine. Swap for Redis if horizontal scaling is needed.
- **Votes hidden until reveal**: `VOTE_CAST` broadcasts only that a player voted — not the value. Values are sent in `VOTES_REVEALED`.
- **Attention checks**: fire at a random interval (1–5 min), skip the host. Non-responders within the 30-second window are marked inactive and visible to all players.
- **Audio source detection**: a single `HEAD /audio/hold-music.mp3` request on component mount determines which audio path to use; no configuration required.
