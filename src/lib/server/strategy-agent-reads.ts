import type { SupabaseClient } from '@supabase/supabase-js';
import { getStudio } from '$lib/server/cli-queries';
import { studioCompleteness } from '$lib/studio-completeness';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

function clip(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export async function readBrandStudioForAgent(supabase: SupabaseClient, brandId: string) {
  const [studio, brandRes] = await Promise.all([
    getStudio(supabase, brandId),
    supabase.from('brands').select('content_prefs').eq('id', brandId).maybeSingle()
  ]);
  const kit = studio.kit as AnyRec | null;
  const prefs = (brandRes.data?.content_prefs ?? {}) as AnyRec;
  const completeness = studioCompleteness({
    products: studio.products.length,
    history: studio.history.length,
    documents: studio.documents.length,
    voice: !!kit?.ai_character,
    about: !!kit?.about,
    audience: !!kit?.target_audience,
    logo: Array.isArray(kit?.logos) && kit.logos.length > 0,
    colors: !!kit?.brand_colors
  });

  return {
    completeness,
    target_platforms: studio.targetPlatforms,
    language: studio.language,
    platform_instructions: studio.platformInstructions,
    voice_prefs: {
      mood: prefs.mood ?? null,
      tone: prefs.tone ?? null,
      goal: prefs.goal ?? null,
      frequency: prefs.frequency ?? null,
      voice_mode: prefs.voiceMode ?? null,
      voice_framework: prefs.voiceFramework ?? null,
      avoid: Array.isArray(prefs.avoid) ? prefs.avoid.slice(0, 20) : [],
      voice_examples: Array.isArray(prefs.voiceExamples) ? prefs.voiceExamples.slice(0, 8) : [],
      platform_hashtags: prefs.platformHashtags ?? {}
    },
    kit: kit
      ? {
          category: kit.category,
          site_type: kit.site_type,
          about: kit.about,
          target_audience: kit.target_audience,
          brand_style: kit.brand_style,
          brand_colors: kit.brand_colors,
          theme_color: kit.theme_color,
          fonts: kit.fonts,
          logos: kit.logos,
          favicon_url: kit.favicon_url,
          images: kit.images,
          ai_character: kit.ai_character,
          ai_context: clip(kit.ai_context as string, 6000),
          ai_context_updated_at: kit.ai_context_updated_at,
          content_pillars: kit.content_pillars,
          visual_style: clip(kit.visual_style as string, 8000),
          visual_style_locked: kit.visual_style_locked === true
        }
      : null,
    products: studio.products.map((p: AnyRec) => ({
      id: p.id,
      title: p.title,
      pricing: p.pricing,
      featured: p.featured,
      imageCount: Array.isArray(p.images) ? p.images.length : 0
    })),
    people: studio.people,
    competitors: studio.competitors.map((c: AnyRec) => ({
      name: c.name,
      website: c.website,
      kind: c.kind,
      rationale: c.rationale
    }))
  };
}

export async function readKnowledgeForAgent(
  supabase: SupabaseClient,
  brandId: string,
  opts?: { kind?: 'note' | 'document' | 'image'; limit?: number; query?: string }
) {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 60);

  if (opts?.query?.trim()) {
    const { searchKnowledge } = await import('$lib/server/knowledge');
    const hits = await searchKnowledge(supabase, brandId, opts.query, { limit: Math.min(limit, 12) });
    return { mode: 'search' as const, results: hits, count: hits.length };
  }

  let query = supabase
    .from('brand_documents')
    .select('id, kind, title, summary, status, chunk_count, file_name, mime_type, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts?.kind) query = query.eq('kind', opts.kind);

  const { data } = await query;
  return {
    mode: 'list' as const,
    documents: (data ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      file_name: d.file_name,
      mime_type: d.mime_type,
      created_at: d.created_at,
      status: d.status,
      chunk_count: d.chunk_count,
      summary: clip(d.summary, 400)
    })),
    count: data?.length ?? 0,
    hint: 'Pass query= to retrieve chunk passages via FTS.'
  };
}
