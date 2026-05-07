import { useEffect, useState } from 'react';
import { Dialog } from '../shared/Dialog';
import { WatchFormFields, type WatchFormValues } from './WatchFormFields';
import type { Watch, Location, PortfolioCategory } from '../../api/types';
import { jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';

interface Props {
  watch: Watch | null;
  onClose: () => void;
  onSaved: () => void;
  locations: Location[];
  categories: PortfolioCategory[];
}

export function EditWatchDialog({ watch, onClose, onSaved, locations, categories }: Props) {
  const toast = useToast();
  const [values, setValues] = useState<WatchFormValues>({
    query: '', min_price: '', max_price: '', location: '',
    ad_type: 'all', platforms: 'blocket', category: '', exclude_words: '', is_car: false,
  });

  useEffect(() => {
    if (watch) {
      setValues({
        query: watch.query,
        min_price: watch.min_price != null ? String(watch.min_price) : '',
        max_price: watch.max_price != null ? String(watch.max_price) : '',
        location: watch.location ?? '',
        ad_type: watch.ad_type ?? 'all',
        platforms: watch.platforms ?? 'blocket',
        category: watch.category ?? '',
        exclude_words: watch.exclude_words ?? '',
        is_car: Boolean(watch.is_car),
      });
    }
  }, [watch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!watch) return;
    await jsonPatch(`/api/watches/${watch.id}`, {
      query: values.query.trim() || undefined,
      max_price: parseInt(values.max_price, 10) || null,
      min_price: parseInt(values.min_price, 10) || null,
      location: values.location || null,
      ad_type: values.ad_type,
      platforms: values.platforms,
      is_car: values.is_car ? 1 : 0,
      exclude_words: values.exclude_words.trim() || null,
      category: values.category || null,
    });
    onClose();
    onSaved();
    toast('Sparat.');
  }

  return (
    <Dialog
      open={!!watch}
      onClose={onClose}
      title="Ändra bevakning"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Avbryt</button>
          <button type="submit" form="edit-watch-form" className="btn-primary">Spara</button>
        </>
      }
    >
      <form id="edit-watch-form" onSubmit={handleSubmit}>
        <WatchFormFields values={values} onChange={setValues} locations={locations} categories={categories} />
      </form>
    </Dialog>
  );
}
