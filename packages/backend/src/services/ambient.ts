// ──────────────────────────────────────────────────────────────────────────────
// Ambient Listening Service – Real-time Socket.io Handlers
// ──────────────────────────────────────────────────────────────────────────────

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { extractEntitiesFromChunk, extractClinicalEntities, generateSOAPNote } from './gemini.js';
import { db } from '../db/connection.js';

interface AmbientSession {
  consultationId: string;
  doctorId: string;
  transcriptChunks: string[];
  context: string;
  isRecording: boolean;
}

const activeSessions = new Map<string, AmbientSession>();

/**
 * Set up ambient listening Socket.io namespaces with real event handlers.
 */
export function setupAmbientHandlers(io: SocketIOServer): void {
  // ── /ambient/stream – Audio/transcript streaming ──────────────────────
  const ambientStream = io.of('/ambient/stream');
  ambientStream.on('connection', (socket: Socket) => {
    console.log(`[ambient/stream] client connected: ${socket.id}`);

    // Start a new ambient session for a consultation
    socket.on('start-session', (data: { consultationId: string; doctorId: string }) => {
      const session: AmbientSession = {
        consultationId: data.consultationId,
        doctorId: data.doctorId,
        transcriptChunks: [],
        context: '',
        isRecording: true,
      };
      activeSessions.set(socket.id, session);
      socket.join(`consultation:${data.consultationId}`);
      socket.emit('session-started', { consultationId: data.consultationId });
      console.log(`[ambient/stream] session started for consultation ${data.consultationId}`);
    });

    // Receive a transcript chunk (from browser speech-to-text or external ASR)
    socket.on('transcript-chunk', async (data: { text: string; isFinal: boolean }) => {
      const session = activeSessions.get(socket.id);
      if (!session || !session.isRecording) return;

      session.transcriptChunks.push(data.text);

      // Extract entities from this chunk in real-time
      try {
        const { entities, updatedContext } = await extractEntitiesFromChunk(
          data.text,
          session.context,
        );
        session.context = updatedContext;

        // Broadcast extracted entities to the consultation room
        const entitiesNs = io.of('/ambient/entities');
        entitiesNs.to(`consultation:${session.consultationId}`).emit('entities-update', {
          consultationId: session.consultationId,
          chunk: data.text,
          entities,
          isFinal: data.isFinal,
        });
      } catch (err) {
        console.error('[ambient/stream] entity extraction error:', err);
      }
    });

    // Stop recording and generate final transcript + SOAP note
    socket.on('stop-session', async () => {
      const session = activeSessions.get(socket.id);
      if (!session) return;

      session.isRecording = false;
      const fullTranscript = session.transcriptChunks.join(' ');

      try {
        // Extract all entities from the full transcript
        const entities = await extractClinicalEntities(fullTranscript);

        // Get consultation data for SOAP note
        const [consultation, diagnoses, prescriptions, labOrders, patient] = await Promise.all([
          db('consultations').where({ id: session.consultationId }).first(),
          db('diagnoses').where({ consultation_id: session.consultationId }),
          db('prescriptions').where({ consultation_id: session.consultationId }),
          db('lab_orders').where({ consultation_id: session.consultationId }),
          db('consultations')
            .join('patients', 'consultations.patient_id', 'patients.id')
            .where('consultations.id', session.consultationId)
            .select('patients.*')
            .first(),
        ]);

        // Generate SOAP note
        const soapNote = await generateSOAPNote({
          transcript: fullTranscript,
          entities,
          diagnoses,
          vitals: {},
          prescriptions,
          labOrders,
          patient,
        });

        // Persist transcript and SOAP note
        await db('consultations')
          .where({ id: session.consultationId })
          .update({
            transcript: fullTranscript,
            soap_note: JSON.stringify(soapNote),
            updated_at: new Date(),
          });

        // Notify client
        socket.emit('session-complete', {
          consultationId: session.consultationId,
          transcript: fullTranscript,
          entities,
          soapNote,
        });
      } catch (err) {
        console.error('[ambient/stream] session-complete error:', err);
        socket.emit('session-error', { error: 'Failed to process transcript' });
      } finally {
        activeSessions.delete(socket.id);
      }
    });

    socket.on('disconnect', () => {
      activeSessions.delete(socket.id);
      console.log(`[ambient/stream] client disconnected: ${socket.id}`);
    });
  });

  // ── /ambient/entities – Clients subscribe to entity updates ────────────
  const ambientEntities = io.of('/ambient/entities');
  ambientEntities.on('connection', (socket: Socket) => {
    console.log(`[ambient/entities] client connected: ${socket.id}`);

    socket.on('subscribe', (data: { consultationId: string }) => {
      socket.join(`consultation:${data.consultationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[ambient/entities] client disconnected: ${socket.id}`);
    });
  });

  // ── /kbe/live – Live KBE query events ──────────────────────────────────
  const kbeLive = io.of('/kbe/live');
  kbeLive.on('connection', (socket: Socket) => {
    console.log(`[kbe/live] client connected: ${socket.id}`);

    socket.on('subscribe', (data: { consultationId: string }) => {
      socket.join(`consultation:${data.consultationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[kbe/live] client disconnected: ${socket.id}`);
    });
  });

  // ── /safety-net/alerts – Real-time safety alerts ───────────────────────
  const safetyNetAlerts = io.of('/safety-net/alerts');
  safetyNetAlerts.on('connection', (socket: Socket) => {
    console.log(`[safety-net/alerts] client connected: ${socket.id}`);

    socket.on('subscribe', (data: { consultationId: string }) => {
      socket.join(`consultation:${data.consultationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[safety-net/alerts] client disconnected: ${socket.id}`);
    });
  });
}

/**
 * Broadcast safety-net alerts to a consultation room.
 */
export function broadcastSafetyAlerts(
  io: SocketIOServer,
  consultationId: string,
  alerts: Array<{ signal: string; category: string; message: string }>,
): void {
  io.of('/safety-net/alerts')
    .to(`consultation:${consultationId}`)
    .emit('alerts-update', { consultationId, alerts });
}

/**
 * Broadcast KBE scoring results to a consultation room.
 */
export function broadcastKBEResults(
  io: SocketIOServer,
  consultationId: string,
  results: unknown,
): void {
  io.of('/kbe/live')
    .to(`consultation:${consultationId}`)
    .emit('kbe-update', { consultationId, results });
}
