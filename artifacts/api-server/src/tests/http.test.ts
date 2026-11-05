import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// This is the only persistence substitution: the real pg pool is pointed at a
// private schema. Routes, validation, sessions and quote transactions are real.
vi.mock("@workspace/db", async () => {
  const { testPool } = await import("./database");
  return { pool: testPool };
});
vi.hoisted(() => { process.env.LOG_LEVEL = "silent"; });

import { initialPolicy, names, type Quote, type Role } from "../lib/dealdesk";
import { cleanupDatabase, resetDatabase, setupDatabase, testPool } from "./database";
import { action, create, login, read, request, sentQuote, startServer, stopServer, switchRole } from "./http-client";
import { quoteInput } from "./fixtures";

type PublicResult = {
  quote: Quote;
  payment?: { reference: string; amount: number; label: string; accountName: string };
};
const roles: Role[] = ["Rep", "Sales Head", "Founder"];
const decisions = ["approve", "reject", "request_changes"] as const;

beforeAll(async () => {
  await setupDatabase();
  await startServer();
}, 20000);
beforeEach(async () => { await resetDatabase(initialPolicy); });
afterAll(async () => {
  try { await stopServer(); } finally { await cleanupDatabase(); }
}, 20000);

describe("HTTP login and origin authorization", () => {
  it.each([
    ["GET", "/policy"], ["PUT", "/policy"], ["GET", "/quotes"],
    ["POST", "/quotes"], ["GET", "/quotes/missing"], ["PUT", "/quotes/missing"],
    ["POST", "/quotes/missing/actions"], ["GET", "/dashboard"], ["GET", "/connect"],
    ["POST", "/session/role"],
  ])("%s %s requires a real session before processing input", async (method, path) => {
    expect((await request(method, path, method === "GET" ? undefined : {})).status).toBe(401);
  });

  it("rejects invalid credentials, forged/expired cookies and signed-out cookies", async () => {
    expect((await request("POST", "/session", { email: "demo@dealdesk.app", password: "wrong" })).status).toBe(401);
    expect((await request("GET", "/quotes", undefined, "dealdesk_demo=forged")).status).toBe(401);
    const cookie = await login();
    expect((await request("DELETE", "/session", undefined, cookie)).status).toBe(200);
    expect((await request("GET", "/quotes", undefined, cookie)).status).toBe(401);
    const expiredCookie = await login();
    await testPool.query("UPDATE dealdesk_sessions SET expires_at=now()-interval '1 day'");
    expect((await request("GET", "/quotes", undefined, expiredCookie)).status).toBe(401);
  });

  it("blocks cross-origin writes before changing sessions, quotes, policy or public acceptance", async () => {
    const cookie = await login();
    const q = await sentQuote(cookie);
    const evil = { Origin: "https://other.example.test" };
    for (const [method, path, body] of [
      ["POST", "/session", { email: "demo@dealdesk.app", password: "dealdesk2026" }],
      ["DELETE", "/session", undefined],
      ["POST", "/session/role", { role: "Founder" }],
      ["POST", "/quotes", quoteInput()],
      ["PUT", `/quotes/${q.id}`, { ...q, notes: "changed" }],
      ["POST", `/quotes/${q.id}/actions`, { action: "send" }],
      ["PUT", "/policy", initialPolicy],
      ["POST", `/public/quotes/${q.publicToken}/accept`, { name: "Demo Buyer" }],
    ] as const) {
      expect((await request(method, path, body, cookie, evil)).status).toBe(403);
    }
    expect(await read(cookie, q.id)).toEqual(q);
    const session = await request<{ role: Role }>("GET", "/session", undefined, cookie);
    expect(session.data.role).toBe("Rep");
    expect((await request("GET", "/policy", undefined, cookie)).data).toEqual(initialPolicy);
    const count = await testPool.query("SELECT count(*)::int AS n FROM dealdesk_quotes");
    expect(count.rows[0].n).toBe(1);
  });

  it("validates numeric bounds and action names without saving bad input", async () => {
    const cookie = await login();
    for (const body of [
      { ...quoteInput(), discountPercent: -1 },
      { ...quoteInput(), discountPercent: 101 },
      { ...quoteInput(), lineItems: [{ productName: "Growth plan seat", quantity: 0, unitPrice: 600 }] },
      { ...quoteInput(), lineItems: [{ productName: "Growth plan seat", quantity: 1, unitPrice: -1 }] },
    ]) {
      expect((await request("POST", "/quotes", body, cookie)).status).toBe(400);
    }
    const q = await create(cookie);
    expect((await action(cookie, q, "bypass")).status).toBe(400);
    expect(await read(cookie, q.id)).toEqual(q);
  });
});

