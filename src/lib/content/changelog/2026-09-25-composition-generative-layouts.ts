import type { ChangelogEntry } from './index';

export default {
  date: '2026-09-25',
  title: 'Composizione adds five generative 3D layouts',
  items: [
    'Arrange media as a spatial cloud, cinematic media ring, or helix, then tune every layout and camera parameter in real time.',
    'Vertical flow and editorial coverflow now scroll every card through a closed 3D carousel while the camera stays fixed.',
    'Media rings now align every card to the circumference as one continuous 3D band.',
    'Composition controls now use compact drag knobs, making more live parameters visible at once.',
    'Composition backgrounds now render as clean solid colors without a forced glow.',
    'The orbital carousel now completes one stable fixed-camera cycle with a clear front card.',
    'Rear-facing orbital carousel cards now disappear instead of covering readable media.',
    'Sparse inputs now repeat to fill the selected composition, and one reset restores its designed defaults.',
    'Every composition and camera now returns to its first frame through a continuous expo-eased loop.'
  ]
} satisfies ChangelogEntry;
