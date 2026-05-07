import { useRef } from 'react';
import { Dialog } from '../shared/Dialog';
import { jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';

export interface SellTarget {
  type: 'item' | 'bundle';
  id: number;
  title: string;
}

interface Props {
  target: SellTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

export function SellDialog({ target, onClose, onSaved }: Props) {
  const toast = useToast();
  const priceRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const price = parseInt(priceRef.current!.value, 10);
    if (!price || price < 0) return toast('Ange ett giltigt pris.');
    const url = target.type === 'bundle'
      ? `/api/portfolio/bundles/${target.id}/sold`
      : `/api/portfolio/${target.id}/sold`;
    await jsonPatch(url, { sold_price: price });
    toast('Markerat som såld!');
    onSaved();
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Markera som såld"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="sell-form" className="btn-primary">Spara</button>
        </>
      }
    >
      <form id="sell-form" onSubmit={handleSubmit}>
        <p style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {target?.title || 'Okänd annons'}
        </p>
        <div className="field">
          <label>Säljpris (kr) *</label>
          <input ref={priceRef} type="number" min="0" step="1" placeholder="t.ex. 6 000" required />
        </div>
      </form>
    </Dialog>
  );
}
