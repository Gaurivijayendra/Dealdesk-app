import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { CreateQuoteBody, UpdatePolicyBody } from "@workspace/api-zod";
import { z } from "zod";

export type Policy = z.infer<typeof UpdatePolicyBody>;
export type QuoteInput = z.infer<typeof CreateQuoteBody>;
export type Role = "Rep" | "Sales Head" | "Founder";
const roleSeniority: Record<Role, number> = { Rep: 0, "Sales Head": 1, Founder: 2 };
export type Event = { at: string; actor: string; message: string };
export type Quote = Omit<QuoteInput, "validityDate"> & {
  validityDate: string; id: string; number: string; status: string; source: "claude" | "manual";
  requiredApprover: Role; subtotal: number; listTotal: number; discountAmount: number;
  total: number; floorTotal: number; effectiveDiscountPercent: number; originalDiscountPercent: number;
  approvedDiscountPercent: number | null; approvedAt: string | null; belowFloor: boolean;
  ruleDescription: string; createdAt: string; updatedAt: string; history: Event[];
  publicToken: string; version: number; acceptedBy: string | null;
};
export const names: Record<Role, string> = { Rep: "Aarav Mehta", "Sales Head": "Meera Iyer", Founder: "Rohan Kapoor" };
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const iso = () => new Date().toISOString();
export function dateOnly(value: string | Date) {
  const d = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw new AppError(400, "Enter a valid validity date.");
  return d;
}
export const initialPolicy: Policy = {
  products: [
    { name: "Growth plan seat", unit: "seat / month", listPrice: 600, floorPrice: 450 },
    { name: "Onboarding package", unit: "one-time", listPrice: 50000, floorPrice: 35000 },
    { name: "Priority support", unit: "month", listPrice: 15000, floorPrice: 10000 },
  ],
  bands: [{ maxDiscount: 10, approver: "Rep" }, { maxDiscount: 20, approver: "Sales Head" }, { maxDiscount: 100, approver: "Founder" }],
};
export function calculate(input: QuoteInput | Quote, policy: Policy) {
  let subtotal = 0, listTotal = 0, floorTotal = 0, belowFloor = false;
  for (const item of input.lineItems) {
    const p = policy.products.find(p => p.name === item.productName);
    if (!p) throw new AppError(400, `Unknown product: ${item.productName}. Use the pricing catalog.`);
    const periods = /annual/i.test(input.billingTerms) && p.unit !== "one-time" ? 12 : 1;
    subtotal += round(item.unitPrice * item.quantity * periods);
    listTotal += round(p.listPrice * item.quantity * periods);
    floorTotal += round(p.floorPrice * item.quantity * periods);
    if (round(item.unitPrice * (1 - input.discountPercent / 100)) < p.floorPrice) belowFloor = true;
  }
  subtotal = round(subtotal); listTotal = round(listTotal); floorTotal = round(floorTotal);
  const discountAmount = round(subtotal * input.discountPercent / 100);
  const total = round(subtotal - discountAmount);
  const effectiveDiscountPercent = round(Math.max(0, (1 - total / listTotal) * 100));
  // Apply policy to the effective catalog discount too: lowering unit prices cannot bypass approval.
  const policyDiscount = Math.max(input.discountPercent, effectiveDiscountPercent);
  const band = policy.bands.find(b => policyDiscount <= b.maxDiscount) ?? policy.bands[policy.bands.length - 1]!;
  const requiredApprover: Role = belowFloor ? "Founder" : band.approver as Role;
  const ruleDescription = belowFloor ? "Below-floor pricing always requires Founder approval." :
    requiredApprover === "Rep" ? `Within the ${band.maxDiscount}% rep band. Auto-approved.` :
    `${round(policyDiscount)}% effective discount requires ${requiredApprover} approval.`;
  return { subtotal, listTotal, discountAmount, total, floorTotal, effectiveDiscountPercent, belowFloor, requiredApprover, ruleDescription };
}
type Client = PoolClient;
export async function transaction<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(482091)");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
export async function getPolicy(c: Pick<Client, "query"> = pool): Promise<Policy> {
  const r = await c.query("SELECT data FROM dealdesk_policy WHERE id='default'");
  if (!r.rows[0]) throw new AppError(503, "Pricing policy is not initialized.");
  return r.rows[0].data;
}
export async function listQuotes(status?: string, rep?: string): Promise<Quote[]> {
  const r = await pool.query("SELECT data FROM dealdesk_quotes WHERE ($1::text IS NULL OR data->>'status'=$1) AND ($2::text IS NULL OR data->>'repName'=$2) ORDER BY data->>'createdAt' DESC", [status || null, rep || null]);
  return r.rows.map(row => row.data);
}
export async function getQuote(id: string, c: Pick<Client, "query"> = pool): Promise<Quote> {
  const r = await c.query("SELECT data FROM dealdesk_quotes WHERE id=$1", [id]);
  if (!r.rows[0]) throw new AppError(404, "Quote not found.");
  return r.rows[0].data;
}
export async function persist(c: Client, q: Quote) {
  await c.query("INSERT INTO dealdesk_quotes(id,data) VALUES ($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data", [q.id, JSON.stringify(q)]);
  return q;
}
export function event(q: Quote, actor: string, message: string) {
  q.history.push({ at: iso(), actor, message }); q.updatedAt = iso(); q.version++;
}
export function buildQuote(input: QuoteInput, policy: Policy, source: "claude" | "manual", number: number): Quote {
  const computed = calculate(input, policy), now = iso();
  const status = input.saveAsDraft ? "draft" : computed.requiredApprover === "Rep" ? "approved" : "pending_approval";
  const q: Quote = {
    ...input, validityDate: dateOnly(input.validityDate), ...computed, id: randomUUID(),
    number: `QT-${String(number).padStart(4, "0")}`, status, source,
    originalDiscountPercent: computed.effectiveDiscountPercent,
    approvedDiscountPercent: status === "approved" ? computed.effectiveDiscountPercent : null,
    approvedAt: status === "approved" ? now : null, createdAt: now, updatedAt: now,
    history: [{ at: now, actor: source === "claude" ? `Claude via MCP (${input.repName})` : input.repName, message: source === "claude" ? "Quote created via Claude MCP." : "Quote created manually." }],
    publicToken: randomUUID(), version: 1, acceptedBy: null,
  };
  if (status === "approved") event(q, "Policy engine", "Auto-approved within rep discount band.");
  else if (status === "pending_approval") event(q, "Policy engine", `Routed to ${q.requiredApprover}. ${q.ruleDescription}`);
  return q;
}
export async function createQuote(input: QuoteInput, source: "claude" | "manual") {
  return transaction(async c => {
    const n = await c.query("SELECT count(*)::int AS n FROM dealdesk_quotes");
    return persist(c, buildQuote(input, await getPolicy(c), source, n.rows[0].n + 1001));
  });
}
function checkVersion(q: Quote, version?: number) {
  if (version !== undefined && version !== q.version) throw new AppError(409, "This quote changed in another session. Reload before saving.");
}
export async function updateQuote(id: string, input: QuoteInput, actor: string) {
  return transaction(async c => {
    const old = await getQuote(id, c); checkVersion(old, input.version);
    if (old.status === "accepted") throw new AppError(409, "Accepted quotes are locked.");
    const computed = calculate(input, await getPolicy(c));
    const q: Quote = { ...old, ...input, validityDate: dateOnly(input.validityDate), ...computed, version: old.version, history: [...old.history] };
    const fields = ["clientCompany", "contactName", "contactEmail", "repName", "lineItems", "discountPercent", "discountReason", "counterOffer", "billingTerms", "validityDate", "notes"] as const;
    for (const field of fields) {
      if (JSON.stringify(old[field] ?? "") !== JSON.stringify(q[field] ?? "")) {
        const title = field.replace(/([A-Z])/g, " $1").replace(/^./, x => x.toUpperCase());
        const val = (v: unknown) => field === "lineItems" ? JSON.stringify(v) : `${v ?? "(empty)"}${field === "discountPercent" ? "%" : ""}`;
        event(q, actor, `${title} changed ${val(old[field])} → ${val(q[field])}`);
      }
    }
    const previouslyApproved = ["approved", "sent"].includes(old.status);
    const increased = q.discountPercent > old.discountPercent || q.effectiveDiscountPercent > (old.approvedDiscountPercent ?? old.effectiveDiscountPercent) || (!old.belowFloor && q.belowFloor);
    if (old.status === "draft" && input.saveAsDraft !== false) q.status = "draft";
    else if (previouslyApproved && !increased && q.requiredApprover === old.requiredApprover) {
      q.status = "approved";
      q.approvedDiscountPercent = q.effectiveDiscountPercent;
    } else {
      q.status = computed.requiredApprover === "Rep" ? "approved" : "pending_approval";
      q.approvedAt = q.status === "approved" ? iso() : null;
      q.approvedDiscountPercent = q.status === "approved" ? q.effectiveDiscountPercent : null;
      event(q, "Policy engine", increased && previouslyApproved ? `Approval reset after increased discount. ${q.ruleDescription}` : `Policy re-evaluated. ${q.ruleDescription}`);
    }
    if (old.status === "sent") { q.publicToken = randomUUID(); event(q, actor, "Previous client link revoked after editing. Send the updated quote again."); }
    q.originalDiscountPercent = Math.max(old.originalDiscountPercent, q.effectiveDiscountPercent);
    return persist(c, q);
  });
}
export async function actionQuote(id: string, action: string, role: Role, comment = "", version?: number) {
  return transaction(async c => {
    const q = await getQuote(id, c); checkVersion(q, version);
    if (q.status === "accepted") throw new AppError(409, "Accepted quotes are locked.");
    if (action === "submit") {
      if (!["draft", "changes_requested"].includes(q.status)) throw new AppError(409, "Only drafts or changes-requested quotes can be submitted.");
      Object.assign(q, calculate(q, await getPolicy(c)));
      q.status = q.requiredApprover === "Rep" ? "approved" : "pending_approval";
      if (q.status === "approved") { q.approvedAt = iso(); q.approvedDiscountPercent = q.effectiveDiscountPercent; }
    } else if (action === "send") {
      if (q.status !== "approved") throw new AppError(409, "Only an approved quote can be sent.");
      if (q.validityDate < iso().slice(0, 10)) throw new AppError(409, "Update the expired validity date before sending.");
      q.status = "sent";
    } else {
      if (q.status !== "pending_approval") throw new AppError(409, "This quote is not waiting for approval.");
      if (roleSeniority[role] < roleSeniority[q.requiredApprover]) {
        const eligible = q.requiredApprover === "Founder" ? "Only the Founder can decide this quote." : "Only the Sales Head or Founder can decide this quote.";
        throw new AppError(403, eligible);
      }
      if (!["approve", "reject", "request_changes"].includes(action)) throw new AppError(400, "Unknown action.");
      q.status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
      if (action === "approve") { q.approvedAt = iso(); q.approvedDiscountPercent = q.effectiveDiscountPercent; }
    }
    const labels: Record<string, string> = { submit: "Quote submitted for policy review", send: "Quote sent: client acceptance link created (copy and share manually; no email sent)", approve: "Quote approved", reject: "Quote rejected", request_changes: "Changes requested" };
    const message = ["approve", "reject", "request_changes"].includes(action)
      ? `${action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Changes requested"} by ${names[role]} (${role})${role === q.requiredApprover ? "" : ` — ${q.requiredApprover} band`}.${comment ? ` ${comment}` : ""}`
      : `${labels[action]}.${comment ? ` ${comment}` : ""}`;
    event(q, names[role], message);
    return persist(c, q);
  });
}
export function validatePolicy(policy: Policy) {
  if (policy.bands.length !== 3 || policy.products.length !== 3) throw new AppError(400, "Maintain three discount bands and three catalog products.");
  let previous = -1;
  for (const band of policy.bands) {
    if (!Number.isFinite(band.maxDiscount) || band.maxDiscount <= previous || band.maxDiscount > 100 || band.maxDiscount < 0) throw new AppError(400, "Band limits must increase and end at 100%.");
    previous = band.maxDiscount;
  }
  if (previous !== 100) throw new AppError(400, "The final band must cover 100%.");
  for (const product of policy.products) {
    const seed = initialPolicy.products.find(p => p.name === product.name);
    if (!seed || product.unit !== seed.unit || !Number.isFinite(product.floorPrice) || !Number.isFinite(product.listPrice) || product.floorPrice < 0 || product.listPrice <= 0 || product.floorPrice > product.listPrice) throw new AppError(400, "Use the existing catalog names/units and floor prices between zero and list price.");
  }
  if (new Set(policy.products.map(p => p.name)).size !== 3) throw new AppError(400, "Product names must be unique.");
}
export async function savePolicy(policy: Policy, actor: string) {
  validatePolicy(policy);
  return transaction(async c => {
    const before = await getPolicy(c);
    await c.query("UPDATE dealdesk_policy SET data=$1::jsonb WHERE id='default'", [JSON.stringify(policy)]);
    if (JSON.stringify(before) !== JSON.stringify(policy)) {
      const rows = await c.query("SELECT data FROM dealdesk_quotes");
      for (const row of rows.rows) {
        const q = row.data as Quote;
        if (q.status === "accepted") continue;
        Object.assign(q, calculate(q, policy));
        if (["approved", "sent", "pending_approval"].includes(q.status)) {
          if (q.status === "sent") q.publicToken = randomUUID();
          q.status = q.requiredApprover === "Rep" ? "approved" : "pending_approval";
          q.approvedAt = q.status === "approved" ? iso() : null;
          q.approvedDiscountPercent = q.status === "approved" ? q.effectiveDiscountPercent : null;
        }
        event(q, actor, "Pricing policy updated; quote re-evaluated and previous approval/client link revoked where applicable.");
        await persist(c, q);
      }
    }
    return policy;
  });
}
export function paymentFor(q: Quote) {
  return { reference: `SIM-VP-${q.number}`, amount: q.total, accountName: "Northwind Analytics · Simulated", accountNumber: "0000 1234 5678", ifsc: "SIMU0000001", label: "Simulated — Volopay integration" };
}
export async function publicQuote(token: string) {
  const r = await pool.query("SELECT data FROM dealdesk_quotes WHERE data->>'publicToken'=$1 AND data->>'status' IN ('sent','accepted')", [token]);
  if (!r.rows[0]) throw new AppError(404, "This client link is unavailable or has been revoked.");
  const q: Quote = r.rows[0].data;
  return { quote: q, ...(q.status === "accepted" ? { payment: paymentFor(q) } : {}) };
}
export async function acceptQuote(token: string, name: string) {
  return transaction(async c => {
    const r = await c.query("SELECT data FROM dealdesk_quotes WHERE data->>'publicToken'=$1", [token]);
    const q = r.rows[0]?.data as Quote | undefined;
    if (!q || !["sent", "accepted"].includes(q.status)) throw new AppError(404, "This client link is unavailable.");
    if (q.status === "accepted") return { quote: q, payment: paymentFor(q) };
    if (q.validityDate < iso().slice(0, 10)) throw new AppError(409, "This quote has expired. Ask your rep for an updated quote.");
    q.status = "accepted"; q.acceptedBy = name.trim();
    event(q, name.trim(), "Client accepted quote. Simulated Volopay payment request created; no real funds requested.");
    await persist(c, q);
    return { quote: q, payment: paymentFor(q) };
  });
}
export async function dashboard() {
  const all = await listQuotes(), now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  const quotes = all.filter(q => new Date(q.createdAt) >= start);
  const won = quotes.filter(q => ["approved", "sent", "accepted"].includes(q.status));
  const protectedAmount = (q: Quote) => q.approvedDiscountPercent === null ? 0 : round(Math.max(0, q.originalDiscountPercent - q.approvedDiscountPercent) / 100 * q.listTotal);
  const times = won.filter(q => q.approvedAt).map(q => Math.max(0, (Date.parse(q.approvedAt!) - Date.parse(q.createdAt)) / 3600000)).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2), median = times.length ? times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2 : 0;
  const policy = await getPolicy(), repBand = policy.bands.find(b => b.approver === "Rep")?.maxDiscount ?? 0;
  return {
    quarter: `Q${Math.floor(now.getUTCMonth() / 3) + 1} ${now.getUTCFullYear()}`,
    discountGiven: round(won.reduce((n, q) => n + Math.max(0, q.listTotal - q.total), 0)),
    averageDiscount: round(quotes.length ? quotes.reduce((n, q) => n + q.effectiveDiscountPercent, 0) / quotes.length : 0),
    abovePolicyRequests: quotes.filter(q => q.originalDiscountPercent > repBand || q.belowFloor).length,
    marginProtected: round(won.reduce((n, q) => n + protectedAmount(q), 0)),
    medianApprovalHours: round(median), totalQuotes: quotes.length,
    pendingCount: quotes.filter(q => q.status === "pending_approval").length,
    pipelineValue: round(quotes.filter(q => !["rejected", "accepted"].includes(q.status)).reduce((n, q) => n + q.total, 0)),
    byRep: [...new Set(quotes.map(q => q.repName))].map(rep => {
      const qs = quotes.filter(q => q.repName === rep), final = qs.filter(q => won.includes(q));
      return { rep, quoteCount: qs.length, discountPercent: round(qs.reduce((n, q) => n + q.effectiveDiscountPercent, 0) / qs.length), discountGiven: round(final.reduce((n, q) => n + Math.max(0, q.listTotal - q.total), 0)), marginProtected: round(final.reduce((n, q) => n + protectedAmount(q), 0)) };
    }),
    recentActivity: quotes.flatMap(q => q.history.map(h => ({ ...h, message: `${q.number} · ${h.message}` }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
  };
}
