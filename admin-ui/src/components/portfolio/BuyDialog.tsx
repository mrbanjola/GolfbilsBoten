import { useRef } from 'react';
import { Dialog } from '../shared/Dialog';
import { jsonPost } from '../../api/client';
import { useToast } from '../../hooks/useToast';

export interface PendingPurchase {
  listing_id: string;
  platform: string;
  title: string;
  url: string | null;
  image_url: string | null;
  watch_query: string | null;
}

interface Props {
  data: PendingPurchase | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BuyDialog({ data, onClose, onSaved }: Props) {
  const toast = useToast();
  const priceRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseInt(priceRef.current!.value, 10);
    if (!price || price < 0) return toast('Ange ett giltigt pris.');
    await jsonPost('/api/portfolio', { ...data, purchase_price: price });
    toast('Markerat som köpt!');
    onSaved();
  }

  return (
    <Dialog
      open={!!data}
      onClose={onClose}
      title="Markera som köpt"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="buy-form" className="btn-primary">Spara</button>
        </>
      }
    >
      <form id="buy-form" onSubmit={handleSubmit}>
        <p style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data?.title || 'Okänd annons'}
        </p>
        <div className="field">
          <label>Köppris (kr) *</label>
          <input ref={priceRef} type="number" min="0" step="1" placeholder="t.ex. 4 500" required />
        </div>
      </form>
    </Dialog>
  );
}
