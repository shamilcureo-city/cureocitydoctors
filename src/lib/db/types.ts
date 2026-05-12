/**
 * Hand-rolled types for the Supabase schema in supabase/migrations/0001_initial.sql.
 * Replace with `supabase gen types typescript` output once the CLI is wired up.
 */

export type ClinicRole = "owner" | "admin" | "doctor";
export type ConsultStatus =
  | "draft"
  | "recording"
  | "transcribing"
  | "review"
  | "finalized"
  | "cancelled";
export type ConsentKind = "recording" | "data_processing" | "sharing";
export type RegionCode = "IN" | "AE" | "SA" | "QA" | "KW" | "BH" | "OM";

export type SoapNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type PrescriptionItem = {
  drug: string;
  strength?: string;
  form?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
};

export type Prescription = {
  items: PrescriptionItem[];
  advice?: string;
  follow_up?: string;
};

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      clinics: {
        Row: {
          id: string;
          name: string;
          region: RegionCode;
          country: string | null;
          city: string | null;
          registration_number: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          region?: RegionCode;
          country?: string | null;
          city?: string | null;
          registration_number?: string | null;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["clinics"]["Insert"]>;
        Relationships: [];
      };
      clinic_members: {
        Row: {
          clinic_id: string;
          user_id: string;
          role: ClinicRole;
          invited_by: string | null;
          joined_at: string;
        };
        Insert: {
          clinic_id: string;
          user_id: string;
          role?: ClinicRole;
          invited_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clinic_members"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          id: string;
          clinic_id: string;
          mrn: string | null;
          full_name: string;
          date_of_birth: string | null;
          sex: "male" | "female" | "other" | "unspecified" | null;
          phone: string | null;
          email: string | null;
          preferred_language: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          mrn?: string | null;
          full_name: string;
          date_of_birth?: string | null;
          sex?: "male" | "female" | "other" | "unspecified" | null;
          phone?: string | null;
          email?: string | null;
          preferred_language?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["patients"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      consultations: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          doctor_id: string;
          status: ConsultStatus;
          chief_complaint: string | null;
          audio_path: string | null;
          audio_duration_seconds: number | null;
          language: string | null;
          transcript: string | null;
          soap: SoapNote | null;
          prescription: Prescription | null;
          doctor_notes: string | null;
          started_at: string | null;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          doctor_id: string;
          status?: ConsultStatus;
          chief_complaint?: string | null;
          audio_path?: string | null;
          audio_duration_seconds?: number | null;
          language?: string | null;
          transcript?: string | null;
          soap?: SoapNote | null;
          prescription?: Prescription | null;
          doctor_notes?: string | null;
          started_at?: string | null;
          finalized_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["consultations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "consultations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_records: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          consultation_id: string | null;
          kind: ConsentKind;
          language: string | null;
          text_shown: string;
          agreed: boolean;
          captured_audio_path: string | null;
          captured_by: string | null;
          captured_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          consultation_id?: string | null;
          kind: ConsentKind;
          language?: string | null;
          text_shown: string;
          agreed: boolean;
          captured_audio_path?: string | null;
          captured_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["consent_records"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: number;
          clinic_id: string | null;
          actor_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          clinic_id?: string | null;
          actor_id?: string | null;
          action: string;
          target_table?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_clinic_member: {
        Args: { p_clinic: string };
        Returns: boolean;
      };
      is_clinic_admin: {
        Args: { p_clinic: string };
        Returns: boolean;
      };
    };
    Enums: {
      clinic_role: ClinicRole;
      consult_status: ConsultStatus;
      consent_kind: ConsentKind;
      region_code: RegionCode;
    };
    CompositeTypes: Record<string, never>;
  };
};
