import { Router, type IRouter } from "express";
import {
  LoginBody, SwitchRoleBody, CreateQuoteBody, UpdateQuoteBody, QuoteActionBody,
  UpdatePolicyBody, AcceptPublicQuoteBody, ListQuotesQueryParams,
  GetQuoteParams, GetPublicQuoteParams,
} from "@workspace/api-zod";
import { AppError, getPolicy, savePolicy, listQuotes, getQuote, createQuote, updateQuote, actionQuote, publicQuote, acceptQuote, dashboard } from "../lib/dealdesk";
import { sessionMiddleware, requireLogin, sameOrigin, loginSession, signedOut, changeRole, endSession } from "../lib/session";

const router: IRouter = Router();
router.use(sessionMiddleware);
router.get("/session", (req, res) => { res.json(req.demoSession ?? signedOut); });
router.post("/session", sameOrigin, async (req, res) => {
  const input = LoginBody.parse(req.body);
  if (input.email !== "demo@dealdesk.app" || input.password !== "dealdesk2026") throw new AppError(401, "Use the demo email and password shown on the login page.");
  res.json(await loginSession(req, res));
});
router.delete("/session", sameOrigin, async (req, res) => { res.json(await endSession(req, res)); });
router.post("/session/role", requireLogin, sameOrigin, async (req, res) => { res.json(await changeRole(req, SwitchRoleBody.parse(req.body).role)); });
router.get("/public/quotes/:token", async (req, res) => { res.json(await publicQuote(GetPublicQuoteParams.parse(req.params).token)); });
router.post("/public/quotes/:token/accept", sameOrigin, async (req, res) => {
  const { name } = AcceptPublicQuoteBody.parse(req.body);
  if (name.trim().length < 2) throw new AppError(400, "Please enter your full name.");
  res.json(await acceptQuote(GetPublicQuoteParams.parse(req.params).token, name));
});
router.use(requireLogin);
router.use((req, res, next) => { if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) sameOrigin(req, res, next); else next(); });
router.get("/policy", async (_req, res) => { res.json(await getPolicy()); });
router.put("/policy", async (req, res) => { res.json(await savePolicy(UpdatePolicyBody.parse(req.body), req.demoSession!.name)); });
router.get("/quotes", async (req, res) => {
  const { status, rep } = ListQuotesQueryParams.parse(req.query);
  res.json(await listQuotes(status, rep));
});
router.post("/quotes", async (req, res) => { res.status(201).json(await createQuote(CreateQuoteBody.parse(req.body), "manual")); });
router.get("/quotes/:id", async (req, res) => { res.json(await getQuote(GetQuoteParams.parse(req.params).id)); });
router.put("/quotes/:id", async (req, res) => { res.json(await updateQuote(GetQuoteParams.parse(req.params).id, UpdateQuoteBody.parse(req.body), req.demoSession!.name)); });
router.post("/quotes/:id/actions", async (req, res) => {
  const input = QuoteActionBody.parse(req.body);
  res.json(await actionQuote(GetQuoteParams.parse(req.params).id, input.action, req.demoSession!.role, input.comment, input.version));
});
router.get("/dashboard", async (_req, res) => { res.json(await dashboard()); });
router.get("/connect", (_req, res) => {
  res.json({ mcpPath: "/mcp", tools: ["get_pricing_and_policy", "create_quote", "list_pending_approvals", "get_quote", "list_quotes"], transport: "Streamable HTTP · stateless · no OAuth", warning: "Public demo connector: anyone with the URL can read and create fictional demo quotes. Do not enter real client or confidential data. Publish first and use your published HTTPS domain for Claude." });
});
export default router;
