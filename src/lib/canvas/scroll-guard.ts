export function overflows(el: { scrollHeight: number; clientHeight: number }): boolean {
  return el.scrollHeight > el.clientHeight;
}

/**
 * `nowheel` ferma xyflow dal leggere la rotella come pan della tela SOLO quando c'è davvero
 * altro sotto — un'area corta lascia passare la rotella e la tela continua a scorrere sopra di
 * lei, come ci si aspetta. `ResizeObserver` invece di una lettura sola: il nodo testo cresce e
 * il bordo fra "scorre dentro" e "scorre la tela" si sposta con lui.
 */
export function scrollGuard(el: HTMLElement) {
  function sync() {
    el.classList.toggle('nowheel', overflows(el));
  }

  const ro = new ResizeObserver(sync);
  ro.observe(el);
  sync();

  return { destroy: () => ro.disconnect() };
}
