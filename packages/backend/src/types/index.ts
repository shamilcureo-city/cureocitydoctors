import type { Request } from 'express';

export interface DoctorPayload {
  id: string;
  phone: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  doctor: DoctorPayload;
  // Explicitly inherit body/params/query from Request – these are already
  // on the base type, but redeclaring avoids TS narrowing issues when the
  // controller signature uses AuthenticatedRequest directly.
  body: any;            // eslint-disable-line @typescript-eslint/no-explicit-any
  params: any;          // eslint-disable-line @typescript-eslint/no-explicit-any
  query: any;           // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
