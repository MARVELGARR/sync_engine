# Sync Engine: Project Study and Frontend Plan

## Executive summary

Sync Engine is a real-time collaborative document backend. It combines a REST API for identity and document permissions with a Yjs-compatible WebSocket protocol for live editing. The backend already establishes the important MVP behavior: users can register and log in, authenticated users can create and list documents, owners can share documents with `read` or `read-write` access, and authorized clients can join a document room and exchange Yjs updates.

The frontend should therefore be designed as a **document workspace**, not as a conventional CRUD dashboard. Its two central responsibilities are to provide a clear document-management experience and to maintain a resilient browser-side Yjs connection while the user is editing.

The recommended implementation is a separate `web/` Next.js application in the repository. It should use TypeScript, Tailwind CSS, shadcn/ui, TanStack Query for REST server state, Zustand or React context for small client-only session state, and Yjs plus a compatible WebSocket provider for collaboration. The visual system should remain mostly open source and dependency-light.

## 1. What the backend currently does

### 1.1 Service topology

The repository contains seven runtime containers:

| Service | Responsibility | Frontend relevance |
|---|---|---|
| Nginx gateway | Routes `/api/*` to the user service and `/ws` to the sync cluster | The browser should use one public origin whenever possible |
| User service | Registration, login, JWTs, profile lookup, document metadata, sharing, authorization | Main REST API consumed by Next.js |
| Sync service node 1 | WebSocket room management and Yjs synchronization | Live editor transport |
| Sync service node 2 | Horizontally scaled copy of the sync service | Transparent to the frontend when reached through Nginx |
| Persist worker | Consumes Redis stream updates and writes snapshots | Provides eventual persistence; it is not called directly by the browser |
| Redis | Cross-node Pub/Sub and persistence stream broker | Not exposed to the frontend |
| PostgreSQL | Users, documents, permissions, snapshots, and deltas | Not exposed to the frontend |

The gateway is the intended public boundary. REST calls use paths such as `/api/auth/login`, while the editor connects to `/ws?docId=<uuid>&token=<jwt>`.

### 1.2 Authentication flow

1. The user submits email, password, and display name to `POST /api/auth/register`.
2. The user logs in through `POST /api/auth/login`.
3. The response contains a JWT at `data.token` and a user object at `data.user` or the equivalent service response shape.
4. Protected REST requests send `Authorization: Bearer <token>`.
5. The browser opens the WebSocket using the token as a query parameter because the current WebSocket handshake reads `docId` and `token` from the URL.
6. The sync service verifies the JWT locally and then asks the user service whether the user is authorized for the document.

The frontend must handle expired tokens centrally. The current API includes `POST /api/auth/refresh`, which should be used before forcing a logout where possible.

### 1.3 Document and permission model

A document has an ID, title, owner ID, and timestamps. The owner always has `read-write` access. Other users receive explicit permissions identified by email when sharing:

- `read`: the user can connect, receive the current document, see awareness updates, and cannot publish document edits.
- `read-write`: the user can edit and publish Yjs updates.

