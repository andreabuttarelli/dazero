-- Il default della chat passa da google/gemini-3.8-flash a openai/gpt-5.6-luna.
--
-- La riga esisteva gia` (seed, posizione 60): serviva solo accendere `is_default`. Il trigger
-- `chat_model_catalog_one_default` spegne l'altra da solo.
update public.chat_model_catalog
  set is_default = (model_id = 'openai/gpt-5.6-luna');
