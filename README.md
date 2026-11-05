# DealDesk

DealDesk is a quote-approval tool for small B2B sales teams. A customer's own Claude can draft quotes from deal notes over MCP; DealDesk stores them in PostgreSQL, enforces discount rules, routes approvals, and hosts a link for the client to accept. There is no AI inside the app: Claude drafts, while DealDesk applies deterministic rules and people make approval decisions.

## Live links

- App: <https://dealdesk-quotes.replit.app>
- MCP endpoint: <https://dealdesk-quotes.replit.app/mcp>
- Demo login: `demo@dealdesk.app` / `dealdesk2026`

The MCP endpoint is a public demo endpoint without OAuth. Anyone who has its URL can read and create fictional demo quotes. Do not submit real client details or confidential information.

## Connect to Claude

1. In Claude, open **Customize → Connectors**.
2. Click **+ Add → Add custom connector**.
3. Paste <https://dealdesk-quotes.replit.app/mcp> as the MCP URL.
4. Choose **No sign in**, then click **Add**.
5. In a chat, click **+ → Connectors** and switch on **DealDesk**.
6. Try a prompt such as:
   - “Draft a DealDesk quote for Acme Logistics: 40 Growth plan seats, annual prepaid. They want 25% off because a competitor quoted ₹450 per seat. Include a discount reason and suggest a counter-offer within policy.”
   - “Which DealDesk quotes are waiting for my approval? Summarise each in one line.”

## How it works

1. A sales rep gives their own Claude deal notes and asks for a quote.
2. Claude calls DealDesk for the current product catalog and discount policy.
3. Claude drafts the quote using the returned product names, prices, and rules.
4. Claude calls `create_quote` through the public MCP endpoint.
5. DealDesk calculates totals, checks floor prices, determines the required approver, and stores the quote in PostgreSQL.
6. DealDesk returns the quote status and an in-app review link; the team can edit, approve, reject, or request changes, with changes recorded in the audit history.
7. After approval, a team member sends the quote and shares its client acceptance link manually.
8. The client can accept without logging in; DealDesk locks the accepted quote and displays a simulated Volopay payment request.

## MCP tools

The stateless Streamable HTTP MCP server is served by the API at `/mcp`. All amounts are in INR.

| Tool | Access | Purpose |
| --- | --- | --- |
| `get_pricing_and_policy` | Read | Returns the product catalog, list and floor prices, and current discount rules. |
| `create_quote` | Write | Saves a draft or submits a quote for review; DealDesk calculates totals and routing. |
| `list_pending_approvals` | Read | Lists quotes waiting for a human decision, including amount, discount, approver, reason, and age. |
| `get_quote` | Read | Returns one quote's details, totals, status, approval history, and review link. |
| `list_quotes` | Read | Lists quotes, optionally filtered by status or rep. |

MCP can create and inspect quotes; approval decisions and sending to the client are handled in the app.

## Approval rules and roles

- The seeded discount bands are 0–10% for Rep approval (auto-approved), above 10% through 20% for Sales Head approval, and above 20% for Founder approval. A quote with any line below its product floor always requires Founder approval. The Founder can edit discount bands and floor prices on the Rules page.
- Approval is seniority-based: Rep < Sales Head < Founder. A role can decide a pending quote routed to that role or a more junior role.
- If an edit after approval increases the discount or changes the required approver, the quote returns to approval review. Below-floor pricing is included in that routing check.
- Editing a quote that has already been sent revokes its previous client link; the updated quote must be sent again to create a new link. A relevant policy update also re-evaluates quotes and revokes the existing link for sent quotes.
- Accepted quotes are locked and cannot be edited.

## Tech stack and project structure

- TypeScript monorepo managed with pnpm.
- React and Vite frontend, Express API server, and PostgreSQL accessed through Drizzle.
- Official `@modelcontextprotocol/sdk` for the remote MCP protocol and Streamable HTTP transport.
- `artifacts/api-server/` — Express API, MCP endpoint, quote and policy logic, and tests.
- `artifacts/dealdesk/` — React/Vite web app.
- `lib/api-spec/` — shared OpenAPI specification and API client generation.
- `lib/db/` — PostgreSQL connection and Drizzle schema.
- `lib/api-zod/` and `lib/api-client-react/` — shared validation schemas and generated React API client.
- `scripts/` — workspace scripts.

## Run locally and run tests

Use Node.js and pnpm. Configure `DATABASE_URL` in the local shell to point to a development PostgreSQL database before running the API or database-backed tests. Do not use a production database for tests.

```sh
pnpm install
pnpm --filter @workspace/db run push
```

Start the API server and web app in separate terminals:

```sh
pnpm --filter @workspace/api-server run dev
```

```sh
pnpm --filter @workspace/dealdesk run dev
```

Run the workspace type checks and tests:

```sh
pnpm run typecheck
pnpm test
```

`pnpm test` includes HTTP tests that require `DATABASE_URL` for a development/test PostgreSQL database. To run database-independent calculation tests only:

```sh
pnpm --filter @workspace/api-server run test:unit
```

## Simulated features and limitations

- The Rep, Sales Head, and Founder roles share one demo login. The role switcher simulates which team member is using the app; it is not a separate user-account system.
- The Volopay payment request uses dummy virtual-account details and does not initiate a real payment.
- The public, unauthenticated MCP demo endpoint can be used by anyone with its URL. Use fictional demo data only.
- The prototype supports one company, Northwind Analytics, and INR only.
- The app does not send email, chat, or other notifications. A team member must share the client acceptance link manually.

## AI and credentials

No AI SDKs or AI API keys are used anywhere in this project. The only Claude-related package is `@modelcontextprotocol/sdk`, which implements the MCP protocol; it does not provide or call an AI model.
