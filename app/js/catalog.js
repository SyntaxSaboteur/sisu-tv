/*
 * Sisu TV - service catalogue.
 *
 * Pure data + small pure helpers. No DOM, no webOS calls, so this file is
 * unit-tested directly in Node (see test/catalog.test.mjs).
 *
 * Every entry is a way into a Finnish service. Two launch strategies exist:
 *   appId - the native webOS app, used when it is already installed
 *   url   - the web address, opened in the TV browser otherwise
 * Keeping both means the launcher still works on a TV whose LG Content Store
 * only ever offered the Thai catalogue.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SisuCatalog = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CATEGORIES = [
    { id: 'all', label: 'Kaikki' },
    { id: 'live', label: 'Suorat' },
    { id: 'series', label: 'Sarjat' },
    { id: 'news', label: 'Uutiset' },
    { id: 'radio', label: 'Radio' }
  ];

  /*
   * Android/iOS apps aside, these are the services a Finland-resident viewer
   * expects. nativeId is only set where the webOS app id is well known; when
   * it is wrong or missing the browser fallback still works.
   */
  var SERVICES = [
    {
      id: 'areena',
      name: 'Yle Areena',
      tagline: 'Ohjelmat ja sarjat',
      monogram: 'A',
      category: 'series',
      color: '#00b3b0',
      url: 'https://areena.yle.fi/tv'
    },
    {
      id: 'tv1',
      name: 'Yle TV1',
      tagline: 'Suora lähetys',
      monogram: '1',
      category: 'live',
      color: '#0f8f8c',
      live: true,
      url: 'https://areena.yle.fi/tv/suorat/yle-tv1'
    },
    {
      id: 'katsomo',
      name: 'MTV Katsomo',
      tagline: 'MTV3 ja sarjat',
      monogram: 'K',
      category: 'series',
      color: '#ff2e63',
      url: 'https://www.mtv.fi/katsomo'
    },
    {
      id: 'ruutu',
      name: 'Ruutu',
      tagline: 'Nelonen ja suorat',
      monogram: 'R',
      category: 'series',
      color: '#ff7a00',
      url: 'https://www.ruutu.fi'
    },
    {
      id: 'viaplay',
      name: 'Viaplay',
      tagline: 'Urheilu ja sarjat',
      monogram: 'V',
      category: 'series',
      color: '#7c3aed',
      url: 'https://viaplay.fi'
    },
    {
      id: 'uutiset',
      name: 'Yle Uutiset',
      tagline: 'Tuoreimmat uutiset',
      monogram: 'U',
      category: 'news',
      color: '#1f6feb',
      url: 'https://yle.fi/uutiset'
    },
    {
      id: 'tekstitv',
      name: 'Teksti-TV',
      tagline: 'Sivu 100',
      monogram: 'T',
      category: 'news',
      color: '#2f81f7',
      url: 'https://yle.fi/tekstitv'
    },
    {
      id: 'radio',
      name: 'Radio Suomi',
      tagline: 'Yle Radio Suomi',
      monogram: 'S',
      category: 'radio',
      color: '#22c55e',
      url: 'https://areena.yle.fi/radio/ohjelmat/yle-radio-suomi'
    },
    {
      id: 'netflix',
      name: 'Netflix',
      tagline: 'Elokuvat ja sarjat',
      monogram: 'N',
      category: 'series',
      color: '#e50914',
      nativeId: 'com.netflix.app',
      url: 'https://www.netflix.com/browse'
    },
    {
      id: 'youtube',
      name: 'YouTube',
      tagline: 'Videot ja musiikki',
      monogram: 'Y',
      category: 'series',
      color: '#ff0033',
      nativeId: 'youtube.leanback.v4',
      url: 'https://www.youtube.com/tv'
    },
    {
      id: 'twitch',
      name: 'Twitch',
      tagline: 'Suorat striimit',
      monogram: 'W',
      category: 'live',
      color: '#9146ff',
      url: 'https://www.twitch.tv'
    },
    {
      id: 'max',
      name: 'HBO Max',
      tagline: 'Elokuvat ja sarjat',
      monogram: 'M',
      category: 'series',
      color: '#5b21b6',
      url: 'https://www.max.com/fi'
    }
  ];

  /*
   * Region codes. A webOS TV stores its market in NVRAM as a packed integer
   * called contiArea2All. The layout below was read out of the Region Changer
   * homebrew service (see docs/RESEARCH.md); it lets us explain what the TV
   * currently believes it is, without writing anything.
   */
  var LANG_COUNTRY = [
    'NORDIC', 'NON NORDIC', 'EAST EU', 'WEST EU', 'ETC EU', 'AJ', 'JA', 'IL',
    'TW', 'CO', 'PA', 'CN', 'HK', 'KR', 'US', 'CA', 'MX', 'HN', 'BR', 'CL',
    'PE', 'AR', 'EC', 'JP', 'EU', 'IR', 'PH', 'BW', 'CS'
  ];
  var HW_GROUP = ['EU', 'AJ JA IL', 'TW CO', 'CN HK', 'KR', 'US', 'SA', 'JP'];

  var AREA_PRESETS = {
    EU: 19461,
    US: 22282
  };

  function decodeArea(area) {
    var value = parseInt(area, 10);
    if (isNaN(value) || value <= 0) {
      return null;
    }
    var continentIdx = value & 0x7f;
    var langIdx = (value >> 7) & 0x1f;
    var hwIdx = (value >> 12) & 0xf;
    return {
      area: value,
      continentIdx: continentIdx,
      languageCountry: LANG_COUNTRY[langIdx] || 'UNKNOWN(' + langIdx + ')',
      hwSettingGroup: HW_GROUP[hwIdx] || 'UNKNOWN(' + hwIdx + ')'
    };
  }

  function servicesFor(category) {
    if (!category || category === 'all') {
      return SERVICES.slice();
    }
    return SERVICES.filter(function (service) {
      return service.category === category;
    });
  }

  function findService(id) {
    for (var i = 0; i < SERVICES.length; i++) {
      if (SERVICES[i].id === id) {
        return SERVICES[i];
      }
    }
    return null;
  }

  function isValidCategory(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) {
        return true;
      }
    }
    return false;
  }

  return {
    CATEGORIES: CATEGORIES,
    SERVICES: SERVICES,
    AREA_PRESETS: AREA_PRESETS,
    decodeArea: decodeArea,
    servicesFor: servicesFor,
    findService: findService,
    isValidCategory: isValidCategory
  };
});
