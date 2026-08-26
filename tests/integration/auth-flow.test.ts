/**
 * ════════════════════════════════════════════════════════════════
 * Integration Test — Auth & Document Flow
 * ════════════════════════════════════════════════════════════════
 *
 * Prerequisites: All containers running (`docker-compose up`)
 *
 * Run:  npx tsx tests/integration/auth-flow.test.ts
 *
 * Tests covered:
 *   1. Register a new user
 *   2. Reject duplicate registration
 *   3. Login with valid credentials
 *   4. Reject login with wrong password
 *   5. Verify JWT claims via GET /api/auth/me
 *   6. Refresh JWT token
 *   7. Create a document
 *   8. List user documents
 *   9. Get document by ID
 *  10. Share document with another user
 *  11. Verify /authorize for owner (read-write)
 *  12. Verify /authorize for shared user (read)
 *  13. Verify /authorize for unauthorized user (denied)
 *  14. Revoke permission
 *  15. Delete document (owner only)
 *  16. Reject unauthorized access after revocation
 */

const BASE_URL = process.env.BASE_URL || "http://localhost";

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

// ─── Test Data ──────────────────────────────────────────────────

const timestamp = Date.now();
const userA = {
    email: `alice-${timestamp}@test.com`,
    password: "SecureP@ssw0rd!",
    displayName: "Alice Test",
};
const userB = {
    email: `bob-${timestamp}@test.com`,
    password: "AnotherP@ss1!",
    displayName: "Bob Test",
};
const userC = {
    email: `charlie-${timestamp}@test.com`,
    password: "ThirdP@ss99!",
    displayName: "Charlie Test",
};

let tokenA = "";
let tokenB = "";
let tokenC = "";
let docId = "";

// ─── Run Tests ──────────────────────────────────────────────────

