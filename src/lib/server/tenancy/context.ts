import type { Membership } from '$lib/server/repos/orgs';

/**
 * QUALE ORG STA GUARDANDO CHI È ENTRATO.
 *
 * La scelta sta in un cookie, non nell'URL: il canvas è scopato sul progetto, non sull'org, e un
 * id in più nel percorso sarebbe una cosa da tenere allineata a ogni link. Il cookie è un
 * suggerimento, mai un permesso — la lista delle appartenenze arriva dal database sotto RLS, e un
 * id che non è lì dentro non apre niente. Per questo la scelta si risolve QUI, su una lista già
 * verificata, invece che con un `if` a ogni pagina.
 */
export const ORG_COOKIE = 'dz-org';

export function chooseOrg(memberships: Membership[], chosenId: string | null): Membership | null {
  if (memberships.length === 0) {
    return null;
  }

  return memberships.find((m) => m.org.id === chosenId) ?? memberships[0];
}
