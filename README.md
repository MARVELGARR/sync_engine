# ⚡ Sync Engine

> A production-ready, real-time collaborative document editing backend built on **Yjs CRDTs**, **WebSockets**, **Redis Pub/Sub**, and **PostgreSQL**.

---

## Architecture

```
                  [ Yjs Client (browser) ]
                           │
                           ▼
               [ 🌐 Nginx API Gateway :80 ]
                  /api/             /ws
                  │                  │
                  ▼                  ▼
     ┌──────────────────┐  ┌──────────────────────────┐
     │   User & Auth    │  │   Sync Cluster (WS)       │
     │   Service :3000  │  │  Node 1 :4000 / Node 2 :4001 │
     └────────┬─────────┘  └────────────┬─────────────┘
              │                         │
              ▼                         ▼
     ┌──────────────────┐  ┌──────────────────────────┐
     │   PostgreSQL     │  │   Redis :6379             │
     │   users_schema   │  │   Pub/Sub + Streams       │
     └──────────────────┘  └────────────┬─────────────┘
                                        │
                                        ▼
                              ┌──────────────────────┐
                              │   Persist Worker     │
                              │   (background)       │
                              └──────────┬───────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │   PostgreSQL         │
                              │   documents_schema   │
                              └──────────────────────┘
```

### Containers

| # | Service | Image | Port | Purpose |
|---|---------|-------|------|---------|
| 1 | `gateway` | `nginx:alpine` | 80 | Reverse proxy — REST + WebSocket routing |
| 2 | `user-service` | `node:20-alpine` | 3000 | Auth, JWT, user & document management |
| 3 | `sync-service-1` | `node:20-alpine` | 4000 | Real-time WebSocket sync node 1 |
| 4 | `sync-service-2` | `node:20-alpine` | 4001 | Real-time WebSocket sync node 2 |
| 5 | `persist-worker` | `node:20-alpine` | — | Async Redis-stream consumer → Postgres |
| 6 | `redis-broker` | `redis:7-alpine` | 6379 | Pub/Sub (cross-node sync) + Streams (persistence) |
| 7 | `postgres-db` | `postgres:16-alpine` | 5432 | Multi-schema database |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20, TypeScript 5 |
| API Framework | Express 4 |
| Real-time | WebSocket (`ws`), Yjs CRDT, `y-protocols` |
| Database ORM | Drizzle ORM + drizzle-kit migrations |
| Database | PostgreSQL 16 (dual-schema) |
| Cache / Broker | Redis 7 (Pub/Sub + Streams XREADGROUP) |
| Auth | JWT (`jsonwebtoken`), bcrypt |
| Validation | Zod |
| Logging | Pino (structured, child loggers) |
| Rate Limiting | `express-rate-limit` + Nginx `limit_req` |
| Containerisation | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- Docker Desktop running

### 1. Copy env file
```bash
cp .env.example .env
```
> Edit `JWT_SECRET` to a secure random value before deploying.

### 2. Start everything
```bash
docker-compose up --build
```

Services become available after healthchecks pass (~30s):

| Endpoint | Description |
|----------|-------------|
| `http://localhost/api/health` | Gateway health |
| `http://localhost/api/auth/register` | Register a user |
| `http://localhost/api/auth/login` | Login → JWT |
| `ws://localhost/ws?docId=<uuid>&token=<jwt>` | WebSocket sync |

---

## API Reference

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | ❌ | Register `{ email, password, displayName }` |
| `POST` | `/api/auth/login` | ❌ | Login → `{ token, user }` |
| `GET` | `/api/auth/me` | ✅ | Current user profile |

### Documents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/documents` | ✅ | Create `{ title }` |
| `GET` | `/api/documents` | ✅ | List owned + shared documents |
| `GET` | `/api/documents/:id` | ✅ | Get document metadata |
| `DELETE` | `/api/documents/:id` | ✅ | Delete (owner only) |
| `POST` | `/api/documents/:id/share` | ✅ | Share `{ email, permission }` (`read` \| `read-write`) |
| `DELETE` | `/api/documents/:id/share/:userId` | ✅ | Revoke permission |
| `GET` | `/api/documents/:id/authorize` | ✅ | Internal — called by sync-service on WS handshake |

### WebSocket

Connect to `ws://localhost/ws?docId=<uuid>&token=<jwt>`

