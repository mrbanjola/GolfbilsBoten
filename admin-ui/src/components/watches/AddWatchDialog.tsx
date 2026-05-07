import { useState } from 'react';
import { Dialog } from '../shared/Dialog';
import { WatchFormFields, EMPTY_WATCH_FORM, type WatchFormValues } from './WatchFormFields';
import type { Location, PortfolioCategory } from '../../api/types';
import { jsonPost, jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: Location[];
  categories: PortfolioCategory[];
}

export function AddWatchDialog({ open, onClose, onSaved, locations, categories }: Props) {
  const toast = useToast();
  const [values, setValues] = useState<WatchFormValues>(EMPTY_WATCH_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const created = await jsonPost<{ id: number }>('/api/watches', {
      query: values.query.trim(),
      max_price: parseInt(values.max_price, 10) || null,
      min_price: parseInt(values.min_price, 10) || null,
      platforms: values.platforms,
      is_car: values.is_car,
    });
    await jsonPatch(`/api/watches/${created.id}`, {
      location: values.location || null,
      ad_type: values.ad_type,
      is_car: values.is_car ? 1 : 0,
      exclude_words: values.exclude_words.trim() || null,
      category: values.category || null,
    });
    setValues(EMPTY_WATCH_FORM);
    onClose();
    onSaved();
    toast('Bevakning tillagd.');
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Lägg till bevakning"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="add-watch-form" className="btn-primary">Lägg till</button>
        </>
      }
    >
      <form id="add-watch-form" onSubmit={handleSubmit}>
        <WatchFormFields values={values} onChange={setValues} locations={locations} categories={categories} />
      </form>
    </Dialog>
  );
}
