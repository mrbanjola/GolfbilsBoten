import { useEffect, useState } from 'react';
import { api, jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import { useConstants } from '../../hooks/useConstants';
import type { Watch } from '../../api/types';
import { WatchCard } from './WatchCard';
import { AddWatchDialog } from './AddWatchDialog';
import { EditWatchDialog } from './EditWatchDialog';
import { AiSettings } from '../settings/AiSettings';
import { BlacklistSettings } from '../settings/BlacklistSettings';
import { FacebookSettings } from '../settings/FacebookSettings';
import { TagRegistry } from '../settings/TagRegistry';

export function WatchesView() {
  const toast = useToast();
  const constants = useConstants();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editWatch, setEditWatch] = useState<Watch | null>(null);

  const locations = constants?.locations ?? [];
  const categories = constants?.portfolioCategories ?? [];

  async function loadWatches() {
    const data = await api<Watch[]>('/api/watches').catch(() => []);
    setWatches(data);
  }

  useEffect(() => { loadWatches(); }, []);

  async function handleTogglePause(id: number, paused: number) {
    await jsonPatch(`/api/watches/${id}`, { paused: paused ? 0 : 1 });
    loadWatches();
    toast(paused ? 'Bevakning återupptagen.' : 'Bevakning pausad.');
  }

  async function handleDelete(id: number, query: string) {
    if (!confirm(`Ta bort bevakning "${query}"?`)) return;
    await fetch(`/api/watches/${id}`, { method: 'DELETE' });
    loadWatches();
    toast('Bevakning borttagen.');
  }

  return (
    <>
      <div className="card">
        <div className="card-head" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="card-icon ci-blue">📋</div>
            <h2>Aktiva bevakningar</h2>
          </div>
          <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>＋ Lägg till</button>
        </div>
        <div id="watches-container">
          {watches.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🔎</div>
              Inga aktiva bevakningar ännu.
            </div>
          ) : (
            <div className="watch-list">
              {watches.map((w) => (
                <WatchCard
                  key={w.id}
                  watch={w}
                  locations={locations}
                  categories={categories}
                  onTogglePause={handleTogglePause}
                  onEdit={setEditWatch}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AiSettings />
      <BlacklistSettings />
      <FacebookSettings />
      <TagRegistry />

      <AddWatchDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={loadWatches}
        locations={locations}
        categories={categories}
      />
      <EditWatchDialog
        watch={editWatch}
        onClose={() => setEditWatch(null)}
        onSaved={loadWatches}
        locations={locations}
        categories={categories}
      />
    </>
  );
}
