const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5001"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { accessToken, body, headers, ...requestInit } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    headers: requestHeaders,
    body:
      body === undefined || body instanceof FormData
        ? (body as BodyInit | null | undefined)
        : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const error = (await response.json()) as { message?: string | string[] };
      if (error.message) {
        message = Array.isArray(error.message)
          ? error.message.join(", ")
          : error.message;
      }
    } catch {
      // Keep the status-based message when the API does not return JSON.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
