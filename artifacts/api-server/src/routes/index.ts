import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import commentsRouter from "./comments";
import metaRouter from "./meta";
import internalRouter from "./internal";
import podcastRouter from "./podcast";
import horusRouter from "./horus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(commentsRouter);
router.use(metaRouter);
router.use(internalRouter);
router.use(podcastRouter);
router.use(horusRouter);

export default router;