describe("seniority-based decisions, not request claims", () => {
  for (const [discountPercent, requiredRole] of [[15, "Sales Head"], [21, "Founder"]] as const) {
    for (const decision of decisions) {
      it.each(roles)(`${decision} on a ${discountPercent}% quote is available to ${requiredRole} or more senior (session %s)`, async role => {
        const cookie = await login(role);
        const q = await create(cookie, { discountPercent });
        expect(q.requiredApprover).toBe(requiredRole);
        const response = await request("POST", `/quotes/${q.id}/actions`, {
          action: decision, version: q.version,
          // These claims must never override the cookie-backed session role.
          role: requiredRole, approvedBy: requiredRole,
        }, cookie, { "X-Role": requiredRole });
        const mayDecide = roles.indexOf(role) >= roles.indexOf(requiredRole);
        if (!mayDecide) {
          expect(response.status).toBe(403);
          expect(await read(cookie, q.id)).toEqual(q);
        } else {
          expect(response.status).toBe(200);
          expect(response.data.status).toBe({
            approve: "approved", reject: "rejected", request_changes: "changes_requested",
          }[decision]);
          expect(response.data.version).toBe(q.version + 1);
          expect(response.data.history).toHaveLength(q.history.length + 1);
          const decisionEvent = response.data.history.at(-1)!;
          expect(decisionEvent.actor).toBe(names[role]);
          expect(decisionEvent.message).toContain(`by ${names[role]} (${role})`);
          if (role !== requiredRole) expect(decisionEvent.message).toContain(`— ${requiredRole} band`);
          if (decision === "approve") {
            expect(response.data.approvedDiscountPercent).toBe(discountPercent);
            expect(response.data.approvedAt).not.toBeNull();
          } else {
            expect(response.data.approvedAt).toBeNull();
          }
        }
      });
    }
  }

  it("lets the Founder approve after editing a Founder-band quote into the Sales Head band", async () => {
    const cookie = await login("Founder");
    const q = await create(cookie, { discountPercent: 25 });
    expect(q.status).toBe("pending_approval");
    expect(q.requiredApprover).toBe("Founder");

    const edited = await request("PUT", `/quotes/${q.id}`, { ...q, discountPercent: 18 }, cookie);
    expect(edited.status).toBe(200);
    expect(edited.data.status).toBe("pending_approval");
    expect(edited.data.requiredApprover).toBe("Sales Head");

    const approved = await action(cookie, edited.data, "approve");
    expect(approved.status).toBe(200);
    expect(approved.data.status).toBe("approved");
    expect(approved.data.history.at(-1)?.message).toContain("Approved by Rohan Kapoor (Founder) — Sales Head band");
  });

  it("requires Founder for a single floor breach even when the aggregate is profitable", async () => {
    const cookie = await login("Sales Head");
    const q = await create(cookie, {
      discountPercent: 10,
      lineItems: [
        { productName: "Growth plan seat", quantity: 1, unitPrice: 499.99 },
        { productName: "Onboarding package", quantity: 10, unitPrice: 50000 },
      ],
    });
    expect(q.total).toBeGreaterThan(q.floorTotal);
    expect(q.requiredApprover).toBe("Founder");
    expect((await action(cookie, q, "approve")).status).toBe(403);
    await switchRole(cookie, "Founder");
    expect((await action(cookie, q, "approve")).data.status).toBe("approved");
  });

  it("cannot send pending/rejected quotes or turn a rejected quote into an approval", async () => {
    const cookie = await login("Sales Head");
    const q = await create(cookie, { discountPercent: 15 });
    expect((await action(cookie, q, "send")).status).toBe(409);
    const rejected = await action(cookie, q, "reject");
    expect(rejected.status).toBe(200);
    expect((await action(cookie, rejected.data, "send")).status).toBe(409);
    expect((await action(cookie, rejected.data, "approve")).status).toBe(409);
    expect(await read(cookie, q.id)).toEqual(rejected.data);
  });
});

