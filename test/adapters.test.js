import test from 'node:test';
import assert from 'node:assert/strict';
import { BudiAdapter } from '../src/adapters/budi.js';
import { JunoraAdapter } from '../src/adapters/junora.js';

test('Junora uses the current sorting contract', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ auctions: [], total: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await new JunoraAdapter(0).search({ query: 'traktor', min_price: null, max_price: null });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get('sortBy'), 'timeleft');
  assert.equal(params.get('sortOrder'), 'Ascending');
  assert.equal(params.get('statusFilter'), 'Active');
  assert.equal(params.get('search'), 'traktor');
});

test('Budi keeps relevance sorting and rejects its generic fallback list', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let title = 'Traktor Volvo BM 400';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(`
      <a class="budi-auctionobject__card"
         data-budi-auctionobject-id="123"
         data-budi-auctionobject-isended="false"
         data-budi-auctionobject-endingdatetimeiso="2099-01-01T12:00:00+01:00"
         href="/objekt/123/test">
        <div class="budi-auctionobject__desc"><p>${title}</p></div>
        <span class="budi-auctionobject__bid-current-amount">12 500 kr</span>
        <span class="budi-auctionobject__location">Örebro</span>
        <span class="budi-auctionobject__bid-count">3 bud</span>
      </a>
    `, { status: 200, headers: { 'content-type': 'text/html' } });
  };

  const adapter = new BudiAdapter(0);
  try {
    const relevant = await adapter.search({ query: 'traktor', min_price: null, max_price: null });
    assert.equal(relevant.length, 1);
    const params = new URL(requestedUrl).searchParams;
    assert.equal(params.get('q'), 'traktor');
    assert.equal(params.has('s'), false);

    title = 'TV TCL 85 tum';
    const fallback = await adapter.search({ query: 'zzzxqvnoresult999', min_price: null, max_price: null });
    assert.deepEqual(fallback, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
