import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const createPatientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  phone: z.string().min(10).max(20),
  age: z.number().int().positive().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  blood_group: z.string().max(10).optional(),
  allergies: z.array(z.string()).optional(),
  comorbidities: z.array(z.string()).optional(),
  abha_id: z.string().max(50).optional(),
  emergency_contact_name: z.string().max(255).optional(),
  emergency_contact_phone: z.string().max(20).optional(),
});

const updatePatientSchema = createPatientSchema.partial();

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------
export async function search(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = (req.query.q as string) || '';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    let query = db('patients').where({ doctor_id: req.doctor.id });

    if (q) {
      query = query.where(function () {
        this.where('name', 'ILIKE', `%${q}%`)
          .orWhere('phone', 'ILIKE', `%${q}%`)
          .orWhere('id', 'ILIKE', `%${q}%`);
      });
    }

    const [{ count }] = await query.clone().count('* as count');
    const total = parseInt(count as string, 10);

    const patients = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    res.status(200).json({
      data: patients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function create(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const data = {
      ...parsed.data,
      allergies: parsed.data.allergies ? JSON.stringify(parsed.data.allergies) : '[]',
      comorbidities: parsed.data.comorbidities
        ? JSON.stringify(parsed.data.comorbidities)
        : '[]',
      doctor_id: req.doctor.id,
    };

    const [patient] = await db('patients').insert(data).returning('*');

    res.status(201).json(patient);
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
    const { id } = req.params;

    const patient = await db('patients')
      .where({ id, doctor_id: req.doctor.id })
      .first();

    if (!patient) {
      throw new AppError('Patient not found', 404, 'NOT_FOUND');
    }

    const [{ count }] = await db('consultations')
      .where({ patient_id: id })
      .count('* as count');

    res.status(200).json({
      ...patient,
      consultation_count: parseInt(count as string, 10),
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
    const { id } = req.params;

    const parsed = updatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const existing = await db('patients')
      .where({ id, doctor_id: req.doctor.id })
      .first();

    if (!existing) {
      throw new AppError('Patient not found', 404, 'NOT_FOUND');
    }

    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date() };
    if (updateData.allergies) {
      updateData.allergies = JSON.stringify(updateData.allergies);
    }
    if (updateData.comorbidities) {
      updateData.comorbidities = JSON.stringify(updateData.comorbidities);
    }

    const [updated] = await db('patients')
      .where({ id })
      .update(updateData)
      .returning('*');

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const patient = await db('patients')
      .where({ id, doctor_id: req.doctor.id })
      .first();

    if (!patient) {
      throw new AppError('Patient not found', 404, 'NOT_FOUND');
    }

    // Fetch consultations with nested data
    const consultations = await db('consultations')
      .where({ patient_id: id })
      .orderBy('started_at', 'desc');

    const consultationIds = consultations.map((c) => c.id);

    const [diagnoses, prescriptions, labOrders, vitals, labResults] = await Promise.all([
      consultationIds.length
        ? db('diagnoses').whereIn('consultation_id', consultationIds)
        : [],
      consultationIds.length
        ? db('prescriptions').whereIn('consultation_id', consultationIds)
        : [],
      consultationIds.length
        ? db('lab_orders').whereIn('consultation_id', consultationIds)
        : [],
      consultationIds.length
        ? db('vitals').whereIn('consultation_id', consultationIds).orderBy('recorded_at', 'desc')
        : [],
      db('lab_results').where({ patient_id: id }).orderBy('entered_at', 'desc'),
    ]);

    // Group by consultation
    const consultationsWithData = consultations.map((c) => ({
      ...c,
      diagnoses: (diagnoses as Array<Record<string, unknown>>).filter(
        (d) => d.consultation_id === c.id,
      ),
      prescriptions: (prescriptions as Array<Record<string, unknown>>).filter(
        (p) => p.consultation_id === c.id,
      ),
      lab_orders: (labOrders as Array<Record<string, unknown>>).filter(
        (l) => l.consultation_id === c.id,
      ),
      vitals: (vitals as Array<Record<string, unknown>>).filter(
        (v) => v.consultation_id === c.id,
      ),
    }));

    res.status(200).json({
      patient,
      consultations: consultationsWithData,
      lab_results: labResults,
    });
  } catch (err) {
    next(err);
  }
}
