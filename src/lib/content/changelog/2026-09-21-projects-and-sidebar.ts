import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-21',
  title: 'A projects dashboard, and a sidebar that holds the work',
  items: [
    'The home is now a projects dashboard: pick a project, and it opens on its first canvas. A project holds canvases and its pages — materials, calendar, identity, ads.',
    'Canvases live at /p/<project>/c/<canvas> with the whole shell around them: a left sidebar listing the project’s canvases above its pages.',
    'The sidebar has the pane switcher back (Chat · Pagine · Media) and the Upgrade button, whether or not the project has a brand.',
    'The Media pane is a two-column shelf — image and video tiles with real previews, an honest empty state and a quiet retry.',
    'The chat no longer needs a brand to open. It works on the project you are in, and gains brand powers when the project has one.',
    'Google Ads is out of the sidebar.'
  ]
} satisfies ChangelogEntry;
