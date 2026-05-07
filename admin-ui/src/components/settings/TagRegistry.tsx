import { useEffect, useRef, useState } from 'react';
import { api, jsonPost, jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import { CONDITION_EMOJI } from '../shared/ConditionBadge';
import type { Tag } from '../../api/types';

interface Props {
  onTagsLoaded?: (conditionTags: Tag[], allTags: Tag[]) => void;
}

export function TagRegistry({ onTagsLoaded }: Props) {
  const toast = useToast();
  const [conditionTags, setConditionTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const guidelinesRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [all, cond] = await Promise.all([
      api<Tag[]>('/api/tags').catch(() => []),
      api<Tag[]>('/api/tags/conditions').catch(() => []),
    ]);
    setAllTags(all);
    setConditionTags(cond);
    onTagsLoaded?.(cond, all);
  }

  useEffect(() => { load(); }, []);

  async function saveGuidelines(dataName: string, guidelines: string) {
    await jsonPatch(`/api/tags/${encodeURIComponent(dataName)}`, { guidelines: guidelines.trim() || null });
    toast('Riktlinje sparad.');
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const data_name = nameRef.current!.value.trim();
    const label = labelRef.current!.value.trim();
    const guidelines = guidelinesRef.current!.value.trim() || null;
    if (!data_name || !label) return;
    await jsonPost('/api/tags', { data_name, label, guidelines });
    nameRef.current!.value = '';
    labelRef.current!.value = '';
    guidelinesRef.current!.value = '';
    toast('Tagg tillagd.');
    load();
  }

  async function handleDeleteTag(dataName: string) {
    if (!confirm('Ta bort taggen från registret?')) return;
    await fetch(`/api/tags/${encodeURIComponent(dataName)}`, { method: 'DELETE' });
    toast('Tagg borttagen.');
    load();
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#4f46e5' }}>🏷️</div>
        <h2>Taggar</h2>
      </div>
      <div className="analytics-title" style={{ marginBottom: 8 }}>Kondition</div>
      <div style={{ marginBottom: 18 }}>
        {conditionTags.map((t) => (
          <div key={t.data_name} className="condition-registry-row">
            <span className="condition-badge" data-condition={t.data_name}>
              {CONDITION_EMOJI[t.data_name] ?? '🏷️'} {t.label}
            </span>
            <input
              type="text"
              className="condition-guidelines-input"
              defaultValue={t.guidelines ?? ''}
              placeholder="AI-riktlinje..."
              onBlur={(e) => saveGuidelines(t.data_name, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="analytics-title" style={{ marginBottom: 8 }}>Detaljtaggar</div>
      <div className="tag-chips">
        {allTags.length === 0
          ? <span style={{ fontSize: '.78rem', color: 'var(--text-4)' }}>Inga taggar ännu.</span>
          : allTags.map((t) => (
            <span key={t.data_name} className="tag-chip">
              {t.label}
              <button type="button" className="tag-chip-del" onClick={() => handleDeleteTag(t.data_name)} title="Ta bort">×</button>
            </span>
          ))
        }
      </div>
      <form onSubmit={handleAddTag} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <input ref={nameRef} type="text" placeholder="data_name (t.ex. rust)" style={{ width: 130, fontSize: '.82rem' }} pattern="[a-z][a-z0-9_]*" title="Bara a-z, 0-9 och _" />
        <input ref={labelRef} type="text" placeholder="Etikett (t.ex. Rost)" style={{ flex: 1, minWidth: 120, fontSize: '.82rem' }} required />
        <input ref={guidelinesRef} type="text" placeholder="AI-riktlinje (valfri)" style={{ width: '100%', fontSize: '.82rem', marginTop: 4 }} />
        <button type="submit" className="btn-primary btn-sm">+ Lägg till</button>
      </form>
    </div>
  );
}
