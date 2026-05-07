import { useEffect, useRef, useState } from 'react';
import { api, jsonPost } from '../../api/client';
import { useToast } from '../../hooks/useToast';

export function BlacklistSettings() {
  const toast = useToast();
  const [words, setWords] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const data = await api<string[]>('/api/settings/blacklist').catch(() => []);
    setWords(data);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const word = inputRef.current!.value.trim().toLowerCase();
    if (!word) return;
    await jsonPost('/api/settings/blacklist', { word });
    inputRef.current!.value = '';
    toast(`"${word}" tillagd i blacklist.`);
    load();
  }

  async function handleDelete(word: string) {
    await fetch(`/api/settings/blacklist/${encodeURIComponent(word)}`, { method: 'DELETE' });
    toast(`"${word}" borttagen från blacklist.`);
    load();
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>🚫</div>
        <h2>Blacklist</h2>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Ord som filtrerar bort annonser från <em>alla</em> bevakningar, före AI. Matchar mot rubrik och beskrivning.
      </p>
      <div className="tag-chips">
        {words.length === 0
          ? <span style={{ fontSize: '.78rem', color: 'var(--text-4)' }}>Ingen blacklist ännu.</span>
          : words.map((w) => (
            <span key={w} className="tag-chip blacklist-chip">
              {w}
              <button type="button" className="tag-chip-del" onClick={() => handleDelete(w)} title="Ta bort">×</button>
            </span>
          ))
        }
      </div>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input ref={inputRef} type="text" placeholder="Lägg till ord..." style={{ flex: 1, fontSize: '.82rem' }} required />
        <button type="submit" className="btn-primary btn-sm">+ Lägg till</button>
      </form>
    </div>
  );
}
