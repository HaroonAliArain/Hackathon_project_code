import type { ApiErrorBody, User } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'emergencylink.session-token';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: ApiErrorBody['details'];

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error('Cannot reach the backend. Check that the API server is running.');
  }

  const contentType = response.headers.get('content-type') || '';
  const body: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const wrapped = body && typeof body === 'object' && 'error' in body
      ? (body as { error: ApiErrorBody }).error
      : undefined;
    if (response.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event('emergencylink:session-expired'));
    }
    throw new ApiError(response.status, wrapped);
  }

  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await apiRequest<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveToken(result.token);
  return result;
}

export function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/auth/me');
}
