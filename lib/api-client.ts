type ApiResponseLike = {
  status?: string;
  message?: string;
};

const parseJsonSafely = async <T = unknown>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const requireApiSuccess = async <T = any>(
  response: Response,
  fallbackMessage: string,
): Promise<T> => {
  const payload = await parseJsonSafely<T & ApiResponseLike>(response);

  if (!response.ok) {
    const message = payload?.message || `${fallbackMessage}: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (payload && typeof payload === "object" && "status" in payload && payload.status !== "success") {
    throw new Error(payload.message || fallbackMessage);
  }

  return (payload ?? ({} as T)) as T;
};

export { requireApiSuccess };
