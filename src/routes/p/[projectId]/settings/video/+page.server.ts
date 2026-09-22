import type { Actions, PageServerLoad } from './$types';
import { studioActions } from '$lib/server/studio-actions';
import { videoDurationOptions, isKnownVideoModel } from '$lib/server/video';
import { MEDIA_MODEL_SLOTS, slotAccepts } from '$lib/media-model-slots';
import { offerableSlotChoices } from '$lib/server/offerable-models';
import { createAdminClient } from '$lib/server/supabase-admin';

export const load: PageServerLoad = async ({ parent }) => {
  const { brand } = await parent();
  const prefs = (brand?.content_prefs ?? {}) as Record<string, unknown>;
  const videoModel = isKnownVideoModel(prefs.videoModel) ? String(prefs.videoModel) : null;
  const admin = createAdminClient();

  return {
    // Uno slot stantio non torna selezionato: mostrare un modello che il salvataggio poi rifiuta
    // e' peggio che mostrare "Platform default", perche' sembra una scelta gia' fatta.
    modelSlots: await Promise.all(
      MEDIA_MODEL_SLOTS.map(async (slot) => {
        const stored = String(prefs[slot.pref] ?? '').trim();
        const offerable = await offerableSlotChoices(admin, slot);
        return {
          id: slot.id,
          i18n: slot.i18n,
          choices: offerable.choices,
          synced: offerable.synced,
          current: stored && slotAccepts(slot, stored) ? stored : ''
        };
      })
    ),
    durationOptions: videoDurationOptions(videoModel)
  };
};

export const actions: Actions = {
  updateVideoDuration: studioActions.updateVideoDuration,
  updateVideoResolution: studioActions.updateVideoResolution,
  updateVideoInstructions: studioActions.updateVideoInstructions,
  updateMediaModel: studioActions.updateMediaModel
};
