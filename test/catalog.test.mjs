import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Catalog = require('../app/js/catalog.js');

test('area codes decode to the market fields the TV uses', () => {
  const eu = Catalog.decodeArea(19461);
  assert.equal(eu.languageCountry, 'EU');
  assert.equal(eu.continentIdx, 5);

  const us = Catalog.decodeArea(22282);
  assert.equal(us.languageCountry, 'US');

  // 4741 is a plausible APAC packing (Asia group) used by the mock data.
  assert.equal(Catalog.decodeArea(4741).languageCountry, 'AJ');
  assert.equal(Catalog.decodeArea(4741).hwSettingGroup, 'AJ JA IL');
});

test('area decoding rejects junk', () => {
  assert.equal(Catalog.decodeArea('nope'), null);
  assert.equal(Catalog.decodeArea(0), null);
  assert.equal(Catalog.decodeArea(-4), null);
});

test('categories filter the catalogue', () => {
  assert.equal(Catalog.servicesFor('all').length, Catalog.SERVICES.length);

  for (const category of ['live', 'series', 'news', 'radio']) {
    const services = Catalog.servicesFor(category);
    assert.ok(services.length > 0, `${category} should not be empty`);
    for (const service of services) {
      assert.equal(service.category, category);
    }
  }

  const total = ['live', 'series', 'news', 'radio']
    .reduce((sum, category) => sum + Catalog.servicesFor(category).length, 0);
  assert.equal(total, Catalog.SERVICES.length, 'every service belongs to exactly one category');
});

test('service records are well formed', () => {
  const ids = new Set();
  for (const service of Catalog.SERVICES) {
    assert.ok(service.id, 'id is required');
    assert.ok(!ids.has(service.id), `duplicate id ${service.id}`);
    ids.add(service.id);

    assert.ok(service.name, `${service.id} needs a name`);
    assert.match(service.url, /^https:\/\//, `${service.id} must use https`);
    assert.match(service.color, /^#[0-9a-f]{6}$/i, `${service.id} needs a hex colour`);
    assert.ok(service.monogram && service.monogram.length <= 2, `${service.id} needs a short monogram`);
    assert.ok(['live', 'series', 'news', 'radio'].includes(service.category));
  }
});

test('live badges only appear on live services', () => {
  const live = Catalog.SERVICES.filter((service) => service.live).map((service) => service.id);
  assert.deepEqual(live.sort(), ['tv1'], 'only linear channels carry the SUORA badge');
});

test('lookup helpers', () => {
  assert.equal(Catalog.findService('areena').name, 'Yle Areena');
  assert.equal(Catalog.findService('does-not-exist'), null);
  assert.equal(Catalog.isValidCategory('news'), true);
  assert.equal(Catalog.isValidCategory('sports'), false);
});

test('every category id is unique', () => {
  const ids = Catalog.CATEGORIES.map((category) => category.id);
  assert.equal(new Set(ids).size, ids.length);
});
