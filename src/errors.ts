export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class GoneError extends AppError {
  constructor(message: string) {
    super(message, 410, "GONE");
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message: string) {
    super(message, 422, "INSUFFICIENT_BALANCE");
  }
}

export class UpstreamError extends AppError {
  constructor(message: string) {
    super(message, 502, "UPSTREAM_ERROR");
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 503, "DATABASE_ERROR");
  }
}
