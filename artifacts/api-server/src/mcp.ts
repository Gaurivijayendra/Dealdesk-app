import { Router, type IRouter } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { CreateQuoteBody } from "@workspace/api-zod";
import { getPolicy, createQuote, listQuotes, getQuote, AppError } from "./lib/dealdesk";

/** MCP is a protocol SDK, not an AI SDK. This server never calls an LLM. */
function makeServer(origin: string) {
  const server = new McpServer({ name: "DealDesk", version: "1.0.0" }, {
    instructions: "DealDesk stores fictional B2B quotes in INR. First get pricing and policy, then draft a quote with a specific business reason and optional compliant counter-offer. The app, not Claude, computes totals and approvals. Do not claim a quote is approved or sent unless its returned status says so. No AI runs inside DealDesk. This is an unauthenticated public demo; never send confidential or real client data.",
  });
  const result = async (fn: () => Promise<unknown>) => {
    try {
      const value = await fn();
      return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof AppError ? error.message : "Could not complete the operation. Check the inputs and try again." }] };
    }
  };
  server.registerTool("get_pricing_and_policy", {
    description: "Get Northwind Analytics' product catalog (name, unit, list and floor prices in INR) and current editable discount approval bands before drafting a quote or suggesting a counter-offer. Discounts apply to all line items. Annual prepaid multiplies recurring monthly prices by 12; onboarding is one-time. Below-floor net unit prices always require Founder approval. Effective discounts from reducing unit prices also count toward policy.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, () => result(async () => ({ company: "Northwind Analytics", currency: "INR", ...await getPolicy(), floorRule: "Any net line price below product floor requires Founder approval.", reapprovalRule: "Increasing discount after approval resets approval.", billing: "Monthly units ×12 for annual prepaid, one-time products once.", demo: true })));
  server.registerTool("create_quote", {
    description: "Create a persistent quote from your drafted deal notes. Get pricing first; use exact catalog product names and unit prices in INR before discount. Include company/contact/email/rep, positive integer quantities, discount percent, your written discount reason, optional suggested counter-offer, monthly or annual prepaid billing terms, ISO validity date and notes. DealDesk computes totals, flags post-discount floor breaches and routes approvals. Returns the saved quote and review link; does not send, approve exceptions or request real payment. Omit saveAsDraft or set false to submit for approval.",
    inputSchema: {
      ...CreateQuoteBody.shape,
      clientCompany: CreateQuoteBody.shape.clientCompany.describe("Fictional client company name"),
      discountReason: CreateQuoteBody.shape.discountReason.describe("Your written business justification for the requested discount"),
      counterOffer: CreateQuoteBody.shape.counterOffer.describe("Optional suggested counter-offer that protects margin"),
      validityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Quote validity date in YYYY-MM-DD format"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, input => result(async () => {
    const q = await createQuote(CreateQuoteBody.parse(input), "claude");
    return { quoteId: q.id, quoteNumber: q.number, currency: "INR", subtotal: q.subtotal, total: q.total, discountAmount: q.discountAmount, status: q.status, requiredApprover: q.requiredApprover, belowFloor: q.belowFloor, rule: q.ruleDescription, reviewLink: `${origin}/quotes/${q.id}` };
  }));
  server.registerTool("list_pending_approvals", {
    description: "List quotes waiting for a human discount approval, including client, INR total, discount, required approver, business reason and age. Use to prepare an approval summary; this tool cannot approve quotes.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, () => result(async () => (await listQuotes("pending_approval")).map(q => ({
    quoteId: q.id, company: q.clientCompany, total: q.total, currency: "INR",
    discountPercent: q.discountPercent, effectiveDiscountPercent: q.effectiveDiscountPercent,
    requiredApprover: q.requiredApprover, reason: q.discountReason,
    ageHours: Math.round((Date.now() - Date.parse(q.createdAt)) / 3600000 * 10) / 10,
    reviewLink: `${origin}/quotes/${q.id}`,
  }))));
  server.registerTool("get_quote", {
    description: "Retrieve full details, computed totals, status, approval history, floor warnings and review link for one quote. Use after creating a quote or to inspect human edits. All amounts INR.",
    inputSchema: { quote_id: z.string().describe("Quote id returned by create_quote or list_quotes") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, ({ quote_id }) => result(async () => ({ ...await getQuote(quote_id), reviewLink: `${origin}/quotes/${quote_id}`, currency: "INR" })));
  server.registerTool("list_quotes", {
    description: "List saved quotes with optional exact status and/or rep name filters. Use to find quotes and track whether people have approved, edited, sent or accepted a deal. Status values: draft, pending_approval, approved, sent, accepted, changes_requested, rejected. All amounts INR.",
    inputSchema: { status: z.enum(["draft", "pending_approval", "approved", "sent", "accepted", "changes_requested", "rejected"]).optional(), rep: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, ({ status, rep }) => result(async () => (await listQuotes(status, rep)).map(q => ({ ...q, reviewLink: `${origin}/quotes/${q.id}` }))));
  return server;
}
export const mcpRouter: IRouter = Router();
mcpRouter.options("/", (_req, res) => { res.sendStatus(204); });
mcpRouter.post("/", async (req, res) => {
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const server = makeServer(`${protocol}://${host}`);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    req.log.error({ err }, "MCP request failed");
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "MCP request failed" } });
  }
});
mcpRouter.all("/", (_req, res) => {
  res.setHeader("Allow", "POST, OPTIONS");
  res.status(405).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Stateless MCP uses POST. GET streams and DELETE sessions are not supported." } });
});
