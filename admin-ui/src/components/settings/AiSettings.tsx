import { useEffect, useState } from 'react';
import { api, jsonPatch } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import type { AiSettings as AiSettingsType } from '../../api/types';

export function AiSettings() {
  const toast = useToast();
  const [s, setS] = useState<AiSettingsType>({
    enabled: false, model: '', batch_size: 8, timeout_ms: 15000,
    system_prompt: '', global_rules: '',
  });

  useEffect(() => {
    api<AiSettingsType>('/api/settings/ai').then(setS).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await jsonPatch('/api/settings/ai', s);
    toast('AI-inställningar sparade.');
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-icon ci-purple">🤖</div>
        <h2>AI-filter</h2>
      </div>
      <form onSubmit={handleSave}>
        <div className="toggle-row" style={{ marginBottom: 18 }}>
          <label className="switch">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            />
            <span className="switch-track"></span>
          </label>
          <label className="toggle-label">Aktivera Claude-baserad relevansfiltrering</label>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Modell</label>
            <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="claude-haiku-4-5-20251001" />
          </div>
          <div className="field">
            <label>Batch size</label>
            <input type="number" min="1" max="25" value={s.batch_size} onChange={(e) => setS({ ...s, batch_size: parseInt(e.target.value, 10) || 8 })} />
          </div>
          <div className="field">
            <label>Timeout (ms)</label>
            <input type="number" min="1000" step="1000" value={s.timeout_ms} onChange={(e) => setS({ ...s, timeout_ms: parseInt(e.target.value, 10) || 15000 })} />
          </div>
          <div className="field">
            <label style={{ visibility: 'hidden' }}>_</label>
            <p className="hint">API-nyckeln konfigureras via <code>CLAUDE_API_KEY</code> i miljövariabler.</p>
          </div>
          <div className="field full">
            <label>System prompt</label>
            <textarea value={s.system_prompt} onChange={(e) => setS({ ...s, system_prompt: e.target.value })} placeholder="Instruktioner som skickas som system prompt till Claude..." />
          </div>
          <div className="field full">
            <label>Globala regler</label>
            <textarea value={s.global_rules} onChange={(e) => setS({ ...s, global_rules: e.target.value })} placeholder="Regler som hjälper Claude att avgöra relevans..." />
          </div>
          <div className="full form-actions">
            <button type="submit" className="btn-primary">Spara AI-inställningar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
