import { describe, expect, it } from "vitest";
import { getApprovalPath } from "../../../dealdesk/src/lib/approval-history.ts";

const approvedAt = "2026-11-06T14:30:00.000Z";

function quote(overrides = {}) {
  return {
    status: "approved",
    requiredApprover: "Sales Head",
    discountPercent: 18,
    effectiveDiscountPercent: 18,
    originalDiscountPercent: 28,
    approvedAt,
    history: [
      { at: "2026-11-06T12:00:00.000Z", actor: "Policy engine", message: "Routed to Founder. 28% effective discount requires Founder approval." },
      { at: "2026-11-06T13:00:00.000Z", actor: "Rohan Kapoor", message: "Discount percent changed 28% → 18%" },
      { at: "2026-11-06T13:00:00.000Z", actor: "Policy engine", message: "Policy re-evaluated. 18% effective discount requires Sales Head approval." },
      { at: approvedAt, actor: "Rohan Kapoor", message: "Approved by Rohan Kapoor (Founder) — Sales Head band." },
    ],
    ...overrides,
  };
}

describe("approval history presentation", () => {
  it("attributes a senior approval to the actual role and explains the lowered route", () => {
    const result = getApprovalPath(quote(), (date) => date);

    expect(result.founder).toEqual({
      state: "done",
      note: `Approved by Rohan Kapoor (Founder) ${approvedAt}`,
    });
    expect(result.salesHead).toEqual({
      state: "skipped",
      note: "Covered by Founder approval",
    });
    expect(result.originalRouteNote).toBe("Originally routed to Founder at 28%; edited to 18%");
    expect(result.approverLabel).toBe("Rohan Kapoor (Founder)");
  });

  it("shows the Sales Head as the actual approver when that role decided", () => {
    const result = getApprovalPath(quote({
      history: [
        { at: approvedAt, actor: "Meera Iyer", message: "Approved by Meera Iyer (Sales Head)." },
      ],
    }), (date) => date);

    expect(result.salesHead).toEqual({
      state: "done",
      note: `Approved by Meera Iyer (Sales Head) ${approvedAt}`,
    });
    expect(result.founder).toEqual({
      state: "skipped",
      note: "Skipped — Sales Head band covers it",
    });
    expect(result.approverLabel).toBe("Meera Iyer (Sales Head)");
  });

  it("does not treat a previous approval as current while the quote is pending", () => {
    const result = getApprovalPath(quote({
      status: "pending_approval",
      history: [
        { at: approvedAt, actor: "Rohan Kapoor", message: "Approved by Rohan Kapoor (Founder) — Founder band." },
      ],
    }), (date) => date);

    expect(result.salesHead).toEqual({ state: "current", note: "Awaiting decision" });
    expect(result.founder.state).toBe("skipped");
    expect(result.approverLabel).toBe("Sales Head");
  });
});
