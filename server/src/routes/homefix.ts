/**
 * HomeFix Interior Planner — top-level tRPC router.
 * Composes catalog, staging, and render sub-routers.
 */
import { router } from "../trpc/trpc.js";
import { homefixCatalogRouter } from "./homefix-catalog.js";
import { homefixStagingRouter } from "./homefix-staging.js";
import { homefixRenderRouter } from "./homefix-render.js";

export const homefixRouter = router({
  catalog: homefixCatalogRouter,
  staging: homefixStagingRouter,
  render:  homefixRenderRouter,
});
