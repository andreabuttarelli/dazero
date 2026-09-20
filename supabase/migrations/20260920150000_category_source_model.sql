-- `category_source` diceva `'gemini'`: il nome di un fornitore che non chiamiamo più direttamente.
-- Il campo non dice CHI ha servito la chiamata, dice CHE COSA ha messo la categoria — un modello
-- invece della query che l'ha indovinata — e il modello si sceglie dal catalogo del gateway,
-- quindi quel nome sarebbe falso al primo cambio.
--
-- I dati si spostano con il codice, o il codice nuovo non riconosce le righe vecchie: sono 3.797
-- righe già giudicate che tornerebbero nella coda e verrebbero rigiudicate, a pagamento.
update market_posts
set category_source = 'model'
where category_source = 'gemini';
