import { createMiddleware } from "hono/factory";
import { auth, type Session } from "../auth.js";
import { ApiError } from "../lib/errors.js";

export type SessionEnv = {
  Variables: {
    session: Session;
  };
};

export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  c.set("session", session);
  await next();
});
