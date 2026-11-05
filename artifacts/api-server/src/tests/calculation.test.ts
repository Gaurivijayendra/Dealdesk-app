import { describe, expect, it, vi } from "vitest";

// Calculation tests must run without credentials, PostgreSQL or network access.
vi.mock("@workspace/db", () => ({ pool: {} }));

import { buildQuote, calculate, initialPolicy } from "../lib/dealdesk";
import { quoteInput } from "./fixtures";

describe("deterministic discount policy", () => {
  it.each([
    [0, "Rep", "approved"],
    [9.99, "Rep", "approved"],
    [10, "Rep", "approved"],
    [10.01, "Sales Head", "pending_approval"],
    [19.99, "Sales Head", "pending_approval"],
    [20, "Sales Head", "pending_approval"],
    [20.01, "Founder", "pending_approval"],
  ])("%s%% uses the inclusive band for %s", (discountPercent, role, status) => {
    const q = buildQuote(quoteInput({ discountPercent }), initialPolicy, "manual", 1001);
    expect(q.requiredApprover).toBe(role);
    expect(q.status).toBe(status);
    expect(q.belowFloor).toBe(false);
    expect(q.effectiveDiscountPercent).toBe(discountPercent);
    expect(q.total).toBe(Math.round(6000 * (1 - discountPercent / 100) * 100) / 100);
    expect(q.approvedDiscountPercent).toBe(status === "approved" ? discountPercent : null);
    expect(q.approvedAt === null).toBe(status !== "approved");
  });

  it.each([
    [540, 0, 10, "Rep"],
    [539.94, 0, 10.01, "Sales Head"],
    [480, 0, 20, "Sales Head"],
    [479.94, 0, 20.01, "Founder"],
    [570, 5, 9.75, "Rep"],
    [570, 10, 14.5, "Sales Head"],
    [540, 15, 23.5, "Founder"],
    // A higher custom price must not reduce the explicit approval requirement.
    [660, 20, 12, "Sales Head"],
    [660, 21, 13.1, "Founder"],
  ])("unit price %s + %s%% discount cannot bypass %s%% effective pricing",
    (unitPrice, discountPercent, effective, role) => {
      const q = buildQuote(quoteInput({
        discountPercent,
        lineItems: [{ productName: "Growth plan seat", quantity: 10, unitPrice }],
      }), initialPolicy, "manual", 1001);
      expect(q.effectiveDiscountPercent).toBe(effective);
      expect(q.requiredApprover).toBe(role);
      expect(q.status).toBe(role === "Rep" ? "approved" : "pending_approval");
    });

  it.each([
    [500, 10, false], // Net unit price equals the INR 450 floor exactly.
    [499.99, 10, true],
    [450, 0, false],
    [449.99, 0, true],
  ])("compares each rounded post-discount unit price with its floor (%s, %s%%)",
    (unitPrice, discountPercent, belowFloor) => {
      const result = calculate(quoteInput({
        discountPercent,
        lineItems: [{ productName: "Growth plan seat", quantity: 1, unitPrice }],
      }), initialPolicy);
      expect(result.belowFloor).toBe(belowFloor);
      if (belowFloor) {
        expect(result.requiredApprover).toBe("Founder");
        expect(result.ruleDescription).toContain("Below-floor");
      }
    });

  it("does not hide one under-floor line behind profitable lines or an aggregate floor", () => {
    const result = calculate(quoteInput({
      discountPercent: 10,
      lineItems: [
        { productName: "Growth plan seat", quantity: 1, unitPrice: 499.99 },
        { productName: "Onboarding package", quantity: 10, unitPrice: 50000 },
      ],
    }), initialPolicy);
    expect(result.total).toBeGreaterThan(result.floorTotal);
    expect(result.effectiveDiscountPercent).toBeLessThan(10.1);
    expect(result.belowFloor).toBe(true);
    expect(result.requiredApprover).toBe("Founder");
  });

  it("annual prepaid bills recurring products 12 times and onboarding only once", () => {
    const result = calculate(quoteInput({
      billingTerms: "Annual prepaid",
      discountPercent: 10,
      lineItems: [
        { productName: "Growth plan seat", quantity: 2, unitPrice: 600 },
        { productName: "Onboarding package", quantity: 1, unitPrice: 50000 },
        { productName: "Priority support", quantity: 1, unitPrice: 15000 },
      ],
    }), initialPolicy);
    expect(result).toMatchObject({
      subtotal: 244400, listTotal: 244400, discountAmount: 24440,
      total: 219960, floorTotal: 165800, effectiveDiscountPercent: 10,
      belowFloor: false, requiredApprover: "Rep",
    });
  });

  it("keeps drafts unapproved and applies the same deterministic rules to external-client inputs", () => {
    const input = quoteInput({ discountPercent: 15 });
    const manual = buildQuote(input, initialPolicy, "manual", 1001);
    const external = buildQuote(input, initialPolicy, "claude", 1002);
    for (const field of ["total", "requiredApprover", "status", "effectiveDiscountPercent"] as const) {
      expect(external[field]).toEqual(manual[field]);
    }
    const draft = buildQuote(quoteInput({ saveAsDraft: true }), initialPolicy, "manual", 1003);
    expect(draft.status).toBe("draft");
    expect(draft.approvedAt).toBeNull();
    expect(draft.approvedDiscountPercent).toBeNull();
  });

  it("rejects products outside the catalog instead of inventing pricing", () => {
    expect(() => calculate(quoteInput({
      lineItems: [{ productName: "Unknown plan", quantity: 1, unitPrice: 600 }],
    }), initialPolicy)).toThrow("Unknown product");
  });
});
