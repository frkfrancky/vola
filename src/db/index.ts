import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas défini (voir .env.example).");
  return drizzle({ client: neon(url), schema });
}

let instance: ReturnType<typeof createDb> | undefined;

/** Connexion créée à la première utilisation, pour que `next build` fonctionne sans base. */
export function getDb() {
  instance ??= createDb();
  return instance;
}
