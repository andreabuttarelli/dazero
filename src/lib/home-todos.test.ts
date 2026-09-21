import { describe, expect, it } from 'vitest';
import { homeTodos, type TodoSource } from './home-todos';

const nothing: TodoSource = {
  setup: { socialAccounts: 1 }
};

const src = (patch: Partial<TodoSource>): TodoSource => ({ ...nothing, ...patch });

describe('le cose da fare, sotto la testa della home', () => {
  it('non inventa righe quando non c’è niente da fare', () => {
    expect(homeTodos(nothing)).toEqual([]);
  });

  /**
   * La coda di approvazione NON sta qui. La testa della pagina già apre su quella — «un post
   * aspetta la tua approvazione», con la sua foto e il bottone — e ripeterla come riga di elenco
   * due centimetri sotto era la duplicazione che il redesign è venuto a togliere. Qui resta ciò
   * che aspetta senza una scadenza, e che la testa non racconta.
   */
  it('non ripete la coda di approvazione, che è già la testa della pagina', () => {
    const todos = homeTodos({ setup: { socialAccounts: 0 } });

    expect(todos.map((t) => t.key)).toEqual(['social']);
  });

  /**
   * Zero account collegati è l'unica riga che non nasce da un conteggio ma da un'assenza: senza
   * un account l'AI produce e non pubblica, e il brand se ne accorge quando è tardi.
   */
  it('dice che manca un account collegato, che è la riga senza numero', () => {
    const [social] = homeTodos(src({ setup: { socialAccounts: 0 } }));

    expect(social.key).toBe('social');
    expect(social.count).toBe(0);
    expect(social.path).toBe('/settings/connected-accounts');
  });

  it('ogni riga sa dove porta e come si chiama, senza testo scritto dentro', () => {
    const todos = homeTodos({ setup: { socialAccounts: 0 } });

    for (const todo of todos) {
      expect(todo.labelKey, todo.key).toMatch(/^app\./);
      expect(todo.hintKey, todo.key).toMatch(/^app\./);
      expect(todo.path.startsWith('/'), todo.key).toBe(true);
    }
  });
});
