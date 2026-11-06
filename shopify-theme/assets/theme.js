(function () {
  'use strict';

  var qs = function (s, r) { return (r || document).querySelector(s); };
  var qsa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'EUR';

  function money(cents) {
    return new Intl.NumberFormat(document.documentElement.lang || 'it-IT', {
      style: 'currency',
      currency: currency
    }).format(cents / 100);
  }

  var toastTimer;
  function toast(msg) {
    var el = qs('[data-toast]');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }

  /* ---------- drawer ---------- */
  var drawer = qs('#cart-drawer');
  var scrim = qs('[data-scrim]');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('on');
    var close = qs('[data-cart-close]', drawer);
    if (close) close.focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.classList.remove('on');
  }

  /* ---------- cart ---------- */
  function swap(selector, html) {
    if (!html) return;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var fresh = qs(selector, doc);
    var current = qs(selector);
    if (fresh && current) current.innerHTML = fresh.innerHTML;
  }

  function refreshCart() {
    var onCartPage = !!qs('[data-cart-page]');
    var sections = 'cart-drawer' + (onCartPage ? ',main-cart' : '');

    return Promise.all([
      fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }),
      fetch(root + '?sections=' + sections, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })
    ]).then(function (res) {
      var cart = res[0];
      var data = res[1];

      swap('[data-cart-drawer]', data['cart-drawer']);
      if (onCartPage) swap('[data-cart-page]', data['main-cart']);

      qsa('[data-cart-count]').forEach(function (el) {
        el.textContent = cart.item_count;
        el.classList.toggle('on', cart.item_count > 0);
      });
      return cart;
    }).catch(function () {
      toast('Carrello non aggiornato');
      return null;
    });
  }

  function addItem(id, quantity) {
    return fetch(root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(id), quantity: quantity || 1 }] })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.description || 'Prodotto non disponibile');
        return data;
      });
    }).then(function () {
      return refreshCart();
    }).then(function () {
      openDrawer();
      return true;
    }).catch(function (err) {
      toast(err.message || 'Prodotto non disponibile');
      return false;
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('[data-cart-close]') || e.target === scrim) { closeDrawer(); return; }

    var quick = e.target.closest('[data-quick-add]');
    if (quick) {
      quick.disabled = true;
      addItem(quick.getAttribute('data-quick-add'), 1).then(function () { quick.disabled = false; });
      return;
    }

    var change = e.target.closest('[data-cart-change]');
    if (change) {
      var qty = Math.max(0, Number(change.getAttribute('data-qty')));
      fetch(root + 'cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: change.getAttribute('data-cart-change'), quantity: qty })
      }).then(function () { refreshCart(); })
        .catch(function () { toast('Carrello non aggiornato'); });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });

  /* ---------- product form ---------- */
  var form = qs('#product-form');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var idInput = qs('[data-variant-id]', form);
      var qtyInput = qs('[name="quantity"]', form);
      if (!idInput) return;
      addItem(idInput.value, qtyInput ? Number(qtyInput.value) : 1);
    });
  }

  /* ---------- varianti ---------- */
  var variantsScript = qs('[data-variants]');
  var info = qs('[data-product-info]');
  if (variantsScript && info) {
    var variants = JSON.parse(variantsScript.textContent);
    var idField = qs('[data-variant-id]', info);
    var priceEl = qs('[data-price]', info);
    var addBtn = qs('[data-add-label]', info);
    var pills = qsa('[data-option-pills] .size', info);
    var selects = qsa('[data-option-select]', info);
    var current = null;

    if (variants.length && idField) {
      var first = variants.filter(function (v) { return String(v.id) === String(idField.value); })[0] || variants[0];
      current = first.options.slice();

      selects.forEach(function (sel) {
        sel.value = current[Number(sel.getAttribute('data-option-pos'))];
      });

      var apply = function () {
        var match = variants.filter(function (v) {
          return v.options.every(function (o, i) { return o === current[i]; });
        })[0];
        if (!match) return;

        idField.value = match.id;

        if (priceEl) {
          priceEl.innerHTML = money(match.price) +
            (match.compare_at_price > match.price ? ' <s class="p-compare">' + money(match.compare_at_price) + '</s>' : '');
        }

        if (addBtn) {
          addBtn.disabled = !match.available;
          addBtn.textContent = match.available
            ? addBtn.getAttribute('data-add-label') + ' · ' + money(match.price)
            : 'Esaurito';
        }

        pills.forEach(function (pill) {
          var value = pill.getAttribute('data-option-value');
          var test = current.slice();
          test[0] = value;
          var anyAvailable = variants.some(function (v) {
            return v.available && v.options.every(function (o, i) { return o === test[i]; });
          });
          pill.disabled = !anyAvailable;
          pill.setAttribute('aria-pressed', String(value === current[0]));
        });
      };

      pills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          if (pill.disabled) return;
          current[0] = pill.getAttribute('data-option-value');
          apply();
        });
      });

      selects.forEach(function (sel) {
        sel.addEventListener('change', function () {
          current[Number(sel.getAttribute('data-option-pos'))] = sel.value;
          apply();
        });
      });

      apply();
    }
  }

  /* ---------- galleria ---------- */
  var mainImg = qs('[data-gallery-main]');
  var sourcesScript = qs('[data-gallery-sources]');
  if (mainImg && sourcesScript) {
    var sources = JSON.parse(sourcesScript.textContent);
    qsa('[data-gallery-thumb]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-gallery-thumb');
        var item = sources.filter(function (s) { return String(s.id) === String(id); })[0];
        if (item) mainImg.src = item.src;
        qsa('[data-gallery-thumb]').forEach(function (b) {
          b.setAttribute('aria-selected', String(b === btn));
        });
      });
    });
  }
})();
