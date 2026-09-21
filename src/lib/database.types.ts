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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          brand_id: string
          created_at: string
          currency: string
          external_account_id: string
          facebook_page_id: string | null
          id: string
          instagram_actor_id: string | null
          name: string | null
          org_id: string
          platform: string
          status: string
          timezone: string | null
          updated_at: string
          zernio_ad_account_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          currency: string
          external_account_id: string
          facebook_page_id?: string | null
          id?: string
          instagram_actor_id?: string | null
          name?: string | null
          org_id: string
          platform?: string
          status?: string
          timezone?: string | null
          updated_at?: string
          zernio_ad_account_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          currency?: string
          external_account_id?: string
          facebook_page_id?: string | null
          id?: string
          instagram_actor_id?: string | null
          name?: string | null
          org_id?: string
          platform?: string
          status?: string
          timezone?: string | null
          updated_at?: string
          zernio_ad_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          actor_id: string | null
          actor_kind: string
          ad_account_id: string
          agent_key: string | null
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          budget_amount: number
          budget_type: string
          created_at: string
          ends_at: string | null
          error: string | null
          external_campaign_id: string | null
          id: string
          name: string
          objective: string
          org_id: string
          parent_campaign_id: string | null
          placements: Json | null
          starts_at: string | null
          status: string
          targeting: Json | null
          updated_at: string
          zernio_campaign_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          ad_account_id: string
          agent_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          budget_amount: number
          budget_type: string
          created_at?: string
          ends_at?: string | null
          error?: string | null
          external_campaign_id?: string | null
          id?: string
          name: string
          objective: string
          org_id: string
          parent_campaign_id?: string | null
          placements?: Json | null
          starts_at?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string
          zernio_campaign_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          ad_account_id?: string
          agent_key?: string | null
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          budget_amount?: number
          budget_type?: string
          created_at?: string
          ends_at?: string | null
          error?: string | null
          external_campaign_id?: string | null
          id?: string
          name?: string
          objective?: string
          org_id?: string
          parent_campaign_id?: string | null
          placements?: Json | null
          starts_at?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string
          zernio_campaign_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_parent_campaign_id_fkey"
            columns: ["parent_campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          call_to_action: string | null
          campaign_id: string
          created_at: string
          description: string | null
          destination_url: string | null
          external_creative_id: string | null
          headline: string | null
          id: string
          media: Json | null
          org_id: string
          post_id: string | null
          primary_text: string | null
          rejection_reason: string | null
          scheduled_post_id: string | null
          status: string
          updated_at: string
          variant_of: string | null
        }
        Insert: {
          call_to_action?: string | null
          campaign_id: string
          created_at?: string
          description?: string | null
          destination_url?: string | null
          external_creative_id?: string | null
          headline?: string | null
          id?: string
          media?: Json | null
          org_id: string
          post_id?: string | null
          primary_text?: string | null
          rejection_reason?: string | null
          scheduled_post_id?: string | null
          status?: string
          updated_at?: string
          variant_of?: string | null
        }
        Update: {
          call_to_action?: string | null
          campaign_id?: string
          created_at?: string
          description?: string | null
          destination_url?: string | null
          external_creative_id?: string | null
          headline?: string | null
          id?: string
          media?: Json | null
          org_id?: string
          post_id?: string | null
          primary_text?: string | null
          rejection_reason?: string | null
          scheduled_post_id?: string | null
          status?: string
          updated_at?: string
          variant_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_creatives_variant_of_fkey"
            columns: ["variant_of"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calls: {
        Row: {
          actor_id: string | null
          actor_kind: string
          agent_key: string | null
          billed_credits: number | null
          brand_id: string | null
          cached_tokens: number | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          model: string | null
          node_id: string | null
          node_run_id: string | null
          operation: string
          org_id: string
          post_id: string | null
          project_id: string | null
          prompt_tokens: number | null
          provider: string
          provider_credits: number | null
          reasoning_tokens: number | null
          request_id: string | null
          status: string
          thread_id: string | null
          total_tokens: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          billed_credits?: number | null
          brand_id?: string | null
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          node_id?: string | null
          node_run_id?: string | null
          operation: string
          org_id: string
          post_id?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          provider: string
          provider_credits?: number | null
          reasoning_tokens?: number | null
          request_id?: string | null
          status: string
          thread_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          billed_credits?: number | null
          brand_id?: string | null
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          node_id?: string | null
          node_run_id?: string | null
          operation?: string
          org_id?: string
          post_id?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          provider?: string
          provider_credits?: number | null
          reasoning_tokens?: number | null
          request_id?: string | null
          status?: string
          thread_id?: string | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_node_run_id_fkey"
            columns: ["node_run_id"]
            isOneToOne: false
            referencedRelation: "node_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          bytes: number | null
          content: string | null
          created_at: string
          duration_s: number | null
          embedding: string | null
          height: number | null
          id: string
          mime_type: string | null
          org_id: string
          project_id: string | null
          source: string | null
          source_node_id: string | null
          type: string
          updated_at: string
          url: string | null
          width: number | null
        }
        Insert: {
          bytes?: number | null
          content?: string | null
          created_at?: string
          duration_s?: number | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          project_id?: string | null
          source?: string | null
          source_node_id?: string | null
          type: string
          updated_at?: string
          url?: string | null
          width?: number | null
        }
        Update: {
          bytes?: number | null
          content?: string | null
          created_at?: string
          duration_s?: number | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          project_id?: string | null
          source?: string | null
          source_node_id?: string | null
          type?: string
          updated_at?: string
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_source_node_fk"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          content: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          org_id: string
          palette: Json | null
          short_description: string | null
          slug: string
          target: Json | null
          updated_at: string
          website: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          org_id: string
          palette?: Json | null
          short_description?: string | null
          slug: string
          target?: Json | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          org_id?: string
          palette?: Json | null
          short_description?: string | null
          slug?: string
          target?: Json | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          after: Json | null
          agent_key: string | null
          before: Json | null
          canvas_id: string
          created_at: string
          edge_id: string | null
          id: number
          kind: string
          node_id: string | null
          org_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          after?: Json | null
          agent_key?: string | null
          before?: Json | null
          canvas_id: string
          created_at?: string
          edge_id?: string | null
          id?: number
          kind: string
          node_id?: string | null
          org_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          after?: Json | null
          agent_key?: string | null
          before?: Json | null
          canvas_id?: string
          created_at?: string
          edge_id?: string | null
          id?: number
          kind?: string
          node_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_events_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          project_id: string
          updated_at: string
          viewport: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          project_id: string
          updated_at?: string
          viewport?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          project_id?: string
          updated_at?: string
          viewport?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canvases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          actor_id: string | null
          actor_kind: string
          agent_key: string | null
          ai_call_id: string | null
          attachments: Json | null
          content: string | null
          created_at: string
          id: string
          org_id: string
          role: string
          seq: number
          thread_id: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          ai_call_id?: string | null
          attachments?: Json | null
          content?: string | null
          created_at?: string
          id?: string
          org_id: string
          role: string
          seq: number
          thread_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          ai_call_id?: string | null
          attachments?: Json | null
          content?: string | null
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          seq?: number
          thread_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          brand_id: string | null
          canvas_id: string | null
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          org_id: string
          project_id: string | null
          surface: string
          title: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          canvas_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          org_id: string
          project_id?: string | null
          surface?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          canvas_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          org_id?: string
          project_id?: string | null
          surface?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_ads: {
        Row: {
          brand_id: string | null
          country: string
          created_at: string
          creative_body: string | null
          creative_title: string | null
          cta: string | null
          external_ad_id: string
          fetched_at: string
          first_seen_at: string | null
          found_via: string | null
          id: string
          is_active: boolean | null
          landing_url: string | null
          last_seen_at: string | null
          matched_terms: string | null
          media: Json | null
          node_id: string | null
          org_id: string
          page_id: string | null
          page_name: string | null
          platform: string
          raw: Json | null
        }
        Insert: {
          brand_id?: string | null
          country: string
          created_at?: string
          creative_body?: string | null
          creative_title?: string | null
          cta?: string | null
          external_ad_id: string
          fetched_at?: string
          first_seen_at?: string | null
          found_via?: string | null
          id?: string
          is_active?: boolean | null
          landing_url?: string | null
          last_seen_at?: string | null
          matched_terms?: string | null
          media?: Json | null
          node_id?: string | null
          org_id: string
          page_id?: string | null
          page_name?: string | null
          platform?: string
          raw?: Json | null
        }
        Update: {
          brand_id?: string | null
          country?: string
          created_at?: string
          creative_body?: string | null
          creative_title?: string | null
          cta?: string | null
          external_ad_id?: string
          fetched_at?: string
          first_seen_at?: string | null
          found_via?: string | null
          id?: string
          is_active?: boolean | null
          landing_url?: string | null
          last_seen_at?: string | null
          matched_terms?: string | null
          media?: Json | null
          node_id?: string | null
          org_id?: string
          page_id?: string | null
          page_name?: string | null
          platform?: string
          raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_ads_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_ads_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_ads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      node_runs: {
        Row: {
          actor_id: string | null
          actor_kind: string
          attempts: number
          claimed_at: string | null
          cost_usd: number | null
          created_at: string
          error: string | null
          external_job_id: string | null
          finished_at: string | null
          id: string
          model: string | null
          node_id: string
          org_id: string
          output_asset_id: string | null
          params: Json | null
          prompt: string | null
          started_at: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          attempts?: number
          claimed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          external_job_id?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          node_id: string
          org_id: string
          output_asset_id?: string | null
          params?: Json | null
          prompt?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          attempts?: number
          claimed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          error?: string | null
          external_job_id?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          node_id?: string
          org_id?: string
          output_asset_id?: string | null
          params?: Json | null
          prompt?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_runs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "node_runs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "node_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "node_runs_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          actor_id: string | null
          actor_kind: string
          agent_key: string | null
          canvas_id: string
          created_at: string
          data: Json
          deleted_at: string | null
          display_name: string | null
          height: number | null
          id: string
          lock_actor_id: string | null
          lock_actor_kind: string | null
          lock_agent_key: string | null
          lock_at: string | null
          org_id: string
          project_id: string
          type: string
          updated_at: string
          version: number
          width: number | null
          x: number
          y: number
          z: number
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          canvas_id: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          display_name?: string | null
          height?: number | null
          id?: string
          lock_actor_id?: string | null
          lock_actor_kind?: string | null
          lock_agent_key?: string | null
          lock_at?: string | null
          org_id: string
          project_id: string
          type: string
          updated_at?: string
          version?: number
          width?: number | null
          x: number
          y: number
          z?: number
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          canvas_id?: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          display_name?: string | null
          height?: number | null
          id?: string
          lock_actor_id?: string | null
          lock_actor_kind?: string | null
          lock_agent_key?: string | null
          lock_at?: string | null
          org_id?: string
          project_id?: string
          type?: string
          updated_at?: string
          version?: number
          width?: number | null
          x?: number
          y?: number
          z?: number
        }
        Relationships: [
          {
            foreignKeyName: "nodes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_lock_actor_id_fkey"
            columns: ["lock_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes_connections: {
        Row: {
          actor_id: string | null
          actor_kind: string
          canvas_id: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          source_handle: string | null
          source_node_id: string
          target_handle: string | null
          target_node_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          canvas_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id: string
          source_handle?: string | null
          source_node_id: string
          target_handle?: string | null
          target_node_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          canvas_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          source_handle?: string | null
          source_node_id?: string
          target_handle?: string | null
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_connections_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_connections_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_connections_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_connections_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      orgs_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          org_id: string
          role: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orgs_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_sources: {
        Row: {
          created_at: string
          node_id: string
          post_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          node_id: string
          post_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          node_id?: string
          post_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_sources_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_sources_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          actor_id: string | null
          actor_kind: string
          agent_key: string | null
          brand_id: string
          caption: string
          created_at: string
          id: string
          link_url: string | null
          media: Json
          org_id: string
          per_platform: Json | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          brand_id: string
          caption?: string
          created_at?: string
          id?: string
          link_url?: string | null
          media?: Json
          org_id: string
          per_platform?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          agent_key?: string | null
          brand_id?: string
          caption?: string
          created_at?: string
          id?: string
          link_url?: string | null
          media?: Json
          org_id?: string
          per_platform?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available: boolean | null
          brand_id: string
          created_at: string
          currency: string | null
          description: string | null
          external_id: string
          handle: string | null
          id: string
          images: Json | null
          org_id: string
          platform: string
          price: number | null
          synced_at: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          available?: boolean | null
          brand_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          external_id: string
          handle?: string | null
          id?: string
          images?: Json | null
          org_id: string
          platform: string
          price?: number | null
          synced_at?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          available?: boolean | null
          brand_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          external_id?: string
          handle?: string | null
          id?: string
          images?: Json | null
          org_id?: string
          platform?: string
          price?: number | null
          synced_at?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          brand_id: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand_id?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand_id?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          account_id: string
          actor_id: string | null
          actor_kind: string
          attempts: number
          caption: string | null
          created_at: string
          error: string | null
          external_post_id: string | null
          external_url: string | null
          id: string
          media: Json | null
          org_id: string
          platform: string
          post_id: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          timezone: string
          updated_at: string
          zernio_post_id: string | null
        }
        Insert: {
          account_id: string
          actor_id?: string | null
          actor_kind?: string
          attempts?: number
          caption?: string | null
          created_at?: string
          error?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          media?: Json | null
          org_id: string
          platform: string
          post_id: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          zernio_post_id?: string | null
        }
        Update: {
          account_id?: string
          actor_id?: string | null
          actor_kind?: string
          attempts?: number
          caption?: string | null
          created_at?: string
          error?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          media?: Json | null
          org_id?: string
          platform?: string
          post_id?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          avatar_url: string | null
          brand_id: string
          connected_at: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          last_error: string | null
          org_id: string
          platform: string
          status: string
          updated_at: string
          zernio_account_id: string
          zernio_profile_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_id: string
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          org_id: string
          platform: string
          status?: string
          updated_at?: string
          zernio_account_id: string
          zernio_profile_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_id?: string
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          org_id?: string
          platform?: string
          status?: string
          updated_at?: string
          zernio_account_id?: string
          zernio_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string | null
          created_at: string
          external_id: string
          fetched_at: string
          handle: string | null
          id: string
          media: Json | null
          metrics: Json | null
          node_id: string
          org_id: string
          permalink: string | null
          platform: string
          posted_at: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          external_id: string
          fetched_at?: string
          handle?: string | null
          id?: string
          media?: Json | null
          metrics?: Json | null
          node_id: string
          org_id: string
          permalink?: string | null
          platform: string
          posted_at?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          external_id?: string
          fetched_at?: string
          handle?: string | null
          id?: string
          media?: Json | null
          metrics?: Json | null
          node_id?: string
          org_id?: string
          permalink?: string | null
          platform?: string
          posted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_org_ids: { Args: never; Returns: string[] }
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
