# Expand the Composizione generative layouts

## Why

The first editor exposed a solid 3D scene, but only a grid and a carousel. Its controls also
redrew with stale scene options, so changing a slider did not reliably change the live preview.

## Decisions

- Keep one layout registry and add three peers: spatial cloud, media ring, and helix.
- Give every layout only the parameters that shape its motion.
- Update the mounted Three.js scene in place so media textures are not reloaded while editing.
- Keep seeded spatial placement deterministic so a saved composition reopens unchanged.
- Let each layout own its scene density and cycle sparse inputs until the figure is complete.
- Model the media ring as a horizontal 3D carousel with tangent cards and perspective depth.
- Reset the selected layout and camera to their authored defaults from one editor action.
- Add a vertical depth flow and an editorial coverflow from the supplied visual references.
- Make layout and camera motion one closed expo-eased loop tied to the composition duration.
- Tune default densities and card scales for phone-sized social posts.
- Move coverflow and vertical flow on closed 3D carousel paths while their cameras stay fixed.
- Keep ring cards tangent to the circumference so their surfaces form one coherent band.
- Replace horizontal parameter sliders with compact drag knobs arranged in a three-column grid.
- Render the chosen background as a solid color without forced glow or particles.
- Rebuild the orbital carousel as one fixed-camera cycle with radial cards and a subdued rear plane.
- Hide the orbital carousel's rear-facing cards so they never cover readable media.

## Discarded

- A second advanced editor: it would duplicate the existing timeline, camera, and save flow.
- Rebuilding the scene on every slider movement: it would reload textures and make live editing
  visibly unstable.
