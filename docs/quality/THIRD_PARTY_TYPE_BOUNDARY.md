# Third-party declaration boundary

Status: active, narrow compatibility boundary. Reviewed 2026-07-18.

Mergora keeps `strict`, `exactOptionalPropertyTypes`, and `skipLibCheck: false` in the shared TypeScript baseline. The aggregate test project and generated `mergora-ui` build override only `skipLibCheck` because the current stable React Aria Components declaration graph is internally inconsistent under exact optional property types.

The verified dependency set is `react-aria-components@1.19.0`, `@react-types/shared@3.36.0`, and `@types/react@19.2.17`. `OverlayArrowProps` extends both React `HTMLAttributes<HTMLDivElement>` and React Aria `DOMProps`: React declares `id?: string | undefined`, while `DOMProps` declares `id?: string`. TypeScript rejects the external interface before evaluating Mergora source. The same declarations remain in the current upstream source.

This boundary does not disable strict checking, exact optional property checking, or declaration emission for Mergora `.ts` and `.tsx` files. Focused component projects and packed Next.js/Vite consumers continue to compile source and public APIs. A compatibility sentinel binds the override to the exact upstream declarations so an upstream correction requires removal and revalidation rather than leaving the exception permanent.

Removal conditions:

1. Upgrade to a stable React Aria Components release whose `OverlayArrowProps` graph compiles with the workspace baseline.
2. Remove the two scoped `skipLibCheck` overrides.
3. Run the full workspace, generated declarations, and packed-consumer matrices twice.
