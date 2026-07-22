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
      achievement_definitions: {
        Row: {
          badge_key: string
          created_at: string
          description: string
          display_name: string
          id: string
          rule_parameters: Json
          rule_type: Database["public"]["Enums"]["achievement_rule_type"]
          rule_version: number
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["achievement_definition_status"]
          visibility: Database["public"]["Enums"]["achievement_visibility"]
        }
        Insert: {
          badge_key: string
          created_at?: string
          description: string
          display_name: string
          id: string
          rule_parameters: Json
          rule_type: Database["public"]["Enums"]["achievement_rule_type"]
          rule_version: number
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["achievement_definition_status"]
          visibility: Database["public"]["Enums"]["achievement_visibility"]
        }
        Update: {
          badge_key?: string
          created_at?: string
          description?: string
          display_name?: string
          id?: string
          rule_parameters?: Json
          rule_type?: Database["public"]["Enums"]["achievement_rule_type"]
          rule_version?: number
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["achievement_definition_status"]
          visibility?: Database["public"]["Enums"]["achievement_visibility"]
        }
        Relationships: []
      }
      achievement_progress: {
        Row: {
          achievement_definition_id: string
          computed_at: string
          current_value: number
          definition_version: number
          last_source_id: string | null
          last_source_type:
            | Database["public"]["Enums"]["achievement_source_type"]
            | null
          state: Database["public"]["Enums"]["achievement_progress_state"]
          target_value: number
          user_id: string
        }
        Insert: {
          achievement_definition_id: string
          computed_at?: string
          current_value: number
          definition_version: number
          last_source_id?: string | null
          last_source_type?:
            | Database["public"]["Enums"]["achievement_source_type"]
            | null
          state: Database["public"]["Enums"]["achievement_progress_state"]
          target_value: number
          user_id: string
        }
        Update: {
          achievement_definition_id?: string
          computed_at?: string
          current_value?: number
          definition_version?: number
          last_source_id?: string | null
          last_source_type?:
            | Database["public"]["Enums"]["achievement_source_type"]
            | null
          state?: Database["public"]["Enums"]["achievement_progress_state"]
          target_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_progress_achievement_definition_id_fkey"
            columns: ["achievement_definition_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      achievement_unlocks: {
        Row: {
          achievement_definition_id: string
          definition_version: number
          id: string
          source_id: string
          source_type: Database["public"]["Enums"]["achievement_source_type"]
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_definition_id: string
          definition_version: number
          id?: string
          source_id: string
          source_type: Database["public"]["Enums"]["achievement_source_type"]
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_definition_id?: string
          definition_version?: number
          id?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["achievement_source_type"]
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_unlocks_achievement_definition_id_fkey"
            columns: ["achievement_definition_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_unlocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_attempts: {
        Row: {
          assignment_id: string
          attempt_number: number
          completed_at: string | null
          id: string
          live_session_id: string | null
          passed: boolean | null
          quiz_session_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["assignment_attempt_status"]
          user_id: string
        }
        Insert: {
          assignment_id: string
          attempt_number: number
          completed_at?: string | null
          id?: string
          live_session_id?: string | null
          passed?: boolean | null
          quiz_session_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["assignment_attempt_status"]
          user_id: string
        }
        Update: {
          assignment_id?: string
          attempt_number?: number
          completed_at?: string | null
          id?: string
          live_session_id?: string | null
          passed?: boolean | null
          quiz_session_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["assignment_attempt_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_attempts_live_session_fk"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_attempts_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "assignment_attempts_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_targets: {
        Row: {
          assignment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_targets_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          activity_type: Database["public"]["Enums"]["assignment_activity_type"]
          attempt_limit: number | null
          available_from: string | null
          classroom_id: string
          created_at: string
          deadline_at: string | null
          id: string
          live_activity_id: string | null
          owner_teacher_id: string
          passing_rule: Json
          quiz_template_id: string | null
          rules_version: string
          status: Database["public"]["Enums"]["assignment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["assignment_activity_type"]
          attempt_limit?: number | null
          available_from?: string | null
          classroom_id: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          live_activity_id?: string | null
          owner_teacher_id: string
          passing_rule: Json
          quiz_template_id?: string | null
          rules_version?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["assignment_activity_type"]
          attempt_limit?: number | null
          available_from?: string | null
          classroom_id?: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          live_activity_id?: string | null
          owner_teacher_id?: string
          passing_rule?: Json
          quiz_template_id?: string | null
          rules_version?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_live_activity_fk"
            columns: ["live_activity_id"]
            isOneToOne: false
            referencedRelation: "live_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_quiz_template_id_fkey"
            columns: ["quiz_template_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_frames: {
        Row: {
          cost_tokens: number
          created_at: string
          gradient_end: string
          gradient_start: string
          id: string
          name: string
          sort_order: number
          stable_code: string
          status: string
        }
        Insert: {
          cost_tokens: number
          created_at?: string
          gradient_end: string
          gradient_start: string
          id: string
          name: string
          sort_order: number
          stable_code: string
          status: string
        }
        Update: {
          cost_tokens?: number
          created_at?: string
          gradient_end?: string
          gradient_start?: string
          id?: string
          name?: string
          sort_order?: number
          stable_code?: string
          status?: string
        }
        Relationships: []
      }
      blooks: {
        Row: {
          cost_tokens: number
          created_at: string
          emoji: string
          id: string
          name: string
          sort_order: number
          stable_code: string
          status: string
        }
        Insert: {
          cost_tokens: number
          created_at?: string
          emoji: string
          id: string
          name: string
          sort_order: number
          stable_code: string
          status: string
        }
        Update: {
          cost_tokens?: number
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          sort_order?: number
          stable_code?: string
          status?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          course_id: string
          created_at: string
          description: string
          id: string
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_members: {
        Row: {
          activated_at: string
          classroom_id: string
          created_at: string
          deactivated_at: string | null
          joined_at: string
          last_join_request_id: string
          member_role: Database["public"]["Enums"]["classroom_member_role"]
          status: Database["public"]["Enums"]["classroom_member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          classroom_id: string
          created_at?: string
          deactivated_at?: string | null
          joined_at?: string
          last_join_request_id: string
          member_role: Database["public"]["Enums"]["classroom_member_role"]
          status?: Database["public"]["Enums"]["classroom_member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string
          classroom_id?: string
          created_at?: string
          deactivated_at?: string | null
          joined_at?: string
          last_join_request_id?: string
          member_role?: Database["public"]["Enums"]["classroom_member_role"]
          status?: Database["public"]["Enums"]["classroom_member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_members_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          created_at: string
          id: string
          join_code_hash: string
          join_code_rotated_at: string
          join_code_version: number
          name: string
          owner_teacher_id: string
          status: Database["public"]["Enums"]["classroom_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code_hash: string
          join_code_rotated_at?: string
          join_code_version?: number
          name: string
          owner_teacher_id: string
          status?: Database["public"]["Enums"]["classroom_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code_hash?: string
          join_code_rotated_at?: string
          join_code_version?: number
          name?: string
          owner_teacher_id?: string
          status?: Database["public"]["Enums"]["classroom_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_imports: {
        Row: {
          created_at: string
          created_ids: Json
          dry_run: boolean
          error_rows: number
          filename: string
          id: string
          request_id: string
          row_errors: Json
          status: Database["public"]["Enums"]["content_import_status"]
          teacher_id: string
          total_rows: number
          valid_rows: number
          warning_rows: number
        }
        Insert: {
          created_at?: string
          created_ids?: Json
          dry_run?: boolean
          error_rows: number
          filename: string
          id?: string
          request_id: string
          row_errors?: Json
          status: Database["public"]["Enums"]["content_import_status"]
          teacher_id: string
          total_rows: number
          valid_rows: number
          warning_rows?: number
        }
        Update: {
          created_at?: string
          created_ids?: Json
          dry_run?: boolean
          error_rows?: number
          filename?: string
          id?: string
          request_id?: string
          row_errors?: Json
          status?: Database["public"]["Enums"]["content_import_status"]
          teacher_id?: string
          total_rows?: number
          valid_rows?: number
          warning_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_imports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_publication_events: {
        Row: {
          actor_id: string
          content_id: string
          content_type: Database["public"]["Enums"]["versioned_content_type"]
          created_at: string
          event_type: Database["public"]["Enums"]["publication_event_type"]
          id: string
          request_id: string
          version: number
        }
        Insert: {
          actor_id: string
          content_id: string
          content_type: Database["public"]["Enums"]["versioned_content_type"]
          created_at?: string
          event_type: Database["public"]["Enums"]["publication_event_type"]
          id?: string
          request_id: string
          version: number
        }
        Update: {
          actor_id?: string
          content_id?: string
          content_type?: Database["public"]["Enums"]["versioned_content_type"]
          created_at?: string
          event_type?: Database["public"]["Enums"]["publication_event_type"]
          id?: string
          request_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_publication_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          content_id: string
          content_type: Database["public"]["Enums"]["versioned_content_type"]
          created_at: string
          created_by: string
          frozen_payload: Json
          id: string
          payload_hash: string
          status: Database["public"]["Enums"]["content_status"]
          version: number
        }
        Insert: {
          content_id: string
          content_type: Database["public"]["Enums"]["versioned_content_type"]
          created_at?: string
          created_by: string
          frozen_payload: Json
          id?: string
          payload_hash: string
          status: Database["public"]["Enums"]["content_status"]
          version: number
        }
        Update: {
          content_id?: string
          content_type?: Database["public"]["Enums"]["versioned_content_type"]
          created_at?: string
          created_by?: string
          frozen_payload?: Json
          id?: string
          payload_hash?: string
          status?: Database["public"]["Enums"]["content_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string
          id: string
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_activities: {
        Row: {
          chapter_id: string | null
          classroom_id: string | null
          created_at: string
          id: string
          owner_teacher_id: string
          status: Database["public"]["Enums"]["external_activity_status"]
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          chapter_id?: string | null
          classroom_id?: string | null
          created_at?: string
          id?: string
          owner_teacher_id: string
          status?: Database["public"]["Enums"]["external_activity_status"]
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          chapter_id?: string | null
          classroom_id?: string | null
          created_at?: string
          id?: string
          owner_teacher_id?: string
          status?: Database["public"]["Enums"]["external_activity_status"]
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_activities_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activities_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_activities_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hint_events: {
        Row: {
          created_at: string
          hint_level: number
          id: string
          question_version: number
          served_content: string
          session_question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hint_level: number
          id?: string
          question_version: number
          served_content: string
          session_question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hint_level?: number
          id?: string
          question_version?: number
          served_content?: string
          session_question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hint_events_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_question_id"]
          },
          {
            foreignKeyName: "hint_events_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hint_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_activities: {
        Row: {
          created_at: string
          id: string
          owner_teacher_id: string
          question_time_limit_seconds: number
          quiz_template_id: string
          rules_version: string
          scheduled_for: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_teacher_id: string
          question_time_limit_seconds?: number
          quiz_template_id: string
          rules_version?: string
          scheduled_for?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_teacher_id?: string
          question_time_limit_seconds?: number
          quiz_template_id?: string
          rules_version?: string
          scheduled_for?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_activities_owner_teacher_id_fkey"
            columns: ["owner_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_activities_quiz_template_id_fkey"
            columns: ["quiz_template_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      live_answers: {
        Row: {
          answer_status: Database["public"]["Enums"]["quiz_answer_status"]
          id: string
          idempotency_key: string
          participant_id: string
          response_ms: number | null
          score_delta: number
          selected_option_id: string | null
          session_question_id: string
          submitted_at: string
        }
        Insert: {
          answer_status: Database["public"]["Enums"]["quiz_answer_status"]
          id?: string
          idempotency_key: string
          participant_id: string
          response_ms?: number | null
          score_delta?: number
          selected_option_id?: string | null
          session_question_id: string
          submitted_at?: string
        }
        Update: {
          answer_status?: Database["public"]["Enums"]["quiz_answer_status"]
          id?: string
          idempotency_key?: string
          participant_id?: string
          response_ms?: number | null
          score_delta?: number
          selected_option_id?: string | null
          session_question_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "live_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: false
            referencedRelation: "live_session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_join_throttle: {
        Row: {
          failure_count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          failure_count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          failure_count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_join_throttle_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          current_streak: number
          final_rank: number | null
          id: string
          joined_at: string
          left_at: string | null
          score: number
          session_id: string
          status: Database["public"]["Enums"]["live_participant_status"]
          team_number: number | null
          user_id: string
        }
        Insert: {
          current_streak?: number
          final_rank?: number | null
          id?: string
          joined_at?: string
          left_at?: string | null
          score?: number
          session_id: string
          status?: Database["public"]["Enums"]["live_participant_status"]
          team_number?: number | null
          user_id: string
        }
        Update: {
          current_streak?: number
          final_rank?: number | null
          id?: string
          joined_at?: string
          left_at?: string | null
          score?: number
          session_id?: string
          status?: Database["public"]["Enums"]["live_participant_status"]
          team_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_questions: {
        Row: {
          closed_at: string | null
          correct_option_id: string
          deadline_at: string | null
          explanation: string | null
          id: string
          opened_at: string | null
          position: number
          prompt: string
          public_options: Json
          question_stable_code: string
          question_version: number
          session_id: string
        }
        Insert: {
          closed_at?: string | null
          correct_option_id: string
          deadline_at?: string | null
          explanation?: string | null
          id?: string
          opened_at?: string | null
          position: number
          prompt: string
          public_options: Json
          question_stable_code: string
          question_version: number
          session_id: string
        }
        Update: {
          closed_at?: string | null
          correct_option_id?: string
          deadline_at?: string | null
          explanation?: string | null
          id?: string
          opened_at?: string | null
          position?: number
          prompt?: string
          public_options?: Json
          question_stable_code?: string
          question_version?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          assignment_id: string | null
          cancelled_at: string | null
          classroom_id: string
          completed_at: string | null
          created_at: string
          current_position: number
          host_teacher_id: string
          id: string
          join_code_hash: string
          join_code_version: number
          live_activity_id: string
          mode: string
          opened_at: string | null
          paused_remaining_ms: number | null
          question_count: number
          rules_version: string
          state: Database["public"]["Enums"]["live_session_state"]
          state_version: number
          team_count: number | null
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          cancelled_at?: string | null
          classroom_id: string
          completed_at?: string | null
          created_at?: string
          current_position?: number
          host_teacher_id: string
          id?: string
          join_code_hash: string
          join_code_version?: number
          live_activity_id: string
          mode?: string
          opened_at?: string | null
          paused_remaining_ms?: number | null
          question_count?: number
          rules_version?: string
          state?: Database["public"]["Enums"]["live_session_state"]
          state_version?: number
          team_count?: number | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          cancelled_at?: string | null
          classroom_id?: string
          completed_at?: string | null
          created_at?: string
          current_position?: number
          host_teacher_id?: string
          id?: string
          join_code_hash?: string
          join_code_version?: number
          live_activity_id?: string
          mode?: string
          opened_at?: string | null
          paused_remaining_ms?: number | null
          question_count?: number
          rules_version?: string
          state?: Database["public"]["Enums"]["live_session_state"]
          state_version?: number
          team_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_teacher_id_fkey"
            columns: ["host_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_live_activity_id_fkey"
            columns: ["live_activity_id"]
            isOneToOne: false
            referencedRelation: "live_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option_id: string
          session_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option_id: string
          session_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_attempts_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_attempts_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mastery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_hint_events: {
        Row: {
          created_at: string
          hint_level: number
          id: string
          question_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          hint_level: number
          id?: string
          question_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          hint_level?: number
          id?: string
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_hint_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_hint_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mastery_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_sessions: {
        Row: {
          chapter_id: string
          completed_at: string | null
          created_at: string
          id: string
          position: number
          question_ids: string[]
          question_versions: number[]
          rules_version: string
          status: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          position?: number
          question_ids: string[]
          question_versions: number[]
          rules_version?: string
          status?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          position?: number
          question_ids?: string[]
          question_versions?: number[]
          rules_version?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mistake_items: {
        Row: {
          first_wrong_at: string
          id: string
          last_event_at: string
          origin_answer_id: string
          question_id: string
          question_version: number
          status: Database["public"]["Enums"]["mistake_status"]
          user_id: string
        }
        Insert: {
          first_wrong_at?: string
          id?: string
          last_event_at?: string
          origin_answer_id: string
          question_id: string
          question_version: number
          status?: Database["public"]["Enums"]["mistake_status"]
          user_id: string
        }
        Update: {
          first_wrong_at?: string
          id?: string
          last_event_at?: string
          origin_answer_id?: string
          question_id?: string
          question_version?: number
          status?: Database["public"]["Enums"]["mistake_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mistake_items_origin_answer_id_fkey"
            columns: ["origin_answer_id"]
            isOneToOne: false
            referencedRelation: "quiz_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistake_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mistake_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_blook_id: string
          active_frame_id: string
          created_at: string
          display_name: string
          full_name: string | null
          id: string
          login_account: string | null
          reduced_motion: boolean
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          active_blook_id: string
          active_frame_id: string
          created_at?: string
          display_name: string
          full_name?: string | null
          id: string
          login_account?: string | null
          reduced_motion?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_blook_id?: string
          active_frame_id?: string
          created_at?: string
          display_name?: string
          full_name?: string | null
          id?: string
          login_account?: string | null
          reduced_motion?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_blook_id_fkey"
            columns: ["active_blook_id"]
            isOneToOne: false
            referencedRelation: "blooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_frame_id_fkey"
            columns: ["active_frame_id"]
            isOneToOne: false
            referencedRelation: "avatar_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      question_hints: {
        Row: {
          content: string
          created_at: string
          hint_level: number
          id: string
          question_id: string
          question_version: number
        }
        Insert: {
          content: string
          created_at?: string
          hint_level: number
          id?: string
          question_id: string
          question_version: number
        }
        Update: {
          content?: string
          created_at?: string
          hint_level?: number
          id?: string
          question_id?: string
          question_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_hints_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          id: string
          is_correct: boolean
          option_key: string
          option_text: string
          question_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_correct?: boolean
          option_key: string
          option_text: string
          question_id: string
          sort_order: number
        }
        Update: {
          id?: string
          is_correct?: boolean
          option_key?: string
          option_text?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          explanation: string
          id: string
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          subtopic_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          explanation: string
          id?: string
          prompt: string
          question_type?: Database["public"]["Enums"]["question_type"]
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          subtopic_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          explanation?: string
          id?: string
          prompt?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          subtopic_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          answer_status: Database["public"]["Enums"]["quiz_answer_status"]
          answered_at: string
          correct_option_id: string
          id: string
          idempotency_key: string
          provisional_tokens: number
          provisional_xp: number
          response_ms: number
          score_delta: number
          selected_option_id: string | null
          session_id: string
          session_question_id: string
          user_id: string
        }
        Insert: {
          answer_status: Database["public"]["Enums"]["quiz_answer_status"]
          answered_at?: string
          correct_option_id: string
          id?: string
          idempotency_key: string
          provisional_tokens?: number
          provisional_xp?: number
          response_ms: number
          score_delta: number
          selected_option_id?: string | null
          session_id: string
          session_question_id: string
          user_id: string
        }
        Update: {
          answer_status?: Database["public"]["Enums"]["quiz_answer_status"]
          answered_at?: string
          correct_option_id?: string
          id?: string
          idempotency_key?: string
          provisional_tokens?: number
          provisional_xp?: number
          response_ms?: number
          score_delta?: number
          selected_option_id?: string | null
          session_id?: string
          session_question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "quiz_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: true
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_question_id"]
          },
          {
            foreignKeyName: "quiz_answers_session_question_id_fkey"
            columns: ["session_question_id"]
            isOneToOne: true
            referencedRelation: "quiz_session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_session_questions: {
        Row: {
          correct_option_id: string
          deadline_at: string | null
          explanation: string
          frozen_options: Json
          id: string
          position: number
          prompt: string
          question_id: string
          question_stable_code: string
          question_version: number
          session_id: string
          started_at: string | null
        }
        Insert: {
          correct_option_id: string
          deadline_at?: string | null
          explanation: string
          frozen_options: Json
          id?: string
          position: number
          prompt: string
          question_id: string
          question_stable_code: string
          question_version: number
          session_id: string
          started_at?: string | null
        }
        Update: {
          correct_option_id?: string
          deadline_at?: string | null
          explanation?: string
          frozen_options?: Json
          id?: string
          position?: number
          prompt?: string
          question_id?: string
          question_stable_code?: string
          question_version?: number
          session_id?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_questions_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_session_questions_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_session_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "quiz_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          answered_count: number
          assignment_attempt_id: string | null
          chapter_title: string
          client_request_id: string
          completed_at: string | null
          correct_count: number
          game_rules_version: string
          id: string
          purpose: Database["public"]["Enums"]["quiz_session_purpose"]
          question_count: number
          reward_rate_percent: number
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          template_id: string
          tokens_awarded: number
          total_score: number
          user_id: string
          xp_awarded: number
        }
        Insert: {
          answered_count?: number
          assignment_attempt_id?: string | null
          chapter_title: string
          client_request_id: string
          completed_at?: string | null
          correct_count?: number
          game_rules_version?: string
          id?: string
          purpose?: Database["public"]["Enums"]["quiz_session_purpose"]
          question_count: number
          reward_rate_percent?: number
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          template_id: string
          tokens_awarded?: number
          total_score?: number
          user_id: string
          xp_awarded?: number
        }
        Update: {
          answered_count?: number
          assignment_attempt_id?: string | null
          chapter_title?: string
          client_request_id?: string
          completed_at?: string | null
          correct_count?: number
          game_rules_version?: string
          id?: string
          purpose?: Database["public"]["Enums"]["quiz_session_purpose"]
          question_count?: number
          reward_rate_percent?: number
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          template_id?: string
          tokens_awarded?: number
          total_score?: number
          user_id?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_assignment_attempt_id_fkey"
            columns: ["assignment_attempt_id"]
            isOneToOne: false
            referencedRelation: "assignment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_templates: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          question_count: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          question_count?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          question_count?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_templates_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      remediation_attempts: {
        Row: {
          answer_id: string
          created_at: string
          id: string
          mistake_item_id: string
          result: Database["public"]["Enums"]["remediation_result"]
          session_id: string
          user_id: string
        }
        Insert: {
          answer_id: string
          created_at?: string
          id?: string
          mistake_item_id: string
          result: Database["public"]["Enums"]["remediation_result"]
          session_id: string
          user_id: string
        }
        Update: {
          answer_id?: string
          created_at?: string
          id?: string
          mistake_item_id?: string
          result?: Database["public"]["Enums"]["remediation_result"]
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remediation_attempts_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "quiz_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remediation_attempts_mistake_item_id_fkey"
            columns: ["mistake_item_id"]
            isOneToOne: false
            referencedRelation: "mistake_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remediation_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_question_state"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "remediation_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remediation_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_card_media: {
        Row: {
          alt_text: string
          asset_path: string
          card_version: number
          id: string
          review_card_id: string
          sort_order: number
        }
        Insert: {
          alt_text: string
          asset_path: string
          card_version: number
          id?: string
          review_card_id: string
          sort_order: number
        }
        Update: {
          alt_text?: string
          asset_path?: string
          card_version?: number
          id?: string
          review_card_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_card_media_review_card_id_fkey"
            columns: ["review_card_id"]
            isOneToOne: false
            referencedRelation: "review_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cards: {
        Row: {
          content: string
          created_at: string
          group_label: string
          id: string
          requires_recompletion: boolean
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          subtopic_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          group_label?: string
          id?: string
          requires_recompletion?: boolean
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          subtopic_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          group_label?: string
          id?: string
          requires_recompletion?: boolean
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          subtopic_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_cards_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      review_progress: {
        Row: {
          card_version: number
          completed_at: string
          id: string
          request_id: string
          review_card_id: string
          rules_version: string
          user_id: string
        }
        Insert: {
          card_version: number
          completed_at?: string
          id?: string
          request_id: string
          review_card_id: string
          rules_version?: string
          user_id: string
        }
        Update: {
          card_version?: number
          completed_at?: string
          id?: string
          request_id?: string
          review_card_id?: string
          rules_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_progress_review_card_id_fkey"
            columns: ["review_card_id"]
            isOneToOne: false
            referencedRelation: "review_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          chapter_id: string
          created_at: string
          description: string
          id: string
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      subtopics: {
        Row: {
          created_at: string
          description: string
          id: string
          section_id: string
          sort_order: number
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          section_id: string
          sort_order?: number
          stable_code: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          section_id?: string
          sort_order?: number
          stable_code?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtopics_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blooks: {
        Row: {
          acquired_at: string
          blook_id: string
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          blook_id: string
          source: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          blook_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blooks_blook_id_fkey"
            columns: ["blook_id"]
            isOneToOne: false
            referencedRelation: "blooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_frames: {
        Row: {
          acquired_at: string
          frame_id: string
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          frame_id: string
          source: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          frame_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_frames_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "avatar_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          source_id: string
          source_type: Database["public"]["Enums"]["economy_source_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          source_id: string
          source_type: Database["public"]["Enums"]["economy_source_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["economy_source_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          token_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          source_id: string
          source_type: Database["public"]["Enums"]["economy_source_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          source_id: string
          source_type: Database["public"]["Enums"]["economy_source_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["economy_source_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      question_options_public: {
        Row: {
          id: string | null
          option_key: string | null
          option_text: string | null
          question_id: string | null
          sort_order: number | null
        }
        Insert: {
          id?: string | null
          option_key?: string | null
          option_text?: string | null
          question_id?: string | null
          sort_order?: number | null
        }
        Update: {
          id?: string | null
          option_key?: string | null
          option_text?: string | null
          question_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_session_question_state: {
        Row: {
          answer_status:
            | Database["public"]["Enums"]["quiz_answer_status"]
            | null
          answered_count: number | null
          chapter_title: string | null
          completed_at: string | null
          correct_count: number | null
          correct_option_id: string | null
          deadline_at: string | null
          explanation: string | null
          game_rules_version: string | null
          options: Json | null
          position: number | null
          prompt: string | null
          question_count: number | null
          question_stable_code: string | null
          question_version: number | null
          response_ms: number | null
          reward_rate_percent: number | null
          score_delta: number | null
          selected_option_id: string | null
          session_id: string | null
          session_question_id: string | null
          session_started_at: string | null
          session_status:
            | Database["public"]["Enums"]["quiz_session_status"]
            | null
          started_at: string | null
          template_id: string | null
          tokens_awarded: number | null
          total_score: number | null
          xp_awarded: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "question_options_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quiz_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      achievement_metric_value: {
        Args: {
          target_rule_type: Database["public"]["Enums"]["achievement_rule_type"]
          target_user_id: string
        }
        Returns: number
      }
      activate_next_quiz_question: {
        Args: { session_id: string }
        Returns: Json
      }
      advance_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      apply_question_payload: {
        Args: { p_payload: Json; p_question_id: string }
        Returns: string
      }
      apply_review_card_payload: {
        Args: { p_card_id: string; p_payload: Json; p_target_version: number }
        Returns: string
      }
      archive_question: {
        Args: { p_question_id: string; p_request_id: string }
        Returns: Json
      }
      archive_review_card: {
        Args: { p_card_id: string; p_request_id: string }
        Returns: Json
      }
      assert_content_teacher: { Args: never; Returns: string }
      assert_safe_content_text: {
        Args: { p_value: string }
        Returns: undefined
      }
      build_assignment_attempt_payload: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      build_quiz_answer_result: {
        Args: { target_answer_id: string }
        Returns: Json
      }
      build_quiz_session_payload: {
        Args: { target_session_id: string }
        Returns: Json
      }
      cancel_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      close_live_question: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      commit_content_import: {
        Args: {
          p_dry_run?: boolean
          p_filename: string
          p_request_id: string
          p_rows: Json
        }
        Returns: Json
      }
      complete_review_card: {
        Args: { p_request_id: string; p_review_card_id: string }
        Returns: Json
      }
      create_assignment: {
        Args: {
          p_activity_reference: string
          p_activity_type: Database["public"]["Enums"]["assignment_activity_type"]
          p_attempt_limit: number
          p_available_from: string
          p_classroom_id: string
          p_deadline_at: string
          p_passing_threshold: number
          p_title: string
        }
        Returns: Json
      }
      create_classroom: {
        Args: { p_name: string }
        Returns: {
          classroom_id: string
          classroom_name: string
          join_code: string
          join_code_version: number
        }[]
      }
      create_live_activity: {
        Args: {
          p_question_time_limit_seconds?: number
          p_quiz_template_id: string
          p_title: string
        }
        Returns: Json
      }
      create_live_session: {
        Args: {
          p_assignment_id?: string
          p_classroom_id: string
          p_live_activity_id: string
          p_mode?: string
          p_team_count?: number
        }
        Returns: Json
      }
      create_quiz_session: {
        Args: { client_request_id: string; template_id: string }
        Returns: Json
      }
      current_user_owns_classroom: {
        Args: { p_classroom_id: string }
        Returns: boolean
      }
      ensure_import_subtopic: {
        Args: { p_chapter: string; p_section_label: string }
        Returns: string
      }
      equip_blook: { Args: { blook_id: string }; Returns: Json }
      equip_frame: { Args: { frame_id: string }; Returns: Json }
      evaluate_achievements: {
        Args: {
          event_source_id: string
          event_source_type: Database["public"]["Enums"]["achievement_source_type"]
          target_user_id: string
        }
        Returns: Json
      }
      finalize_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      finalize_quiz_session: { Args: { session_id: string }; Returns: Json }
      generate_live_join_code: { Args: never; Returns: Record<string, unknown> }
      get_classroom_leaderboard: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_classroom_progress: {
        Args: { p_classroom_id: string }
        Returns: {
          chapter_id: string
          display_name: string
          mastery: number
          rules_version: string
          status: string
          user_id: string
        }[]
      }
      get_learning_progress: {
        Args: { p_chapter_id?: string }
        Returns: {
          accuracy: number
          chapter_id: string
          coverage: number
          mastery: number
          review_completed: number
          review_total: number
          rules_version: string
          scope: string
          status: string
          subtopic_id: string
        }[]
      }
      get_live_session_state: { Args: { p_session_id: string }; Returns: Json }
      get_mastery_hint: {
        Args: { p_hint_level: number; p_session_id: string }
        Returns: Json
      }
      get_mastery_state: { Args: { p_session_id: string }; Returns: Json }
      get_my_achievement_catalog: { Args: never; Returns: Json }
      get_my_blook_inventory: { Args: never; Returns: Json }
      get_my_economy_summary: { Args: never; Returns: Json }
      get_my_frame_inventory: { Args: never; Returns: Json }
      get_review_completion: {
        Args: { p_chapter_id?: string }
        Returns: {
          chapter_id: string
          completed_count: number
          subtopic_id: string
          total_count: number
        }[]
      }
      is_active_classroom_member: {
        Args: { p_classroom_id: string; p_user_id: string }
        Returns: boolean
      }
      is_active_live_participant: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      is_assignment_owner: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      is_assignment_target: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      is_live_session_host: { Args: { p_session_id: string }; Returns: boolean }
      join_classroom: {
        Args: { p_join_code: string; p_request_id: string }
        Returns: {
          classroom_id: string
          classroom_name: string
          joined_at: string
          membership_status: Database["public"]["Enums"]["classroom_member_status"]
        }[]
      }
      join_live_session: {
        Args: { p_join_code: string; p_request_id: string }
        Returns: Json
      }
      list_classroom_assignments: {
        Args: { p_classroom_id: string }
        Returns: {
          activity_type: Database["public"]["Enums"]["assignment_activity_type"]
          assignment_id: string
          attempt_limit: number
          available_from: string
          completed_count: number
          created_at: string
          deadline_at: string
          passing_threshold: number
          status: Database["public"]["Enums"]["assignment_status"]
          target_count: number
          title: string
          updated_at: string
        }[]
      }
      list_my_assignments: {
        Args: never
        Returns: {
          assignment_id: string
          attempt_limit: number
          attempts_used: number
          available_from: string
          classroom_id: string
          classroom_name: string
          deadline_at: string
          latest_attempt_status: Database["public"]["Enums"]["assignment_attempt_status"]
          latest_passed: boolean
          passing_threshold: number
          status: Database["public"]["Enums"]["assignment_status"]
          title: string
        }[]
      }
      list_my_classrooms: {
        Args: never
        Returns: {
          classroom_id: string
          classroom_name: string
          joined_at: string
          membership_status: Database["public"]["Enums"]["classroom_member_status"]
        }[]
      }
      list_my_mistakes: { Args: never; Returns: Json }
      list_owned_classroom_members: {
        Args: { p_classroom_id: string }
        Returns: {
          active_blook_id: string
          display_name: string
          joined_at: string
          membership_status: Database["public"]["Enums"]["classroom_member_status"]
        }[]
      }
      list_owned_classrooms: {
        Args: never
        Returns: {
          classroom_id: string
          classroom_name: string
          classroom_status: Database["public"]["Enums"]["classroom_status"]
          created_at: string
          join_code_version: number
          member_count: number
        }[]
      }
      live_broadcast: {
        Args: { p_payload: Json; p_session_id: string }
        Returns: undefined
      }
      live_close_open_question: {
        Args: { p_session_id: string }
        Returns: Json
      }
      live_completed_payload: {
        Args: {
          target_session: Database["public"]["Tables"]["live_sessions"]["Row"]
        }
        Returns: Json
      }
      live_feedback_snapshot: {
        Args: {
          target_question: Database["public"]["Tables"]["live_session_questions"]["Row"]
          target_session: Database["public"]["Tables"]["live_sessions"]["Row"]
        }
        Returns: Json
      }
      live_open_next_question: {
        Args: { p_next_position: number; p_session_id: string }
        Returns: Json
      }
      live_question_distribution: {
        Args: { p_session_id: string }
        Returns: Json
      }
      live_question_payload: {
        Args: {
          target_question: Database["public"]["Tables"]["live_session_questions"]["Row"]
        }
        Returns: Json
      }
      live_session_standings: { Args: { p_session_id: string }; Returns: Json }
      live_team_totals: { Args: { p_session_id: string }; Returns: Json }
      live_topic_session_id: { Args: { p_topic: string }; Returns: string }
      open_live_question: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      pause_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      publish_question: {
        Args: { p_payload?: Json; p_question_id: string; p_request_id?: string }
        Returns: Json
      }
      publish_review_card: {
        Args: { p_card_id: string; p_payload?: Json; p_request_id?: string }
        Returns: Json
      }
      purchase_blook: { Args: { blook_id: string }; Returns: Json }
      purchase_frame: { Args: { frame_id: string }; Returns: Json }
      question_semantic_payload: {
        Args: { p_question_id: string }
        Returns: Json
      }
      reconcile_wallet_cache: {
        Args: { target_user_id: string }
        Returns: number
      }
      record_content_version: {
        Args: {
          p_actor: string
          p_content_id: string
          p_payload: Json
          p_status: Database["public"]["Enums"]["content_status"]
          p_type: Database["public"]["Enums"]["versioned_content_type"]
          p_version: number
        }
        Returns: undefined
      }
      request_question_hint: {
        Args: { p_hint_level: number; p_session_question_id: string }
        Returns: Json
      }
      resume_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      review_card_semantic_payload: {
        Args: { p_card_id: string }
        Returns: Json
      }
      rotate_classroom_join_code: {
        Args: { p_classroom_id: string }
        Returns: {
          classroom_id: string
          join_code: string
          join_code_version: number
        }[]
      }
      rotate_live_join_code: { Args: { p_session_id: string }; Returns: Json }
      schedule_live_activity: {
        Args: { p_activity_id: string; p_scheduled_for: string }
        Returns: Json
      }
      start_assignment_attempt: {
        Args: { p_assignment_id: string; p_request_id: string }
        Returns: Json
      }
      start_live_session: {
        Args: { p_expected_version: number; p_session_id: string }
        Returns: Json
      }
      start_mastery_session: { Args: { p_chapter_id: string }; Returns: string }
      start_remediation_session: {
        Args: { p_request_id: string; p_subtopic_id: string }
        Returns: Json
      }
      submit_live_answer: {
        Args: {
          p_idempotency_key: string
          p_selected_option_id: string
          p_session_question_id: string
        }
        Returns: Json
      }
      submit_mastery_attempt: {
        Args: { p_option_id: string; p_session_id: string }
        Returns: Json
      }
      submit_quiz_answer: {
        Args: {
          idempotency_key: string
          selected_option_id?: string
          session_question_id: string
        }
        Returns: Json
      }
      teacher_answer_facts: {
        Args: {
          p_chapter_id: string
          p_classroom_id: string
          p_from: string
          p_subtopic_id: string
          p_to: string
        }
        Returns: {
          answered_at: string
          chapter_id: string
          is_correct: boolean
          prompt: string
          question_id: string
          session_id: string
          stable_code: string
          subtopic_id: string
          user_id: string
        }[]
      }
      teacher_assignment_summary: {
        Args: { p_classroom_id: string; p_from?: string; p_to?: string }
        Returns: {
          assignment_id: string
          attempts: number
          completed: number
          passed: number
          status: string
          targets: number
          title: string
        }[]
      }
      teacher_classroom_summary: {
        Args: {
          p_chapter_id?: string
          p_classroom_id: string
          p_from?: string
          p_subtopic_id?: string
          p_to?: string
        }
        Returns: {
          attempts: number
          average_accuracy: number
          unique_students: number
          worst_subtopic_code: string
          worst_subtopic_title: string
        }[]
      }
      teacher_list_questions: {
        Args: never
        Returns: {
          explanation: string
          options: Json
          prompt: string
          question_id: string
          stable_code: string
          status: Database["public"]["Enums"]["content_status"]
          subtopic_id: string
          version: number
        }[]
      }
      teacher_live_session_detail: {
        Args: { p_session_id: string }
        Returns: Json
      }
      teacher_live_session_report: {
        Args: { p_classroom_id: string; p_from?: string; p_to?: string }
        Returns: {
          activity_title: string
          answers: number
          completed_at: string
          correct_rate: number
          participants: number
          session_id: string
          state: string
        }[]
      }
      teacher_question_analysis: {
        Args: {
          p_chapter_id?: string
          p_classroom_id: string
          p_from?: string
          p_subtopic_id?: string
          p_to?: string
        }
        Returns: {
          attempts: number
          correct_rate: number
          prompt: string
          stable_code: string
        }[]
      }
      teacher_subtopic_mastery: {
        Args: {
          p_chapter_id?: string
          p_classroom_id: string
          p_from?: string
          p_subtopic_id?: string
          p_to?: string
        }
        Returns: {
          accuracy: number
          answers: number
          students: number
          subtopic_code: string
          subtopic_title: string
        }[]
      }
      update_assignment_status: {
        Args: {
          p_assignment_id: string
          p_expected_updated_at: string
          p_status: Database["public"]["Enums"]["assignment_status"]
        }
        Returns: Json
      }
      upsert_external_activity: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      upsert_question_draft: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      upsert_review_card_draft: {
        Args: { p_payload: Json; p_request_id: string }
        Returns: Json
      }
      validate_achievement_rule_parameters: {
        Args: {
          parameters: Json
          rule_type: Database["public"]["Enums"]["achievement_rule_type"]
          rule_version: number
        }
        Returns: boolean
      }
      validate_import_question_row: { Args: { p_row: Json }; Returns: Json }
      validate_import_review_card_row: { Args: { p_row: Json }; Returns: Json }
      validate_single_choice_options: {
        Args: { target_question_id: string }
        Returns: undefined
      }
    }
    Enums: {
      achievement_definition_status: "active" | "archived"
      achievement_progress_state: "not_started" | "in_progress" | "unlocked"
      achievement_rule_type:
        | "completed_task_count"
        | "perfect_quiz_count"
        | "resolved_mistake_count"
        | "mastered_chapter_count"
        | "level_reached"
        | "correct_streak"
        | "live_completed_count"
        | "initial_blook_owned_count"
      achievement_source_type:
        | "quiz_finalize"
        | "xp_ledger"
        | "blook_acquired"
        | "catalog_backfill"
        | "assignment_finalize"
        | "live_finalize"
        | "mistake_resolved"
        | "mastery_recomputed"
      achievement_visibility: "public" | "hidden"
      app_role: "student" | "teacher" | "admin"
      assignment_activity_type: "quiz_template" | "live_activity"
      assignment_attempt_status:
        | "in_progress"
        | "completed"
        | "expired"
        | "abandoned"
      assignment_status: "draft" | "published" | "paused" | "archived"
      classroom_member_role: "student" | "teacher"
      classroom_member_status: "active" | "inactive"
      classroom_status: "active" | "archived"
      content_import_status: "committed" | "failed"
      content_status: "draft" | "published" | "archived"
      economy_source_type:
        | "quiz_finalize"
        | "blook_purchase"
        | "achievement"
        | "assignment"
        | "live"
        | "frame_purchase"
      external_activity_status: "available" | "archived"
      live_participant_status: "active" | "left" | "removed"
      live_session_state:
        | "draft"
        | "lobby"
        | "question_open"
        | "question_feedback"
        | "completed"
        | "cancelled"
        | "paused"
      mistake_status: "open" | "resolved" | "reopened"
      publication_event_type: "publish" | "archive"
      question_type: "single_choice"
      quiz_answer_status: "correct" | "incorrect" | "timeout"
      quiz_session_purpose: "practice" | "assignment" | "remediation"
      quiz_session_status: "in_progress" | "completed"
      remediation_result: "resolved" | "unresolved"
      versioned_content_type: "question" | "review_card"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      achievement_definition_status: ["active", "archived"],
      achievement_progress_state: ["not_started", "in_progress", "unlocked"],
      achievement_rule_type: [
        "completed_task_count",
        "perfect_quiz_count",
        "resolved_mistake_count",
        "mastered_chapter_count",
        "level_reached",
        "correct_streak",
        "live_completed_count",
        "initial_blook_owned_count",
      ],
      achievement_source_type: [
        "quiz_finalize",
        "xp_ledger",
        "blook_acquired",
        "catalog_backfill",
        "assignment_finalize",
        "live_finalize",
        "mistake_resolved",
        "mastery_recomputed",
      ],
      achievement_visibility: ["public", "hidden"],
      app_role: ["student", "teacher", "admin"],
      assignment_activity_type: ["quiz_template", "live_activity"],
      assignment_attempt_status: [
        "in_progress",
        "completed",
        "expired",
        "abandoned",
      ],
      assignment_status: ["draft", "published", "paused", "archived"],
      classroom_member_role: ["student", "teacher"],
      classroom_member_status: ["active", "inactive"],
      classroom_status: ["active", "archived"],
      content_import_status: ["committed", "failed"],
      content_status: ["draft", "published", "archived"],
      economy_source_type: [
        "quiz_finalize",
        "blook_purchase",
        "achievement",
        "assignment",
        "live",
        "frame_purchase",
      ],
      external_activity_status: ["available", "archived"],
      live_participant_status: ["active", "left", "removed"],
      live_session_state: [
        "draft",
        "lobby",
        "question_open",
        "question_feedback",
        "completed",
        "cancelled",
        "paused",
      ],
      mistake_status: ["open", "resolved", "reopened"],
      publication_event_type: ["publish", "archive"],
      question_type: ["single_choice"],
      quiz_answer_status: ["correct", "incorrect", "timeout"],
      quiz_session_purpose: ["practice", "assignment", "remediation"],
      quiz_session_status: ["in_progress", "completed"],
      remediation_result: ["resolved", "unresolved"],
      versioned_content_type: ["question", "review_card"],
    },
  },
} as const

