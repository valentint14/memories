export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      archive_jobs: {
        Row: {
          archive_path: string | null
          completed_at: string | null
          created_at: string
          event_id: string
          expires_at: string | null
          file_count: number | null
          id: string
          requested_by: string | null
          skipped_count: number | null
          status: Database["public"]["Enums"]["archive_status"]
          total_bytes: number | null
        }
        Insert: {
          archive_path?: string | null
          completed_at?: string | null
          created_at?: string
          event_id: string
          expires_at?: string | null
          file_count?: number | null
          id?: string
          requested_by?: string | null
          skipped_count?: number | null
          status?: Database["public"]["Enums"]["archive_status"]
          total_bytes?: number | null
        }
        Update: {
          archive_path?: string | null
          completed_at?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string | null
          file_count?: number | null
          id?: string
          requested_by?: string | null
          skipped_count?: number | null
          status?: Database["public"]["Enums"]["archive_status"]
          total_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "archive_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "organizer_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_retention_changes: {
        Row: {
          actor_kind: Database["public"]["Enums"]["retention_actor"]
          actor_user_id: string | null
          created_at: string
          event_id: string
          from_final_price_minor: number | null
          from_months: number | null
          id: number
          to_final_price_minor: number
          to_months: number
          to_purge_at: string
        }
        Insert: {
          actor_kind: Database["public"]["Enums"]["retention_actor"]
          actor_user_id?: string | null
          created_at?: string
          event_id: string
          from_final_price_minor?: number | null
          from_months?: number | null
          id?: never
          to_final_price_minor: number
          to_months: number
          to_purge_at: string
        }
        Update: {
          actor_kind?: Database["public"]["Enums"]["retention_actor"]
          actor_user_id?: string | null
          created_at?: string
          event_id?: string
          from_final_price_minor?: number | null
          from_months?: number | null
          id?: never
          to_final_price_minor?: number
          to_months?: number
          to_purge_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_retention_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_retention_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "organizer_events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          anonymized_at: string | null
          base_price_minor: number
          created_at: string
          event_date: string
          expired_at: string | null
          final_price_minor: number | null
          id: string
          max_files_per_guest: number
          max_photo_bytes: number
          max_video_bytes: number
          name: string | null
          organizer_email: string | null
          public_token: string
          purge_at: string
          retention_months: number
          retention_option_id: string
          retention_surcharge_minor: number
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
          upload_ends_at: string
          upload_starts_at: string
        }
        Insert: {
          anonymized_at?: string | null
          base_price_minor: number
          created_at?: string
          event_date: string
          expired_at?: string | null
          final_price_minor?: number | null
          id?: string
          max_files_per_guest?: number
          max_photo_bytes?: number
          max_video_bytes?: number
          name?: string | null
          organizer_email?: string | null
          public_token?: string
          purge_at?: string
          retention_months?: number
          retention_option_id: string
          retention_surcharge_minor?: number
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          upload_ends_at: string
          upload_starts_at: string
        }
        Update: {
          anonymized_at?: string | null
          base_price_minor?: number
          created_at?: string
          event_date?: string
          expired_at?: string | null
          final_price_minor?: number | null
          id?: string
          max_files_per_guest?: number
          max_photo_bytes?: number
          max_video_bytes?: number
          name?: string | null
          organizer_email?: string | null
          public_token?: string
          purge_at?: string
          retention_months?: number
          retention_option_id?: string
          retention_surcharge_minor?: number
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          upload_ends_at?: string
          upload_starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_retention_option_id_fkey"
            columns: ["retention_option_id"]
            isOneToOne: false
            referencedRelation: "retention_options"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          created_at: string
          display_name: string | null
          event_id: string
          files_reserved: number
          id: string
          last_seen_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          event_id: string
          files_reserved?: number
          id?: string
          last_seen_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          event_id?: string
          files_reserved?: number
          id?: string
          last_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "organizer_events"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          actual_bytes: number | null
          created_at: string
          declared_bytes: number
          declared_mime: string
          detected_mime: string | null
          display_path: string | null
          duration_ms: number | null
          event_id: string
          guest_name: string | null
          guest_session_id: string
          height: number | null
          id: string
          incoming_path: string
          kind: Database["public"]["Enums"]["media_kind"]
          original_filename: string
          original_path: string | null
          playback_path: string | null
          processing_error: string | null
          status: Database["public"]["Enums"]["media_status"]
          thumb_path: string | null
          updated_at: string
          uploaded_at: string | null
          width: number | null
        }
        Insert: {
          actual_bytes?: number | null
          created_at?: string
          declared_bytes: number
          declared_mime: string
          detected_mime?: string | null
          display_path?: string | null
          duration_ms?: number | null
          event_id: string
          guest_name?: string | null
          guest_session_id: string
          height?: number | null
          id?: string
          incoming_path: string
          kind: Database["public"]["Enums"]["media_kind"]
          original_filename: string
          original_path?: string | null
          playback_path?: string | null
          processing_error?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          thumb_path?: string | null
          updated_at?: string
          uploaded_at?: string | null
          width?: number | null
        }
        Update: {
          actual_bytes?: number | null
          created_at?: string
          declared_bytes?: number
          declared_mime?: string
          detected_mime?: string | null
          display_path?: string | null
          duration_ms?: number | null
          event_id?: string
          guest_name?: string | null
          guest_session_id?: string
          height?: number | null
          id?: string
          incoming_path?: string
          kind?: Database["public"]["Enums"]["media_kind"]
          original_filename?: string
          original_path?: string | null
          playback_path?: string | null
          processing_error?: string | null
          status?: Database["public"]["Enums"]["media_status"]
          thumb_path?: string | null
          updated_at?: string
          uploaded_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "organizer_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket_key: string
          count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      retention_notices: {
        Row: {
          enqueued_at: string
          event_id: string
          failed_at: string | null
          purge_at: string
          sent_at: string | null
          threshold: Database["public"]["Enums"]["notice_threshold"]
        }
        Insert: {
          enqueued_at?: string
          event_id: string
          failed_at?: string | null
          purge_at: string
          sent_at?: string | null
          threshold: Database["public"]["Enums"]["notice_threshold"]
        }
        Update: {
          enqueued_at?: string
          event_id?: string
          failed_at?: string | null
          purge_at?: string
          sent_at?: string | null
          threshold?: Database["public"]["Enums"]["notice_threshold"]
        }
        Relationships: [
          {
            foreignKeyName: "retention_notices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_notices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "organizer_events"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_options: {
        Row: {
          active: boolean
          created_at: string
          id: string
          months: number
          surcharge_minor: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          months: number
          surcharge_minor: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          months?: number
          surcharge_minor?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      organizer_events: {
        Row: {
          event_date: string | null
          expired_at: string | null
          final_price_minor: number | null
          id: string | null
          name: string | null
          purge_at: string | null
          retention_months: number | null
          status: Database["public"]["Enums"]["event_status"] | null
          upload_ends_at: string | null
          upload_starts_at: string | null
        }
        Insert: {
          event_date?: string | null
          expired_at?: string | null
          final_price_minor?: number | null
          id?: string | null
          name?: string | null
          purge_at?: string | null
          retention_months?: number | null
          status?: Database["public"]["Enums"]["event_status"] | null
          upload_ends_at?: string | null
          upload_starts_at?: string | null
        }
        Update: {
          event_date?: string | null
          expired_at?: string | null
          final_price_minor?: number | null
          id?: string | null
          name?: string | null
          purge_at?: string | null
          retention_months?: number | null
          status?: Database["public"]["Enums"]["event_status"] | null
          upload_ends_at?: string | null
          upload_starts_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_event_stats: {
        Args: { p_event_id?: string }
        Returns: {
          event_id: string
          file_count: number
          total_bytes: number
        }[]
      }
      admin_event_token: { Args: { p_event_id: string }; Returns: string }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window: string }
        Returns: boolean
      }
      event_organizer_email: { Args: { p_event_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_platform_admin_user: { Args: never; Returns: boolean }
      organizer_owns_active_event: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      orphan_organizer_user_id: { Args: { p_email: string }; Returns: string }
      raise_app_error: {
        Args: { p_code: string; p_detail?: Json }
        Returns: undefined
      }
      rate_limit_retry_after: { Args: { p_window: string }; Returns: number }
      request_event_deletion: {
        Args: { p_confirm_name: string; p_event_id: string }
        Returns: undefined
      }
    }
    Enums: {
      archive_status: "pending" | "building" | "ready" | "failed" | "expired"
      event_status: "active" | "expiring" | "expired" | "deleting"
      media_kind: "photo" | "video"
      media_status:
        | "reserved"
        | "uploaded"
        | "processing"
        | "ready"
        | "failed"
        | "rejected"
        | "deleting"
      notice_threshold: "30d" | "7d" | "1d"
      retention_actor: "admin" | "organizer" | "system"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      archive_status: ["pending", "building", "ready", "failed", "expired"],
      event_status: ["active", "expiring", "expired", "deleting"],
      media_kind: ["photo", "video"],
      media_status: [
        "reserved",
        "uploaded",
        "processing",
        "ready",
        "failed",
        "rejected",
        "deleting",
      ],
      notice_threshold: ["30d", "7d", "1d"],
      retention_actor: ["admin", "organizer", "system"],
    },
  },
} as const