The backend exposes these document operations:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/documents` | Create a document with `{ title }` |
| `GET` | `/api/documents` | List owned and shared documents |
| `GET` | `/api/documents/:id` | Read document metadata if the user has access |
| `DELETE` | `/api/documents/:id` | Delete a document as owner |
| `POST` | `/api/documents/:id/share` | Grant or update a permission using `{ email, permission }` |
| `DELETE` | `/api/documents/:id/share/:userId` | Revoke a permission |
| `GET` | `/api/documents/:id/authorize` | Return authorization information; primarily used internally by sync-service |

### 1.4 Realtime editing flow

The sync service stores an in-memory `Y.Doc` per active document room. When the first client enters a room, the service loads the latest binary snapshot from PostgreSQL. The browser then completes the standard Yjs synchronization handshake.

When a user edits a document, the flow is:

1. The editor changes a shared Yjs data structure.
2. Yjs produces a binary update.
3. The WebSocket provider sends the update to the sync service.
4. The sync service applies it to the room and broadcasts it to other clients.
5. Redis Pub/Sub relays the update between sync nodes.
6. Redis Streams sends the update to the persist worker.
7. The persist worker periodically writes a complete snapshot to PostgreSQL.

The frontend should show a connection indicator, but it should not claim that an edit is durably stored immediately. The system is realtime first and persistence is asynchronous.

### 1.5 Awareness and presence

The backend supports Yjs awareness messages. These are intended for transient presence information such as active cursors and selections. The current server-side client metadata includes `userId`, `displayName`, and permission. The frontend should initialize awareness with a display name and a stable color, then render other users' presence when the editor integration supports it.

### 1.6 WebSocket failure codes

The editor should translate these close codes into user-facing states:

| Code | Backend meaning | Recommended UI response |
|---|---|---|
| `4000` | Missing document ID or token | Treat as a client configuration error |
| `4001` | Invalid or expired JWT | Refresh once, then redirect to login if refresh fails |
| `4003` | User has no access | Show an access-denied page and return to documents |
| `4005` | Document room is full | Show a temporary capacity message and retry with backoff |
| `4006` | User has too many active connections | Close duplicate tabs or show a session-limit message |

## 2. Recommended frontend information architecture

### Public routes

- `/login`: email and password form.
- `/register`: display name, email, and password form.
- `/`: redirect authenticated users to `/documents`; redirect unauthenticated users to `/login`.

### Authenticated routes

- `/documents`: primary workspace home. It should show owned documents, documents shared with the user, search, sorting, and a create-document action.
- `/documents/[id]`: collaborative editor route. It should load metadata, authorize the user, connect to Yjs, and expose the share panel when the current user is the owner.
- `/settings/profile`: optional MVP-plus route for profile details and logout.

### Editor layout

The first editor version should use a focused three-part layout:

1. **Top bar:** document title, connection state, last local activity, collaborators, share action, and a back-to-documents button.
2. **Main canvas:** a block editor or rich-text editor backed by a Yjs shared type.
3. **Optional right panel:** collaborators and permissions, shown on demand to keep the writing area wide.

A read-only user should see a visible `Read only` badge and a disabled editing surface. This is better than allowing interaction that is silently rejected by the server.

## 3. Recommended technology choices

| Concern | Recommendation | Reason |
|---|---|---|
| Application | Next.js with App Router and TypeScript | Good route-level structure and strong React ecosystem |
| UI primitives | shadcn/ui and Radix UI | Open source, composable, accessible, and easy to customize |
| Styling | Tailwind CSS | Fast implementation and consistent design tokens |
| REST fetching | TanStack Query | Handles caching, invalidation, loading states, and mutations cleanly |
| Forms | React Hook Form + Zod | Matches the backend validation approach and avoids hand-written form state |
| Icons | Lucide React | Open source and already aligned with shadcn/ui conventions |
| Toasts | Sonner or shadcn/ui toast pattern | Clear feedback for document and permission mutations |
| Collaboration | Yjs plus a compatible WebSocket provider or a small custom provider | Must speak the backend's standard Yjs sync and awareness protocol |
| Editor | Tiptap with its Yjs extension, or CodeMirror if the product is code-oriented | Tiptap is the best default for collaborative rich text; CodeMirror is better for code/plain text |
| Local state | React context for auth bootstrap; Zustand only if editor/session state grows | Avoids adding a state library for simple state |
| Testing | Vitest, React Testing Library, and Playwright | Open source coverage for components, hooks, and browser collaboration flows |

The main technical decision is the editor format. The current backend stores Yjs binary state but does not prescribe a document schema. For a general writing product, use Tiptap with a shared Yjs fragment. For a code editor, use CodeMirror with a shared Y.Text. This choice should be made before implementing the editor because it affects the Yjs data model.

## 4. Frontend data and API layer

Create a typed API client with one responsibility: attach the access token, parse the standard response wrapper, normalize errors, and refresh the token once on an authentication failure.

Suggested modules:

```text
web/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (workspace)/documents/page.tsx
│   ├── (workspace)/documents/[id]/page.tsx
│   └── layout.tsx
├── components/
│   ├── auth/
│   ├── documents/
│   ├── editor/
│   ├── sharing/
│   └── ui/
├── lib/
│   ├── api-client.ts
│   ├── auth-session.ts
│   ├── query-client.ts
│   ├── websocket-provider.ts
│   └── validators.ts
├── hooks/
│   ├── use-current-user.ts
│   ├── use-documents.ts
│   ├── use-document.ts
│   └── use-collaboration.ts
└── types/
    ├── api.ts
    ├── auth.ts
    └── documents.ts
