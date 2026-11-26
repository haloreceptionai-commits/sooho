export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      facebook_connections: {
        Row: {
          created_at: string
          page_access_token: string
          page_id: string
          page_name: string
          updated_at: string
          user_access_token: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          page_access_token: string
          page_id: string
          page_name: string
          updated_at?: string
          user_access_token?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          updated_at?: string
          user_access_token?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          created_at: string
          error: string | null
          expires_at: string
          fence: number
          id: string
          lease_owner: string | null
          lease_until: string | null
          recovery_count: number
          request: Json
          run_id: string | null
          status: string
          token_hash: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          expires_at: string
          fence?: number
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          recovery_count?: number
          request: Json
          run_id?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          expires_at?: string
          fence?: number
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          recovery_count?: number
          request?: Json
          run_id?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_steps: {
        Row: {
          created_at: string
          error: string | null
          fence: number
          input_hash: string
          job_id: string
          result: Json | null
          retries: number
          status: string
          step_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          fence: number
          input_hash: string
          job_id: string
          result?: Json | null
          retries?: number
          status: string
          step_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          fence?: number
          input_hash?: string
          job_id?: string
          result?: Json | null
          retries?: number
          status?: string
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          created_at: string
          error: string | null
          expires_at: string
          id: string
          manifest: Json
          output_path: string
          recovery: Json
          run_id: string | null
          status: string
          token_hash: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          expires_at: string
          id?: string
          manifest: Json
          output_path: string
          recovery?: Json
          run_id?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          expires_at?: string
          id?: string
          manifest?: Json
          output_path?: string
          recovery?: Json
          run_id?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_discoveries: {
        Row: {
          batch_id: string
          created_at: string
          data: Json
          fact_key: string
          id: string
          saved: boolean
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          data: Json
          fact_key: string
          id?: string
          saved?: boolean
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          data?: Json
          fact_key?: string
          id?: string
          saved?: boolean
          user_id?: string
        }
        Relationships: []
      }
      video_automation: {
        Row: {
          enabled: boolean
          focus: string
          formats: string[]
          last_checked_at: string | null
          long_seconds: number
          long_time: string
          paused_reason: string | null
          posting_verified_at: string | null
          posting_verified_youtube_id: string | null
          settings: Json
          short_seconds: number
          short_time: string
          timezone: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          enabled?: boolean
          focus?: string
          formats?: string[]
          last_checked_at?: string | null
          long_seconds?: number
          long_time?: string
          paused_reason?: string | null
          posting_verified_at?: string | null
          posting_verified_youtube_id?: string | null
          settings?: Json
          short_seconds?: number
          short_time?: string
          timezone?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          enabled?: boolean
          focus?: string
          formats?: string[]
          last_checked_at?: string | null
          long_seconds?: number
          long_time?: string
          paused_reason?: string | null
          posting_verified_at?: string | null
          posting_verified_youtube_id?: string | null
          settings?: Json
          short_seconds?: number
          short_time?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_automation_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      video_automation_runs: {
        Row: {
          created_at: string
          error: string | null
          fence: number
          format: string
          generate_at: string
          generation_job_id: string | null
          id: string
          lease_owner: string | null
          lease_until: string | null
          local_date: string
          private_test: boolean
          publish_at: string
          status: string
          updated_at: string
          upload_mime: string | null
          upload_offset: number
          upload_size: number | null
          upload_url: string | null
          user_id: string
          video_id: string
          workspace_id: string
          youtube_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          fence?: number
          format: string
          generate_at: string
          generation_job_id?: string | null
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          local_date: string
          private_test?: boolean
          publish_at: string
          status?: string
          updated_at?: string
          upload_mime?: string | null
          upload_offset?: number
          upload_size?: number | null
          upload_url?: string | null
          user_id: string
          video_id: string
          workspace_id: string
          youtube_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          fence?: number
          format?: string
          generate_at?: string
          generation_job_id?: string | null
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          local_date?: string
          private_test?: boolean
          publish_at?: string
          status?: string
          updated_at?: string
          upload_mime?: string | null
          upload_offset?: number
          upload_size?: number | null
          upload_url?: string | null
          user_id?: string
          video_id?: string
          workspace_id?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_automation_runs_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_automation_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_automation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "video_automation"
            referencedColumns: ["workspace_id"]
          },
        ]
      }
      video_automation_runtime: {
        Row: {
          key: string
          last_checked_at: string | null
          lease_owner: string | null
          lease_until: string | null
        }
        Insert: {
          key: string
          last_checked_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
        }
        Update: {
          key?: string
          last_checked_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      video_step_locks: {
        Row: {
          expires_at: string
          holder: string
          stage: string
          started_at: string
          step: string
          user_id: string
          video_id: string
        }
        Insert: {
          expires_at: string
          holder: string
          stage?: string
          started_at?: string
          step: string
          user_id?: string
          video_id: string
        }
        Update: {
          expires_at?: string
          holder?: string
          stage?: string
          started_at?: string
          step?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          data: Json
          file_path: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          file_path?: string | null
          id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          file_path?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_connections: {
        Row: {
          auto_reply: boolean
          channel_id: string | null
          channel_title: string | null
          last_auto_reply_at: string | null
          refresh_token: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          auto_reply?: boolean
          channel_id?: string | null
          channel_title?: string | null
          last_auto_reply_at?: string | null
          refresh_token: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          auto_reply?: boolean
          channel_id?: string | null
          channel_title?: string | null
          last_auto_reply_at?: string | null
          refresh_token?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_replies: {
        Row: {
          author: string | null
          comment: string | null
          comment_id: string
          created_at: string
          reply: string
          user_id: string
          video_id: string | null
          workspace_id: string | null
        }
        Insert: {
          author?: string | null
          comment?: string | null
          comment_id: string
          created_at?: string
          reply: string
          user_id: string
          video_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          author?: string | null
          comment?: string | null
          comment_id?: string
          created_at?: string
          reply?: string
          user_id?: string
          video_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_render_event: {
        Args: {
          job_id: string
          job_token: string
          next_status: string
          saved_path: string
          video_patch: Json
        }
        Returns: boolean
      }
      approve_cartoon_render: {
        Args: {
          job_id: string
          next_token_hash: string
          owner_id: string
          review_hash: string
        }
        Returns: boolean
      }
      begin_generation_step: {
        Args: {
          p_fence: number
          p_hash: string
          p_input_hash: string
          p_job: string
          p_key: string
          p_owner: string
        }
        Returns: string
      }
      cancel_generation_job: {
        Args: { p_job: string; p_user: string }
        Returns: boolean
      }
      cancel_render_job: {
        Args: { job_id: string; owner_id: string }
        Returns: boolean
      }
      claim_generation_job: {
        Args: { p_hash: string; p_job: string; p_owner: string }
        Returns: number
      }
      claim_video_automation_tick: {
        Args: { p_owner: string }
        Returns: boolean
      }
      claim_video_automation_upload: {
        Args: { p_owner: string; p_run: string }
        Returns: number
      }
      claim_video_step: {
        Args: {
          _holder: string
          _stage: string
          _step: string
          _ttl_seconds: number
          _video_id: string
        }
        Returns: {
          expires_at: string
          holder: string
          stage: string
          started_at: string
        }[]
      }
      complete_generation_step: {
        Args: {
          p_fence: number
          p_hash: string
          p_input_hash: string
          p_job: string
          p_key: string
          p_owner: string
          p_result: Json
        }
        Returns: boolean
      }
      complete_video_automation_upload: {
        Args: {
          p_fence: number
          p_owner: string
          p_run: string
          p_youtube: string
        }
        Returns: boolean
      }
      ensure_default_workspace: { Args: never; Returns: string }
      expire_render_jobs: { Args: never; Returns: undefined }
      handoff_generation_job: {
        Args: {
          p_fence: number
          p_hash: string
          p_job: string
          p_owner: string
        }
        Returns: boolean
      }
      heartbeat_generation_job: {
        Args: {
          p_fence: number
          p_hash: string
          p_job: string
          p_owner: string
        }
        Returns: boolean
      }
      patch_generation_video: {
        Args: {
          p_fence: number
          p_hash: string
          p_job: string
          p_owner: string
          p_patch: Json
        }
        Returns: boolean
      }
      pause_generation_job: {
        Args: {
          p_error: string
          p_fence: number
          p_hash: string
          p_job: string
          p_owner: string
        }
        Returns: boolean
      }
      recover_cartoon_review: {
        Args: { job_id: string; owner_id: string; saved_review: Json }
        Returns: boolean
      }
      recover_generation_job: {
        Args: { p_job: string; p_new_hash: string }
        Returns: boolean
      }
      reserve_video_automation_run: {
        Args: {
          p_date: string
          p_format: string
          p_hash: string
          p_publish: string
          p_video: string
          p_workspace: string
        }
        Returns: Json
      }
      resume_cartoon_render: {
        Args: {
          job_id: string
          next_output_path: string
          next_token_hash: string
          owner_id: string
          review_hash: string
        }
        Returns: boolean
      }
      retry_generation_step: {
        Args: {
          p_fence: number
          p_hash: string
          p_input_hash: string
          p_job: string
          p_key: string
          p_owner: string
        }
        Returns: string
      }
      start_generation_job: {
        Args: {
          p_hash: string
          p_settings: Json
          p_user: string
          p_video: string
        }
        Returns: Json
      }
      start_video_automation_test: {
        Args: {
          p_format: string
          p_hash: string
          p_settings: Json
          p_user: string
          p_video: string
          p_workspace: string
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
  public: {
    Enums: {},
  },
} as const
