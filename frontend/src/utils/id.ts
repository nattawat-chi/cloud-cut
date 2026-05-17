/**
 * Short prefixed id generator for **mock/local** state.
 *
 * Real persistence uses server-generated UUIDv7 (Phase 3). The `UUID` type
 * alias in `@/types` is `string` so both forms interop without casts.
 */
export function uid(prefix: string = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
