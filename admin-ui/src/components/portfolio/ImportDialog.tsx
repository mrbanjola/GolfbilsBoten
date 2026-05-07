import { useRef, useState } from 'react';
import { api, jsonPost } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import { ThumbPlaceholder } from '../shared/ThumbPlaceholder';
import { platformChipClass } from '../shared/PlatformChip';
import type { PrefetchResult } from '../../api/types';

function getPlatformFromUrl(url: string): string | null {
  if (url.includes('blocket.se')) return 'blocket';
  if (url.includes('tradera.com')) return 'tradera';
  if (url.includes('klaravik.se')) return 'klaravik';
  if (url.includes('auctionet.com')) return 'auctionet';
  if (url.includes('junora.se')) return 'junora';
  if (url.includes('budi.se')) return 'budi';
  if (url.includes('blinto.se')) return 'blinto';
  if (url.includes('facebook.com')) return 'facebook';
  return null;
}

interface Props {
  onSaved: () => void;
}

export function ImportSection({ onSaved }: Props) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [prefetch, setPrefetch] = useState<PrefetchResult | null>(null);
  const [title, setTitle] = useState('');
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [fetchedImageUrl, setFetchedImageUrl] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const priceRef = useRef<HTMLInputElement>(null);

  async function handleFetch() {
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<PrefetchResult>('/api/portfolio/prefetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      setPrefetch(data);
      setTitle(data.title ?? '');
      setFetchedImageUrl(data.imageUrl ?? '');
      setThumbSrc(data.imageUrl);
      setImageData(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fel vid hämtning');
    } finally {
      setLoading(false);
    }
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setImageData(null); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target!.result as string;
      setImageData(result.split(',')[1]);
      setThumbSrc(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseInt(priceRef.current!.value, 10);
    if (!price || price < 0) return toast('Ange ett giltigt köppris.');
    const platform = prefetch?.platform ?? getPlatformFromUrl(url) ?? 'okänd';
    const body: Record<string, unknown> = {
      listing_id: `manual-${Date.now()}`,
      platform,
      title: title || null,
      url: url || null,
      watch_query: null,
      purchase_price: price,
    };
    if (imageData) body.image_data = imageData;
    else if (fetchedImageUrl) body.image_url = fetchedImageUrl;
    await jsonPost('/api/portfolio', body);
    reset();
    toast('Annons importerad till portfolio!');
    onSaved();
  }

  function reset() {
    setUrl('');
    setPrefetch(null);
    setTitle('');
    setThumbSrc(null);
    setFetchedImageUrl('');
    setImageData(null);
    setError('');
  }

  const platform = prefetch?.platform ?? null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-icon ci-blue">📥</div>
        <h2>Importera annons</h2>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.klaravik.se/auktion/..."
          style={{ flex: 1 }}
        />
        <button className="btn-primary btn-sm" onClick={handleFetch} disabled={loading}>
          {loading ? '…' : 'Hämta'}
        </button>
      </div>
      {error && <p className="hint" style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</p>}

      {prefetch && (
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ flexShrink: 0 }}>
              {thumbSrc
                ? <img className="recent-thumb" src={thumbSrc} alt="" loading="lazy" />
                : <ThumbPlaceholder />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {platform && <span className={`chip ${platformChipClass(platform)} recent-platform`}>{platform}</span>}
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Titel</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Annonsens titel" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Bild <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(valfri — välj fil för att ersätta)</span></label>
                <input type="file" accept="image/*" onChange={handleImagePick} style={{ fontSize: '.82rem' }} />
              </div>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Köppris (kr) *</label>
            <input ref={priceRef} type="number" min="0" step="1" placeholder="t.ex. 4 500" required />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={reset}>Avbryt</button>
            <button type="submit" className="btn-primary">Lägg till i portfolio</button>
          </div>
        </form>
      )}
    </div>
  );
}