```

The client should model at least these types:

```ts
type Permission = "read" | "read-write";

type DocumentSummary = {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};
```

Dates should be treated as ISO strings at the network boundary and converted only where a component needs formatted display text.

## 5. Implementation phases

### Phase 0: Contract and infrastructure alignment

Before building visual features, install the repository dependencies and verify the backend locally. The first verification attempt failed at `tsc: not found`, which indicates that `npm install` has not been run in the repository. Then run the existing auth and sync integration tests with Docker Compose.

At this stage, make these backend/frontend decisions explicit:

- Choose Tiptap rich text or CodeMirror code/plain text.
- Choose whether the JWT is stored in memory plus a refresh mechanism, or in a carefully protected browser storage strategy. The current backend returns a bearer token, so this needs an explicit security decision.
- Decide whether the frontend is served by the same Nginx origin or by a separate Next.js origin. Same-origin deployment is simpler because `/api` and `/ws` need no cross-origin configuration.
- Confirm the exact login response shape and document-list shape from running the API.

### Phase 1: Next.js shell and design system

Create `web/` as a separate workspace or application. Add shadcn/ui components for buttons, inputs, labels, cards, dialogs, dropdowns, avatars, badges, skeletons, alerts, and separators. Establish design tokens for a calm document workspace: neutral surfaces, one accent color, clear read-only and connection statuses, and responsive behavior for narrow screens.

Build the application shell with a responsive sidebar, a top-level user menu, protected-route handling, and loading/error boundaries.

### Phase 2: Authentication

Implement registration, login, logout, current-user bootstrap, refresh handling, and protected navigation. Validation errors should be shown next to fields. Network and server errors should be shown in a non-blocking alert or toast.

Acceptance criteria:

- A new user can register and is redirected to documents after login.
- Invalid credentials do not expose whether an email exists beyond the backend's response.
- Refresh failures clear the session and return the user to login.
- Reloading the page restores the authenticated session according to the selected token strategy.

### Phase 3: Document workspace

Implement the document list with owned/shared sections or filter tabs. Include search, empty states, skeleton loading, create-document dialog, rename affordance only if a rename API is added, and owner-only delete confirmation.

The current backend does not expose rename. Avoid showing a rename control until `PATCH /api/documents/:id` exists. The list should not infer permissions from ownership alone if the API does not return a permission field; add that field to the list response or derive it through a dedicated endpoint.

### Phase 4: Collaborative editor

Build a browser-side Yjs provider that:

1. Creates a Y.Doc.
2. Connects to `ws(s)://<origin>/ws?docId=<id>&token=<jwt>`.
3. Encodes and decodes the standard Yjs sync message format used by the server.
4. Handles awareness updates.
5. Reconnects with bounded exponential backoff.
6. Disposes the socket, Y.Doc, and editor bindings on route change.

The editor must render `Connecting`, `Connected`, `Reconnecting`, `Offline`, and `Access denied` states. It should warn before navigation only if the product promises unsaved local changes; because Yjs can keep local state, this behavior should be defined rather than assumed.

### Phase 5: Sharing and collaborators

Implement an owner-only share dialog with email and permission selection. On success, invalidate document and collaborator queries and show the updated state. Add revoke controls with a confirmation step because revoking a user's access changes their ability to open the document.

The backend currently lacks a route to list document permissions. Add:

```text
GET /api/documents/:id/permissions
```

The endpoint should be owner-only and return the target user's ID, email, display name, permission, and grant timestamp. This makes the collaborators panel deterministic and avoids guessing from the document list.

### Phase 6: Quality, accessibility, and production hardening

Add component tests for auth forms, document creation, permission controls, and error states. Add Playwright tests for the critical journey: register, create a document, open two browser contexts, edit in one, observe the other, and verify that a read-only user cannot edit.

