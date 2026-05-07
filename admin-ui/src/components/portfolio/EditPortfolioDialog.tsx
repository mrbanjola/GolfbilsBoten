import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../shared/Dialog';
import { jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import { ThumbPlaceholder } from '../shared/ThumbPlaceholder';
import { CONDITION_EMOJI } from '../shared/ConditionBadge';
import type { PortfolioItem, Tag, PortfolioCategory, Cost } from '../../api/types';

interface Props {
  item: PortfolioItem | null;
  conditionTags: Tag[];
  allTags: Tag[];
  categories: PortfolioCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditPortfolioDialog({ item, conditionTags, allTags, categories, onClose, onSaved }: Props) {
  const toast = useToast();
  const [costs, setCosts] = useState<Cost[]>([]);
  const [imageData, setImageData] = useState<string | null>(null);
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const costDescRef = useRef<HTMLInputElement>(null);
  const costAmountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setCosts((item.costs ?? []).map((c) => ({ description: c.description, amount: c.amount })));
      setImageData(null);
      setThumbSrc(item.image_url);
    }
  }, [item]);

  function addCost() {
    const desc = costDescRef.current!.value.trim();
    const amount = parseInt(costAmountRef.current!.value, 10);
    if (!desc || !amount || amount < 0) return;
    setCosts((prev) => [...prev, { description: desc, amount }]);
    costDescRef.current!.value = '';
    costAmountRef.current!.value = '';
  }

  function removeCost(i: number) {
    setCosts((prev) => prev.filter((_, idx) => idx !== i));
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!item) return;
    const form = e.currentTarget;
    const soldVal = (form.querySelector('#pedit-sold-price') as HTMLInputElement).value.trim();
    const selectedCondition = (form.querySelector('[name="pedit-condition"]:checked') as HTMLInputElement | null)?.value || null;
    const selectedTags = [...form.querySelectorAll<HTMLInputElement>('[name="pedit-tag"]:checked')].map((el) => el.value);
    const body: Record<string, unknown> = {
      purchase_price: parseInt((form.querySelector('#pedit-purchase-price') as HTMLInputElement).value, 10),
      sold_price: soldVal ? parseInt(soldVal, 10) : null,
      notes: (form.querySelector('#pedit-notes') as HTMLTextAreaElement).value.trim() || null,
      category: (form.querySelector('#pedit-category') as HTMLSelectElement).value || null,
      condition: selectedCondition,
      tags: selectedTags,
      costs,
    };
    if (imageData) body.image_data = imageData;
    await jsonPatch(`/api/portfolio/${item.id}`, body);
    toast('Sparat.');
    onSaved();
  }

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title="Redigera"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="pedit-form" className="btn-primary">Spara</button>
        </>
      }
    >
      <form id="pedit-form" ref={formRef} onSubmit={handleSubmit}>
        <p style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item?.title ?? 'Okänd annons'}
        </p>
        <div className="field">
          <label>Köppris (kr) *</label>
          <input id="pedit-purchase-price" type="number" min="0" step="1" defaultValue={item?.purchase_price ?? ''} required />
        </div>
        <div className="field">
          <label>Säljpris (kr) <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(lämna tomt om ej såld)</span></label>
          <input id="pedit-sold-price" type="number" min="0" step="1" defaultValue={item?.sold_price ?? ''} placeholder="–" />
        </div>
        <div className="field">
          <label>Extra kostnader</label>
          <div className="cost-list">
            {costs.length === 0
              ? <div className="cost-empty">Inga extrakostnader.</div>
              : costs.map((c, i) => (
                <div key={i} className="cost-row">
                  <span className="cost-desc" title={c.description}>{c.description}</span>
                  <span className="cost-amount">{c.amount.toLocaleString('sv')} kr</span>
                  <button type="button" className="cost-remove" onClick={() => removeCost(i)}>×</button>
                </div>
              ))
            }
          </div>
          <div className="cost-add-row">
            <input ref={costDescRef} type="text" placeholder="Beskrivning, t.ex. Nytt batteri" />
            <input ref={costAmountRef} type="number" min="1" step="1" placeholder="Belopp" />
            <button type="button" className="btn-secondary btn-sm" onClick={addCost}>+</button>
          </div>
        </div>
        <div className="field">
          <label>Kategori</label>
          <select id="pedit-category" defaultValue={item?.category ?? ''}>
            <option value="">– Välj kategori –</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Kondition</label>
          <div className="condition-radio-list">
            {conditionTags.map((t) => (
              <label key={t.data_name} className="condition-radio-label">
                <input type="radio" name="pedit-condition" value={t.data_name} defaultChecked={item?.condition === t.data_name} />
                <span>{CONDITION_EMOJI[t.data_name] ?? '🏷️'} {t.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Detaljtaggar</label>
          <div className="tag-checkbox-list">
            {allTags.length === 0
              ? <span style={{ fontSize: '.78rem', color: 'var(--text-4)' }}>Inga taggar i registret.</span>
              : allTags.map((t) => (
                <label key={t.data_name} className="tag-checkbox-label">
                  <input type="checkbox" name="pedit-tag" value={t.data_name} defaultChecked={item?.tags?.includes(t.data_name)} />
                  <span>{t.label}</span>
                </label>
              ))
            }
          </div>
        </div>
        <div className="field">
          <label>Kommentar</label>
          <textarea id="pedit-notes" defaultValue={item?.notes ?? ''} placeholder="T.ex. skick, vad som gjordes, fynd-info..." style={{ minHeight: 56 }} />
        </div>
        <div className="field">
          <label>Bild <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(ladda upp för att ersätta)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {thumbSrc
              ? <img className="recent-thumb" src={thumbSrc} alt="" style={{ flexShrink: 0 }} />
              : <ThumbPlaceholder />
            }
            <input type="file" accept="image/*" onChange={handleImagePick} style={{ fontSize: '.82rem', flex: 1 }} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
