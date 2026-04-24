const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function buildSystemPrompt(aiSettings) {
  const globalRules = aiSettings.global_rules?.trim()
    ? `\n\nGlobal rules:\n${aiSettings.global_rules.trim()}`
    : '';

  return `${aiSettings.system_prompt.trim()}${globalRules}

Return JSON only with this exact shape:
{"results":[{"id":"string","keep":true,"reason_code":"short_code","note":"optional short note"}]}

Rules:
- Use only the provided listing data.
- Reject if the match is weak, indirect, or likely the wrong product.
- Reject accessories, spare parts, manuals, rentals, services, and wanted ads unless clearly relevant.
- Keep only listings that are likely to be useful notifications for the watch.`;
}

function buildUserPayload(watch, listings) {
  return {
    watch: {
      id: watch.id,
      query: watch.query,
      min_price: watch.min_price ?? null,
      max_price: watch.max_price ?? null,
      location: watch.location ?? null,
      ad_type: watch.ad_type ?? 'all',
      exclude_words: watch.exclude_words ?? null,
      platforms: watch.platforms ?? 'blocket',
    },
    listings: listings.map((listing) => ({
      id: listing.id,
      platform: listing.platform,
      title: listing.title,
      subtitle: listing.subtitle ?? null,
      description: listing.description ?? null,
      detail_text: listing.detailText ?? null,
      price: listing.price ?? null,
      currency: listing.currency ?? 'SEK',
      location: listing.location ?? null,
      url: listing.url,
      created_at: listing.createdAt ?? null,
      trade_type: listing.tradeType ?? null,
      auction_end: listing.auctionEnd ?? null,
      bid_count: listing.bidCount ?? null,
      no_reserve: listing.noReserve ?? null,
      reserve_met: listing.reserveMet ?? null,
      metadata: listing.metadata ?? {},
    })),
  };
}

function extractTextContent(messageJson) {
  const parts = Array.isArray(messageJson?.content) ? messageJson.content : [];
  return parts
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

function parseClaudeResponse(text, expectedIds) {
  const normalized = stripCodeFences(text);
  const parsed = JSON.parse(normalized);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('Claude response saknar results-array');
  }

  const decisions = parsed.results.map((item) => ({
    id: String(item.id),
    keep: Boolean(item.keep),
    reasonCode: typeof item.reason_code === 'string' ? item.reason_code : 'unknown',
    note: typeof item.note === 'string' ? item.note : '',
  }));

  const decisionIds = new Set(decisions.map((item) => item.id));
  for (const expectedId of expectedIds) {
    if (!decisionIds.has(expectedId)) {
      throw new Error(`Claude response saknar beslut for listing ${expectedId}`);
    }
  }

  return decisions;
}

export async function filterListingsWithClaude({ apiKey, aiSettings, watch, listings }) {
  if (!aiSettings.enabled || listings.length === 0) {
    return { approved: listings, decisions: [], skipped: true };
  }

  if (!apiKey) {
    console.warn('[Claude] AI-filtrering aktiverad men CLAUDE_API_KEY saknas - hoppar over');
    return { approved: listings, decisions: [], skipped: true };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(aiSettings.timeout_ms || 15000, 1000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: aiSettings.model,
        max_tokens: 1200,
        system: buildSystemPrompt(aiSettings),
        messages: [
          {
            role: 'user',
            content: JSON.stringify(buildUserPayload(watch, listings)),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 500)}`);
    }

    const json = await response.json();
    const text = extractTextContent(json);
    const decisions = parseClaudeResponse(text, listings.map((listing) => listing.id));
    const keepIds = new Set(decisions.filter((decision) => decision.keep).map((decision) => decision.id));
    const approved = listings.filter((listing) => keepIds.has(listing.id));

    return { approved, decisions, skipped: false };
  } finally {
    clearTimeout(timer);
  }
}
