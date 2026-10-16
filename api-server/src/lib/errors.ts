import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorHandler(error: Error, c: Context) {
  if (error instanceof ApiError) {
    return c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request data is invalid.",
          details: error.flatten(),
        },
      },
      400,
    );
  }

  if (error instanceof HTTPException) {
    return c.json(
      { error: { code: "HTTP_ERROR", message: error.message } },
      error.status,
    );
  }

  console.error(error);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    500,
  );
}
