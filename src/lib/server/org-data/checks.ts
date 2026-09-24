/**
 * I VINCOLI CHECK DELLE 26 TABELLE, letti da `pg_constraint` sul database vero
 * (klnswzhhgrqvbfjzioul). Stesso motivo di `tables.ts`: le migration non li hanno ancora, quindi
 * non si possono generare da lì. `org-tables.test.ts` non li riverifica ad ogni corsa — costerebbe
 * una connessione al database ad ogni `vitest run` — ma il fix di un CHECK scritto qui a mano e
 * quello vero divergono al silenzio, non a un test rosso: chi tocca un CHECK in una migrazione
 * futura lo aggiorna anche qui.
 *
 * Nessun grant per colonna: `information_schema.column_privileges` per `authenticated` su queste
 * tabelle è vuoto, quindi non c'è un `ORG_WRITABLE_COLUMNS` da generare — il confine è tutto RLS.
 */
export const ORG_TABLE_CHECKS: Record<string, string> = {
  ad_accounts_platform_check: "platform = 'meta'",
  ad_accounts_status_check: "status in ('connected', 'expired', 'revoked')",
  ad_campaigns_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  ad_campaigns_budget_type_check: "budget_type in ('daily', 'lifetime')",
  ad_campaigns_objective_check:
    "objective in ('awareness', 'traffic', 'engagement', 'video_views', 'lead_generation', 'conversions', 'app_promotion', 'catalog_sales')",
  ad_campaigns_status_check:
    "status in ('draft', 'pending_review', 'scheduled', 'active', 'paused', 'completed', 'failed', 'rejected')",
  ad_creatives_status_check: "status in ('draft', 'active', 'paused', 'rejected')",
  ai_calls_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  ai_calls_status_check: "status in ('ok', 'error', 'timeout', 'refused')",
  assets_source_check: "source in ('upload', 'generated', 'imported')",
  assets_type_check: "type in ('text', 'image', 'video', 'iframe', 'document')",
  canvas_events_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  canvas_events_kind_check: "kind in ('node.create', 'node.update', 'node.delete', 'edge.create', 'edge.delete')",
  chat_messages_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  chat_messages_role_check: "role in ('user', 'assistant', 'tool', 'system')",
  chat_threads_surface_check: "surface in ('sidebar', 'mcp', 'cli')",
  competitor_ads_found_via_check: "found_via in ('page', 'search')",
  competitor_ads_platform_check: "platform = 'meta'",
  influencers_source_check: "source in ('catalogue', 'generated', 'upload')",
  influencers_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  node_runs_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  node_runs_status_check: "status in ('running', 'finishing', 'done', 'failed', 'expired')",
  nodes_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  nodes_connections_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  nodes_connections_check: 'source_node_id <> target_node_id',
  nodes_connections_mode_check: "mode in ('fixed', 'iterate')",
  nodes_lock_actor_kind_check: "lock_actor_kind in ('user', 'agent', 'system')",
  nodes_type_check:
    "type in ('text', 'image', 'video', 'doc', 'iframe', 'social_account_feed', 'social_post_mockup', 'products', 'ads', 'influencer', 'list', 'select')",
  orgs_invites_role_check: "role in ('owner', 'admin', 'member')",
  orgs_members_role_check: "role in ('owner', 'admin', 'member')",
  post_sources_role_check: "role in ('caption', 'media', 'reference')",
  posts_actor_kind_check: "actor_kind in ('user', 'agent', 'system')",
  posts_status_check: "status in ('draft', 'ready', 'archived')",
  products_platform_check: "platform in ('shopify', 'woocommerce')",
  social_accounts_platform_check:
    "platform in ('instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'threads', 'youtube', 'reddit', 'pinterest')",
  social_accounts_status_check: "status in ('connected', 'expired', 'revoked')"
};