Add frontend observability for WebSocket state transitions and API failures without logging JWTs or document contents. Verify that the production gateway uses secure `wss` behind TLS and that CORS is restricted to the actual frontend origin rather than `*`.

## 6. Backend changes recommended before or during frontend work

| Priority | Change | Why it matters |
|---|---|---|
| High | Add `GET /api/documents/:id/permissions` | Required for a real collaborators panel and revoke UI |
| High | Return explicit permission and owner information in document list responses | Needed for correct badges and editor mode |
| High | Decide token storage and refresh behavior | JWT-in-query-string WebSocket authentication has URL/log exposure considerations |
| High | Add a document update endpoint if rename is required | Current API supports create, list, read, share, revoke, and delete only |
| High | Confirm or provide a browser-compatible Yjs provider contract | The server speaks low-level Yjs protocol; the client must match its message framing |
| Medium | Add rate-limit-friendly error codes and stable error shapes | Improves form and toast behavior |
| Medium | Restrict CORS in production | Current gateway configuration allows all origins |
| Medium | Add snapshot freshness metadata if the UI will show save state | Persistence is asynchronous and currently not directly observable from the API |
| Low | Add document activity/history APIs | Needed only for version history or audit UI, not for the first editor MVP |

The WebSocket token design deserves special attention. The current server expects the token in the query string, so the browser cannot use a normal `Authorization` header during the native WebSocket handshake. If the deployment or logging layer records full request URLs, JWTs may appear in logs. A future version should consider a short-lived WebSocket ticket endpoint or a cookie-based handshake.

## 7. Suggested MVP screen checklist

The first usable release should include:

- Login and registration screens.
- Authenticated workspace shell.
- Document list with owned/shared distinction.
- Create-document dialog.
- Empty, loading, error, and retry states.
- Collaborative editor with title and document ID routing.
- Read-only mode based on permission.
- Connection status indicator.
- Presence avatars or a simple collaborator count.
- Owner-only share dialog.
- Owner-only revoke action after the permissions endpoint exists.
- Owner-only delete confirmation.
- Logout and expired-session handling.

The first release should not include document version history, offline-first conflict resolution UI, comments, notifications, arbitrary document search, or rich administration dashboards. Those features require backend contracts that are not present yet.

## 8. Definition of done for the frontend MVP

The frontend MVP is complete when a new user can register, log in, create a document, open it in the editor, and see a second authorized browser session receive edits in real time. An owner must be able to share the document with another registered user as read-only or read-write. The read-only session must receive the document and presence updates but must not change the document. Unauthorized and expired sessions must receive clear navigation and recovery behavior.

The UI must remain usable on desktop and mobile widths, expose keyboard-accessible controls, avoid leaking tokens or document content into logs, and provide clear feedback for API failures, reconnecting sockets, and permission changes.

## 9. Recommended order of execution

The most efficient sequence is:

1. Install dependencies and run the backend tests.
2. Add the missing permissions-list API and normalize document response fields.
3. Scaffold the Next.js app and shadcn/ui design system.
4. Implement authentication and session handling.
5. Implement documents list and create flow.
6. Prove the Yjs WebSocket provider with a minimal editor before polishing the UI.
7. Add permission-aware editor behavior and connection states.
8. Add sharing and collaborator management.
9. Add browser-level collaboration tests.
10. Deploy behind the same gateway origin and perform a production WebSocket check.

This order reduces risk because the Yjs provider and token-handshake behavior are the two parts most likely to affect the frontend architecture.

## References

[1]: README.md "Sync Engine repository README and API reference"
[2]: IMPLEMENTATION_PLAN.md "Sync Engine staged implementation plan"
[3]: user-service/src/routes/auth.routes.ts "Authentication route definitions"
[4]: user-service/src/routes/document.routes.ts "Document and permission route definitions"
[5]: sync-service/src/rooms/document.room.ts "Yjs document room and awareness protocol implementation"
[6]: tests/integration/auth-flow.test.ts "Authentication and document permission integration flow"
[7]: tests/integration/sync-flow.test.ts "WebSocket authorization integration flow"
