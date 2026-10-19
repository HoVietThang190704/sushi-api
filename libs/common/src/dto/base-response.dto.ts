export interface BaseResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  statusCode: number;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  path: string;
}
