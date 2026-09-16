import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { errorHandler } from "../src/middleware/errorHandler.js";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res) as unknown as Response["status"];
  res.json = vi.fn().mockReturnValue(res) as unknown as Response["json"];
  return res;
}

const fakeReq = {} as unknown as Request;
const fakeNext = vi.fn() as unknown as NextFunction;

describe("errorHandler", () => {
  it("maps a Prisma initialization failure to 503 DATABASE_ERROR", () => {
    const res = mockRes();
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      "6.19.3",
    );

    errorHandler(err, fakeReq, res, fakeNext);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "DATABASE_ERROR", message: expect.any(String) },
    });
  });

  it("maps a Prisma P1001 connectivity-loss error to 503 DATABASE_ERROR", () => {
    const res = mockRes();
    const err = new Prisma.PrismaClientKnownRequestError(
      "Can't reach database server",
      { code: "P1001", clientVersion: "6.19.3" },
    );

    errorHandler(err, fakeReq, res, fakeNext);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "DATABASE_ERROR", message: expect.any(String) },
    });
  });

  it("still falls back to 500 INTERNAL_ERROR for a truly unknown error", () => {
    const res = mockRes();
    errorHandler(new Error("something else broke"), fakeReq, res, fakeNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  });
});
