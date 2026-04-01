// ──────────────────────────────────────────────────────────────────────────────
// Audit Logging Middleware – Tracks clinical actions for compliance
// ──────────────────────────────────────────────────────────────────────────────

import type { Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import type { AuthenticatedRequest } from '../types/index.js';

// Map HTTP method + route pattern to action name
function resolveAction(method: string, path: string): string | null {
  const m = method.toUpperCase();
  const p = path.replace(/\/[0-9a-f-]{36}/g, '/:id');

  const actionMap: Record<string, string> = {
    'POST /api/consultations': 'consultation.create',
    'PATCH /api/consultations/:id': 'consultation.update',
    'POST /api/consultations/:id/sign': 'consultation.sign',
    'POST /api/consultations/:id/prescription': 'prescription.create',
    'POST /api/consultations/:id/lab-orders': 'lab_order.create',
    'POST /api/consultations/:id/vitals': 'vitals.record',
    'POST /api/consultations/:id/diagnoses': 'diagnosis.add',
    'POST /api/consultations/:id/extract-entities': 'ai.extract_entities',
    'POST /api/consultations/:id/soap-note': 'ai.generate_soap',
    'POST /api/consultations/:id/run-safety-checks': 'safety_net.run_checks',
    'POST /api/consultations/:id/safety-net/:id/action': 'safety_net.doctor_action',
    'POST /api/consultations/:id/follow-ups': 'follow_up.create',
    'PATCH /api/consultations/:id/follow-ups/:id': 'follow_up.update',
    'POST /api/patients': 'patient.create',
    'PATCH /api/patients/:id': 'patient.update',
  };

  return actionMap[`${m} ${p}`] || null;
}

function extractEntityInfo(path: string): { entityType: string | null; entityId: string | null } {
  // Try to extract consultation ID or patient ID from the path
  const consultationMatch = path.match(/\/consultations\/([0-9a-f-]{36})/);
  if (consultationMatch) {
    return { entityType: 'consultation', entityId: consultationMatch[1] };
  }
  const patientMatch = path.match(/\/patients\/([0-9a-f-]{36})/);
  if (patientMatch) {
    return { entityType: 'patient', entityId: patientMatch[1] };
  }
  return { entityType: null, entityId: null };
}

/**
 * Audit logging middleware – logs write operations to audit_logs table.
 * Attach after authentication middleware.
 */
export function auditLog(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Only audit mutating requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    return next();
  }

  const action = resolveAction(req.method, req.path);
  if (!action) {
    return next();
  }

  // Log after response is sent (non-blocking)
  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    // Only log successful operations (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const { entityType, entityId } = extractEntityInfo(req.originalUrl || req.path);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '';

      db('audit_logs')
        .insert({
          doctor_id: req.doctor?.id || null,
          action,
          entity_type: entityType,
          entity_id: entityId,
          details: JSON.stringify({
            method: req.method,
            path: req.originalUrl || req.path,
            statusCode: res.statusCode,
          }),
          ip_address: ipAddress.substring(0, 50),
        })
        .catch((err) => {
          console.error('[audit] Failed to write audit log:', err.message);
        });
    }

    return originalEnd.apply(res, args);
  } as any;

  next();
}
