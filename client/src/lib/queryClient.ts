import { QueryClient, QueryFunction } from "@tanstack/react-query";

type ApiErrorDetails = {
  status?: number;
  code: string;
  details?: unknown;
  rawBody?: string;
};

export class ApiError extends Error {
  status?: number;
  code: string;
  details?: unknown;
  rawBody?: string;

  constructor(message: string, options: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.rawBody = options.rawBody;
  }
}

function createApiError(message: string, options: ApiErrorDetails) {
  return new ApiError(message, options);
}

function getResponseContentType(res: Response) {
  return res.headers.get("content-type")?.toLowerCase() || "";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const trimmed = text.trim();

    if (trimmed.startsWith("<")) {
      throw createApiError(
        "La API devolvió HTML en lugar de JSON. Inicia la app con `npm run dev` para levantar Express + frontend juntos.",
        {
          status: res.status,
          code: "API_RETURNED_HTML",
          rawBody: trimmed,
        },
      );
    }

    try {
      const payload = JSON.parse(trimmed) as { code?: string; message?: string; details?: unknown };
      throw createApiError(payload.message || `${res.status}: ${res.statusText}`, {
        status: res.status,
        code: payload.code || `HTTP_${res.status}`,
        details: payload.details,
        rawBody: trimmed,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw createApiError(trimmed || `${res.status}: ${res.statusText}`, {
        status: res.status,
        code: `HTTP_${res.status}`,
        rawBody: trimmed,
      });
    }
  }
}

/** Parse JSON; if the body is HTML (SPA fallback), surface a clear error instead of JSON.parse noise. */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw createApiError("Respuesta vacía del servidor", {
      status: res.status,
      code: "API_EMPTY_RESPONSE",
    });
  }
  if (trimmed.startsWith("<")) {
    throw createApiError(
      "El servidor devolvió HTML en lugar de JSON. Suele pasar si la app corre solo con Vite (sin Express), si el despliegue envía /api al estático, o si la ruta API no existe. Usa el mismo comando que levanta API + frontend (p. ej. npm run dev) y revisa variables GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID.",
      {
        status: res.status,
        code: "API_RETURNED_HTML",
        rawBody: trimmed,
      },
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw createApiError(`Respuesta no JSON: ${trimmed.slice(0, 200)}`, {
      status: res.status,
      code: "API_INVALID_JSON",
      rawBody: trimmed,
    });
  }
}

export function getApiErrorInfo(error: unknown) {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      isApiUnavailable: error.code === "API_RETURNED_HTML" || error.code === "API_UNREACHABLE",
      isAuthError: error.status === 401 || error.code === "AUTH_REQUIRED",
    };
  }

  return {
    status: undefined,
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "Error inesperado",
    details: undefined,
    isApiUnavailable: false,
    isAuthError: false,
  };
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch {
    throw createApiError(
      "No se pudo conectar con la API. Inicia la aplicación con `npm run dev` o revisa el despliegue del backend.",
      { code: "API_UNREACHABLE" },
    );
  }

  await throwIfResNotOk(res);

  const contentType = getResponseContentType(res);
  if (contentType.includes("text/html")) {
    const rawBody = (await res.text()).trim();
    throw createApiError(
      "La API devolvió HTML en lugar de JSON. Inicia la app con `npm run dev` para levantar Express + frontend juntos.",
      {
        status: res.status,
        code: "API_RETURNED_HTML",
        rawBody,
      },
    );
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let res: Response;
    try {
      res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
      });
    } catch {
      throw createApiError(
        "No se pudo conectar con la API. Inicia la aplicación con `npm run dev` o revisa el despliegue del backend.",
        { code: "API_UNREACHABLE" },
      );
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return parseJsonResponse(res);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
