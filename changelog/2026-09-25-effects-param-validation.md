# Validate effect params against the EFFECTS table

`effects` node data accepted any `Record<string, number | string>` as
`params` — an agent (or a bug) could write `blockSize: 999` on `pixelate`,
an unknown option on `dither`, a non-hex string as a `duotone` color, or a
stray param name, and `validateNodeData` waved it through. `applyStack`
would then run on garbage input.

`src/lib/canvas/node-data.ts` now derives one Zod schema per effect FROM
`EFFECTS` (`paramFieldSchema`/`paramsSchemaFor`): `range` → number clamped
to `min..max`, `select` → one of `options.value`, `color` → `#rrggbb`,
`seed` → integer. `effectStepSchema` runs it with `superRefine` keyed on
`step.id`, `.strict()` so an unknown param name is rejected, and each
param takes the table's `default` when missing. No second hand-written
list of effects/params exists anywhere — the same `EFFECTS` table the
editor and `applyStack` already read.

Not shipped as a public changelog line on its own: nothing observable
changes yet, since nothing calls `applyStack` server-side. The public
line lands with the apply endpoint.
