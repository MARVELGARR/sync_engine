# Sync Engine

> A real-time collaborative document workspace built with **Yjs CRDTs**, **WebSockets**, **Redis**, **PostgreSQL**, and **Next.js**.

Sync Engine lets users create documents, edit them concurrently, share them with read or read-write access, and reconnect to persisted document state. The system is split into independently deployable services and runs locally with Docker Compose.

## Highlights

- Real-time, conflict-free collaboration using Yjs CRDTs.
- WebSocket sync with Yjs SyncStep1/SyncStep2, incremental updates, and awareness/presence messages.
- Horizontal sync-service topology with Redis Pub/Sub for cross-node document updates.
- Asynchronous persistence through Redis Streams and a dedicated worker.
- JWT authentication with token refresh and revocation via token versions.
- Guest sessions that can create and edit documents before being converted into full accounts.
- Document sharing with `read` and `read-write` permissions.
- URL-driven document search, filtering, and sorting that survives refresh and can be shared as a link.
- Offline document/session caching in IndexedDB with automatic synchronization after reconnect.
- Visible collaborator presence, connection status, and a manual refresh/re-sync recovery path.
- Next.js frontend served behind the same Nginx gateway as the REST and WebSocket APIs.
- PostgreSQL storage for users, document metadata, permissions, snapshots, and an update audit trail.
- Rate limiting, WebSocket heartbeats, connection limits, and structured Pino logging.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                 Next.js UI + Yjs client                      │
└───────────────────────┬───────────────────┬──────────────────┘
                        │ HTTP               │ WebSocket
                        ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                    Nginx gateway :80                         │
