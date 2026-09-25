# I tool MCP di feega

> Generato da `node scripts/mcp-inventory.mjs --write`, leggendo `tools/list` dal server vero.
> Non si modifica a mano: il prossimo che rigenera cancella le correzioni.

**12 tool** — 4 in lettura, 5 in scrittura, 3 che distruggono.
Il payload di `tools/list` pesa **11.441 caratteri**, circa **2860 token**, ed e' il costo che ogni sessione paga prima di dire una parola.

| gruppo | tool |
|---|---:|
| Accesso diretto al database | 5 |
| Ads | 3 |
| Post | 3 |
| Nodi e generazione | 1 |

Legenda: **R** legge e non cambia niente · **W** scrive · **D** distrugge, e il client puo' chiedere conferma.

## Accesso diretto al database

### `delete_row` · D

*Delete rows*

Remove rows that exist, in your org. `where` is required — a delete with no filter is refused. At most 10 rows per call, counted before anything is removed. This does not come back. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. Omit to use the default. |
| `table` | string |  |
| `where` | object[] |  |

### `describe_node_types` · R

*Node data shapes*

What `data` must look like on a `nodes` row, per `type` — the JSON Schema `insert_row`/`update_row` actually enforce on `nodes`, not a guess. Omit `type` for all 9 at once; name one to save tokens once you know which you need. Limits (aspect ratios, durations, prompt length) are NOT here — those come from `get_media_models`, because they are a fact of the model, not the node. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. Omit to use the default. |
| `type`? | `text` \| `image` \| `video` \| `doc` \| `iframe` \| `social_account_feed` \| `social_post_mockup` \| `products` \| `ads` |  |

### `insert_row` · W

*Insert a row*

Add ONE row to any table in your org. `org_id` is filled in for you; naming a different one is refused, not quietly corrected. Never replaces anything — a row that already exists comes back as a collision, and changing it is `update_row`. Several jsonb columns are checked against a real shape before writing (`nodes.data` by `type` — call `describe_node_types` first; `posts.media`, `ad_campaigns.targeting`/`placements`, `canvases.viewport` too); a rejection names the exact field. Others are deliberately free-form. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. Omit to use the default. |
| `table` | string |  |
| `values` | object |  |

### `query` · R

*Query the database*

READ ANYTHING in your org: projects, canvases, nodes, connections, assets, posts, ads, products, social accounts — every table, scoped to your org and nothing else. No SQL: name a table, columns and filters, and it issues one PostgREST read. Omit `table` to list every name. A project has no brand until one is attached (`projects.brand_id` is nullable, and that is the normal case). A canvas belongs to a project; nodes and their connections belong to a canvas. A post (`posts` table) is the promoted artifact — caption, media, brand — different from a node, which is raw canvas material; `post_sources` links a post back to the nodes it came from. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. Omit to use the default. |
| `table`? | string |  |
| `columns`? | string[] |  |
| `where`? | object[] |  |
| `order`? | object \| array |  |
| `embed`? | object[] |  |
| `offset`? | integer |  |
| `count`? | `estimated` \| `exact` |  |
| `limit`? | integer |  |

### `update_row` · D

*Update rows*

Change columns on rows that already exist in your org. Only the columns you send are touched. `where` is required — an update with no filter is refused. At most 50 rows per call, counted before anything is written. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. Omit to use the default. |
| `table` | string |  |
| `where` | object[] |  |
| `values` | object |  |

## Ads

### `approve_ad_campaign` · D

*Approve an ad campaign*

Let a drafted campaign spend. REFUSED over an API key on purpose: an agent cannot approve its own spend — this only works from a signed-in person's own session (the app, or `feega login`). If you are an agent and this fails, tell the person to approve it themselves.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `id` | string |  |

### `create_ad_campaign` · W

*Draft an ad campaign*

Draft a new ad campaign for a brand's ad account. It ALWAYS lands unapproved (`draft`, no `approved_by`) — a campaign spends real money, and nothing here can make it spend without a human approving it separately. Nothing is scheduled or billed by calling this. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `brand_id` | string |  |
| `ad_account_id` | string |  |
| `name` | string |  |
| `objective` | `awareness` \| `traffic` \| `engagement` \| `video_views` \| `lead_generation` \| `conversions` \| `app_promotion` \| `catalog_sales` |  |
| `budget_type` | `daily` \| `lifetime` |  |
| `budget_amount` | number |  |
| `starts_at`? | string |  |
| `ends_at`? | string |  |

### `list_ad_campaigns` · R

*List ad campaigns*

Ad campaigns of one brand, with their status and whether a human has approved them yet. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `brand_id` | string |  |
| `status`? | `draft` \| `pending_review` \| `scheduled` \| `active` \| `paused` \| `completed` \| `failed` \| `rejected` |  |

## Post

### `create_post` · W

*Promote to a post*

Turn material into a post: this is what makes something publishable, distinct from writing to a node. Give it a brand, a caption and its media (asset ids already in this org). `sources` optionally links back to the nodes it came from. Lands as `draft`; nothing is scheduled or published from here. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `brand_id` | string |  |
| `caption` | string |  |
| `media`? | object[] |  |
| `title`? | string |  |
| `link_url`? | string |  |
| `sources`? | object[] |  |

### `list_posts` · R

*List posts*

Posts of one brand — the promoted artifacts, not canvas nodes. Filter by status (draft, ready, archived). Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `brand_id` | string |  |
| `status`? | `draft` \| `ready` \| `archived` |  |

### `set_post_status` · W

*Change a post status*

Move a post between draft, ready and archived. Does not schedule or publish it. Free.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `id` | string |  |
| `status` | `draft` \| `ready` \| `archived` |  |

## Nodi e generazione

### `run_node_generation` · W

*Generate a node's content*

Generate into an existing canvas node — text, image or video. This is the same engine the canvas Generate button calls; it never creates a node (`insert_row` does that). `medium` MUST match the node's own type, or the call is refused before anything is spent. Pass `version` as the node's current `nodes.version`: a stale value comes back `conflict` (never a silent overwrite) — re-read the node and retry with the fresh version. A `video` NEVER returns finished here: it comes back `queued` with an `external_job_id` on the run, and the render lands later, asynchronously — the node stays `running` until a later tick deposits the asset. Poll the node (`query`) rather than expecting a file now. Spends credits; a `credits_exhausted` failure means the org is out.

| campo | tipo | |
|---|---|---|
| `org`? | string | Which org, if you belong to more than one. |
| `node_id` | string |  |
| `medium` | `text` \| `image` \| `video` |  |
| `prompt` | string |  |
| `model` | string |  |
| `version` | integer |  |
| `params`? | object |  |

