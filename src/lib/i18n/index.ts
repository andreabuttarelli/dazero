import { register, init } from 'svelte-i18n';
import { DEFAULT_LOCALE } from './locale';

register(DEFAULT_LOCALE, async () => {
  const [main, docs] = await Promise.all([
    import('./locales/en.json'),
    import('./locales/docs/en.json')
  ]);
  return { ...main.default, docs: docs.default };
});

init({
  fallbackLocale: DEFAULT_LOCALE,
  initialLocale: DEFAULT_LOCALE
});
