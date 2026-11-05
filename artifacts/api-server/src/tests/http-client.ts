import type { Server } from "node:http";
import { expect } from "vitest";
import app from "../app";
import type { Quote, Role } from "../lib/dealdesk";
import type { DemoSession } from "../lib/session";
import { quoteInput } from "./fixtures";

let server: Server | undefined;
let origin: string;

export async function startServer() {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test HTTP port");
  origin = `http://127.0.0.1:${address.port}`;
}

export async function stopServer() {
  if (server) {
    const closing = new Promise<void>((resolve, reject) => {
      server!.close(error => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    await closing;
  }
}

export async function request<T = Quote>(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status,
    data: await response.json() as T,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

export async function login(role: Role = "Rep") {
  const response = await request<DemoSession>("POST", "/session", {
    email: "demo@dealdesk.app", password: "dealdesk2026",
  });
  expect(response.status).toBe(200);
  expect(response.cookie).toBeTruthy();
  const cookie = response.cookie!;
  if (role !== "Rep") await switchRole(cookie, role);
  return cookie;
}

export async function switchRole(cookie: string, role: Role) {
  const response = await request<DemoSession>("POST", "/session/role", { role }, cookie);
  expect(response.status).toBe(200);
  expect(response.data.role).toBe(role);
}

export async function create(cookie: string, overrides: Parameters<typeof quoteInput>[0] = {}) {
  const response = await request("POST", "/quotes", quoteInput(overrides), cookie);
  expect(response.status).toBe(201);
  return response.data;
}

export async function read(cookie: string, id: string) {
  const response = await request("GET", `/quotes/${id}`, undefined, cookie);
  expect(response.status).toBe(200);
  return response.data;
}

export function action(cookie: string, q: Quote, actionName: string, version = q.version) {
  return request("POST", `/quotes/${q.id}/actions`, { action: actionName, version }, cookie);
}

export async function sentQuote(cookie: string) {
  const quote = await create(cookie, { discountPercent: 10 });
  const sent = await action(cookie, quote, "send");
  expect(sent.status).toBe(200);
  expect(sent.data.status).toBe("sent");
  return sent.data;
}
