import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const quotesTable = pgTable("dealdesk_quotes", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
});
export const policyTable = pgTable("dealdesk_policy", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
});
export const sessionsTable = pgTable("dealdesk_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  role: text("role").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const insertQuoteSchema = createInsertSchema(quotesTable);
export const insertPolicySchema = createInsertSchema(policyTable);
export const insertSessionSchema = createInsertSchema(sessionsTable);
export type QuoteRow = typeof quotesTable.$inferSelect;