│              /       /api/*       /ws                        │
└───────────────┬───────────────┬──────────────┬───────────────┘
                │               │              │
                ▼               ▼              ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │  Frontend   │ │ User/Auth   │ │ Sync cluster│
        │  Next.js    │ │ service     │ │ Node 1 + 2  │
        │  :3000      │ │ :3000       │ │ :4000/:4001 │
        └─────────────┘ └──────┬──────┘ └──────┬──────┘
                                │               │
                                ▼               ▼
                         ┌─────────────┐ ┌─────────────┐
                         │ PostgreSQL  │ │ Redis       │
                         │ users_schema│ │ Pub/Sub +   │
                         │             │ │ Streams     │
                         └─────────────┘ └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │ Persist     │
                                         │ worker      │
                                         └──────┬──────┘
                                                ▼
                                         ┌─────────────┐
                                         │ PostgreSQL  │
                                         │ documents_  │
                                         │ schema      │
                                         └─────────────┘
```

### Services

| Service | Container port | Responsibility |
| --- | ---: | --- |
| `gateway` | `80` | Nginx reverse proxy for the UI, REST API, and WebSockets |
| `frontend` | `3000` | Next.js collaborative workspace |
| `user-service` | `3000` | Authentication, users, documents, permissions, and authorization |
| `sync-service-1` | `4000` | WebSocket/Yjs synchronization node |
| `sync-service-2` | `4001` | Second WebSocket/Yjs synchronization node |
| `persist-worker` | — | Redis Stream consumer that writes document state to PostgreSQL |
| `redis-broker` | `6379` | Cross-node Pub/Sub and durable update stream |
| `postgres-db` | `5432` | Relational data and binary Yjs snapshots |

The host maps PostgreSQL to `5435` and the frontend directly to `3000` for debugging. Normal browser traffic should use the gateway at `http://localhost`.

## Technology stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 20, TypeScript 5 |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| API | Express 4 |
| Collaboration | Yjs, `y-protocols`, WebSocket (`ws`) |
| Persistence | PostgreSQL 16, Drizzle ORM, drizzle-kit |
| Messaging | Redis 7, Pub/Sub, Redis Streams, `XREADGROUP` |
| Authentication | JWT, bcryptjs |
| Validation | Zod |
| Logging | Pino and pino-pretty |
| Infrastructure | Docker, Docker Compose, Nginx |

## Quick start with Docker

### Prerequisites

- Docker Desktop or Docker Engine with the Compose plugin.
- Ports `80`, `3000`, `5435`, and `6379` available on the host.

### 1. Configure the environment

```bash
cp .env.example .env
```

For local development, the example values are sufficient. Before deploying anywhere shared or public, replace `JWT_SECRET`, database credentials, and any other development secrets.

### 2. Build and start the stack

```bash
npm install
docker compose up --build -d
```

The gateway waits for the application health checks before routing traffic. Startup may take around 30 seconds on the first build.

### 3. Open the application

- Web workspace: <http://localhost>
- Gateway health: <http://localhost/health>
- API health: <http://localhost/api/health>
- Direct frontend debug port: <http://localhost:3000>

### 4. Inspect logs or stop the stack

```bash
npm run docker:logs
npm run docker:down
```

To remove containers and their volumes, use this destructive command only when you no longer need local database or Redis data:

```bash
docker compose down -v
```

## Using the application

1. Register or log in from the web UI.
2. Alternatively, choose **Continue as guest** to start an ephemeral session.
3. Create a document from the documents workspace.
4. Open the document in multiple browser tabs to verify real-time editing.
5. Share a document with a registered user as either `read` or `read-write`.
6. Claim a guest session to preserve its documents and unlock sharing.

Guest sessions expire after seven days by default. Guests can create and edit documents, but they cannot share documents until the session is claimed as a full account.

### Workspace features

The documents workspace provides:

- Search by document title.
- `All`, `Owned`, and `Shared` filters.
- Sorting by last updated, title, or creation date.
- URL-owned workspace state, so search/filter/sort choices survive refresh, browser back/forward, and shared links.
- Create and delete dialogs with retry states for document loading failures.
- A guest banner with an in-context account-claim flow.

The editor provides:

- Live document content over the Yjs WebSocket provider.
- Collaborator presence and connection status.
- Read-only behavior for users with `read` permission.
- Offline restoration from IndexedDB and local persistence while disconnected.
- A **Refresh** action that re-fetches document metadata and re-runs the Yjs handshake to merge the latest persisted snapshot.
- Profile settings with session details, logout, and a **Clear local cache** action for IndexedDB data.

## API reference

The gateway exposes the REST API under `/api`. Protected endpoints expect:

```http
Authorization: Bearer <jwt>
```

Responses from the user service generally use a `{ "success": true, "data": ... }` envelope. The authorization endpoint is consumed by the sync service during WebSocket handshakes and returns its result directly.

### Health

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Gateway health response |
| `GET` | `/api/health` | None | User-service health response |

### Authentication

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | None | Register `{ email, password, displayName }` |
| `POST` | `/api/auth/login` | None | Log in and receive `{ token, user }` |
| `POST` | `/api/auth/guest` | None | Create an ephemeral guest session; optional `{ displayName }` |
| `GET` | `/api/auth/me` | JWT | Return the current user |
| `POST` | `/api/auth/refresh` | JWT | Rotate the current access token |
| `POST` | `/api/auth/claim` | Guest JWT | Convert a guest session into a full account using `{ email, password, displayName? }` |

### Documents and permissions

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/api/documents` | JWT | Create `{ title }` |
| `GET` | `/api/documents` | JWT | List documents owned by or shared with the user |
| `GET` | `/api/documents/:id` | JWT | Get document metadata when authorized |
| `DELETE` | `/api/documents/:id` | Owner JWT | Permanently delete a document |
| `POST` | `/api/documents/:id/share` | Owner JWT | Share `{ email, permission }`, where permission is `read` or `read-write` |
| `DELETE` | `/api/documents/:id/share/:userId` | Owner JWT | Revoke a user’s document permission |
| `GET` | `/api/documents/:id/authorize` | JWT | Return the caller’s document authorization; used by the sync service |

## WebSocket protocol

Connect through the gateway with:

```text
ws://localhost/ws?docId=<document-uuid>&token=<jwt>
```

The sync service uses the standard Yjs wire protocol:

- `SyncStep1` and `SyncStep2` exchange the initial document state.
- `Update` messages carry incremental CRDT changes.
- `Awareness` messages carry presence and cursor state.

The server verifies the JWT locally, then calls the user service to confirm document access. Read-only clients may receive updates and awareness messages but cannot submit document updates.

### WebSocket close codes

| Code | Meaning |
| ---: | --- |
| `4000` | Missing `docId` or `token` |
| `4001` | Invalid or expired JWT |
| `4003` | User is not authorized for the document |
| `4005` | Document room connection limit exceeded; maximum 50 clients |
| `4006` | User connection limit exceeded; maximum 10 active connections |

## Data flow and persistence

### Edit path

1. A browser sends a Yjs update over WebSocket.
2. The sync node applies the update to the in-memory `Y.Doc`.
3. The update is broadcast to other clients in the local room.
4. The sync node publishes the update to Redis:
   - `doc:<documentId>` Pub/Sub channel for other sync nodes.
   - `doc_updates` stream for the persistence worker.
5. The persistence worker accumulates updates in an in-memory Yjs document.
6. The worker flushes a snapshot when either the pending delta threshold or flush interval is reached.

By default, snapshots flush after **50 pending deltas** or **5 seconds**, whichever comes first. These values are configurable through `FLUSH_THRESHOLD` and `FLUSH_INTERVAL_MS`.

### Reconnect path

1. The WebSocket handshake authenticates and authorizes the caller.
2. The sync node loads the latest snapshot from PostgreSQL when a room is created or refreshed.
3. Yjs sends the current document state through its synchronization handshake.
4. Redis Pub/Sub continues to relay live updates between sync nodes.

## Data model

PostgreSQL is initialized with separate schemas for ownership and document state:

### `users_schema`

- `users` — credentials, profile data, guest state, expiry, and token version.
- `documents` — document metadata and ownership.
- `document_permissions` — explicit `read` or `read-write` grants.

### `documents_schema`

- `document_snapshots` — versioned binary Yjs snapshots stored as `bytea`.
- `document_deltas` — raw update audit trail with document and user IDs.

## Configuration

Copy `.env.example` to `.env` and adjust values for the environment. The most important variables are:

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | `your-super-secret-...` | Shared secret used to sign and verify JWTs |
| `JWT_EXPIRY` | `24h` | Full-account access-token lifetime |
| `GUEST_EXPIRY` | `7d` | Guest-session lifetime |
| `JWT_ISSUER` | `sync-engine` | JWT issuer claim |
| `JWT_AUDIENCE` | `sync-engine-app` | JWT audience claim |
| `DATABASE_URL` | PostgreSQL connection string | Database connection used by services |
| `REDIS_URL` | `redis://redis-broker:6379` | Redis connection used for Pub/Sub and Streams |
| `CORS_ORIGINS` | `http://localhost,http://localhost:3000` | Comma-separated allowed browser origins |
| `FLUSH_INTERVAL_MS` | `5000` | Persistence-worker flush interval |
| `FLUSH_THRESHOLD` | `50` | Persistence-worker pending-update threshold |
| `NEXT_PUBLIC_API_URL` | `http://localhost/api` | Browser-facing REST base URL, baked in at frontend build time |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost/ws` | Browser-facing WebSocket base URL, baked in at frontend build time |
| `FRONTEND_PORT` | `3000` | Host port for direct frontend access |

`NEXT_PUBLIC_*` values are supplied as Docker build arguments. Changing them requires rebuilding the frontend image.

## Development commands

Install the backend workspace dependencies from the repository root:

```bash
npm install
```

The frontend is maintained as a separate Next.js package and is not included in the root npm workspace list. Install its dependencies separately when running it outside Docker:

```bash
cd frontend
npm install
```

### Build all TypeScript workspaces

```bash
npm run build:all
```

### Run individual services locally

These commands expect PostgreSQL and Redis to be available and the relevant environment variables to be set:

```bash
npm run dev:user
npm run dev:sync
npm run dev:persist
```

Run the frontend from its own directory:

```bash
cd frontend
npm run dev
```

### Run infrastructure only

```bash
docker compose up -d postgres-db redis-broker
```

### Database workflows

Run migration commands from the service that owns the schema:

```bash
npm run --workspace=user-service db:generate
npm run --workspace=user-service db:migrate
npm run --workspace=user-service db:studio

npm run --workspace=persist-worker db:generate
npm run --workspace=persist-worker db:migrate
npm run --workspace=persist-worker db:studio
```

### Frontend checks

```bash
cd frontend
npm run lint
npm run build
```

## Testing

The integration tests expect the full Docker Compose stack to be running at `http://localhost`:

```bash
npm run docker:up
npm run test:auth
npm run test:sync
# or run both
npm run test:all
```

You can point the tests at another deployment by setting `BASE_URL` and, for WebSocket tests, `WS_URL`:

```bash
BASE_URL=http://localhost WS_URL=ws://localhost npm run test:all
```

The auth flow covers registration, login, refresh, document CRUD, sharing, authorization, revocation, and deletion. The sync flow covers WebSocket rejection cases and authorized connections.

## Security and operational behavior

- JWTs protect REST endpoints and WebSocket handshakes.
- WebSocket connections use local JWT verification plus a user-service authorization check.
- JWT issuer and audience are validated for newly issued tokens.
- Token versions allow credentials changes and guest claims to revoke previously issued tokens.
- Passwords are hashed with bcryptjs using 12 salt rounds.
- Express and Nginx both apply rate limiting.
- WebSocket heartbeats run every 30 seconds; connections that fail the pong timeout are terminated.
- Room and per-user connection limits protect memory and fan-out costs.
- Redis Pub/Sub prevents updates from being isolated to a single sync node.
- Document updates are persisted asynchronously, so the latest few seconds of edits depend on the persistence worker being healthy.

For production, use managed PostgreSQL and Redis where appropriate, rotate all secrets, terminate TLS in front of the gateway, configure trusted CORS origins, and monitor the gateway, sync nodes, Redis stream consumer, and database migrations separately.

## Repository layout

```text
sync_engine/
├── gateway/                 # Nginx reverse-proxy configuration
├── frontend/                # Next.js web application
│   ├── app/                  # Route shells for auth, documents, editor, and profile pages
│   ├── components/
│   │   ├── auth/             # Login, registration, protection, guest claiming
│   │   ├── documents/        # Workspace view, toolbar, cards, and CRUD dialogs
│   │   ├── editor/           # Editor orchestration, canvas, top bar, presence, sync hook
│   │   ├── layout/           # Shared site header
│   │   ├── settings/         # Profile and local-cache controls
│   │   ├── sharing/          # Document-sharing dialog
│   │   └── ui/               # Reusable buttons, cards, inputs, badges, and dialogs
│   ├── hooks/queries/        # React Query document hooks
│   ├── lib/                  # API client, Yjs provider, IndexedDB, types, query setup
│   └── stores/               # Zustand auth/session state
├── user-service/            # Express REST API, auth, users, documents, permissions
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # HTTP handlers
│   │   ├── dal/             # Drizzle schema and queries
│   │   ├── middleware/      # Authentication, errors, rate limiting
│   │   ├── routes/          # Auth and document routes
│   │   ├── schemas/         # Zod request validation
│   │   └── services/        # Business logic
│   └── drizzle/             # Generated migrations
├── sync-service/            # WebSocket/Yjs synchronization service
│   ├── src/
│   │   ├── auth/            # JWT verification and document authorization
│   │   ├── db/              # Snapshot loading
│   │   ├── redis/           # Pub/Sub and Stream publishing
│   │   └── rooms/           # In-memory document rooms
│   └── Dockerfile
├── persist-worker/          # Redis Stream consumer and snapshot writer
│   ├── src/
│   │   ├── buffer/          # Delta buffering and flush logic
│   │   ├── db/              # Snapshot persistence
│   │   ├── config/           # Environment configuration
│   │   └── utils/            # Structured logging
│   └── drizzle/             # Generated migrations
├── packages/shared-types/   # Shared TypeScript types
├── tests/integration/       # Auth and WebSocket integration tests
├── postgres-db/init.sql     # PostgreSQL schema initialization
├── redis-broker/redis.conf  # Redis configuration
├── docker-compose.yml       # Local multi-service deployment
├── .env.example             # Environment template
├── package.json              # Root workspace scripts
└── README.md                # This guide
```

## Contributing

1. Create a feature branch.
2. Keep service boundaries and shared contracts explicit.
3. Update tests and documentation when behavior or configuration changes.
4. Run the relevant build, lint, and integration checks before opening a pull request.

There is currently no repository license file. Add one before distributing or accepting external contributions under a specific open-source license.
