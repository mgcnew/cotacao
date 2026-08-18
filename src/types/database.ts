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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_company_id_parent_id_fkey"
            columns: ["company_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      commercial_divergences: {
        Row: {
          agreed_value: Json | null
          company_id: string
          created_at: string
          created_by: string | null
          financial_impact: number | null
          id: string
          order_id: string
          order_revision_item_id: string
          realized_value: Json | null
          receipt_item_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          supplier_id: string
          type: string
          updated_at: string
        }
        Insert: {
          agreed_value?: Json | null
          company_id: string
          created_at?: string
          created_by?: string | null
          financial_impact?: number | null
          id?: string
          order_id: string
          order_revision_item_id: string
          realized_value?: Json | null
          receipt_item_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          supplier_id: string
          type: string
          updated_at?: string
        }
        Update: {
          agreed_value?: Json | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          financial_impact?: number | null
          id?: string
          order_id?: string
          order_revision_item_id?: string
          realized_value?: Json | null
          receipt_item_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          supplier_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_divergences_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "commercial_divergences_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "v_order_delivery_status"
            referencedColumns: ["company_id", "order_id"]
          },
          {
            foreignKeyName: "commercial_divergences_company_id_order_revision_item_id_fkey"
            columns: ["company_id", "order_revision_item_id"]
            isOneToOne: false
            referencedRelation: "order_revision_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "commercial_divergences_company_id_receipt_item_id_fkey"
            columns: ["company_id", "receipt_item_id"]
            isOneToOne: false
            referencedRelation: "receipt_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "commercial_divergences_company_id_receipt_item_id_fkey"
            columns: ["company_id", "receipt_item_id"]
            isOneToOne: false
            referencedRelation: "v_conversion_history"
            referencedColumns: ["company_id", "receipt_item_id"]
          },
          {
            foreignKeyName: "commercial_divergences_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      communication_logs: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          external_message_id: string | null
          id: string
          order_revision_id: string | null
          provider: string
          round_supplier_id: string | null
          sent_at: string | null
          status: string
          supplier_contact_id: string | null
          supplier_id: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          order_revision_id?: string | null
          provider: string
          round_supplier_id?: string | null
          sent_at?: string | null
          status: string
          supplier_contact_id?: string | null
          supplier_id: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          order_revision_id?: string | null
          provider?: string
          round_supplier_id?: string | null
          sent_at?: string | null
          status?: string
          supplier_contact_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_company_id_order_revision_id_fkey"
            columns: ["company_id", "order_revision_id"]
            isOneToOne: false
            referencedRelation: "order_revisions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "communication_logs_company_id_round_supplier_id_fkey"
            columns: ["company_id", "round_supplier_id"]
            isOneToOne: false
            referencedRelation: "round_suppliers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "communication_logs_company_id_supplier_contact_id_fkey"
            columns: ["company_id", "supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contacts"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "communication_logs_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          currency_code: string
          document_number: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          document_number?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          document_number?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          joined_at: string | null
          role_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_company_id_role_id_fkey"
            columns: ["company_id", "role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      domain_events: {
        Row: {
          actor_supplier_id: string | null
          actor_type: string
          actor_user_id: string | null
          aggregate_id: string
          aggregate_type: string
          company_id: string
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_supplier_id?: string | null
          actor_type: string
          actor_user_id?: string | null
          aggregate_id: string
          aggregate_type: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Update: {
          actor_supplier_id?: string | null
          actor_type?: string
          actor_user_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_company_id_actor_supplier_id_fkey"
            columns: ["company_id", "actor_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "domain_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permission_overrides: {
        Row: {
          company_member_id: string
          created_at: string
          effect: string
          id: string
          permission_id: string
        }
        Insert: {
          company_member_id: string
          created_at?: string
          effect: string
          id?: string
          permission_id: string
        }
        Update: {
          company_member_id?: string
          created_at?: string
          effect?: string
          id?: string
          permission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permission_overrides_company_member_id_fkey"
            columns: ["company_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiations: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          id: string
          negotiated_by: string | null
          new_price: number
          notes: string | null
          previous_price: number
          quotation_response_item_id: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          id?: string
          negotiated_by?: string | null
          new_price: number
          notes?: string | null
          previous_price: number
          quotation_response_item_id: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          id?: string
          negotiated_by?: string | null
          new_price?: number
          notes?: string | null
          previous_price?: number
          quotation_response_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_company_id_quotation_response_item_id_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_response_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "negotiations_company_id_quotation_response_item_id_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "v_current_response_prices"
            referencedColumns: ["company_id", "quotation_response_item_id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          company_id: string
          created_at: string
          id: string
          message: string | null
          metadata: Json
          priority: string
          read_at: string | null
          resource_id: string | null
          resource_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          company_id: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          priority?: string
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          company_id?: string
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          priority?: string
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_divergences: {
        Row: {
          company_id: string
          created_at: string
          current_value: Json | null
          id: string
          notes: string | null
          order_id: string
          order_revision_id: string
          order_revision_item_id: string | null
          proposed_value: Json | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_value?: Json | null
          id?: string
          notes?: string | null
          order_id: string
          order_revision_id: string
          order_revision_item_id?: string | null
          proposed_value?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_value?: Json | null
          id?: string
          notes?: string | null
          order_id?: string
          order_revision_id?: string
          order_revision_item_id?: string | null
          proposed_value?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_divergences_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_divergences_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "v_order_delivery_status"
            referencedColumns: ["company_id", "order_id"]
          },
          {
            foreignKeyName: "order_divergences_company_id_order_revision_id_fkey"
            columns: ["company_id", "order_revision_id"]
            isOneToOne: false
            referencedRelation: "order_revisions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_divergences_company_id_order_revision_item_id_fkey"
            columns: ["company_id", "order_revision_item_id"]
            isOneToOne: false
            referencedRelation: "order_revision_items"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      order_revision_items: {
        Row: {
          agreed_price: number
          company_id: string
          comparison_unit_id: string | null
          created_at: string
          estimated_pricing_quantity: number | null
          id: string
          notes: string | null
          order_revision_id: string
          pricing_unit_id: string
          product_id: string
          product_name_snapshot: string
          purchase_allocation_id: string | null
          purchase_unit_id: string
          requested_quantity: number
        }
        Insert: {
          agreed_price: number
          company_id: string
          comparison_unit_id?: string | null
          created_at?: string
          estimated_pricing_quantity?: number | null
          id?: string
          notes?: string | null
          order_revision_id: string
          pricing_unit_id: string
          product_id: string
          product_name_snapshot: string
          purchase_allocation_id?: string | null
          purchase_unit_id: string
          requested_quantity: number
        }
        Update: {
          agreed_price?: number
          company_id?: string
          comparison_unit_id?: string | null
          created_at?: string
          estimated_pricing_quantity?: number | null
          id?: string
          notes?: string | null
          order_revision_id?: string
          pricing_unit_id?: string
          product_id?: string
          product_name_snapshot?: string
          purchase_allocation_id?: string | null
          purchase_unit_id?: string
          requested_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_revision_items_company_id_comparison_unit_id_fkey"
            columns: ["company_id", "comparison_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revision_items_company_id_order_revision_id_fkey"
            columns: ["company_id", "order_revision_id"]
            isOneToOne: false
            referencedRelation: "order_revisions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revision_items_company_id_pricing_unit_id_fkey"
            columns: ["company_id", "pricing_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revision_items_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revision_items_company_id_purchase_allocation_id_fkey"
            columns: ["company_id", "purchase_allocation_id"]
            isOneToOne: false
            referencedRelation: "purchase_allocations"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revision_items_company_id_purchase_unit_id_fkey"
            columns: ["company_id", "purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      order_revisions: {
        Row: {
          company_id: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          delivery_due_date: string | null
          id: string
          order_id: string
          revision_number: number
          sent_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_due_date?: string | null
          id?: string
          order_id: string
          revision_number: number
          sent_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_due_date?: string | null
          id?: string
          order_id?: string
          revision_number?: number
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_revisions_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "order_revisions_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "v_order_delivery_status"
            referencedColumns: ["company_id", "order_id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          id: string
          order_number: number
          origin: string
          purchase_round_id: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          order_number?: never
          origin: string
          purchase_round_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          id?: string
          order_number?: never
          origin?: string
          purchase_round_id?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "purchase_rounds"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "orders_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_round_progress"
            referencedColumns: ["company_id", "purchase_round_id"]
          },
          {
            foreignKeyName: "orders_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "orders_current_revision_fk"
            columns: ["company_id", "current_revision_id"]
            isOneToOne: false
            referencedRelation: "order_revisions"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          key: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      product_attribute_definitions: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          data_type: string
          id: string
          is_active: boolean
          is_conversion_factor: boolean
          is_required: boolean
          key: string
          name: string
          product_id: string | null
          sort_order: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          data_type: string
          id?: string
          is_active?: boolean
          is_conversion_factor?: boolean
          is_required?: boolean
          key: string
          name: string
          product_id?: string | null
          sort_order?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          data_type?: string
          id?: string
          is_active?: boolean
          is_conversion_factor?: boolean
          is_required?: boolean
          key?: string
          name?: string
          product_id?: string | null
          sort_order?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_definitions_company_id_category_id_fkey"
            columns: ["company_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_definitions_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_definitions_company_id_unit_id_fkey"
            columns: ["company_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_definition_id: string
          company_id: string
          created_at: string
          id: string
          product_id: string
          updated_at: string
          value_boolean: boolean | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          attribute_definition_id: string
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_definition_id?: string
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_company_id_attribute_definition_i_fkey"
            columns: ["company_id", "attribute_definition_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_definitions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "product_attribute_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          company_id: string
          comparison_unit_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          photo_path: string | null
          pricing_unit_id: string
          purchase_unit_id: string
          purpose: string
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          comparison_unit_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          photo_path?: string | null
          pricing_unit_id: string
          purchase_unit_id: string
          purpose?: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          comparison_unit_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          photo_path?: string | null
          pricing_unit_id?: string
          purchase_unit_id?: string
          purpose?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_category_id_fkey"
            columns: ["company_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "products_company_id_comparison_unit_id_fkey"
            columns: ["company_id", "comparison_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_pricing_unit_id_fkey"
            columns: ["company_id", "pricing_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "products_company_id_purchase_unit_id_fkey"
            columns: ["company_id", "purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_access_tokens: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          last_accessed_at: string | null
          order_revision_id: string | null
          purpose: string
          revoked_at: string | null
          round_supplier_id: string | null
          supplier_id: string
          token_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          order_revision_id?: string | null
          purpose: string
          revoked_at?: string | null
          round_supplier_id?: string | null
          supplier_id: string
          token_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_accessed_at?: string | null
          order_revision_id?: string | null
          purpose?: string
          revoked_at?: string | null
          round_supplier_id?: string | null
          supplier_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_access_tokens_company_id_order_revision_id_fkey"
            columns: ["company_id", "order_revision_id"]
            isOneToOne: false
            referencedRelation: "order_revisions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "public_access_tokens_company_id_round_supplier_id_fkey"
            columns: ["company_id", "round_supplier_id"]
            isOneToOne: false
            referencedRelation: "round_suppliers"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "public_access_tokens_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_allocations: {
        Row: {
          allocated_by: string | null
          allocated_quantity: number
          benchmark_price_at_decision: number | null
          company_id: string
          created_at: string
          decision_notes: string | null
          decision_reason: string | null
          estimated_pricing_quantity: number | null
          id: string
          purchase_round_id: string
          quotation_item_id: string
          quotation_response_item_id: string
          selected_price: number
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          allocated_by?: string | null
          allocated_quantity: number
          benchmark_price_at_decision?: number | null
          company_id: string
          created_at?: string
          decision_notes?: string | null
          decision_reason?: string | null
          estimated_pricing_quantity?: number | null
          id?: string
          purchase_round_id: string
          quotation_item_id: string
          quotation_response_item_id: string
          selected_price: number
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          allocated_by?: string | null
          allocated_quantity?: number
          benchmark_price_at_decision?: number | null
          company_id?: string
          created_at?: string
          decision_notes?: string | null
          decision_reason?: string | null
          estimated_pricing_quantity?: number | null
          id?: string
          purchase_round_id?: string
          quotation_item_id?: string
          quotation_response_item_id?: string
          selected_price?: number
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_allocations_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "purchase_rounds"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_allocations_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_round_progress"
            referencedColumns: ["company_id", "purchase_round_id"]
          },
          {
            foreignKeyName: "purchase_allocations_company_id_quotation_item_id_fkey"
            columns: ["company_id", "quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_allocations_company_id_quotation_response_item_id_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_response_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_allocations_company_id_quotation_response_item_id_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "v_current_response_prices"
            referencedColumns: ["company_id", "quotation_response_item_id"]
          },
          {
            foreignKeyName: "purchase_allocations_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      purchase_round_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          purchase_round_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          purchase_round_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          purchase_round_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_round_groups_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "purchase_rounds"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_round_groups_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_round_progress"
            referencedColumns: ["company_id", "purchase_round_id"]
          },
        ]
      }
      purchase_rounds: {
        Row: {
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_rounds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          commercial_status: string
          company_id: string
          comparison_unit_id: string | null
          created_at: string
          estimated_conversion_rate: number | null
          estimated_pricing_quantity: number | null
          group_id: string
          id: string
          notes: string | null
          pricing_unit_id: string
          product_id: string
          purchase_round_id: string
          purchase_unit_id: string
          requested_quantity: number
          updated_at: string
        }
        Insert: {
          commercial_status?: string
          company_id: string
          comparison_unit_id?: string | null
          created_at?: string
          estimated_conversion_rate?: number | null
          estimated_pricing_quantity?: number | null
          group_id: string
          id?: string
          notes?: string | null
          pricing_unit_id: string
          product_id: string
          purchase_round_id: string
          purchase_unit_id: string
          requested_quantity: number
          updated_at?: string
        }
        Update: {
          commercial_status?: string
          company_id?: string
          comparison_unit_id?: string | null
          created_at?: string
          estimated_conversion_rate?: number | null
          estimated_pricing_quantity?: number | null
          group_id?: string
          id?: string
          notes?: string | null
          pricing_unit_id?: string
          product_id?: string
          purchase_round_id?: string
          purchase_unit_id?: string
          requested_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_company_id_comparison_unit_id_fkey"
            columns: ["company_id", "comparison_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_group_id_fkey"
            columns: ["company_id", "group_id"]
            isOneToOne: false
            referencedRelation: "purchase_round_groups"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_pricing_unit_id_fkey"
            columns: ["company_id", "pricing_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "purchase_rounds"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_round_progress"
            referencedColumns: ["company_id", "purchase_round_id"]
          },
          {
            foreignKeyName: "quotation_items_company_id_purchase_unit_id_fkey"
            columns: ["company_id", "purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      quotation_response_attribute_values: {
        Row: {
          attribute_definition_id: string
          company_id: string
          created_at: string
          id: string
          quotation_response_item_id: string
          value_boolean: boolean | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          attribute_definition_id: string
          company_id: string
          created_at?: string
          id?: string
          quotation_response_item_id: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_definition_id?: string
          company_id?: string
          created_at?: string
          id?: string
          quotation_response_item_id?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_response_attribute__company_id_attribute_definit_fkey"
            columns: ["company_id", "attribute_definition_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_definitions"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_response_attribute__company_id_quotation_respons_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_response_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_response_attribute__company_id_quotation_respons_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "v_current_response_prices"
            referencedColumns: ["company_id", "quotation_response_item_id"]
          },
        ]
      }
      quotation_response_items: {
        Row: {
          company_id: string
          created_at: string
          does_not_supply: boolean
          id: string
          is_available: boolean | null
          notes: string | null
          quotation_response_id: string
          quoted_price: number | null
          supplier_quotation_item_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          does_not_supply?: boolean
          id?: string
          is_available?: boolean | null
          notes?: string | null
          quotation_response_id: string
          quoted_price?: number | null
          supplier_quotation_item_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          does_not_supply?: boolean
          id?: string
          is_available?: boolean | null
          notes?: string | null
          quotation_response_id?: string
          quoted_price?: number | null
          supplier_quotation_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_response_items_company_id_quotation_response_id_fkey"
            columns: ["company_id", "quotation_response_id"]
            isOneToOne: false
            referencedRelation: "quotation_responses"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_response_items_company_id_supplier_quotation_ite_fkey"
            columns: ["company_id", "supplier_quotation_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotation_items"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      quotation_responses: {
        Row: {
          company_id: string
          created_at: string
          entered_by: string | null
          id: string
          round_supplier_id: string
          source: string
          started_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entered_by?: string | null
          id?: string
          round_supplier_id: string
          source: string
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          round_supplier_id?: string
          source?: string
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_responses_company_id_round_supplier_id_fkey"
            columns: ["company_id", "round_supplier_id"]
            isOneToOne: false
            referencedRelation: "round_suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          logistic_quantity_received: number
          notes: string | null
          order_revision_item_id: string
          practiced_price: number
          pricing_quantity_received: number
          receipt_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          logistic_quantity_received: number
          notes?: string | null
          order_revision_item_id: string
          practiced_price: number
          pricing_quantity_received: number
          receipt_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          logistic_quantity_received?: number
          notes?: string | null
          order_revision_item_id?: string
          practiced_price?: number
          pricing_quantity_received?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_company_id_order_revision_item_id_fkey"
            columns: ["company_id", "order_revision_item_id"]
            isOneToOne: false
            referencedRelation: "order_revision_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "receipt_items_company_id_receipt_id_fkey"
            columns: ["company_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      receipts: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          order_id: string
          received_at: string | null
          received_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "receipts_company_id_order_id_fkey"
            columns: ["company_id", "order_id"]
            isOneToOne: false
            referencedRelation: "v_order_delivery_status"
            referencedColumns: ["company_id", "order_id"]
          },
        ]
      }
      response_item_corrections: {
        Row: {
          company_id: string
          corrected_by: string | null
          created_at: string
          field_name: string
          id: string
          new_value: Json | null
          old_value: Json | null
          quotation_response_item_id: string
          reason: string
        }
        Insert: {
          company_id: string
          corrected_by?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          quotation_response_item_id: string
          reason: string
        }
        Update: {
          company_id?: string
          corrected_by?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          quotation_response_item_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_item_corrections_company_id_quotation_response_it_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_response_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "response_item_corrections_company_id_quotation_response_it_fkey"
            columns: ["company_id", "quotation_response_item_id"]
            isOneToOne: false
            referencedRelation: "v_current_response_prices"
            referencedColumns: ["company_id", "quotation_response_item_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      round_suppliers: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          first_accessed_at: string | null
          first_sent_at: string | null
          id: string
          purchase_round_id: string
          supplier_contact_id: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          first_accessed_at?: string | null
          first_sent_at?: string | null
          id?: string
          purchase_round_id: string
          supplier_contact_id?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          first_accessed_at?: string | null
          first_sent_at?: string | null
          id?: string
          purchase_round_id?: string
          supplier_contact_id?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_suppliers_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "purchase_rounds"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "round_suppliers_company_id_purchase_round_id_fkey"
            columns: ["company_id", "purchase_round_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_round_progress"
            referencedColumns: ["company_id", "purchase_round_id"]
          },
          {
            foreignKeyName: "round_suppliers_company_id_supplier_contact_id_fkey"
            columns: ["company_id", "supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "supplier_contacts"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "round_suppliers_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      supplier_categories: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          supplier_id: string
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          supplier_id: string
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_categories_company_id_category_id_fkey"
            columns: ["company_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "supplier_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_categories_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          supplier_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          supplier_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          supplier_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          company_id: string
          created_at: string
          id: string
          manually_confirmed_at: string | null
          product_id: string
          source: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          manually_confirmed_at?: string | null
          product_id: string
          source?: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          manually_confirmed_at?: string | null
          product_id?: string
          source?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      supplier_purchase_schedules: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          preferred_time: string | null
          supplier_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          preferred_time?: string | null
          supplier_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          preferred_time?: string | null
          supplier_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_schedules_company_id_category_id_fkey"
            columns: ["company_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "supplier_purchase_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_schedules_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      supplier_quotation_items: {
        Row: {
          added_after_initial_send: boolean
          company_id: string
          created_at: string
          id: string
          quotation_item_id: string
          removed_at: string | null
          round_supplier_id: string
          updated_at: string
        }
        Insert: {
          added_after_initial_send?: boolean
          company_id: string
          created_at?: string
          id?: string
          quotation_item_id: string
          removed_at?: string | null
          round_supplier_id: string
          updated_at?: string
        }
        Update: {
          added_after_initial_send?: boolean
          company_id?: string
          created_at?: string
          id?: string
          quotation_item_id?: string
          removed_at?: string | null
          round_supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotation_items_company_id_quotation_item_id_fkey"
            columns: ["company_id", "quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "supplier_quotation_items_company_id_round_supplier_id_fkey"
            columns: ["company_id", "round_supplier_id"]
            isOneToOne: false
            referencedRelation: "round_suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string
          created_at: string
          document_number: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          purchase_limit: number | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          document_number?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          purchase_limit?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          document_number?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          purchase_limit?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          symbol: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_conversion_history: {
        Row: {
          company_id: string | null
          conversion_rate: number | null
          logistic_quantity_received: number | null
          pricing_quantity_received: number | null
          pricing_unit_id: string | null
          product_id: string | null
          purchase_unit_id: string | null
          receipt_item_id: string | null
          received_at: string | null
          supplier_id: string | null
        }
        Relationships: []
      }
      v_current_response_prices: {
        Row: {
          company_id: string | null
          current_price: number | null
          last_negotiated_at: string | null
          last_negotiation_id: string | null
          quotation_response_id: string | null
          quotation_response_item_id: string | null
          quoted_price: number | null
          supplier_quotation_item_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_response_items_company_id_quotation_response_id_fkey"
            columns: ["company_id", "quotation_response_id"]
            isOneToOne: false
            referencedRelation: "quotation_responses"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "quotation_response_items_company_id_supplier_quotation_ite_fkey"
            columns: ["company_id", "supplier_quotation_item_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotation_items"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      v_order_delivery_status: {
        Row: {
          company_id: string | null
          current_revision_id: string | null
          delivery_due_date: string | null
          is_due_today: boolean | null
          is_overdue: boolean | null
          order_id: string | null
          order_number: number | null
          overdue_days: number | null
          status: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
      v_purchase_round_progress: {
        Row: {
          company_id: string | null
          created_at: string | null
          items_confirmed: number | null
          notes: string | null
          orders_created: number | null
          purchase_round_id: string | null
          status: string | null
          suppliers_completed: number | null
          suppliers_pending: number | null
          title: string | null
          total_items: number | null
          total_suppliers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_rounds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_realized_savings: {
        Row: {
          agreed_price: number | null
          company_id: string | null
          divergence_impact: number | null
          negotiated_savings: number | null
          order_id: string | null
          order_revision_item_id: string | null
          practiced_price: number | null
          pricing_quantity_received: number | null
          product_id: string | null
          quoted_price: number | null
          realized_savings: number | null
          receipt_id: string | null
          received_at: string | null
          supplier_id: string | null
        }
        Relationships: []
      }
      v_supplier_product_stats: {
        Row: {
          company_id: string | null
          last_purchase_at: string | null
          last_response_at: string | null
          product_id: string | null
          purchase_orders: number | null
          quotation_opportunities: number | null
          relationship_status: string | null
          response_rate: number | null
          responses: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_product_id_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "supplier_products_company_id_supplier_id_fkey"
            columns: ["company_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["company_id", "id"]
          },
        ]
      }
    }
    Functions: {
      rpc_activate_round: {
        Args: { p_company_id: string; p_purchase_round_id: string }
        Returns: Json
      }
      rpc_cancel_order: {
        Args: { p_company_id: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      rpc_cancel_round: {
        Args: {
          p_company_id: string
          p_purchase_round_id: string
          p_reason: string
        }
        Returns: Json
      }
      rpc_cancel_round_group: {
        Args: { p_company_id: string; p_group_id: string }
        Returns: Json
      }
      rpc_close_order_balance: {
        Args: { p_company_id: string; p_order_id: string; p_reason: string }
        Returns: Json
      }
      rpc_close_round_group: {
        Args: { p_company_id: string; p_group_id: string }
        Returns: Json
      }
      rpc_complete_round: {
        Args: { p_company_id: string; p_purchase_round_id: string }
        Returns: Json
      }
      rpc_confirm_allocations_generate_orders: {
        Args: {
          p_allocation_ids: string[]
          p_company_id: string
          p_delivery_due_date?: string
          p_purchase_round_id: string
        }
        Returns: Json
      }
      rpc_correct_quotation_response_item: {
        Args: {
          p_company_id: string
          p_does_not_supply?: boolean
          p_is_available?: boolean
          p_notes?: string
          p_quotation_response_item_id: string
          p_quoted_price?: number
          p_reason?: string
        }
        Returns: Json
      }
      rpc_create_direct_order: {
        Args: {
          p_company_id: string
          p_delivery_due_date?: string
          p_items: Json
          p_supplier_id: string
        }
        Returns: Json
      }
      rpc_create_supplier_with_contact: {
        Args: {
          p_company_id: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_phone?: string
          p_contact_role?: string
          p_contact_whatsapp?: string
          p_document_number?: string
          p_legal_name?: string
          p_name: string
          p_notes?: string
          p_purchase_limit?: number
        }
        Returns: string
      }
      rpc_create_order_revision: {
        Args: {
          p_company_id: string
          p_delivery_due_date?: string
          p_items: Json
          p_order_id: string
        }
        Returns: Json
      }
      rpc_dashboard_snapshot: {
        Args: {
          p_company_id: string
          p_dias_falha?: number
          p_status_em_andamento?: string[]
        }
        Returns: {
          atraso_order_id: string
          atraso_pior_dias: number
          divergencia_comercial_order_id: string
          divergencia_fornecedor_order_id: string
          divergencias_comerciais: number
          divergencias_fornecedor: number
          entrega_hoje_order_id: string
          entregas_hoje: number
          falhas_envio: number
          fornecedores_ativos: number
          itens_sem_alocacao: number
          pedidos_atrasados: number
          pedidos_em_aberto: number
          pedidos_rascunho: number
          produtos_ativos: number
          rascunho_order_id: string
          revisao_order_id: string
          revisoes_pendentes: number
          rodadas: Json
          rodadas_total: number
        }[]
      }
      rpc_mark_order_revision_sent: {
        Args: { p_company_id: string; p_order_revision_id: string }
        Returns: Json
      }
      rpc_mark_round_supplier_sent: {
        Args: { p_company_id: string; p_round_supplier_id: string }
        Returns: Json
      }
      rpc_post_receipt: {
        Args: {
          p_company_id: string
          p_items: Json
          p_notes?: string
          p_order_id: string
          p_received_at: string
        }
        Returns: Json
      }
      rpc_public_confirm_order: { Args: { p_token: string }; Returns: Json }
      rpc_public_get_order: { Args: { p_token: string }; Returns: Json }
      rpc_public_get_quotation: { Args: { p_token: string }; Returns: Json }
      rpc_public_report_order_divergence: {
        Args: { p_divergences: Json; p_token: string }
        Returns: Json
      }
      rpc_public_submit_quotation: {
        Args: { p_items: Json; p_token: string }
        Returns: Json
      }
      rpc_record_manual_quotation_item: {
        Args: {
          p_company_id: string
          p_does_not_supply?: boolean
          p_notes?: string
          p_quoted_price?: number
          p_supplier_quotation_item_id: string
        }
        Returns: string
      }
      rpc_record_negotiation: {
        Args: {
          p_channel: string
          p_company_id: string
          p_new_price: number
          p_notes?: string
          p_quotation_response_item_id: string
        }
        Returns: Json
      }
      rpc_resolve_commercial_divergence: {
        Args: {
          p_company_id: string
          p_divergence_id: string
          p_resolution_notes?: string
          p_status: string
        }
        Returns: Json
      }
      rpc_resolve_order_divergence: {
        Args: {
          p_company_id: string
          p_notes?: string
          p_order_divergence_id: string
          p_status: string
        }
        Returns: Json
      }
      rpc_search_company: {
        Args: {
          p_company_id: string
          p_limit?: number
          p_orders?: boolean
          p_products?: boolean
          p_rounds?: boolean
          p_suppliers?: boolean
          p_term: string
        }
        Returns: {
          id: string
          kind: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      rpc_service_log_communication: {
        Args: {
          p_channel: string
          p_company_id: string
          p_error_message?: string
          p_external_message_id?: string
          p_order_revision_id?: string
          p_provider: string
          p_round_supplier_id?: string
          p_status: string
          p_supplier_contact_id?: string
          p_supplier_id: string
        }
        Returns: string
      }
      rpc_service_provision_company: {
        Args: {
          p_currency_code?: string
          p_document_number?: string
          p_legal_name?: string
          p_name: string
          p_owner_user_id: string
          p_timezone?: string
        }
        Returns: string
      }
      rpc_service_store_public_token: {
        Args: {
          p_company_id: string
          p_expires_at?: string
          p_order_revision_id?: string
          p_purpose: string
          p_round_supplier_id?: string
          p_supplier_id: string
          p_token_hash?: string
        }
        Returns: string
      }
      rpc_service_update_communication_log: {
        Args: {
          p_communication_log_id: string
          p_company_id: string
          p_error_message?: string
          p_external_message_id?: string
          p_status: string
        }
        Returns: string
      }
      rpc_session_context: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          company_status: string
          member_id: string
          permissions: string[]
          role_id: string
          role_name: string
        }[]
      }
      rpc_update_draft_order_revision: {
        Args: {
          p_company_id: string
          p_delivery_due_date?: string
          p_items: Json
          p_order_revision_id: string
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
  public: {
    Enums: {},
  },
} as const
