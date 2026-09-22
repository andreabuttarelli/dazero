/**
 * Ambito della chat: il progetto è il tenant, il brand è contesto opzionale.
 *
 * La rotta di progetto (`/api/v1/projects/:id/agent`) è quella su cui si costruisce il prodotto;
 * finché non risponde, il thread di brand resta il filo vivo e l'unica cosa che il client sa
 * scegliere. Un solo punto decide l'URL: quando la rotta di progetto atterra, cambia qui.
 */
export type ChatScope = { projectId?: string; brandSlug?: string };

export function chatEndpoint(scope: ChatScope): string {
  if (scope.brandSlug) {
    return `/api/v1/brands/${scope.brandSlug}/agent`;
  }
  if (scope.projectId) {
    return `/api/v1/projects/${scope.projectId}/agent`;
  }
  return '';
}
