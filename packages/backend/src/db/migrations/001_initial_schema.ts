import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable uuid-ossp extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // 1. clinics (created before doctors so FK can reference it)
  await knex.schema.createTable('clinics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.varchar('name', 255).notNullable();
    table.text('address');
    table.varchar('city', 100);
    table.varchar('state', 100);
    table.varchar('type', 50);
    table.varchar('abdm_facility_id', 100);
    table.varchar('gst_number', 20);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("type IN ('gp','multi_specialty','single_specialty')");
  });

  // 2. doctors
  await knex.schema.createTable('doctors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.varchar('name', 255).notNullable();
    table.varchar('specialization', 100);
    table.varchar('registration_number', 100).unique().notNullable();
    table.uuid('clinic_id').references('id').inTable('clinics').onDelete('SET NULL');
    table.varchar('phone', 20).unique().notNullable();
    table.varchar('email', 255).unique();
    table.varchar('password_hash', 255);
    table.jsonb('preferences').defaultTo('{}');
    table.varchar('subscription_tier', 20).defaultTo('starter');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("subscription_tier IN ('starter','professional','premium','enterprise')");
  });

  // 3. patients
  await knex.schema.createTable('patients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.varchar('name', 255).notNullable();
    table.integer('age');
    table.date('date_of_birth');
    table.varchar('gender', 20);
    table.varchar('phone', 20).notNullable();
    table.varchar('abha_id', 50).unique();
    table.varchar('cureocity_client_id', 100);
    table.varchar('blood_group', 10);
    table.jsonb('allergies').defaultTo('[]');
    table.jsonb('comorbidities').defaultTo('[]');
    table.varchar('emergency_contact_name', 255);
    table.varchar('emergency_contact_phone', 20);
    table.uuid('doctor_id').notNullable().references('id').inTable('doctors').onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('phone');
    table.index('doctor_id');
    table.check("gender IN ('male','female','other')");
  });

  // 4. consultations
  await knex.schema.createTable('consultations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('CASCADE');
    table.uuid('doctor_id').notNullable().references('id').inTable('doctors').onDelete('CASCADE');
    table.varchar('mode', 20).defaultTo('standard');
    table.varchar('status', 20).defaultTo('active');
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('ended_at', { useTz: true });
    table.text('audio_recording_url');
    table.text('transcript');
    table.jsonb('consultation_data').defaultTo('{}');
    table.jsonb('soap_note');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('patient_id');
    table.index('doctor_id');
    table.index('status');
    table.check("mode IN ('quick','standard','comprehensive')");
    table.check("status IN ('active','completed','signed')");
  });

  // 5. diagnoses
  await knex.schema.createTable('diagnoses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.varchar('condition_name', 255).notNullable();
    table.varchar('icd10_code', 20);
    table.varchar('tier', 5);
    table.decimal('kbe_score', 5, 2);
    table.boolean('is_primary').defaultTo(false);
    table.boolean('doctor_confirmed').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("tier IN ('t1','t2','t3')");
  });

  // 6. prescriptions
  await knex.schema.createTable('prescriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.varchar('status', 20).defaultTo('draft');
    table.jsonb('drugs').defaultTo('[]');
    table.jsonb('safety_check_result');
    table.timestamp('signed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("status IN ('draft','signed','dispensed')");
  });

  // 7. lab_orders
  await knex.schema.createTable('lab_orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.varchar('test_name', 255).notNullable();
    table.varchar('urgency', 20).defaultTo('routine');
    table.varchar('status', 20).defaultTo('ordered');
    table.varchar('result_value', 100);
    table.varchar('result_unit', 50);
    table.varchar('reference_range', 100);
    table.varchar('interpreted_status', 20);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("urgency IN ('routine','urgent','stat')");
    table.check("status IN ('ordered','collected','resulted')");
  });

  // 8. lab_results
  await knex.schema.createTable('lab_results', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('CASCADE');
    table.uuid('consultation_id').references('id').inTable('consultations').onDelete('SET NULL');
    table.varchar('test_name', 255).notNullable();
    table.varchar('value', 100);
    table.varchar('unit', 50);
    table.decimal('ref_low');
    table.decimal('ref_high');
    table.varchar('status', 20);
    table.timestamp('entered_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("status IN ('normal','low','high','critical')");
  });

  // 9. vitals
  await knex.schema.createTable('vitals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.integer('bp_systolic');
    table.integer('bp_diastolic');
    table.integer('pulse');
    table.decimal('temperature', 4, 1);
    table.integer('spo2');
    table.decimal('weight', 5, 1);
    table.decimal('height', 5, 1);
    table.decimal('bmi', 4, 1);
    table.timestamp('recorded_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // 10. safety_net_alerts
  await knex.schema.createTable('safety_net_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.varchar('signal', 10).notNullable();
    table.varchar('category', 50).notNullable();
    table.text('message').notNullable();
    table.jsonb('evidence').defaultTo('{}');
    table.varchar('doctor_action', 20);
    table.text('override_reason');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("signal IN ('green','yellow','red')");
    table.check("category IN ('missed_diagnosis','drug_interaction','missing_investigation','red_flag','guideline_adherence')");
    table.check("doctor_action IN ('accepted','dismissed','overridden')");
  });

  // 11. gap_questions
  await knex.schema.createTable('gap_questions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.text('question_text').notNullable();
    table.jsonb('target_conditions').defaultTo('[]');
    table.decimal('information_gain_score', 5, 2);
    table.varchar('status', 20).defaultTo('unanswered');
    table.timestamp('answered_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("status IN ('unanswered','answered_yes','answered_no','not_applicable')");
  });

  // 12. follow_ups
  await knex.schema.createTable('follow_ups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('consultation_id').notNullable().references('id').inTable('consultations').onDelete('CASCADE');
    table.uuid('patient_id').notNullable().references('id').inTable('patients').onDelete('CASCADE');
    table.uuid('doctor_id').notNullable().references('id').inTable('doctors').onDelete('CASCADE');
    table.date('scheduled_date').notNullable();
    table.boolean('reminder_sent').defaultTo(false);
    table.varchar('status', 20).defaultTo('scheduled');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.check("status IN ('scheduled','completed','missed','cancelled')");
  });

  // 13. audit_logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('doctor_id').references('id').inTable('doctors').onDelete('SET NULL');
    table.varchar('action', 100).notNullable();
    table.varchar('entity_type', 50);
    table.uuid('entity_id');
    table.jsonb('details').defaultTo('{}');
    table.varchar('ip_address', 50);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('doctor_id');
    table.index(['entity_type', 'entity_id']);
    table.index('created_at');
  });

  // 14. otp_codes
  await knex.schema.createTable('otp_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.varchar('phone', 20).notNullable();
    table.varchar('code', 10).notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('used').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['phone', 'code']);
  });

  // 15. refresh_tokens
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('doctor_id').notNullable().references('id').inTable('doctors').onDelete('CASCADE');
    table.varchar('token', 500).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('revoked').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index('token');
    table.index('doctor_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('follow_ups');
  await knex.schema.dropTableIfExists('gap_questions');
  await knex.schema.dropTableIfExists('safety_net_alerts');
  await knex.schema.dropTableIfExists('vitals');
  await knex.schema.dropTableIfExists('lab_results');
  await knex.schema.dropTableIfExists('lab_orders');
  await knex.schema.dropTableIfExists('prescriptions');
  await knex.schema.dropTableIfExists('diagnoses');
  await knex.schema.dropTableIfExists('consultations');
  await knex.schema.dropTableIfExists('patients');
  await knex.schema.dropTableIfExists('doctors');
  await knex.schema.dropTableIfExists('clinics');
}