The sync protocol is standard **Yjs** (`y-websocket` compatible):
- **SyncStep1/2** — initial document state exchange
- **Update** — incremental CRDT deltas
- **Awareness** — cursor positions and user presence

WS close codes:
| Code | Reason |
|------|--------|
| `4000` | Missing `docId` or `token` |
| `4001` | Invalid / expired JWT |
| `4003` | Unauthorised — no access to document |
| `4005` | Room connection limit exceeded (max 50/doc) |
| `4006` | User connection limit exceeded (max 10) |

---

## Data Flow

### Write path (edit → persist)
1. Client sends Yjs binary update over WebSocket
2. `sync-service` applies update to in-memory `Y.Doc`
3. Update is broadcast to all clients in the same room
4. Update is **published** to Redis:
   - `PUBLISH doc:<docId>` → other sync nodes apply it (cross-node sync)
   - `XADD doc_updates` → persist-worker consumes it
5. `persist-worker` accumulates deltas in an in-memory `Y.Doc` buffer
6. Buffer flushes to `document_snapshots` in PostgreSQL when:
   - **≥ 50 pending deltas**, or
   - **≥ 5 seconds** since last flush

### Read path (reconnect → load state)
1. New WebSocket connection authenticated and authorised
2. If room doesn't exist → load latest snapshot from `document_snapshots` into `Y.Doc`
3. Standard Yjs SyncStep1/2 protocol sends full state to new client

---

## Database Schemas

### `users_schema` (owned by `user-service`)
- `users` — identity and credentials
- `documents` — document metadata and ownership
- `document_permissions` — explicit `read` / `read-write` grants

### `documents_schema` (owned by `persist-worker`)
- `document_snapshots` — versioned full Yjs state snapshots (`bytea`)
- `document_deltas` — raw delta audit trail

---

## Security Features

- **JWT auth** on every protected REST endpoint and every WebSocket handshake
- **Double validation** on WS connect: local JWT verify + user-service `/authorize` call
- **Permission enforcement** at the protocol level: `read`-only users cannot send Yjs Update messages
- **Rate limiting** at both layers: Express `express-rate-limit` (120 req/min) + Nginx `limit_req` (30 req/s, burst 50)
- **Heartbeat / ping-pong** every 30s — dead connections terminated after 10s timeout
- **Connection limits**: max 50 connections per document room, max 10 per user across all rooms

---

## Development

### Local TypeScript compilation
```bash
# From each service directory:
npm run build        # npx tsc
npm run dev          # tsx watch src/index.ts
```

### Database migrations
```bash
npm run db:generate  # Generate SQL migration files
npm run db:migrate   # Apply migrations to DATABASE_URL
npm run db:studio    # Open Drizzle Studio GUI
```

### Run infrastructure only
```bash
docker-compose up -d postgres-db redis-broker
```

---

## Project Structure

```
sync_engine/
├── gateway/              # Nginx config
├── postgres-db/          # init.sql — schema creation
├── redis-broker/         # redis.conf
├── user-service/         # Express REST API
│   ├── src/
│   │   ├── config/       # env, db pool
│   │   ├── dal/          # Drizzle queries + schema
│   │   ├── services/     # Business logic
│   │   ├── controllers/  # Route handlers
│   │   ├── routes/       # Express routers
│   │   ├── middleware/   # auth, error, rate-limit
│   │   ├── schemas/      # Zod validation
│   │   └── utils/        # Pino logger
│   └── drizzle/          # Generated migrations
├── sync-service/         # WebSocket + Yjs server
│   ├── src/
│   │   ├── auth/         # JWT verify + user-service authorize
│   │   ├── config/       # env
│   │   ├── db/           # Snapshot loader (read-only)
│   │   ├── redis/        # Pub/Sub + Stream publisher
│   │   ├── rooms/        # DocumentRoom class + registry
│   │   └── utils/        # Pino logger
│   └── Dockerfile
├── persist-worker/       # Redis Stream consumer → PostgreSQL
│   ├── src/
│   │   ├── buffer/       # Delta buffer + flush logic
│   │   ├── config/       # env
│   │   ├── db/           # Snapshot writer (Drizzle)
│   │   └── utils/        # Pino logger
│   └── drizzle/          # Generated migrations
├── docker-compose.yml
├── .env.example
└── IMPLEMENTATION_PLAN.md
```