async function run(): Promise<void> {
    console.log("\n🧪 Integration Test — Auth & Document Flow\n");
    console.log("─".repeat(52));

    // ── 1. Register User A ──────────────────────────────────
    console.log("\n📝 Test 1: Register User A");
    const reg = await api("POST", "/api/auth/register", userA);
    assert(reg.status === 201, `Status 201 (got ${reg.status})`);
    assert(reg.data?.success === true, "Response has success: true");
    assert(!!reg.data?.data?.id, `User ID returned: ${reg.data?.data?.id}`);

    // ── 2. Reject duplicate registration ─────────────────────
    console.log("\n📝 Test 2: Reject duplicate registration");
    const dup = await api("POST", "/api/auth/register", userA);
    assert(dup.status === 409, `Status 409 (got ${dup.status})`);

    // ── 3. Login User A ─────────────────────────────────────
    console.log("\n📝 Test 3: Login User A");
    const login = await api("POST", "/api/auth/login", {
        email: userA.email,
        password: userA.password,
    });
    assert(login.status === 200, `Status 200 (got ${login.status})`);
    assert(!!login.data?.data?.token, "JWT token returned");
    tokenA = login.data?.data?.token || "";

    // ── 4. Reject bad password ───────────────────────────────
    console.log("\n📝 Test 4: Reject login with wrong password");
    const badLogin = await api("POST", "/api/auth/login", {
        email: userA.email,
        password: "wrongpassword",
    });
    assert(badLogin.status === 401, `Status 401 (got ${badLogin.status})`);

    // ── 5. GET /api/auth/me ─────────────────────────────────
    console.log("\n📝 Test 5: Verify JWT claims via /api/auth/me");
    const me = await api("GET", "/api/auth/me", undefined, tokenA);
    assert(me.status === 200, `Status 200 (got ${me.status})`);
    assert(me.data?.data?.email === userA.email, `Email matches: ${me.data?.data?.email}`);
    assert(me.data?.data?.displayName === userA.displayName, `Display name matches`);

    // ── 6. Refresh token ────────────────────────────────────
    console.log("\n📝 Test 6: Refresh JWT token");
    const refresh = await api("POST", "/api/auth/refresh", undefined, tokenA);
    assert(refresh.status === 200, `Status 200 (got ${refresh.status})`);
    assert(!!refresh.data?.data?.token, "New JWT token returned");
    assert(refresh.data?.data?.token !== tokenA, "New token differs from original");
    // Use refreshed token going forward
    tokenA = refresh.data?.data?.token || tokenA;

    // ── Register users B and C for permission tests ──────────
    await api("POST", "/api/auth/register", userB);
    const loginB = await api("POST", "/api/auth/login", {
        email: userB.email,
        password: userB.password,
    });
    tokenB = loginB.data?.data?.token || "";

    await api("POST", "/api/auth/register", userC);
    const loginC = await api("POST", "/api/auth/login", {
        email: userC.email,
        password: userC.password,
    });
    tokenC = loginC.data?.data?.token || "";

    // ── 7. Create document ──────────────────────────────────
    console.log("\n📝 Test 7: Create a document (User A)");
    const createDoc = await api(
        "POST",
        "/api/documents",
        { title: "Test Document" },
        tokenA
    );
    assert(createDoc.status === 201, `Status 201 (got ${createDoc.status})`);
    assert(!!createDoc.data?.data?.id, `Document ID returned`);
    docId = createDoc.data?.data?.id || "";

    // ── 8. List documents ───────────────────────────────────
    console.log("\n📝 Test 8: List user documents (User A)");
    const listDocs = await api("GET", "/api/documents", undefined, tokenA);
    assert(listDocs.status === 200, `Status 200 (got ${listDocs.status})`);
    assert(
        Array.isArray(listDocs.data?.data) && listDocs.data.data.length >= 1,
        `At least 1 document returned`
    );

    // ── 9. Get document by ID ───────────────────────────────
    console.log("\n📝 Test 9: Get document by ID");
    const getDoc = await api("GET", `/api/documents/${docId}`, undefined, tokenA);
    assert(getDoc.status === 200, `Status 200 (got ${getDoc.status})`);
    assert(getDoc.data?.data?.title === "Test Document", `Title matches`);

    // ── 10. Share document with User B (read) ───────────────
    console.log("\n📝 Test 10: Share document with User B (read permission)");
    const share = await api(
        "POST",
        `/api/documents/${docId}/share`,
        { email: userB.email, permission: "read" },
        tokenA
    );
    assert(share.status === 200, `Status 200 (got ${share.status})`);

    // ── 11. /authorize for owner (User A = read-write) ──────
    console.log("\n📝 Test 11: /authorize for owner (User A → read-write)");
    const authOwner = await api(
        "GET",
        `/api/documents/${docId}/authorize`,
        undefined,
        tokenA
    );
    assert(authOwner.status === 200, `Status 200 (got ${authOwner.status})`);
    assert(authOwner.data?.authorized === true, `authorized = true`);
    assert(authOwner.data?.permission === "read-write", `permission = read-write`);

    // ── 12. /authorize for shared user (User B = read) ──────
    console.log("\n📝 Test 12: /authorize for shared user (User B → read)");
    const authShared = await api(
        "GET",
        `/api/documents/${docId}/authorize`,
        undefined,
        tokenB
    );
    assert(authShared.status === 200, `Status 200 (got ${authShared.status})`);
    assert(authShared.data?.authorized === true, `authorized = true`);
    assert(authShared.data?.permission === "read", `permission = read`);

    // ── 13. /authorize for unshared user (User C = denied) ──
    console.log("\n📝 Test 13: /authorize for unauthorized user (User C → denied)");
    const authDenied = await api(
        "GET",
        `/api/documents/${docId}/authorize`,
        undefined,
        tokenC
    );
    assert(authDenied.status === 200, `Status 200 (got ${authDenied.status})`);
    assert(authDenied.data?.authorized === false, `authorized = false`);

    // ── 14. Revoke permission from User B ────────────────────
    console.log("\n📝 Test 14: Revoke permission from User B");
    // Get User B's ID first
    const meB = await api("GET", "/api/auth/me", undefined, tokenB);
    const userBId = meB.data?.data?.id;
    const revoke = await api(
        "DELETE",
        `/api/documents/${docId}/share/${userBId}`,
        undefined,
        tokenA
    );
    assert(revoke.status === 200, `Status 200 (got ${revoke.status})`);

    // ── 15. Delete document ─────────────────────────────────
    // First verify User B can no longer access after revocation
    console.log("\n📝 Test 15: Verify User B denied after revocation");
    const authRevoked = await api(
        "GET",
        `/api/documents/${docId}/authorize`,
        undefined,
        tokenB
    );
    assert(authRevoked.data?.authorized === false, `authorized = false after revocation`);

    // ── 16. Delete document (owner only) ────────────────────
    console.log("\n📝 Test 16: Delete document (User A — owner)");
    const del = await api("DELETE", `/api/documents/${docId}`, undefined, tokenA);
    assert(del.status === 200, `Status 200 (got ${del.status})`);

    // Verify it's gone
    const getDeleted = await api("GET", `/api/documents/${docId}`, undefined, tokenA);
    assert(getDeleted.status === 404, `Status 404 after deletion (got ${getDeleted.status})`);

    // ── Summary ─────────────────────────────────────────────
    console.log("\n" + "─".repeat(52));
    console.log(`\n🏁 Results: ${passCount} passed, ${failCount} failed\n`);
    process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error("❌ Fatal error running tests:", err);
    process.exit(1);
});
