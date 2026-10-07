# src/types/ — Map

Ambient `.d.ts` declarations for untyped dependencies.

### `tz-lookup.d.ts`
Domain Purpose: lets the rest of the codebase import the untyped `tz-lookup` npm package with a proper type signature. Responsibility: ambiently declares the `tz-lookup` module's default export, a coordinate-to-IANA-zone-name function. Key Dependencies: no imports (ambient declaration); the typed signature it provides is consumed by `src/time/zones.ts`.
