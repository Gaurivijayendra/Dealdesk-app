import { CreateQuoteBody } from "@workspace/api-zod";
import type { QuoteInput } from "../lib/dealdesk";

// Fictional data only. Parse through the real contract, including date coercion.
export function quoteInput(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return CreateQuoteBody.parse({
    clientCompany: "Regression Demo Ltd",
    contactName: "Demo Buyer",
    contactEmail: "buyer@example.test",
    repName: "Demo Rep",
    lineItems: [{ productName: "Growth plan seat", quantity: 10, unitPrice: 600 }],
    discountPercent: 0,
    discountReason: "Simulated regression scenario",
    billingTerms: "Monthly",
    validityDate: new Date("2099-12-31T00:00:00Z"),
    notes: "Fictional automated test; no real payments.",
    ...overrides,
  });
}
