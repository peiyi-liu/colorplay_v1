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
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
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
          chapter_title: string
          client_request_id: string
          completed_at: string | null
          correct_count: number
          id: string
          question_count: number
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
          chapter_title: string
          client_request_id: string
          completed_at?: string | null
          correct_count?: number
          id?: string
          question_count: number
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
          chapter_title?: string
          client_request_id?: string
          completed_at?: string | null
          correct_count?: number
          id?: string
          question_count?: number
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
          options: Json | null
          position: number | null
          prompt: string | null
          question_count: number | null
          question_stable_code: string | null
          question_version: number | null
          response_ms: number | null
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
          total_score: number | null
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
      activate_next_quiz_question: {
        Args: { session_id: string }
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
      create_quiz_session: {
        Args: { client_request_id: string; template_id: string }
        Returns: Json
      }
      finalize_quiz_session: { Args: { session_id: string }; Returns: Json }
      submit_quiz_answer: {
        Args: {
          idempotency_key: string
          selected_option_id?: string
          session_question_id: string
        }
        Returns: Json
      }
      validate_single_choice_options: {
        Args: { target_question_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
      content_status: "draft" | "published" | "archived"
      question_type: "single_choice"
      quiz_answer_status: "correct" | "incorrect" | "timeout"
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
      app_role: ["student", "teacher", "admin"],
      content_status: ["draft", "published", "archived"],
      question_type: ["single_choice"],
      quiz_answer_status: ["correct", "incorrect", "timeout"],
      quiz_session_status: ["in_progress", "completed"],
    },
  },
} as const