describe("Founder-only policy updates", () => {
  it.each(["Rep", "Sales Head"] as const)("rejects policy changes from %s", async role => {
    const cookie = await login(role);
    const changed = structuredClone(initialPolicy);
    changed.bands[0]!.maxDiscount = 5;

    const response = await request<{ error: string }>("PUT", "/policy", changed, cookie);
    expect(response.status).toBe(403);
    expect(response.data.error).toBe("Only the Founder can change discount rules.");
    expect((await request("GET", "/policy", undefined, cookie)).data).toEqual(initialPolicy);
  });

  it("allows the Founder to update policy", async () => {
    const cookie = await login("Founder");
    const changed = structuredClone(initialPolicy);
    changed.bands[0]!.maxDiscount = 5;
    const response = await request("PUT", "/policy", changed, cookie);
    expect(response.status).toBe(200);
    expect(response.data).toEqual(changed);
  });
});

describe("reapproval and stale-version write protection", () => {
  it.each(["explicit", "custom price", "floor breach"] as const)("resets approved pricing after an increased %s discount", async change => {
    const cookie = await login("Sales Head");
    const pending = await create(cookie, { discountPercent: 15 });
    const approvedResponse = await action(cookie, pending, "approve");
    expect(approvedResponse.status).toBe(200);
    const approved = approvedResponse.data;
    const update = change === "explicit"
      ? { discountPercent: 16 }
      : { lineItems: [{ productName: "Growth plan seat", quantity: 10, unitPrice: change === "floor breach" ? 529.4 : 590 }] };
    const response = await request("PUT", `/quotes/${approved.id}`, { ...approved, ...update }, cookie);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("pending_approval");
    expect(response.data.requiredApprover).toBe(change === "floor breach" ? "Founder" : "Sales Head");
    expect(response.data.approvedAt).toBeNull();
    expect(response.data.approvedDiscountPercent).toBeNull();
    expect(response.data.history.some(h => h.message.includes("Approval reset"))).toBe(true);
    expect((await action(cookie, response.data, "send")).status).toBe(409);
    if (change === "floor breach") await switchRole(cookie, "Founder");
    const reapproved = await action(cookie, response.data, "approve");
    expect(reapproved.status).toBe(200);
    expect(reapproved.data.approvedDiscountPercent).toBe(response.data.effectiveDiscountPercent);
  });

  it("keeps approval for a note-only edit without increasing the discount", async () => {
    const cookie = await login("Sales Head");
    const q = await create(cookie, { discountPercent: 15 });
    const approved = (await action(cookie, q, "approve")).data;
    const response = await request("PUT", `/quotes/${q.id}`, { ...approved, notes: "Updated fictional note" }, cookie);
    expect(response.status).toBe(200);
    expect(response.data.status).toBe("approved");
    expect(response.data.approvedAt).toBe(approved.approvedAt);
    expect(response.data.approvedDiscountPercent).toBe(15);
  });

  it("returns 409 and rolls back stale edits and decisions without changing history or links", async () => {
    const cookie = await login("Sales Head");
    const original = await create(cookie, { discountPercent: 15 });
    const changedResponse = await request("PUT", `/quotes/${original.id}`, { ...original, notes: "Another session saved" }, cookie);
    expect(changedResponse.status).toBe(200);
    const changed = changedResponse.data;
    expect(changed.version).toBeGreaterThan(original.version);
    expect((await request("PUT", `/quotes/${original.id}`, { ...original, discountPercent: 5 }, cookie)).status).toBe(409);
    for (const decision of decisions) {
      expect((await action(cookie, changed, decision, original.version)).status).toBe(409);
    }
    expect(await read(cookie, original.id)).toEqual(changed);
    const approved = await action(cookie, changed, "approve");
    expect(approved.status).toBe(200);
    expect((await action(cookie, approved.data, "send", changed.version)).status).toBe(409);
    expect(await read(cookie, original.id)).toEqual(approved.data);
  });

  it("serializes competing decisions so exactly one write with the current version succeeds", async () => {
    const cookie = await login("Sales Head");
    const q = await create(cookie, { discountPercent: 15 });
    const responses = await Promise.all([action(cookie, q, "approve"), action(cookie, q, "reject")]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = responses.find(r => r.status === 200)!;
    expect(await read(cookie, q.id)).toEqual(winner.data);
    expect(winner.data.history).toHaveLength(q.history.length + 1);
  });

  it("submits drafts and requested changes through the current policy", async () => {
    const cookie = await login("Sales Head");
    const draft = await create(cookie, { discountPercent: 15, saveAsDraft: true });
    expect(draft.status).toBe("draft");
    expect((await action(cookie, draft, "approve")).status).toBe(409);
    const submitted = await action(cookie, draft, "submit");
    expect(submitted.status).toBe(200);
    expect(submitted.data.status).toBe("pending_approval");
    const changes = await action(cookie, submitted.data, "request_changes");
    expect(changes.status).toBe(200);
    expect((await action(cookie, changes.data, "submit")).data.status).toBe("pending_approval");
  });
});

describe("client links, immutable acceptance and simulated payments", () => {
  it("revokes both read and accept access to the old sent link after editing, until a new send", async () => {
    const cookie = await login();
    const sent = await sentQuote(cookie);
    const publicBefore = await request<PublicResult>("GET", `/public/quotes/${sent.publicToken}`);
    expect(publicBefore.status).toBe(200);
    expect(publicBefore.data.payment).toBeUndefined();
    const edited = await request("PUT", `/quotes/${sent.id}`, { ...sent, notes: "Updated offer" }, cookie);
    expect(edited.status).toBe(200);
    expect(edited.data.status).toBe("approved");
    expect(edited.data.publicToken).not.toBe(sent.publicToken);
    for (const token of [sent.publicToken, edited.data.publicToken]) {
      expect((await request("GET", `/public/quotes/${token}`)).status).toBe(404);
      expect((await request("POST", `/public/quotes/${token}/accept`, { name: "Demo Buyer" })).status).toBe(404);
    }
    const resent = await action(cookie, edited.data, "send");
    expect(resent.status).toBe(200);
    expect((await request("GET", `/public/quotes/${resent.data.publicToken}`)).status).toBe(200);
    expect((await request("GET", `/public/quotes/${sent.publicToken}`)).status).toBe(404);
  });

  it("resets unaccepted approvals and revokes sent links after a policy change", async () => {
    const cookie = await login("Founder");
    const sent = await sentQuote(cookie);
    const approved = await create(cookie, { discountPercent: 10 });
    const policy = structuredClone(initialPolicy);
    policy.bands[0]!.maxDiscount = 5;
    expect((await request("PUT", "/policy", policy, cookie)).status).toBe(200);
    for (const old of [sent, approved]) {
      const q = await read(cookie, old.id);
      expect(q.status).toBe("pending_approval");
      expect(q.requiredApprover).toBe("Sales Head");
      expect(q.approvedAt).toBeNull();
      expect(q.approvedDiscountPercent).toBeNull();
      expect(q.version).toBeGreaterThan(old.version);
    }
    expect((await request("GET", `/public/quotes/${sent.publicToken}`)).status).toBe(404);
    expect((await request("POST", `/public/quotes/${sent.publicToken}/accept`, { name: "Demo Buyer" })).status).toBe(404);
  });

  it("accepts without login and is idempotent even across concurrent retries with different names", async () => {
    const cookie = await login();
    const sent = await sentQuote(cookie);
    const path = `/public/quotes/${sent.publicToken}`;
    const first = await request<PublicResult>("POST", `${path}/accept`, { name: "  Demo Buyer  " });
    expect(first.status).toBe(200);
    expect(first.data.quote.status).toBe("accepted");
    expect(first.data.quote.acceptedBy).toBe("Demo Buyer");
    expect(first.data.quote.version).toBe(sent.version + 1);
    expect(first.data.quote.history).toHaveLength(sent.history.length + 1);
    expect(first.data.payment).toMatchObject({
      reference: `SIM-VP-${sent.number}`, amount: sent.total,
      accountName: expect.stringContaining("Simulated"), label: "Simulated — Volopay integration",
    });
    expect(first.data.quote.history.at(-1)?.message).toContain("no real funds requested");
    const retries = await Promise.all(["Different Buyer", "Demo Buyer", "Third Buyer"].map(name =>
      request<PublicResult>("POST", `${path}/accept`, { name })));
    for (const retry of retries) {
      expect(retry.status).toBe(200);
      expect(retry.data).toEqual(first.data);
    }
    expect((await request<PublicResult>("GET", path)).data).toEqual(first.data);
    expect(await read(cookie, sent.id)).toEqual(first.data.quote);
  });

  it("serializes simultaneous first acceptances into one acceptance event and payment reference", async () => {
    const cookie = await login();
    const sent = await sentQuote(cookie);
    const responses = await Promise.all(["First Buyer", "Second Buyer"].map(name =>
      request<PublicResult>("POST", `/public/quotes/${sent.publicToken}/accept`, { name })));
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(responses[0]!.data).toEqual(responses[1]!.data);
    expect(responses[0]!.data.quote.version).toBe(sent.version + 1);
    expect(responses[0]!.data.quote.history).toHaveLength(sent.history.length + 1);
  });

  it("locks accepted quotes against edits, every action and policy re-evaluation", async () => {
    const cookie = await login("Founder");
    const sent = await sentQuote(cookie);
    const accepted = await request<PublicResult>("POST", `/public/quotes/${sent.publicToken}/accept`, { name: "Demo Buyer" });
    expect(accepted.status).toBe(200);
    const q = accepted.data.quote;
    expect((await request("PUT", `/quotes/${q.id}`, { ...q, discountPercent: 99 }, cookie)).status).toBe(409);
    for (const actionName of ["submit", "approve", "reject", "request_changes", "send"]) {
      expect((await action(cookie, q, actionName)).status).toBe(409);
    }
    const policy = structuredClone(initialPolicy);
    policy.bands[0]!.maxDiscount = 5;
    expect((await request("PUT", "/policy", policy, cookie)).status).toBe(200);
    expect(await read(cookie, q.id)).toEqual(q);
    expect((await request<PublicResult>("GET", `/public/quotes/${q.publicToken}`)).data).toEqual(accepted.data);
  });

  it("rejects invalid names, unknown tokens and expired sent quotes without accepting them", async () => {
    const cookie = await login();
    const sent = await sentQuote(cookie);
    const path = `/public/quotes/${sent.publicToken}/accept`;
    for (const name of ["", " ", "A"]) {
      expect((await request("POST", path, { name })).status).toBe(400);
    }
    expect((await request("POST", "/public/quotes/unknown/accept", { name: "Demo Buyer" })).status).toBe(404);
    expect(await read(cookie, sent.id)).toEqual(sent);
    // Simulate expiry after sending, without changing application clocks/timers.
    await testPool.query("UPDATE dealdesk_quotes SET data=jsonb_set(data, '{validityDate}', '\"2000-01-01\"') WHERE id=$1", [sent.id]);
    const expired = await read(cookie, sent.id);
    expect((await request("POST", path, { name: "Demo Buyer" })).status).toBe(409);
    expect(await read(cookie, sent.id)).toEqual(expired);
  });
});
