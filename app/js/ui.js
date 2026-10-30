/*
 * Sisu TV - user interface and remote-control navigation.
 *
 * Focus model: three zones (category chips, tile grid, info bar). Arrow keys
 * move between them, OK activates, BACK closes the overlay or leaves the app
 * alone so it is not killed by accident.
 */
(function (root) {
  'use strict';

  var Catalog = root.SisuCatalog;
  var Platform = root.SisuPlatform;
  var doc = root.document;

  var KEY = {
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    ENTER: 13,
    BACK: 461,
    BACKSPACE: 8
  };

  var state = {
    screen: 'home',
    zone: 'grid',
    chip: 0,
    tile: 0,
    cols: 4,
    category: 'all',
    busy: false
  };

  var dom = {};

  /* ---------- small DOM helpers ---------- */

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  var toastTimer = null;

  function toast(message, ms) {
    if (!dom.toast) {
      return;
    }
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      dom.toast.hidden = true;
    }, ms || 2400);
  }

  /* ---------- clock ---------- */

  function helsinkiParts() {
    var now = new Date();
    var time;
    var date;
    try {
      time = new Intl.DateTimeFormat('fi-FI', {
        timeZone: 'Europe/Helsinki',
        hour: '2-digit',
        minute: '2-digit'
      }).format(now);
      date = new Intl.DateTimeFormat('fi-FI', {
        timeZone: 'Europe/Helsinki',
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(now);
      // fi-FI gives "perjantai 30. lokakuuta"; only the weekday is capitalised.
      date = date.charAt(0).toUpperCase() + date.slice(1);
    } catch (e) {
      time = now.toTimeString().slice(0, 5);
      date = now.toDateString();
    }
    return { time: time, date: date };
  }

  function tickClock() {
    if (!dom.clockTime) {
      return;
    }
    var parts = helsinkiParts();
    dom.clockTime.textContent = parts.time;
    dom.clockDate.textContent = parts.date;
  }

  /* ---------- chips ---------- */

  function renderChips() {
    clear(dom.chips);
    Catalog.CATEGORIES.forEach(function (category, index) {
      var chip = el('button', 'chip', category.label);
      chip.type = 'button';
      chip.setAttribute('data-category', category.id);
      if (category.id === state.category) {
        chip.className += ' is-active';
      }
      chip.addEventListener('click', function () {
        state.chip = index;
        state.category = category.id;
        state.zone = 'grid';
        state.tile = 0;
        renderChips();
        renderGrid();
        applyFocus();
      });
      dom.chips.appendChild(chip);
    });
  }

  /* ---------- grid ---------- */

  function renderGrid() {
    clear(dom.grid);
    var services = Catalog.servicesFor(state.category);
    services.forEach(function (service, index) {
      var tile = el('button', 'tile');
      tile.type = 'button';
      tile.setAttribute('data-id', service.id);
      tile.style.setProperty('--brand', service.color);

      var glow = el('span', 'tile-glow');
      glow.setAttribute('aria-hidden', 'true');

      var mono = el('span', 'tile-mono', service.monogram);
      mono.setAttribute('aria-hidden', 'true');

      var body = el('span', 'tile-body');
      body.appendChild(el('span', 'tile-name', service.name));
      body.appendChild(el('span', 'tile-tag', service.tagline));

      var badge = el('span', 'tile-badge', 'SUORA');
      if (!service.live) {
        badge.hidden = true;
      }

      tile.appendChild(glow);
      tile.appendChild(mono);
      tile.appendChild(body);
      tile.appendChild(badge);

      tile.addEventListener('click', function () {
        state.tile = index;
        state.zone = 'grid';
        applyFocus();
        activate();
      });
      tile.addEventListener('mouseenter', function () {
        if (state.zone !== 'grid' || state.screen !== 'home') {
          return;
        }
        state.tile = index;
        applyFocus();
      });

      dom.grid.appendChild(tile);
    });

    if (state.tile >= services.length) {
      state.tile = Math.max(0, services.length - 1);
    }
  }

  function tileNodes() {
    return dom.grid.querySelectorAll('.tile');
  }

  /* ---------- focus ---------- */

  function measureColumns() {
    if (!dom.grid) {
      return 4;
    }
    var template = root.getComputedStyle(dom.grid).gridTemplateColumns;
    var columns = template ? template.split(' ').filter(Boolean).length : 4;
    return columns > 0 ? columns : 4;
  }

  function applyFocus() {
    var i;
    var chips = dom.chips.querySelectorAll('.chip');
    for (i = 0; i < chips.length; i++) {
      chips[i].className = 'chip' + (i === state.chip ? ' is-focused' : '') +
        (chips[i].getAttribute('data-category') === state.category ? ' is-active' : '');
    }

    var tiles = tileNodes();
    for (i = 0; i < tiles.length; i++) {
      tiles[i].className = 'tile' + (state.zone === 'grid' && i === state.tile ? ' is-focused' : '');
    }

    dom.infoBar.className = 'info-bar' + (state.zone === 'footer' ? ' is-focused' : '');

    var target = null;
    if (state.zone === 'chips') {
      target = chips[state.chip];
    } else if (state.zone === 'grid') {
      target = tiles[state.tile];
    } else {
      target = dom.infoBar;
    }
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /* ---------- navigation ---------- */

  function moveLeft() {
    if (state.zone === 'chips') {
      state.chip = Math.max(0, state.chip - 1);
      selectChip();
    } else if (state.zone === 'grid') {
      if (state.tile % state.cols > 0) {
        state.tile -= 1;
      }
    }
  }

  function moveRight() {
    if (state.zone === 'chips') {
      state.chip = Math.min(Catalog.CATEGORIES.length - 1, state.chip + 1);
      selectChip();
    } else if (state.zone === 'grid') {
      var count = tileNodes().length;
      if (state.tile % state.cols < state.cols - 1 && state.tile + 1 < count) {
        state.tile += 1;
      }
    }
  }

  function selectChip() {
    var category = Catalog.CATEGORIES[state.chip];
    if (category && category.id !== state.category) {
      state.category = category.id;
      state.tile = 0;
      renderChips();
      renderGrid();
      rememberCategory(category.id);
    }
  }

  function moveUp() {
    if (state.zone === 'grid') {
      if (state.tile - state.cols >= 0) {
        state.tile -= state.cols;
      } else {
        state.zone = 'chips';
        state.chip = Math.max(0, state.chip);
      }
    } else if (state.zone === 'footer') {
      var count = tileNodes().length;
      var lastRowStart = Math.floor((count - 1) / state.cols) * state.cols;
      state.zone = 'grid';
      state.tile = Math.min(lastRowStart + (state.tile % state.cols), count - 1);
    }
  }

  function moveDown() {
    if (state.zone === 'chips') {
      state.zone = 'grid';
      state.tile = 0;
    } else if (state.zone === 'grid') {
      var count = tileNodes().length;
      if (state.tile + state.cols < count) {
        state.tile += state.cols;
      } else {
        state.zone = 'footer';
      }
    }
  }

  /* ---------- actions ---------- */

  function rememberCategory(id) {
    try {
      root.localStorage.setItem('sisu.category', id);
    } catch (e) {
      /* storage may be unavailable; not important */
    }
  }

  function restoreCategory() {
    try {
      var stored = root.localStorage.getItem('sisu.category');
      if (stored && Catalog.isValidCategory(stored)) {
        state.category = stored;
        for (var i = 0; i < Catalog.CATEGORIES.length; i++) {
          if (Catalog.CATEGORIES[i].id === stored) {
            state.chip = i;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  function launch(service) {
    if (state.busy) {
      return;
    }
    state.busy = true;
    toast('Avataan ' + service.name + '…', 1600);
    Platform.launchService(service).then(function (result) {
      state.busy = false;
      if (!result.ok) {
        toast('Ei voitu avata: ' + service.name, 3200);
      } else if (result.how === 'demo') {
        toast('Demo-tila: ' + service.url, 3600);
      }
    });
  }

  function activate() {
    if (state.zone === 'chips') {
      state.zone = 'grid';
      state.tile = 0;
      applyFocus();
      return;
    }
    if (state.zone === 'footer') {
      openInfo();
      return;
    }
    var services = Catalog.servicesFor(state.category);
    var service = services[state.tile];
    if (service) {
      launch(service);
    }
  }

  /* ---------- info overlay ---------- */

  function kv(label, value, status, note) {
    var row = el('div', 'kv');
    row.appendChild(el('span', 'kv-label', label));
    var valueNode = el('span', 'kv-value' + (status ? ' ' + status : ''), value);
    if (note) {
      valueNode.appendChild(el('span', 'kv-note', note));
    }
    row.appendChild(valueNode);
    return row;
  }

  function section(title) {
    var wrap = el('div', 'section');
    wrap.appendChild(el('h3', null, title));
    return wrap;
  }

  function renderInfo(result) {
    var body = dom.infoBody;
    clear(body);

    var device = result.device || {};
    var settings = result.settings || {};
    var country = settings.country || device.country || '—';
    var isFinland = country === 'FIN';

    var devSection = section('Televisio');
    devSection.appendChild(kv('Malli', device.modelName || '—'));
    devSection.appendChild(kv('Firmware', device.firmwareVersion || '—'));
    devSection.appendChild(kv('webOS SDK', device.sdkVersion || '—'));
    devSection.appendChild(kv('Emolevyn tyyppi', device.boardType || '—'));
    body.appendChild(devSection);

    var regionSection = section('Alue ja aika');
    regionSection.appendChild(kv(
      'Maa-asetus',
      country,
      isFinland ? 'ok' : 'bad',
      isFinland ? null : 'Televisio on asetettu muuhun maahan kuin Suomeen.'
    ));
    regionSection.appendChild(kv(
      'Palvelualue',
      settings.localeCountryGroup || '—',
      isFinland ? 'ok' : 'warn',
      'LG Content Store näyttää tämän alueen sovellusluettelon.'
    ));
    regionSection.appendChild(kv(
      'Television aikavyöhyke',
      settings.timeZone || '—',
      settings.timeZone === 'Europe/Helsinki' ? 'ok' : 'warn',
      'Sisu TV näyttää aina Helsingin ajan, myös jos TV itse on väärässä ajassa.'
    ));

    if (result.decoded) {
      regionSection.appendChild(kv(
        'Aluekoodi (contiArea2All)',
        result.decoded.area + ' → ' + result.decoded.languageCountry +
          ' / ' + result.decoded.hwSettingGroup,
        result.decoded.languageCountry === 'EU' ? 'ok' : 'warn',
        'Raaka NVRAM-arvo. Euroopan aluekoodi on 19461.'
      ));
    } else {
      regionSection.appendChild(kv(
        'Aluekoodi (contiArea2All)',
        'Ei luettavissa',
        'warn',
        'NVRAM-luku vaatii rootatun television. Tämä ei estä sovelluksen käyttöä.'
      ));
    }
    body.appendChild(regionSection);

    var appSection = section('Käynnistys');
    appSection.appendChild(kv('Netflix, YouTube', 'Sovellus, varalla selain', 'ok',
      'Jos alkuperäinen sovellus on asennettu, se avataan. Muuten video aukeaa selaimessa.'));
    appSection.appendChild(kv('Suomalaiset palvelut', 'Aina selain', 'ok',
      'Yle Areena, MTV Katsomo, Ruutu ja muut avataan TV:n selaimessa, joten Content Storen alue ei estä niitä.'));
    body.appendChild(appSection);

    var systemSection = section('Järjestelmä');
    var devMode = 'Tuntematon';
    var devStatus = 'warn';
    if (result.devMode && typeof result.devMode.enabled !== 'undefined') {
      devMode = result.devMode.enabled ? 'Kehittäjätila päällä' : 'Kehittäjätila pois';
      devStatus = result.devMode.enabled ? 'ok' : 'warn';
    }
    systemSection.appendChild(kv('Kehittäjätila', devMode, devStatus,
      'Kehittäjätila sallii omien sovellusten asennuksen 1000 tunniksi kerrallaan.'));
    systemSection.appendChild(kv(
      'Root-oikeudet',
      result.mock ? 'Demo' : (result.area !== null ? 'Kyllä (NVRAM luettavissa)' : 'Ei / ei tiedossa'),
      result.mock ? 'warn' : (result.area !== null ? 'ok' : 'warn'),
      'Root tarvitaan vain alueen vaihtamiseen, ei tämän sovelluksen käyttöön.'
    ));
    if (result.mock) {
      systemSection.appendChild(kv('Tila', 'Demo-aineisto', 'warn',
        'Avaa sovellus televisiossa nähdäksesi oikeat arvot.'));
    }
    body.appendChild(systemSection);

    var explain = el('div', 'explain');
    var strong = el('strong', null, 'Miksi suomalaiset sovellukset puuttuvat? ');
    explain.appendChild(strong);
    explain.appendChild(doc.createTextNode(
      'Televisiosi hakee sovellukset ja päivitykset sen maan palvelusta, johon se on ' +
      'valmistettu. Bangkokista ostettu laite näkee Aasian luettelon, joten Yle Areenaa ' +
      'tai Ruutua ei koskaan tarjota. Sisu TV kiertää tämän avaamalla palvelut suoraan ' +
      'verkosta – kuva tulee Suomesta, joten myös alueelliset ohjelmat toimivat.'
    ));
    body.appendChild(explain);
  }

  function openInfo() {
    if (state.screen !== 'home') {
      return;
    }
    state.screen = 'info';
    dom.infoOverlay.hidden = false;
    clear(dom.infoBody);
    dom.infoBody.appendChild(el('p', 'loading', 'Luetaan television tietoja…'));

    Platform.diagnose().then(function (result) {
      if (state.screen !== 'info') {
        return;
      }
      renderInfo(result);
    });
  }

  function closeInfo() {
    if (state.screen !== 'info') {
      return;
    }
    state.screen = 'home';
    dom.infoOverlay.hidden = true;
    applyFocus();
  }

  /* ---------- input ---------- */

  function onKeyDown(event) {
    var code = event.keyCode;

    if (code === KEY.BACK || code === KEY.BACKSPACE) {
      if (root.webOS && typeof root.webOS.platformBack === 'function') {
        root.webOS.platformBack();
      }
      if (state.screen === 'info') {
        closeInfo();
        event.preventDefault();
      }
      return;
    }

    if (state.screen === 'info') {
      if (code === KEY.ENTER) {
        closeInfo();
        event.preventDefault();
      } else if (code === KEY.UP || code === KEY.DOWN) {
        // The panel is taller than some screens; let the remote scroll it.
        var step = code === KEY.UP ? -140 : 140;
        dom.infoBody.scrollTop += step;
        event.preventDefault();
      }
      return;
    }

    switch (code) {
      case KEY.LEFT:
        moveLeft();
        break;
      case KEY.RIGHT:
        moveRight();
        break;
      case KEY.UP:
        moveUp();
        break;
      case KEY.DOWN:
        moveDown();
        break;
      case KEY.ENTER:
        activate();
        break;
      default:
        if (code >= 49 && code <= 57 && state.zone !== 'chips') {
          var quick = Catalog.servicesFor(state.category)[code - 49];
          if (quick) {
            state.tile = code - 49;
            applyFocus();
            launch(quick);
          }
        }
        return;
    }

    event.preventDefault();
    applyFocus();
  }

  /* ---------- boot ---------- */

  function boot() {
    dom.chips = doc.getElementById('chips');
    dom.grid = doc.getElementById('grid');
    dom.infoBar = doc.getElementById('infoBar');
    dom.infoOverlay = doc.getElementById('infoOverlay');
    dom.infoBody = doc.getElementById('infoBody');
    dom.infoClose = doc.getElementById('infoClose');
    dom.toast = doc.getElementById('toast');
    dom.regionPill = doc.getElementById('regionPill');
    dom.clockTime = doc.getElementById('clock-time');
    dom.clockDate = doc.getElementById('clock-date');

    restoreCategory();
    state.cols = measureColumns();
    renderChips();
    renderGrid();
    applyFocus();
    tickClock();
    setInterval(tickClock, 15000);

    dom.infoClose.addEventListener('click', function () {
      closeInfo();
    });
    dom.infoBar.addEventListener('click', function () {
      state.zone = 'footer';
      applyFocus();
      openInfo();
    });

    doc.addEventListener('keydown', onKeyDown);
    root.addEventListener('resize', function () {
      state.cols = measureColumns();
      applyFocus();
    });

    if (Platform.isMock()) {
      toast('Demo-tila – avaa televisiossa nähdäksesi oikeat tiedot', 4200);
    }

    Platform.regionStatus().then(function (status) {
      if (!status || !status.ok || !dom.regionPill) {
        return;
      }
      var label = status.country || '?';
      if (status.group) {
        label += ' · ' + status.group;
      }
      dom.regionPill.textContent = 'Alue: ' + label;
      dom.regionPill.className = 'region-pill' + (status.country === 'FIN' ? ' ok' : '');
      dom.regionPill.hidden = false;
    });
  }

  root.SisuUI = {
    boot: boot,
    state: state
  };
})(typeof window !== 'undefined' ? window : this);
