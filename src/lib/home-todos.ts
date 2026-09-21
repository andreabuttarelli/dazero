/**
 * LE COSE DA FARE, sotto la testa della home del brand.
 *
 * La coda di approvazione non è più qui: la apre la testa della pagina, con la foto del post e il
 * bottone che lo approva. Qui resta ciò che aspetta senza scadere — l'account che non c'è — e
 * che la testa non racconta.
 *
 * Qui c'è solo la SELEZIONE e l'ORDINE — nessun testo, come per la nav: le etichette sono chiavi
 * i18n, e la pagina le traduce. Così questo si può far fallire per la ragione giusta.
 *
 * Una riga esiste solo se ha qualcosa da dire: niente riquadri vuoti a riempire lo spazio.
 */

export type TodoSource = {
  setup: { socialAccounts: number };
};

export type TodoItem = {
  key: string;
  /** Frase col conteggio dentro (`{n, plural, …}`). */
  labelKey: string;
  count: number;
  /** Dove vive la cosa: la riga secondaria, la stessa parola della sidebar. */
  hintKey: string;
  /** Sotto `/app/<slug>`. */
  path: string;
};

export function homeTodos(overview: TodoSource): TodoItem[] {
  const todos: TodoItem[] = [];

  // Il setup non scade mai — ma senza un account collegato l'AI produce e non pubblica, e il
  // brand se ne accorge quando è tardi.
  if (overview.setup.socialAccounts === 0) {
    todos.push({
      key: 'social',
      labelKey: 'app.home.todo.noSocial',
      count: 0,
      hintKey: 'app.settings.connectedAccounts',
      path: '/settings/connected-accounts'
    });
  }

  return todos;
}
