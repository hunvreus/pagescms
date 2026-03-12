type ErrorLike = {
  status?: number;
  statusCode?: number;
  message?: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as ErrorLike).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Internal server error.";
};

const getErrorStatus = (error: unknown): number => {
  if (error && typeof error === "object") {
    const { status, statusCode } = error as ErrorLike;
    const explicitStatus = typeof status === "number" ? status : statusCode;
    if (typeof explicitStatus === "number" && explicitStatus >= 400 && explicitStatus <= 599) {
      return explicitStatus;
    }
  }

  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("not found")) return 404;
  if (
    message.includes("permission")
    || message.includes("no access")
    || message.includes("forbidden")
    || message.includes("only github users")
  ) return 403;
  if (message.includes("unauthorized") || message.includes("not signed in")) return 401;
  if (message.includes("conflict") || message.includes("changed since you last loaded")) return 409;
  if (message.includes("rate limit")) return 429;
  if (message.includes("too many clients already")) return 503;
  if (
    message.includes("invalid")
    || message.includes("required")
    || message.includes("validation failed")
  ) return 400;

  return 500;
};

const toErrorResponse = (error: unknown) => {
  const status = getErrorStatus(error);
  return Response.json(
    {
      status: "error",
      message: getErrorMessage(error),
    },
    { status },
  );
};

export { toErrorResponse };
