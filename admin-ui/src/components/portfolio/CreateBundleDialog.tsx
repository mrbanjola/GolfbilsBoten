import { useRef } from 'react';
import { Dialog } from '../shared/Dialog';
import { jsonPost } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import type { PortfolioItem } from '../../api/types';

function totalInvested(item: PortfolioItem) {
  return item.purchase_price + (item.costs ?? []).reduce((s, c) => s + c.amount, 0);
}

interface Props {
  open: boolean;
  items: PortfolioItem[];
  onClose: () => void;
  onSaved: () => void;
}

export function CreateBundleDialog({ open, items, onClose, onSaved }: Props) {
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = nameRef.current!.value.trim();
    const checked = [...formRef.current!.querySelectorAll<HTMLInputElement>('[name="bundle-item"]:checked')]
      .map((el) => parseInt(el.value, 10));
    if (checked.length < 2) return toast('Välj minst 2 objekt.');
    await jsonPost('/api/portfolio/bundles', { name, item_ids: checked });
    toast('Paket skapat!');
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Skapa paket"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="bundle-create-form" className="btn-primary">Skapa paket</button>
        </>
      }
    >
      <form id="bundle-create-form" ref={formRef} onSubmit={handleSubmit}>
        <div className="field">
          <label>Paketnamn *</label>
          <input ref={nameRef} type="text" placeholder="T.ex. Gummibåtspaket" required />
        </div>
        <div className="field">
          <label>Välj objekt att paketera <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(minst 2)</span></label>
          <div className="bundle-items-checklist">
            {items.map((item) => (
              <label key={item.id} className="bundle-item-check">
                <input type="checkbox" name="bundle-item" value={item.id} />
                <span className="bic-mark"></span>
                <span className="bic-title">{item.title ?? 'Okänd annons'}</span>
                <span className="bic-price">{totalInvested(item).toLocaleString('sv')} kr</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
