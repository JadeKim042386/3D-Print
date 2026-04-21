import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Queue } from "bullmq";
import type { Database } from "../types/database.js";
import type {
  GenerationJobData,
  GenerationJobResult,
} from "../queue/generation-queue.js";
import type {
  DimensionJobData,
  DimensionJobResult,
} from "../queue/dimension-queue.js";
import type {
  ExportJobData,
  ExportJobResult,
} from "../queue/export-queue.js";
import type { Mailer } from "../lib/mailer.js";

export interface AppContext {
  supabase: SupabaseClient<Database>;
  /** Meshy AI generation queue */
  generationQueue: Queue<GenerationJobData, GenerationJobResult> | null;
  /** Dimension-based generation queue (separate service) */
  dimensionQueue: Queue<DimensionJobData, DimensionJobResult> | null;
  /** Model format export queue */
  exportQueue: Queue<ExportJobData, ExportJobResult> | null;
  user: { id: string; email: string } | null;
  /** Transactional email service — null when SMTP not configured */
  mailer: Mailer | null;
}

export interface CreateContextDeps {
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseAnonKey: string;
  generationQueue: Queue<GenerationJobData, GenerationJobResult> | null;
  dimensionQueue: Queue<DimensionJobData, DimensionJobResult> | null;
  exportQueue: Queue<ExportJobData, ExportJobResult> | null;
  mailer: Mailer | null;
}

export function createContextFactory(deps: CreateContextDeps) {
  return async function createContext({
    req,
  }: CreateFastifyContextOptions): Promise<AppContext> {
    const serviceClient = createClient<Database>(
      deps.supabaseUrl,
      deps.supabaseServiceKey
    );

    let user: AppContext["user"] = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const anonClient = createClient<Database>(
        deps.supabaseUrl,
        deps.supabaseAnonKey
      );
      const {
        data: { user: authUser },
      } = await anonClient.auth.getUser(token);
      if (authUser) {
        user = { id: authUser.id, email: authUser.email ?? "" };
      }
    }

    return {
      supabase:         serviceClient,
      generationQueue:  deps.generationQueue,
      dimensionQueue:   deps.dimensionQueue,
      exportQueue:      deps.exportQueue,
      mailer:           deps.mailer,
      user,
    };
  };
}
