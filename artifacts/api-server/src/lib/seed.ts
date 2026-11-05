import { buildQuote, event, getPolicy, initialPolicy, persist, transaction, type QuoteInput } from "./dealdesk";

/** DML only. Schema is managed by Drizzle in development and Replit Publish. */
export async function seedDemo() {
  await transaction(async c => {
    await c.query("INSERT INTO dealdesk_policy(id,data) VALUES ('default',$1::jsonb) ON CONFLICT(id) DO NOTHING", [JSON.stringify(initialPolicy)]);
    const exists = await c.query("SELECT id FROM dealdesk_quotes LIMIT 1");
    if (exists.rows.length) return;
    const policy = await getPolicy(c);
    const examples = [
      { company: "Acme Logistics", contact: "Priya Sharma", discount: 25, qty: 40, status: "pending_approval", reason: "Competitor offered ₹450 per seat. Client will commit to annual prepaid for 40 seats if we match.", counter: "Offer 18% with annual prepaid and a 12-month commitment; preserve the ₹450 floor.", annual: true },
      { company: "Meridian Finserv", contact: "Vikram Rao", discount: 15, qty: 75, status: "pending_approval", reason: "Consolidating three reporting tools. Procurement requests a 15% volume discount for a 75-seat rollout.", counter: "Keep 15% conditional on 75 committed seats.", annual: false },
      { company: "Kaveri Retail", contact: "Ananya Shah", discount: 8, qty: 30, status: "approved", reason: "Pilot conversion to a 30-seat team. Standard launch incentive within rep policy.", counter: "8% for monthly billing; expand to 50 seats at renewal.", annual: false },
      { company: "Orbit Healthtech", contact: "Siddharth Jain", discount: 18, qty: 55, status: "sent", reason: "Annual commitment after a successful pilot. Original request was 25%; negotiated to 18%.", counter: "18% annual prepaid instead of 25%, with onboarding at list price.", annual: true },
      { company: "Sahyadri Manufacturing", contact: "Neha Desai", discount: 12, qty: 100, status: "accepted", reason: "Two-plant rollout. Original 22% request reduced to 12% in exchange for annual prepayment.", counter: "12% with a 12-month minimum commitment.", annual: true },
      { company: "Blueleaf Commerce", contact: "Karan Sethi", discount: 22, qty: 25, status: "changes_requested", reason: "Early-stage team wants a 22% introductory discount, with no annual commitment.", counter: "Counter at 10% monthly or 18% annual prepaid.", annual: false },
      { company: "Deccan Mobility", contact: "Ishita Nair", discount: 30, qty: 60, status: "rejected", reason: "Client requests 30% off for a non-binding expansion promise. Net seat price would be below floor.", counter: "Offer 15% on a committed minimum of 60 seats.", annual: false },
      { company: "Tamarind Ventures", contact: "Arjun Menon", discount: 5, qty: 15, status: "draft", reason: "Discovery in progress. Pricing for the initial analytics team; budget not yet confirmed.", counter: "", annual: false },
    ];
    const now = new Date();
    const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).getTime();
    for (const [i, s] of examples.entries()) {
      const input = {
        clientCompany: s.company, contactName: s.contact,
        contactEmail: `${s.contact.toLowerCase().replaceAll(" ", ".")}@${s.company.toLowerCase().replaceAll(" ", "")}.example`,
        repName: "Aarav Mehta",
        lineItems: [{ productName: "Growth plan seat", quantity: s.qty, unitPrice: 600 }, ...(i % 2 === 0 ? [{ productName: "Onboarding package", quantity: 1, unitPrice: 50000 }] : []), ...(i === 4 ? [{ productName: "Priority support", quantity: 1, unitPrice: 15000 }] : [])],
        discountPercent: s.discount, discountReason: s.reason, counterOffer: s.counter,
        billingTerms: s.annual ? "Annual prepaid" : "Monthly",
        validityDate: new Date(Date.now() + (21 + i) * 86400000).toISOString().slice(0, 10),
        notes: "Simulated demo data — fictional client and quote. Recurring products billed ×12 for annual prepaid. Prices exclude taxes.",
      } as unknown as QuoteInput;
      const q = buildQuote(input, policy, i % 3 === 2 ? "manual" : "claude", 1001 + i);
      q.createdAt = new Date(Math.max(quarterStart, Date.now() - (10 - i) * 86400000)).toISOString();
      q.history = [{ at: q.createdAt, actor: q.source === "claude" ? "Simulated Claude via MCP" : "Aarav Mehta", message: "Simulated demo quote created. Fictional scenario, not an actual Claude call." }];
      q.status = s.status;
      if (["approved", "sent", "accepted"].includes(s.status)) {
        q.originalDiscountPercent = i === 3 ? 25 : i === 4 ? 22 : s.discount;
        const approvalTime = new Date(Date.parse(q.createdAt) + (i === 2 ? 0 : i === 3 ? 3.5 : 5) * 3600000).toISOString();
        if (q.originalDiscountPercent !== s.discount) q.history.push({ at: approvalTime, actor: "Meera Iyer", message: `Discount changed ${q.originalDiscountPercent}% → ${s.discount}% after negotiation (Simulated demo).` });
        q.approvedDiscountPercent = q.effectiveDiscountPercent; q.approvedAt = approvalTime;
        q.history.push({ at: approvalTime, actor: q.requiredApprover === "Rep" ? "Policy engine" : "Meera Iyer", message: "Quote approved (Simulated demo)." });
        if (s.status !== "approved") q.history.push({ at: new Date(Date.parse(approvalTime) + 3600000).toISOString(), actor: "Aarav Mehta", message: "Client link shared (Simulated demo)." });
      } else { q.approvedAt = null; q.approvedDiscountPercent = null; }
      if (s.status === "accepted") { q.acceptedBy = s.contact; event(q, s.contact, "Quote accepted; simulated Volopay payment request created (Simulated demo)."); }
      if (s.status === "changes_requested") event(q, "Rohan Kapoor", "Changes requested: reduce discount or obtain annual commitment (Simulated demo).");
      if (s.status === "rejected") event(q, "Rohan Kapoor", "Rejected: below-floor pricing without committed expansion (Simulated demo).");
      q.updatedAt = q.history[q.history.length - 1]!.at;
      await persist(c, q);
    }
  });
}
