import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError, DatabaseError } from "../errors.js";

// Prisma throws these when Postgres itself is unreachable — at client
// startup (PrismaClientInitializationError) or mid-session, e.g. the
// connection dropped (PrismaClientKnownRequestError code P1001). Both
// mean "the database is down," not "the request was bad," so they get
// their own status distinct from a generic 500.
function isDatabaseConnectivityError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P1001"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }
  if (isDatabaseConnectivityError(err)) {
    const dbError = new DatabaseError("Database unavailable");
    return res.status(dbError.status).json({
      error: { code: dbError.code, message: dbError.message },
    });
  }
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
