import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addWatch,
  getAuctions,
  getAuctionSummary,
  initDatabase,
  updateAuctionReview,
  updateWatch,
  upsertAuctions,
} from '../src/db/database.js';

const dataDir = mkdtempSync(join(tmpdir(), 'begagnat-auctions-'));
initDatabase(dataDir);

function listing(overrides = {}) {
  return {
    id: 'auction-1',
    platform: 'klaravik',
    title: 'Testgrävare',
    subtitle: 'Modell 2000',
    price: 125000,
    currency: 'SEK',
    bidCount: 4,
    auctionEnd: '2099-06-01T12:00:00Z',
    location: 'Växjö',
    url: 'https://example.test/auction-1',
    imageUrl: 'https://example.test/image.jpg',
    noReserve: false,
    reserveMet: true,
    ended: false,
    ...overrides,
  };
}

test('auction upsert stores live data and preserves the review state', () => {
  const watchId = addWatch('grävmaskin', null, null, 'klaravik');
  updateWatch(watchId, 'category', 'excavator');
  const watch = { id: watchId, category: 'excavator' };

  assert.deepEqual(upsertAuctions([listing()], watch), { created: 1, updated: 0 });
  assert.equal(updateAuctionReview('klaravik', 'auction-1', 'interesting'), true);
  assert.deepEqual(upsertAuctions([listing({ price: 130000, bidCount: 5 })], watch), { created: 0, updated: 1 });

  const result = getAuctions({ review: 'interesting' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].current_price, 130000);
  assert.equal(result.items[0].bid_count, 5);
  assert.equal(result.items[0].review_state, 'interesting');
  assert.deepEqual(result.items[0].categories, ['excavator']);
});

test('one auction can match more than one watch and category', () => {
  const secondWatchId = addWatch('maskin', null, null, 'klaravik');
  updateWatch(secondWatchId, 'category', 'other_machine');
  upsertAuctions([listing()], { id: secondWatchId, category: 'other_machine' });

  const [item] = getAuctions({ review: 'interesting' }).items;
  assert.deepEqual(new Set(item.categories), new Set(['excavator', 'other_machine']));
  assert.deepEqual(new Set(item.watch_queries), new Set(['grävmaskin', 'maskin']));
});

test('ignored auctions are hidden by default and remain recoverable', () => {
  updateAuctionReview('klaravik', 'auction-1', 'ignored');
  assert.equal(getAuctions().total, 0);
  assert.equal(getAuctions({ review: 'ignored' }).total, 1);
  assert.equal(getAuctionSummary().ignored, 1);

  updateAuctionReview('klaravik', 'auction-1', 'unreviewed');
  assert.equal(getAuctions().total, 1);
});

test('Swedish local auction times are normalized to UTC', () => {
  const watchId = addWatch('lokal tid', null, null, 'blinto');
  upsertAuctions([
    listing({ id: 'local-time', platform: 'blinto', auctionEnd: '2099-06-01 12:00' }),
  ], { id: watchId, category: null });

  const item = getAuctions({ platform: 'blinto' }).items[0];
  assert.equal(item.auction_end, '2099-06-01T10:00:00.000Z');
  assert.deepEqual(item.categories, ['uncategorized']);
});

test('auctions with a passed end time are returned as ended', () => {
  const watchId = addWatch('gammal', null, null, 'budi');
  upsertAuctions([
    listing({ id: 'ended', platform: 'budi', auctionEnd: '2020-01-01T10:00:00Z' }),
  ], { id: watchId, category: 'other_machine' });

  assert.equal(getAuctions({ status: 'active' }).items.some((item) => item.external_id === 'ended'), false);
  assert.equal(getAuctions({ status: 'ended', review: 'all' }).items.some((item) => item.external_id === 'ended'), true);
});
