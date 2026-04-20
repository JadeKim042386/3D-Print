export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      consents: {
        Row: {
          consent_type: string
          created_at: string
          granted: boolean
          granted_at: string | null
          id: string
          ip_address: unknown
          revoked_at: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          consent_type: string
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
          version?: string
        }
        Update: {
          consent_type?: string
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          created_at: string
          error_message: string | null
          file_url: string | null
          format: string | null
          id: string
          prompt: string
          provider: string
          provider_task_id: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          // Dimensional accuracy fields (migration 005)
          width_mm: number | null
          height_mm: number | null
          depth_mm: number | null
          scaling_mode: string | null
          actual_width_mm: number | null
          actual_height_mm: number | null
          actual_depth_mm: number | null
          dimensional_accuracy_pct: number | null
          // Generation type (migration 006)
          generation_type: "ai" | "parametric" | "dimension_aware_ai" | "image_to_3d" | null
          source_image_url: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_url?: string | null
          format?: string | null
          id?: string
          prompt: string
          provider?: string
          provider_task_id?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          // Dimensional accuracy fields (migration 005)
          width_mm?: number | null
          height_mm?: number | null
          depth_mm?: number | null
          scaling_mode?: string | null
          actual_width_mm?: number | null
          actual_height_mm?: number | null
          actual_depth_mm?: number | null
          dimensional_accuracy_pct?: number | null
          // Generation type (migration 006)
          generation_type?: "ai" | "parametric" | "dimension_aware_ai" | "image_to_3d" | null
          source_image_url?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_url?: string | null
          format?: string | null
          id?: string
          prompt?: string
          provider?: string
          provider_task_id?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          // Dimensional accuracy fields (migration 005)
          width_mm?: number | null
          height_mm?: number | null
          depth_mm?: number | null
          scaling_mode?: string | null
          actual_width_mm?: number | null
          actual_height_mm?: number | null
          actual_depth_mm?: number | null
          dimensional_accuracy_pct?: number | null
          // Generation type (migration 006)
          generation_type?: "ai" | "parametric" | "dimension_aware_ai" | "image_to_3d" | null
          source_image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "models_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          model_id: string | null
          order_name: string | null
          payment_key: string | null
          payment_method: string | null
          payment_provider: string | null
          payment_status: string | null
          print_provider: string | null
          receipt_url: string | null
          shipping_address: Json | null
          status: string
          total_price_krw: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          model_id?: string | null
          order_name?: string | null
          payment_key?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          print_provider?: string | null
          receipt_url?: string | null
          shipping_address?: Json | null
          status?: string
          total_price_krw?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          model_id?: string | null
          order_name?: string | null
          payment_key?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          print_provider?: string | null
          receipt_url?: string | null
          shipping_address?: Json | null
          status?: string
          total_price_krw?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      print_providers: {
        Row: {
          name: string
          display_name: string
          display_name_ko: string
          description: string | null
          description_ko: string | null
          location: string
          supports_api: boolean
          supports_webhook: boolean
          materials: string[]
          min_lead_days: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          display_name: string
          display_name_ko: string
          description?: string | null
          description_ko?: string | null
          location?: string
          supports_api?: boolean
          supports_webhook?: boolean
          materials?: string[]
          min_lead_days?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          display_name?: string
          display_name_ko?: string
          description?: string | null
          description_ko?: string | null
          location?: string
          supports_api?: boolean
          supports_webhook?: boolean
          materials?: string[]
          min_lead_days?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      print_orders: {
        Row: {
          id: string
          user_id: string
          model_id: string
          provider_name: string
          provider_order_id: string | null
          status: string
          material: string
          quantity: number
          price_krw: number | null
          estimated_days: number | null
          model_file_url: string
          shipping_address: Json | null
          customer_name: string | null
          customer_email: string | null
          customer_phone: string | null
          tracking_number: string | null
          tracking_url: string | null
          quote_method: string | null
          provider_quote_id: string | null
          estimated_delivery_date: string | null
          notes: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          model_id: string
          provider_name: string
          provider_order_id?: string | null
          status?: string
          material: string
          quantity?: number
          price_krw?: number | null
          estimated_days?: number | null
          model_file_url: string
          shipping_address?: Json | null
          customer_name?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          quote_method?: string | null
          provider_quote_id?: string | null
          estimated_delivery_date?: string | null
          notes?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          model_id?: string
          provider_name?: string
          provider_order_id?: string | null
          status?: string
          material?: string
          quantity?: number
          price_krw?: number | null
          estimated_days?: number | null
          model_file_url?: string
          shipping_address?: Json | null
          customer_name?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          quote_method?: string | null
          provider_quote_id?: string | null
          estimated_delivery_date?: string | null
          notes?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
