import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const createConsultationSchema = z.object({
  patient_id: z.string().uuid('Invalid patient ID'),
  mode: z.enum(['quick', 'standard', 'comprehensive']).default('standard'),
});

const updateConsultationSchema = z.object({
  mode: z.enum(['quick', 'standard', 'comprehensive']).optional(),
  consultation_data: z.record(z.unknown()).optional(),
  transcript: z.string().optional(),
  soap_note: z.record(z.unknown()).optional(),
});

const prescriptionSchema = z.object({
  drugs: z.array(
    z.object({
      name: z.string().min(1),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      duration: z.string().optional(),
      route: z.string().optional(),
      instructions: z.string().optional(),
    }),
  ),
});

const labOrderSchema = z.object({
  orders: z.array(
    z.object({
      test_name: z.string().min(1),
      urgency: z.enum(['routine', 'urgent', 'stat']).default('routine'),
    }),
  ),
});

const vitalsSchema = z.object({
  bp_systolic: z.number().int().positive().optional(),
  bp_diastolic: z.number().int().positive().optional(),
  pulse: z.number().int().positive().optional(),
  temperature: z.number().positive().optional(),
  spo2: z.number().int().min(0).max(100).optional(),
  weight: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const diagnosisSchema = z.object({
  condition_name: z.string().min(1),
  icd10_code: z.string().max(20).optional(),
  tier: z.enum(['t1', 't2', 't3']).optional(),
  kbe_score: z.number().min(0).max(100).optional(),
  is_primary: z.boolean().default(false),
  doctor_confirmed: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function findConsultation(id: string, doctorId: string) {
  const consultation = await db('consultations').where({ id }).first();
  if (!consultation) {
    throw new AppError('Consultation not found', 404, 'NOT_FOUND');
  }
  if (consultation.doctor_id !== doctorId) {
    throw new AppError('Not authorized to access this consultation', 403, 'FORBIDDEN');
  }
  return consultation;
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------
export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    // Verify patient belongs to this doctor
    const patient = await db('patients')
      .where({ id: parsed.data.patient_id, doctor_id: req.doctor.id })
      .first();

    if (!patient) {
      throw new AppError('Patient not found', 404, 'NOT_FOUND');
    }

    const [consultation] = await db('consultations')
      .insert({
        patient_id: parsed.data.patient_id,
        doctor_id: req.doctor.id,
        mode: parsed.data.mode,
        status: 'active',
        started_at: new Date(),
      })
      .returning('*');

    res.status(201).json(consultation);
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    const [patient, diagnoses, prescriptions, labOrders, vitals, safetyNetAlerts, gapQuestions] =
      await Promise.all([
        db('patients').where({ id: consultation.patient_id }).first(),
        db('diagnoses').where({ consultation_id: consultation.id }),
        db('prescriptions').where({ consultation_id: consultation.id }),
        db('lab_orders').where({ consultation_id: consultation.id }),
        db('vitals').where({ consultation_id: consultation.id }),
        db('safety_net_alerts').where({ consultation_id: consultation.id }),
        db('gap_questions')
          .where({ consultation_id: consultation.id })
          .orderBy('information_gain_score', 'desc'),
      ]);

    res.status(200).json({
      ...consultation,
      patient,
      diagnoses,
      prescriptions,
      lab_orders: labOrders,
      vitals,
      safety_net_alerts: safetyNetAlerts,
      gap_questions: gapQuestions,
    });
  } catch (err) {
    next(err);
  }
}

export async function update(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    if (consultation.status === 'signed') {
      throw new AppError('Cannot update a signed consultation', 400, 'CONSULTATION_SIGNED');
    }

    const parsed = updateConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date() };
    if (updateData.consultation_data) {
      updateData.consultation_data = JSON.stringify(updateData.consultation_data);
    }
    if (updateData.soap_note) {
      updateData.soap_note = JSON.stringify(updateData.soap_note);
    }

    const [updated] = await db('consultations')
      .where({ id: consultation.id })
      .update(updateData)
      .returning('*');

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

export async function sign(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    if (consultation.status === 'signed') {
      throw new AppError('Consultation is already signed', 400, 'ALREADY_SIGNED');
    }

    const now = new Date();

    const [signed] = await db('consultations')
      .where({ id: consultation.id })
      .update({
        status: 'signed',
        ended_at: now,
        updated_at: now,
      })
      .returning('*');

    // Also sign any draft prescriptions
    await db('prescriptions')
      .where({ consultation_id: consultation.id, status: 'draft' })
      .update({ status: 'signed', signed_at: now, updated_at: now });

    res.status(200).json(signed);
  } catch (err) {
    next(err);
  }
}

export async function getSafetyNet(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await findConsultation(req.params.id, req.doctor.id);

    const alerts = await db('safety_net_alerts')
      .where({ consultation_id: req.params.id })
      .orderBy('created_at', 'desc');

    res.status(200).json(alerts);
  } catch (err) {
    next(err);
  }
}

export async function getGaps(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await findConsultation(req.params.id, req.doctor.id);

    const questions = await db('gap_questions')
      .where({ consultation_id: req.params.id })
      .orderBy('information_gain_score', 'desc');

    res.status(200).json(questions);
  } catch (err) {
    next(err);
  }
}

