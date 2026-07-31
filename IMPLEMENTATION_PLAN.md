# 🏗️ Sync Engine — Staged Implementation Plan

> A real-time collaborative document editing platform built on Yjs CRDTs, WebSocket rooms, Redis Pub/Sub, and PostgreSQL persistence.

---

## Table of Contents

- [Architecture Recap](#architecture-recap)
- [Stage 0 — Project Foundation & Tooling](#stage-0--project-foundation--tooling)
- [Stage 1 — Infrastructure Containers](#stage-1--infrastructure-containers)
- [Stage 2 — User & Auth Service (REST API)](#stage-2--user--auth-service-rest-api)
- [Stage 3 — Database Schema & Migrations](#stage-3--database-schema--migrations)
- [Stage 4 — Sync Service (Single Node)](#stage-4--sync-service-single-node)
- [Stage 5 — Persist Worker (Async Snapshots)](#stage-5--persist-worker-async-snapshots)
- [Stage 6 — Horizontal Scaling (Multi-Node Sync)](#stage-6--horizontal-scaling-multi-node-sync)
- [Stage 7 — Nginx Gateway & Routing](#stage-7--nginx-gateway--routing)
- [Stage 8 — Integration Testing & Hardening](#stage-8--integration-testing--hardening)
- [Post-MVP Stretch Goals](#post-mvp-stretch-goals)

---

## Architecture Recap

```
                       [ Client / Frontend (Yjs + WebSockets) ]
                                          │
                                          ▼
                             [ 🌐 Nginx API Gateway ]
                                  /            \
                    /api/auth    /              \   /ws (Upgrade)
                                /                \
                               ▼                  ▼
                    ┌──────────────────┐  ┌──────────────────────┐
                    │ 👤 User & Auth   │  │ ⚡ Real-Time Sync    │
                    │    Service       │  │    Node Cluster      │
                    └────────┬─────────┘  └──────────┬───────────┘
                             │                       │
                             ▼                       ▼
                    ┌──────────────────┐  ┌──────────────────────┐
                    │ 🗄️ Users DB      │  │ 🧠 Redis (Pub/Sub &  │
                    │    (PostgreSQL)  │  │    State Streams)    │
                    └──────────────────┘  └──────────┬───────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────┐
                                          │ 💾 Persist Worker    │
                                          │    Service           │
                                          └──────────┬───────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────┐
                                          │ 🗄️ Documents DB      │
                                          │    (PostgreSQL)      │
                                          └──────────────────────┘
```

**7 Containers Total:**

| # | Container | Base Image | Ports | Purpose |
|---|-----------|-----------|-------|---------|
| 1 | `gateway` | `nginx:alpine` | 80, 443 | Reverse proxy & WS upgrading |
| 2 | `user-service` | `node:20-alpine` | 3000 (internal) | Auth, JWT, User DB mutations |
| 3 | `sync-service-1` | `node:20-alpine` | 4000 (internal) | Real-time WS node 1 |
| 4 | `sync-service-2` | `node:20-alpine` | 4001 (internal) | Real-time WS node 2 |
| 5 | `persist-worker` | `node:20-alpine` | None | Background delta aggregation |
| 6 | `redis-broker` | `redis:7-alpine` | 6379 | Pub/Sub + Streams |
| 7 | `postgres-db` | `postgres:16-alpine` | 5432 | Multi-schema DB |

---

## Stage 0 — Project Foundation & Tooling

> **Goal:** Establish a clean, consistent monorepo structure so every service shares tooling, linting, and type configs.

### Steps

1. **Initialise the root project**
   - Create a root `package.json` with `"private": true` and `"workspaces"` pointing to each service folder.
   - Add shared dev dependencies: `typescript`, `tsx`, `eslint`, `prettier`, `@types/node`.
   - Create a root `tsconfig.base.json` with shared compiler options (`strict`, `esModuleInterop`, `moduleResolution: NodeNext`, `target: ES2022`).

2. **Scaffold each service directory**
   - Inside each of `user-service/`, `sync-service-1/`, `sync-service-2/`, `persist-worker/`:
     - Create a `package.json` (name, scripts: `dev`, `build`, `start`, `migrate`).
     - Create a `tsconfig.json` that extends `../tsconfig.base.json`.
     - Create the folder structure:
       ```
       src/
       ├── index.ts          # Entry point
       ├── config/            # Env vars, DB config, Redis config
       ├── routes/            # Express/Fastify routers (user-service only)
       ├── controllers/       # Request handlers
       ├── services/          # Business logic
       ├── dal/               # Data access layer (Drizzle queries)
       ├── middleware/        # Auth guards, error handlers
       ├── schemas/           # Zod validation schemas
       ├── types/             # Shared TypeScript types/interfaces
       └── utils/             # Helpers (logger, JWT, hashing)
       ```
   - `sync-service-2` should be an **identical copy** of `sync-service-1` — they share the same codebase but run as separate container instances. Consider using a single `sync-service/` source directory that both containers mount.

3. **Create a shared types package (optional but recommended)**
   - Create `packages/shared-types/` containing shared interfaces: `User`, `Document`, `Permission`, `CRDTDelta`, `JWTPayload`.
   - Reference it via TypeScript path aliases or npm workspaces.

4. **Create `.env.example`**
   - Define all required environment variables across every service:
     ```env
     # Postgres
     POSTGRES_USER=sync_admin
     POSTGRES_PASSWORD=changeme
     POSTGRES_DB=sync_engine
     DATABASE_URL=postgresql://sync_admin:changeme@postgres-db:5432/sync_engine

     # Redis
     REDIS_URL=redis://redis-broker:6379

     # JWT
     JWT_SECRET=your-256-bit-secret
     JWT_EXPIRY=24h

     # Services
     USER_SERVICE_URL=http://user-service:3000
     SYNC_SERVICE_PORT=4000
     ```

5. **Initialise Git**
   - Create a `.gitignore` (node_modules, dist, .env, *.log, docker volumes).
   - Make the initial commit: `feat: project scaffold`.

### ✅ Stage 0 Milestone
- You can run `npm install` from the root and all workspaces resolve.
- Each service has a valid `tsconfig.json` and an `src/index.ts` placeholder.
- `.env.example` documents every variable.

---

## Stage 1 — Infrastructure Containers

> **Goal:** Get PostgreSQL, Redis, and the Docker Compose skeleton running before writing any application code.

### Steps

1. **Create `docker-compose.yml` at the project root**
   - Define all 7 services (even if the app services are just placeholder `node:20-alpine` containers that `sleep infinity` for now).
   - Create a shared Docker network: `sync-network` (bridge).

2. **Configure `postgres-db`**
   - Use `postgres:16-alpine`.
   - Mount a `postgres-db/init.sql` file via Docker `volumes` that creates two schemas on startup:
     ```sql
     CREATE SCHEMA IF NOT EXISTS users_schema;
     CREATE SCHEMA IF NOT EXISTS documents_schema;
     ```
   - Expose port `5432` to the host for local debugging (psql, pgAdmin).
   - Add a healthcheck: `pg_isready -U sync_admin`.

3. **Configure `redis-broker`**
   - Use `redis:7-alpine`.
   - Bind mount a `redis-broker/redis.conf` if you need custom config (e.g., `maxmemory`, `appendonly yes` for AOF persistence).
   - Expose port `6379` to the host for local debugging (redis-cli).
   - Add a healthcheck: `redis-cli ping`.

4. **Configure `gateway` (Nginx) — placeholder**
   - Use `nginx:alpine`.
   - Mount a `gateway/nginx.conf` with a simple "return 200 'gateway OK';" for now.
   - Expose ports `80` and `443`.

5. **Add dependency ordering**
   - Use `depends_on` with `condition: service_healthy` so application services wait for Postgres and Redis.

6. **Validate**
   - Run `docker-compose up -d postgres-db redis-broker`.
   - Confirm you can connect to Postgres (`psql`) and Redis (`redis-cli ping`).
   - Confirm both schemas exist in Postgres.

### ✅ Stage 1 Milestone
- `docker-compose up` boots Postgres + Redis with healthchecks passing.
- You can connect to both from the host machine.
- The `init.sql` has created both schemas.

---

## Stage 2 — User & Auth Service (REST API)

> **Goal:** Build the complete identity and authorization service. This is the foundation — nothing else works without user tokens.

### Steps

1. **Install service dependencies**
   ```
   express, cors, helmet, cookie-parser
   drizzle-orm, drizzle-kit, pg (node-postgres driver)
   bcryptjs (password hashing)
   jsonwebtoken, @types/jsonwebtoken
   zod (input validation)
   pino, pino-pretty (structured logging)
   ```

2. **Define the database schema (Drizzle ORM)**
   - `users` table (`users_schema`):
     | Column | Type | Notes |
     |--------|------|-------|
     | `id` | `uuid` (default `gen_random_uuid()`) | PK |
     | `email` | `varchar(255)` | UNIQUE, NOT NULL |
     | `password_hash` | `varchar(255)` | NOT NULL |
     | `display_name` | `varchar(100)` | NOT NULL |
     | `created_at` | `timestamp` | DEFAULT NOW() |
     | `updated_at` | `timestamp` | DEFAULT NOW() |

   - `documents` table (`users_schema`):
     | Column | Type | Notes |
     |--------|------|-------|
     | `id` | `uuid` | PK |
     | `title` | `varchar(255)` | NOT NULL |
     | `owner_id` | `uuid` | FK → users.id |
     | `created_at` | `timestamp` | DEFAULT NOW() |
     | `updated_at` | `timestamp` | DEFAULT NOW() |

   - `document_permissions` table (`users_schema`):
     | Column | Type | Notes |
     |--------|------|-------|
     | `id` | `uuid` | PK |
     | `document_id` | `uuid` | FK → documents.id |
     | `user_id` | `uuid` | FK → users.id |
     | `permission` | `enum('read', 'read-write')` | NOT NULL |
     | `granted_at` | `timestamp` | DEFAULT NOW() |
     | Unique constraint on (`document_id`, `user_id`) | | |

3. **Run initial migration**
   - `npx drizzle-kit generate` → `npx drizzle-kit migrate`.
   - Verify tables exist in Postgres.

4. **Implement Auth endpoints**

   | Method | Route | Purpose | Auth Required |
   |--------|-------|---------|---------------|
   | `POST` | `/api/auth/register` | Register a new user | ❌ |
   | `POST` | `/api/auth/login` | Login, returns JWT | ❌ |
   | `GET` | `/api/auth/me` | Get current user profile | ✅ |
   | `POST` | `/api/auth/refresh` | Refresh JWT token | ✅ |

   **JWT Payload structure:**
   ```json
   {
     "sub": "user-uuid",
     "email": "user@example.com",
     "displayName": "User Name",
     "iat": 1234567890,
     "exp": 1234567890
   }
   ```

5. **Implement Document management endpoints**

   | Method | Route | Purpose | Auth Required |
   |--------|-------|---------|---------------|
   | `POST` | `/api/documents` | Create a new document | ✅ |
   | `GET` | `/api/documents` | List user's documents | ✅ |
   | `GET` | `/api/documents/:id` | Get document metadata | ✅ |
   | `DELETE` | `/api/documents/:id` | Delete a document (owner only) | ✅ |
   | `POST` | `/api/documents/:id/share` | Grant permission to another user | ✅ (owner) |
   | `DELETE` | `/api/documents/:id/share/:userId` | Revoke permission | ✅ (owner) |

6. **Implement the internal authorization endpoint**

   | Method | Route | Purpose | Auth Required |
   |--------|-------|---------|---------------|
   | `GET` | `/api/documents/:id/authorize` | Verify user has access to document | ✅ (JWT in header) |

   **Response:**
   ```json
   {
     "authorized": true,
     "permission": "read-write",
     "userId": "uuid",
     "documentId": "uuid"
   }
   ```

   > ⚠️ This is called **internally** by `sync-service` during WebSocket handshake. It must validate the JWT AND check the `document_permissions` table.

7. **Implement middleware**
   - `authMiddleware`: Extracts and verifies JWT from `Authorization: Bearer <token>` header.
   - `errorHandler`: Global error handler with structured Pino logging.
   - `validateBody(schema)`: Generic Zod validation middleware.

8. **Create the Dockerfile**
   - Multi-stage build: `builder` stage (install + compile TS) → `runner` stage (copy dist, run).
   - Use `node:20-alpine`.
   - Set `NODE_ENV=production` in runner.

9. **Test manually**
   - Register a user, login, create a document, share it, call `/authorize`.
   - Verify JWT contains correct claims.

### ✅ Stage 2 Milestone
- You can register, login, and receive a valid JWT.
- You can create documents and manage permissions.
- The `/authorize` endpoint correctly returns `{ authorized: true/false, permission: "read" | "read-write" }`.
- The service runs inside Docker and connects to `postgres-db`.

---

## Stage 3 — Database Schema & Migrations (Documents DB)

> **Goal:** Set up the document storage schema that `persist-worker` will write to.

### Steps

1. **Define the documents storage schema** (in `documents_schema`):

   - `document_snapshots` table:
     | Column | Type | Notes |
     |--------|------|-------|
     | `id` | `uuid` | PK |
     | `document_id` | `uuid` | NOT NULL, indexed |
     | `snapshot_data` | `bytea` | The Yjs encoded document state |
     | `snapshot_version` | `integer` | Monotonically increasing version number |
     | `created_at` | `timestamp` | DEFAULT NOW() |
     | Unique constraint on (`document_id`, `snapshot_version`) | | |

   - `document_deltas` table (optional, for audit/replay):
     | Column | Type | Notes |
     |--------|------|-------|
     | `id` | `uuid` | PK |
     | `document_id` | `uuid` | NOT NULL, indexed |
     | `delta_data` | `bytea` | Raw Yjs update binary |
     | `user_id` | `uuid` | Who made this edit |
     | `applied_at` | `timestamp` | DEFAULT NOW() |

2. **Create and run migrations**
   - This schema can live in the same Postgres instance under `documents_schema`.
   - Use Drizzle Kit or raw SQL in `postgres-db/init.sql`.

3. **Decide on the migration ownership**
   - Option A: `persist-worker` owns and runs these migrations on startup.
   - Option B: A shared migration runner script in `postgres-db/`.
   - **Recommendation:** Option B — keep DB init separate from application services.

### ✅ Stage 3 Milestone
- `document_snapshots` and `document_deltas` tables exist in Postgres under `documents_schema`.
- You can manually INSERT and SELECT binary data from these tables.

---

## Stage 4 — Sync Service (Single Node)

> **Goal:** Build the core real-time collaboration engine. Start with a single instance — horizontal scaling comes in Stage 6.

### Steps

1. **Install service dependencies**
   ```
   ws (WebSocket server)
   yjs (CRDT library)
   y-protocols (Yjs sync/awareness protocols)
   lib0 (Yjs encoding utilities)
   ioredis (Redis client)
   jsonwebtoken (JWT verification)
   pino, pino-pretty
   ```

2. **Implement the WebSocket server (`src/index.ts`)**
   - Create an HTTP server (no Express needed — raw `http.createServer`).
   - Attach `ws.WebSocketServer` to the HTTP server.
   - Listen on `SYNC_SERVICE_PORT` (default: 4000).

3. **Implement the connection handshake**
   - Client connects to: `ws://gateway/ws?docId=<uuid>&token=<jwt>`
   - On `connection` event:
     1. **Extract** `docId` and `token` from the URL query params.
     2. **Validate JWT** locally (verify signature with `JWT_SECRET`).
     3. **Authorize** by calling `GET ${USER_SERVICE_URL}/api/documents/${docId}/authorize` with the JWT in the `Authorization` header.
     4. If unauthorized → close the socket with code `4001` and reason `"Unauthorized"`.
     5. If authorized → proceed to join the document room.

4. **Implement Document Rooms (in-memory)**
   - Create a `Map<string, DocumentRoom>` where key = `docId`.
   - Each `DocumentRoom` contains:
     ```typescript
     interface DocumentRoom {
       docId: string;
       yDoc: Y.Doc;                    // The Yjs document instance
       connections: Set<WebSocket>;     // Active client connections
       awarenessStates: Map<number, any>; // Cursor positions, selections
     }
     ```
   - **On first connection to a room:**
     1. Create a new `Y.Doc` instance.
     2. Load the latest snapshot from Postgres (via a direct DB query or a REST call — decide your approach).
     3. Apply the snapshot to the `Y.Doc` using `Y.applyUpdate(yDoc, snapshotData)`.
   - **On subsequent connections:**
     1. Sync the new client with the existing `Y.Doc` state using the Yjs sync protocol.

5. **Implement the Yjs sync protocol handler**
   - On incoming WebSocket `message`:
     1. Decode the message using `y-protocols/sync`.
     2. Handle `SyncStep1` → respond with `SyncStep2` (send the full doc state).
     3. Handle `SyncStep2` → apply the remote state to the local `Y.Doc`.
     4. Handle `Update` → apply the update to the `Y.Doc`, then broadcast to all other clients in the room.
   - On `Y.Doc` `update` event:
     1. Broadcast the update to all connected clients in the room (except sender).
     2. Publish the update to Redis (see next step).

6. **Implement Redis publishing**
   - On every `Y.Doc` update:
     1. **Pub/Sub:** Publish to Redis channel `doc:<docId>` with the binary update. (This is for cross-node sync in Stage 6.)
     2. **Stream:** Push to Redis Stream `doc_updates` with fields: `docId`, `userId`, `delta` (base64-encoded binary), `timestamp`. (This is for `persist-worker` in Stage 5.)

7. **Implement awareness protocol (cursor positions)**
   - Use `y-protocols/awareness` to broadcast cursor positions and user selections.
   - Each client's awareness state should include: `userId`, `displayName`, `cursor position`, `selection range`, `color`.

8. **Implement connection cleanup**
   - On WebSocket `close`:
     1. Remove the connection from the room's `connections` set.
     2. If the room has zero connections, start a cleanup timer (e.g., 30 seconds).
     3. After the timer, if still empty, destroy the `Y.Doc` and remove the room from memory.

9. **Create the Dockerfile**
   - Same multi-stage pattern as `user-service`.

10. **Test manually**
    - Use a simple HTML page with Yjs + `y-websocket` provider to connect.
    - Open two browser tabs, connect to the same `docId`.
    - Type in one tab → verify it appears in the other.

### ✅ Stage 4 Milestone
- A single `sync-service` instance accepts WebSocket connections.
- JWT + document authorization works on handshake.
- Two clients editing the same document see each other's changes in real-time.
- Cursor positions (awareness) sync between clients.
- Deltas are published to Redis (Pub/Sub + Streams).

---

## Stage 5 — Persist Worker (Async Snapshots)

> **Goal:** Build the background worker that consumes deltas from Redis and writes snapshots to PostgreSQL.

### Steps

1. **Install service dependencies**
   ```
   ioredis (Redis client - Streams consumer)
   yjs (to reconstruct document state)
   drizzle-orm, pg
   pino, pino-pretty
   ```

2. **Implement the Redis Stream consumer**
   - Use Redis `XREADGROUP` with a consumer group named `persist-workers`.
   - Consumer name: `worker-1` (allows horizontal scaling of workers later).
   - Read from stream `doc_updates` in a blocking loop.
   - On startup, create the consumer group if it doesn't exist:
     ```
     XGROUP CREATE doc_updates persist-workers 0 MKSTREAM
     ```

3. **Implement the delta aggregation logic**
   - Maintain an in-memory buffer per `docId`:
     ```typescript
     interface DeltaBuffer {
       docId: string;
       yDoc: Y.Doc;
       pendingDeltas: number;
       lastFlushTime: number;
     }
     ```
   - On each delta received:
     1. Apply the delta to the buffer's `Y.Doc` using `Y.applyUpdate()`.
     2. Increment `pendingDeltas`.
   - **Flush condition** (whichever comes first):
     - `pendingDeltas >= 50` operations.
     - `Date.now() - lastFlushTime >= 5000` ms (5 seconds).

4. **Implement the snapshot writer**
   - On flush:
     1. Encode the full doc state: `Y.encodeStateAsUpdate(yDoc)`.
     2. Increment the `snapshot_version` for the document.
     3. `INSERT INTO document_snapshots (document_id, snapshot_data, snapshot_version)`.
     4. Optionally batch-insert deltas into `document_deltas` for the audit trail.
     5. `XACK` the processed messages in the Redis Stream.
     6. Reset the buffer.

5. **Implement graceful shutdown**
   - On `SIGTERM` / `SIGINT`:
     1. Stop reading from the stream.
     2. Flush all pending buffers immediately.
     3. Close DB and Redis connections.
     4. Exit cleanly.

6. **Implement a periodic flush timer**
   - Run a `setInterval` every 5 seconds that checks all buffers and flushes any that have exceeded the time threshold.

7. **Implement dead letter / error handling**
   - If a delta fails to apply (corrupted data), log the error and `XACK` it to prevent blocking the stream.
   - Optionally publish to a `doc_updates_dlq` (dead letter queue) stream.

8. **Create the Dockerfile**
   - Same pattern. No ports exposed — this is a background worker.

9. **Test end-to-end**
   - Edit a document in the client → verify a snapshot row appears in `document_snapshots` within 5 seconds.
   - Edit 50+ times rapidly → verify the snapshot flushes early.

### ✅ Stage 5 Milestone
- The worker runs as a background process consuming from Redis Streams.
- Document snapshots are written to Postgres within 5 seconds of the last edit.
- Batch flushing works at the 50-operation threshold.
- Graceful shutdown flushes all pending state.

---

## Stage 6 — Horizontal Scaling (Multi-Node Sync)

> **Goal:** Enable multiple `sync-service` instances to stay in sync using Redis Pub/Sub.

### Steps

1. **Implement Redis Pub/Sub subscription in `sync-service`**
   - On room creation (when a `Y.Doc` is loaded for a `docId`):
     - `SUBSCRIBE` to Redis channel `doc:<docId>`.
   - On room destruction (all clients disconnected):
     - `UNSUBSCRIBE` from `doc:<docId>`.

2. **Handle incoming Pub/Sub messages**
   - When a message arrives on `doc:<docId>`:
     1. Check if the update originated from THIS node (include a `nodeId` field in the published message to prevent echo loops).
     2. If it's from another node → `Y.applyUpdate(yDoc, updateData)`.
     3. Broadcast the update to all locally connected WebSocket clients.

3. **Configure `sync-service-2`**
   - Since `sync-service-2` is the same codebase as `sync-service-1`, simply:
     - Set `SYNC_SERVICE_PORT=4001`.
     - Set a unique `NODE_ID=sync-2`.
     - Mount the same source code directory.

4. **Update `docker-compose.yml`**
   - Define `sync-service-1` and `sync-service-2` as separate services pointing to the same build context (or Dockerfile).
   - Give each a different `NODE_ID` environment variable.

5. **Test cross-node sync**
   - Connect Client A to `sync-service-1` (port 4000) for `docId=XYZ`.
   - Connect Client B to `sync-service-2` (port 4001) for `docId=XYZ`.
   - Edit on Client A → verify Client B receives the update via Redis relay.
   - Verify no duplicate/echo updates.

### ✅ Stage 6 Milestone
- Two sync-service instances share document state via Redis Pub/Sub.
- Clients connected to different nodes see each other's edits in real-time.
- No echo loops or duplicate updates.

---

## Stage 7 — Nginx Gateway & Routing

> **Goal:** Route all external traffic through Nginx — REST to `user-service`, WebSocket upgrades to the sync cluster.

### Steps

1. **Write the production `gateway/nginx.conf`**

   ```nginx
   upstream user_service {
       server user-service:3000;
   }

   upstream sync_cluster {
       # Round-robin by default
       server sync-service-1:4000;
       server sync-service-2:4001;
       # ip_hash;  # Uncomment for sticky sessions if needed
   }

   server {
       listen 80;

       # REST API routes → user-service
       location /api/ {
           proxy_pass http://user_service;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # WebSocket routes → sync cluster
       location /ws {
           proxy_pass http://sync_cluster;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_read_timeout 86400s;  # 24 hours for long-lived WS
           proxy_send_timeout 86400s;
       }

       # Health check
       location /health {
           return 200 'OK';
           add_header Content-Type text/plain;
       }
   }
   ```

2. **Consider sticky sessions**
   - If you need a client to always reconnect to the same sync node (e.g., for awareness state continuity), enable `ip_hash` in the `sync_cluster` upstream.
   - Alternatively, rely on the `doc:<docId>` Redis Pub/Sub to keep things consistent regardless of which node a client hits.

3. **Add rate limiting**
   ```nginx
   limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

   location /api/ {
       limit_req zone=api_limit burst=50 nodelay;
       proxy_pass http://user_service;
       # ...
   }
   ```

4. **Add CORS headers (if not handled by Express)**
   ```nginx
   location /api/ {
       add_header Access-Control-Allow-Origin *;
       add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
       add_header Access-Control-Allow-Headers "Authorization, Content-Type";
       # ...
   }
   ```

5. **Test the full flow through Nginx**
   - `POST http://localhost/api/auth/register` → should reach `user-service`.
   - `ws://localhost/ws?docId=123&token=JWT` → should upgrade and reach a sync node.
   - Verify round-robin: connect two WS clients → they may hit different sync nodes → both should still sync via Redis.

### ✅ Stage 7 Milestone
- All traffic flows through `http://localhost` (port 80).
- REST requests route to `user-service`.
- WebSocket upgrades route to the sync cluster.
- Rate limiting is active on the REST API.

---

## Stage 8 — Integration Testing & Hardening

> **Goal:** Validate the entire system end-to-end and handle edge cases.

### Steps

1. **Write integration test scripts**
   - **Auth flow test:** Register → Login → Get JWT → Verify JWT claims.
   - **Document flow test:** Create document → Share with user B → Verify `/authorize` for both users.
   - **Sync flow test (single node):** Connect two WS clients to same doc → edit on one → verify on other.
   - **Sync flow test (cross-node):** Force clients onto different nodes → edit → verify via Redis relay.
   - **Persistence test:** Edit a document → wait 6 seconds → query `document_snapshots` → verify data exists.
   - **Reconnection test:** Disconnect a client → reconnect → verify the client receives the full doc state.
   - **Unauthorized access test:** Connect with an invalid/expired token → verify socket closes with 4001.
   - **Permission enforcement test:** User with `read` permission tries to send an update → verify it's rejected.

2. **Implement read-only enforcement in sync-service**
   - If the user's permission is `read`, accept the WS connection but:
     - Send them the full doc state (SyncStep1/2).
     - Broadcast awareness (so they see cursors).
     - **Reject** any incoming `Update` messages from them.

3. **Add heartbeat/ping-pong to WebSockets**
   - Implement server-side ping every 30 seconds.
   - If a client doesn't respond with pong within 10 seconds, terminate the connection.
   - This prevents ghost connections and wasted memory.

4. **Implement connection limits**
   - Max connections per document (e.g., 50).
   - Max connections per user across all documents (e.g., 10).
   - Return appropriate WS close codes when limits are exceeded.

5. **Add structured logging throughout**
   - Every service should log with Pino using child loggers with context:
     ```
     [user-service] { event: "user.registered", userId: "uuid" }
     [sync-service-1] { event: "room.created", docId: "uuid", connections: 1 }
     [persist-worker] { event: "snapshot.written", docId: "uuid", version: 42 }
     ```

6. **Add Docker healthchecks for all services**
   - `user-service`: `GET /api/health` returns 200.
   - `sync-service`: `GET /health` returns 200 (on the HTTP server).
   - `persist-worker`: Check Redis connection is alive.

7. **Handle edge cases**
   - What happens when a user is removed from a document's permissions while connected?
     - Approach: Periodically re-validate permissions (every 60 seconds) or invalidate on permission change via Redis Pub/Sub.
   - What happens when `persist-worker` crashes mid-flush?
     - Approach: Use Redis Stream `XACK` only after successful DB write. On restart, unacknowledged messages are re-processed.
   - What happens when Postgres is down?
     - Approach: Sync-service continues operating in-memory. Persist-worker retries with exponential backoff.

### ✅ Stage 8 Milestone
- All integration tests pass.
- Unauthorized/read-only users are correctly handled.
- WebSocket connections have heartbeats and limits.
- All services have healthchecks and structured logging.
- Edge cases (permission revocation, crash recovery, DB downtime) are handled.

---

## Post-MVP Stretch Goals

These are **not required** for the initial build but are natural next steps:

| Priority | Feature | Description |
|----------|---------|-------------|
| 🔥 High | **Document version history** | Allow users to view and restore previous snapshots |
| 🔥 High | **SSL/TLS termination** | Add Let's Encrypt certificates to Nginx for `wss://` |
| 🟡 Medium | **Presence indicators** | Show "User A is viewing" / "User B is editing" in the UI |
| 🟡 Medium | **Operational dashboard** | Prometheus metrics + Grafana for connection counts, latency, delta throughput |
| 🟡 Medium | **Document templates** | Pre-populated documents for common use cases |
| 🟢 Low | **Offline editing** | Client-side Yjs state that syncs when reconnected |
| 🟢 Low | **Comments & annotations** | Attach threaded comments to document selections |
| 🟢 Low | **Export (PDF, Markdown)** | Server-side document rendering |

---

## Quick Reference: Service Dependency Chain

```
Stage 0: Project scaffold (no containers)
   │
   ▼
Stage 1: postgres-db + redis-broker (infra only)
   │
   ▼
Stage 2: user-service (depends on postgres-db)
   │
   ▼
Stage 3: documents schema (depends on postgres-db)
   │
   ├──────────────────────────┐
   ▼                          ▼
Stage 4: sync-service-1      Stage 5: persist-worker
(depends on user-service,     (depends on redis-broker,
 redis-broker)                 postgres-db)
   │
   ▼
Stage 6: sync-service-2 (same code, redis cross-sync)
   │
   ▼
Stage 7: nginx gateway (routes to all services)
   │
   ▼
Stage 8: Integration testing & hardening
```

---

> **Tip:** Work through each stage sequentially. Don't move to the next stage until your milestone checklist is fully green. Each stage builds on the previous one, and skipping ahead will create debugging nightmares.
