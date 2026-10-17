/** Errors safe to show to users: a status, a stable code, and plain-language text. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public userMessage: string,
  ) {
    super(code);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