export async function createPrescription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    if (consultation.status === 'signed') {
      throw new AppError('Cannot modify a signed consultation', 400, 'CONSULTATION_SIGNED');
    }

    const parsed = prescriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    // Basic safety check stub
    const safetyCheckResult = {
      status: 'passed',
      warnings: [] as string[],
      checked_at: new Date().toISOString(),
    };

    // Upsert prescription: update if exists, otherwise insert
    const existing = await db('prescriptions')
      .where({ consultation_id: consultation.id })
      .first();

    let prescription;
    if (existing) {
      [prescription] = await db('prescriptions')
        .where({ id: existing.id })
        .update({
          drugs: JSON.stringify(parsed.data.drugs),
          safety_check_result: JSON.stringify(safetyCheckResult),
          updated_at: new Date(),
        })
        .returning('*');
    } else {
      [prescription] = await db('prescriptions')
        .insert({
          consultation_id: consultation.id,
          drugs: JSON.stringify(parsed.data.drugs),
          safety_check_result: JSON.stringify(safetyCheckResult),
          status: 'draft',
        })
        .returning('*');
    }

    res.status(existing ? 200 : 201).json(prescription);
  } catch (err) {
    next(err);
  }
}

export async function createLabOrders(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    if (consultation.status === 'signed') {
      throw new AppError('Cannot modify a signed consultation', 400, 'CONSULTATION_SIGNED');
    }

    const parsed = labOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const records = parsed.data.orders.map((order) => ({
      consultation_id: consultation.id,
      test_name: order.test_name,
      urgency: order.urgency,
      status: 'ordered',
    }));

    const labOrders = await db('lab_orders').insert(records).returning('*');

    res.status(201).json(labOrders);
  } catch (err) {
    next(err);
  }
}

export async function recordVitals(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    const parsed = vitalsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const data: Record<string, unknown> = {
      ...parsed.data,
      consultation_id: consultation.id,
      recorded_at: new Date(),
    };

    // Compute BMI if weight and height are provided
    if (parsed.data.weight && parsed.data.height) {
      const heightInMeters = parsed.data.height / 100;
      data.bmi = Math.round((parsed.data.weight / (heightInMeters * heightInMeters)) * 10) / 10;
    }

    const [vitals] = await db('vitals').insert(data).returning('*');

    res.status(201).json(vitals);
  } catch (err) {
    next(err);
  }
}

export async function addDiagnosis(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const consultation = await findConsultation(req.params.id, req.doctor.id);

    if (consultation.status === 'signed') {
      throw new AppError('Cannot modify a signed consultation', 400, 'CONSULTATION_SIGNED');
    }

    const parsed = diagnosisSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const [diagnosis] = await db('diagnoses')
      .insert({
        ...parsed.data,
        consultation_id: consultation.id,
      })
      .returning('*');

    res.status(201).json(diagnosis);
  } catch (err) {
    next(err);
  }
}
