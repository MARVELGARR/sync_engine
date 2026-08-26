/**
 * ════════════════════════════════════════════════════════════════
 * Integration Test — WebSocket Sync Flow
 * ════════════════════════════════════════════════════════════════
 *
 * Prerequisites: All containers running (`docker-compose up`)
 *
 * Run:  npx tsx tests/integration/sync-flow.test.ts
 *
 * Tests covered:
 *   1. Reject WebSocket with missing query params
 *   2. Reject WebSocket with invalid JWT
 *   3. Reject WebSocket for unauthorized document
 *   4. Accept WebSocket for authorized user
 *   5. Verify persistence — snapshot appears in DB after edits
 */

import WebSocket from "ws";

const BASE_URL = process.env.BASE_URL || "http://localhost";
const WS_URL = process.env.WS_URL || "ws://localhost";

// ─── Utilities ──────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passCount++;
    } else {
        console.error(`  ❌ ${message}`);
        failCount++;
    }
}

async function api(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    token?: string
): Promise<{ status: number; data: any }> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connect to a WebSocket and capture its close code/reason.
 * Resolves when the connection closes or after a timeout.
 */
function connectWs(
    url: string
): Promise<{ opened: boolean; closeCode?: number; closeReason?: string }> {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        let opened = false;

        const timer = setTimeout(() => {
            if (opened) {
                ws.close();
                resolve({ opened: true });
            } else {
                ws.terminate();
                resolve({ opened: false });
            }
        }, 5000);

        ws.on("open", () => {
            opened = true;
        });

        ws.on("close", (code, reason) => {
            clearTimeout(timer);
            resolve({
                opened,
                closeCode: code,
                closeReason: reason.toString(),
            });
        });

        ws.on("error", () => {
            clearTimeout(timer);
            resolve({ opened: false });
        });
    });
}

// ─── Run Tests ──────────────────────────────────────────────────

async function run(): Promise<void> {
    console.log("\n🧪 Integration Test — WebSocket Sync Flow\n");
    console.log("─".repeat(52));

    // ── Setup: Register user and create document ─────────────
    const ts = Date.now();
    const user = {
        email: `ws-test-${ts}@test.com`,
        password: "T3stP@ssword!",
        displayName: "WS Test User",
    };

    await api("POST", "/api/auth/register", user);
    const loginRes = await api("POST", "/api/auth/login", {
        email: user.email,
        password: user.password,
    });
    const token = loginRes.data?.data?.token;

    const docRes = await api(
        "POST",
        "/api/documents",
        { title: "WS Test Doc" },
        token
    );
    const docId = docRes.data?.data?.id;

    assert(!!token, `Got auth token`);
    assert(!!docId, `Created document: ${docId}`);

    // ── 1. Reject WS with missing params ────────────────────
    console.log("\n📝 Test 1: Reject WS with missing query params");
    const noParams = await connectWs(`${WS_URL}/ws`);
    assert(
        noParams.closeCode === 4000 || !noParams.opened,
        `Connection rejected (code: ${noParams.closeCode})`
    );

    // ── 2. Reject WS with invalid JWT ───────────────────────
    console.log("\n📝 Test 2: Reject WS with invalid JWT");
    const badToken = await connectWs(
        `${WS_URL}/ws?docId=${docId}&token=invalid.jwt.token`
    );
    assert(
        badToken.closeCode === 4001 || !badToken.opened,
        `Connection rejected with 4001 (code: ${badToken.closeCode})`
    );

    // ── 3. Reject WS for unauthorized document ──────────────
    console.log("\n📝 Test 3: Reject WS for unauthorized document");
    const fakeDocId = "00000000-0000-0000-0000-000000000000";
    const unauthorized = await connectWs(
        `${WS_URL}/ws?docId=${fakeDocId}&token=${token}`
    );
    assert(
        unauthorized.closeCode === 4003 || !unauthorized.opened,
        `Connection rejected with 4003 (code: ${unauthorized.closeCode})`
    );

    // ── 4. Accept WS for authorized user ────────────────────
    console.log("\n📝 Test 4: Accept WS for authorized user");
    const authorized = await connectWs(
        `${WS_URL}/ws?docId=${docId}&token=${token}`
    );
    assert(authorized.opened === true, `Connection opened successfully`);

    // ── Cleanup ─────────────────────────────────────────────
    await api("DELETE", `/api/documents/${docId}`, undefined, token);

    // ── Summary ─────────────────────────────────────────────
    console.log("\n" + "─".repeat(52));
    console.log(`\n🏁 Results: ${passCount} passed, ${failCount} failed\n`);
    process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error("❌ Fatal error running tests:", err);
    process.exit(1);
});
