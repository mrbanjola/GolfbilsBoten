import { useEffect, useRef, useState } from 'react';
import { api, jsonPost } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import type { FacebookStatus } from '../../api/types';

export function FacebookSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const data = await api<FacebookStatus>('/api/settings/facebook').catch(() => null);
    setStatus(data);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const raw = textareaRef.current!.value.trim();
    if (!raw) return toast('Klistra in session-JSON först.');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return toast('Ogiltig JSON.'); }
    await jsonPost('/api/settings/facebook', { session: parsed });
    textareaRef.current!.value = '';
    await load();
    toast('Facebook-session sparad.');
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-icon ci-amber">🔐</div>
        <h2>Facebook-session</h2>
      </div>
      {status == null ? (
        <p className="hint" style={{ marginBottom: 16 }}>Kontrollerar...</p>
      ) : status.hasSession ? (
        <span className="status-banner banner-ok" style={{ marginBottom: 16 }}>
          <span className="pulse"></span>
          Session aktiv — sparad {status.savedAt ?? 'okänt datum'}
        </span>
      ) : (
        <span className="status-banner banner-missing" style={{ marginBottom: 16 }}>
          ✕ &nbsp;Ingen session — klistra in JSON nedan för att aktivera Facebook-sökning
        </span>
      )}
      <form onSubmit={handleSave}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Session-JSON</label>
          <textarea ref={textareaRef} placeholder="Kör setup-facebook.js lokalt, öppna data/facebook-auth.json och klistra in innehållet här." style={{ minHeight: 72 }} />
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>
          Sessionen sparas till disk och används av Facebook-adaptern. Behöver förnyas när den löper ut (typiskt efter några veckor).
        </p>
        <div className="form-actions">
          <button type="submit" className="btn-primary">Spara session</button>
        </div>
      </form>
    </div>
  );
}
