import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { mcpRouter } from "./mcp";
import { AppError } from "./lib/dealdesk";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ exposedHeaders: ["Mcp-Session-Id", "MCP-Protocol-Version"] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

app.use("/mcp", mcpRouter);
app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof Error && err.name === "ZodError") { res.status(400).json({ error: "Invalid input. Check required fields, numeric ranges and date formats.", details: err.message }); return; }
  if (err instanceof SyntaxError) { res.status(400).json({ error: "Invalid JSON." }); return; }
  req.log.error({ err }, "Request failed");
  res.status(500).json({ error: "Unable to complete this request. Please try again." });
});

export default app;
