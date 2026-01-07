// Centralized error types for the proxy

export enum ProxyErrorType {
  // Retryable errors
  ServerOverload = 'SERVER_OVERLOAD',      // 503, 529
  RateLimit = 'RATE_LIMIT',                // 429
  Timeout = 'TIMEOUT',                     // 408, request timeout

  // Non-retryable errors
  InvalidRequest = 'INVALID_REQUEST',      // 400
  Unauthorized = 'UNAUTHORIZED',           // 401
  Forbidden = 'FORBIDDEN',                 // 403
  NotFound = 'NOT_FOUND',                  // 404

  // Internal errors
  MappingError = 'MAPPING_ERROR',
  AccountError = 'ACCOUNT_ERROR',
  NetworkError = 'NETWORK_ERROR',
  StreamError = 'STREAM_ERROR',
}

export class ProxyError extends Error {
  public readonly type: ProxyErrorType;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly retryAfter?: number; // seconds

  constructor(
    type: ProxyErrorType,
    message: string,
    options?: {
      statusCode?: number;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ProxyError';
    this.type = type;
    this.retryAfter = options?.retryAfter;
    this.statusCode = options?.statusCode ?? ProxyError.typeToStatusCode(type);
    this.retryable = ProxyError.isRetryable(type);
  }

  static typeToStatusCode(type: ProxyErrorType): number {
    switch (type) {
      case ProxyErrorType.ServerOverload: return 503;
      case ProxyErrorType.RateLimit: return 429;
      case ProxyErrorType.Timeout: return 408;
      case ProxyErrorType.InvalidRequest: return 400;
      case ProxyErrorType.Unauthorized: return 401;
      case ProxyErrorType.Forbidden: return 403;
      case ProxyErrorType.NotFound: return 404;
      case ProxyErrorType.MappingError: return 500;
      case ProxyErrorType.AccountError: return 503;
      case ProxyErrorType.NetworkError: return 502;
      case ProxyErrorType.StreamError: return 500;
      default: return 500;
    }
  }

  static isRetryable(type: ProxyErrorType): boolean {
    return [
      ProxyErrorType.ServerOverload,
      ProxyErrorType.RateLimit,
      ProxyErrorType.Timeout,
      ProxyErrorType.NetworkError,
    ].includes(type);
  }

  static fromHttpStatus(status: number, message: string, retryAfter?: number): ProxyError {
    let type: ProxyErrorType;
    switch (status) {
      case 400: type = ProxyErrorType.InvalidRequest; break;
      case 401: type = ProxyErrorType.Unauthorized; break;
      case 403: type = ProxyErrorType.Forbidden; break;
      case 404: type = ProxyErrorType.NotFound; break;
      case 408: type = ProxyErrorType.Timeout; break;
      case 429: type = ProxyErrorType.RateLimit; break;
      case 503:
      case 529: type = ProxyErrorType.ServerOverload; break;
      default: type = status >= 500 ? ProxyErrorType.ServerOverload : ProxyErrorType.NetworkError;
    }
    return new ProxyError(type, message, { statusCode: status, retryAfter });
  }

  toJSON() {
    return {
      type: this.type,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
    };
  }
}

// Format error for OpenAI API response
export function formatOpenAIError(error: ProxyError | Error) {
  const proxyError = error instanceof ProxyError
    ? error
    : new ProxyError(ProxyErrorType.NetworkError, error.message);

  return {
    error: {
      message: proxyError.message,
      type: proxyError.type.toLowerCase(),
      code: proxyError.statusCode,
    },
  };
}

// Format error for Claude API response
export function formatClaudeError(error: ProxyError | Error) {
  const proxyError = error instanceof ProxyError
    ? error
    : new ProxyError(ProxyErrorType.NetworkError, error.message);

  const typeMap: Record<ProxyErrorType, string> = {
    [ProxyErrorType.InvalidRequest]: 'invalid_request_error',
    [ProxyErrorType.Unauthorized]: 'authentication_error',
    [ProxyErrorType.Forbidden]: 'permission_error',
    [ProxyErrorType.NotFound]: 'not_found_error',
    [ProxyErrorType.RateLimit]: 'rate_limit_error',
    [ProxyErrorType.ServerOverload]: 'overloaded_error',
    [ProxyErrorType.Timeout]: 'timeout_error',
    [ProxyErrorType.MappingError]: 'api_error',
    [ProxyErrorType.AccountError]: 'api_error',
    [ProxyErrorType.NetworkError]: 'api_error',
    [ProxyErrorType.StreamError]: 'api_error',
  };

  return {
    type: 'error',
    error: {
      type: typeMap[proxyError.type] || 'api_error',
      message: proxyError.message,
    },
  };
}

// Exponential backoff with jitter
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.2; // ±20% jitter
  const delay = exponentialDelay * (1 + jitter - 0.1); // Center jitter around 1.0
  return Math.min(delay, maxDelayMs);
}

// Sleep helper
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
