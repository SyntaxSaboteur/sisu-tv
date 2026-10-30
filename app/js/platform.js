/*
 * Sisu TV - platform adapter.
 *
 * Everything that differs between "a real LG TV" and "a laptop browser" lives
 * here: Luna service calls, app launching, remote-control keys, and the mock
 * data that lets the UI run outside the TV (?mock=1).
 *
 * Luna calls never throw and never hang: each one resolves with
 * { ok: true, data } or { ok: false, error }.
 */
(function (root) {
  'use strict';

  var TIMEOUT_MS = 6000;
  var hasWebOS = !!(root.webOS && root.webOS.service && typeof root.webOS.service.request === 'function');
  var forcedMock = /[?&]mock=1/.test(String(root.location && root.location.search));
  var mock = forcedMock || !hasWebOS;

  var MOCK = {
    device: {
      modelName: 'OLED77C2PUA',
      firmwareVersion: '03.30.45',
      sdkVersion: '7.3.0',
      boardType: 'C2',
      locale: 'th-TH',
      country: 'THA'
    },
    settings: {
      country: 'THA',
      smartServiceCountryCode3: 'THA',
      localeCountryGroup: 'AJ',
      timeZone: 'Asia/Bangkok'
    },
    area: 4741,
  };

  function request(uri, method, params, timeout) {
    return new Promise(function (resolve) {
      if (mock) {
        resolve({ ok: false, error: 'mock' });
        return;
      }
      if (!hasWebOS) {
        resolve({ ok: false, error: 'no-webos' });
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: 'timeout' });
        }
      }, timeout || TIMEOUT_MS);

      function finish(result) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }

      try {
        root.webOS.service.request(uri, {
          method: method,
          parameters: params || {},
          onSuccess: function (res) {
            finish({ ok: true, data: res });
          },
          onFailure: function (err) {
            finish({
              ok: false,
              error: (err && (err.errorText || err.errorCode)) || 'failure',
              data: err
            });
          }
        });
      } catch (e) {
        finish({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    });
  }

  function getSystemInfo() {
    if (mock) {
      return Promise.resolve({ ok: true, data: MOCK.device, mock: true });
    }
    return request('luna://com.webos.service.tv.systemproperty', 'getSystemInfo', {
      keys: [
        'modelName', 'firmwareVersion', 'sdkVersion', 'boardType',
        'locale', 'country', 'deviceId'
      ]
    });
  }

  function getSettings() {
    if (mock) {
      return Promise.resolve({ ok: true, data: MOCK.settings, mock: true });
    }
    return request('luna://com.webos.service.settings', 'getSystemSettings', {
      category: 'option'
    });
  }

  /*
   * Light-weight "which market does this TV think it is in" probe, used for the
   * badge in the header. Cheaper than the full diagnose() run.
   */
  function regionStatus() {
    return Promise.all([getSystemInfo(), getSettings()]).then(function (out) {
      var device = out[0].ok ? out[0].data : null;
      var settings = out[1].ok ? out[1].data : null;
      var country = (settings && settings.country) || (device && device.country) || null;
      var group = (settings && settings.localeCountryGroup) || null;
      return {
        ok: !!(country || group),
        country: country,
        group: group,
        mock: mock
      };
    });
  }

  /*
   * contiArea2All is the packed market code in NVRAM. Reading it is harmless
   * and does not need elevation on most builds; writing it does, which is why
   * Sisu TV only ever reads.
   */
  function getRegionArea() {
    if (mock) {
      return Promise.resolve({ ok: true, data: MOCK.area, mock: true });
    }
    return request('luna://com.webos.service.lowlevelstorage', 'getData', {
      dbgroups: [{ dbid: 'factory', items: ['contiArea2All'] }]
    }, 4000).then(function (res) {
      if (!res.ok || !res.data || !res.data.returnValue) {
        return { ok: false, error: res.error || 'denied' };
      }
      var groups = res.data.dbgroups || [];
      var items = (groups[0] && groups[0].items) || {};
      var raw = items.contiArea2All;
      if (raw === undefined || raw === null) {
        return { ok: false, error: 'missing' };
      }
      return { ok: true, data: parseInt(raw, 10) };
    });
  }

  function getDevMode() {
    if (mock) {
      return Promise.resolve({ ok: true, data: { enabled: true }, mock: true });
    }
    return request('luna://com.webos.service.devmode', 'getDevMode', {}, 3000);
  }

  function launchApp(appId) {
    return request('luna://com.webos.service.applicationManager', 'launch', {
      id: appId
    }, 5000);
  }

  function openUrl(url) {
    if (mock) {
      return Promise.resolve({ ok: true, how: 'demo', url: url });
    }
    return request('luna://com.webos.service.applicationManager', 'launch', {
      id: 'com.webos.app.browser',
      params: { target: url }
    }, 5000).then(function (res) {
      if (res.ok) {
        return { ok: true, how: 'browser' };
      }
      return request('luna://com.webos.service.applicationManager', 'launch', {
        id: 'com.webos.app.browser',
        params: { url: url }
      }, 5000).then(function (res2) {
        if (res2.ok) {
          return { ok: true, how: 'browser' };
        }
        try {
          root.open(url, '_blank');
          return { ok: true, how: 'window' };
        } catch (e) {
          return { ok: false, error: 'browser-unavailable' };
        }
      });
    });
  }

  /*
   * Prefer the native app when the catalogue names one, fall back to the TV
   * browser. listApps is denied to ordinary web apps on webOS 7+, so the app id
   * is attempted directly and a failure simply means "not installed here".
   */
  function launchService(service) {
    if (service.nativeId) {
      return launchApp(service.nativeId).then(function (res) {
        if (res.ok) {
          return { ok: true, how: 'app', id: service.nativeId };
        }
        return openUrl(service.url);
      });
    }
    return openUrl(service.url);
  }

  /*
   * One-shot diagnostics. Each probe settles independently so a denied Luna
   * call only blanks its own row instead of failing the whole screen.
   */
  function diagnose() {
    return Promise.all([
      getSystemInfo(),
      getSettings(),
      getRegionArea(),
      getDevMode()
    ]).then(function (out) {
      var device = out[0];
      var settings = out[1];
      var area = out[2];
      var devMode = out[3];

      var result = {
        mock: mock,
        device: device.ok ? device.data : null,
        deviceError: device.ok ? null : device.error,
        settings: settings.ok ? settings.data : null,
        settingsError: settings.ok ? null : settings.error,
        area: area.ok ? area.data : null,
        areaError: area.ok ? null : area.error,
        devMode: devMode.ok ? devMode.data : null,
        devModeError: devMode.ok ? null : devMode.error
      };
      result.decoded = result.area ? root.SisuCatalog.decodeArea(result.area) : null;
      return result;
    });
  }

  root.SisuPlatform = {
    isMock: function () {
      return mock;
    },
    platforms: function () {
      return hasWebOS ? 'webos' : 'browser';
    },
    request: request,
    diagnose: diagnose,
    regionStatus: regionStatus,
    launchService: launchService,
    openUrl: openUrl
  };
})(typeof window !== 'undefined' ? window : this);
