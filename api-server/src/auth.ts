import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { redisStorage } from "@better-auth/redis-storage";
import { bearer } from "better-auth/plugins";
import { db } from "./db/index.js";
import * as schema from "./db/schema/index.js";
import { env } from "./env.js";
import { redis } from "./redis.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secondaryStorage: redisStorage({
    client: redis,
    keyPrefix: "better-auth:",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [bearer()],
  advanced: {
    database: {
      joins: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
