# Next-step suggestions below canvas nodes

Next-step chips used a fixed offset from the top of the selected node. Tall nodes therefore
rendered the chips over their content.

The selection bridge now carries the rendered height alongside its position and width. Chips
start eight screen pixels after the resulting bottom edge, so resizing and zooming keep them
outside the node body. Their wrapping container keeps its own rows centered on the node.

Jev previously received only the fixed action ids, making every node of one type indistinguishable.
It now receives the selected node type and data, so its preferred next step can follow the actual
content while remaining inside the validated action set.

The positioning test fixes the boundary across the selection bridge, canvas and chip component.
