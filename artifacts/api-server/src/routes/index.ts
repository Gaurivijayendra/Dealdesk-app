import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dealdeskRouter from "./dealdesk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dealdeskRouter);

export default router;
