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
      profiles: {
        Row: {
          active_blook_id: string
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          active_blook_id: string
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          active_blook_id?: string
          created_at?: string
          display_name?: string
          id?: string
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
      create_quiz_session: {
        Args: { client_request_id: string; template_id: string }
        Returns: Json
      }
      current_user_owns_classroom: {
        Args: { p_classroom_id: string }
        Returns: boolean
      }
      equip_blook: { Args: { blook_id: string }; Returns: Json }
      evaluate_achievements: {
        Args: {
          event_source_id: string
          event_source_type: Database["public"]["Enums"]["achievement_source_type"]
          target_user_id: string
        }
        Returns: Json
      }
      finalize_quiz_session: { Args: { session_id: string }; Returns: Json }
      get_classroom_leaderboard: {
        Args: { p_classroom_id: string }
        Returns: Json
      }
      get_my_achievement_catalog: { Args: never; Returns: Json }
      get_my_blook_inventory: { Args: never; Returns: Json }
      get_my_economy_summary: { Args: never; Returns: Json }
      is_active_classroom_member: {
        Args: { p_classroom_id: string; p_user_id: string }
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
      join_classroom: {
        Args: { p_join_code: string; p_request_id: string }
        Returns: {
          classroom_id: string
          classroom_name: string
          joined_at: string
          membership_status: Database["public"]["Enums"]["classroom_member_status"]
        }[]
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
      purchase_blook: { Args: { blook_id: string }; Returns: Json }
      reconcile_wallet_cache: {
        Args: { target_user_id: string }
        Returns: number
      }
      rotate_classroom_join_code: {
        Args: { p_classroom_id: string }
        Returns: {
          classroom_id: string
          join_code: string
          join_code_version: number
        }[]
      }
      start_assignment_attempt: {
        Args: { p_assignment_id: string; p_request_id: string }
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
      update_assignment_status: {
        Args: {
          p_assignment_id: string
          p_expected_updated_at: string
          p_status: Database["public"]["Enums"]["assignment_status"]
        }
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
      content_status: "draft" | "published" | "archived"
      economy_source_type:
        | "quiz_finalize"
        | "blook_purchase"
        | "achievement"
        | "assignment"
        | "live"
      question_type: "single_choice"
      quiz_answer_status: "correct" | "incorrect" | "timeout"
      quiz_session_purpose: "practice" | "assignment" | "remediation"
      quiz_session_status: "in_progress" | "completed"
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
      content_status: ["draft", "published", "archived"],
      economy_source_type: [
        "quiz_finalize",
        "blook_purchase",
        "achievement",
        "assignment",
        "live",
      ],
      question_type: ["single_choice"],
      quiz_answer_status: ["correct", "incorrect", "timeout"],
      quiz_session_purpose: ["practice", "assignment", "remediation"],
      quiz_session_status: ["in_progress", "completed"],
    },
  },
} as const

