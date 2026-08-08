import { useEffect, useState } from 'react';
import { Columns2, ExternalLink, Layers, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { chooseDefaultModel, modelRequestsPerMinute, resolveModelSelection } from '~shared/models';
import type { ModelOption } from '~shared/types';
import { keyStore, sessionStore } from '../lib/storage';
import { useServerConfig } from '../state/ServerConfigContext';
import { usePreferences } from '../state/PreferencesContext';
import { Button } from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Feedback';
import { Sheet } from '../components/ui/Sheet';
import { SectionLabel, Segmented } from '../components/ui/Surface';

const KEY_URL = 'https://aistudio.google.com/apikey';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { prefs, update, apiKey, setApiKey, clearApiKey } = usePreferences();
  const config = useServerConfig();
  const [draftKey, setDraftKey] = useState('');
  const [sessions, setSessions] = useState(0);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftKey('');
    setCleared(false);
    void sessionStore.list().then((list) => setSessions(list.length));
  }, [open]);

  const hasKey = apiKey.trim().length > 0;
  const keyRequired = config.requireUserKey || !config.hasServerKey;
  const explainModel = resolveModelSelection(prefs.explainModel, config.models, 'explain');
  const chatModel = resolveModelSelection(prefs.chatModel, config.models, 'chat');
  const practiceModel = resolveModelSelection(prefs.practiceModel, config.models, 'practice');

  /* Which model each job would pick on its own. Marking it in the list is the
     difference between a dropdown of unfamiliar ids and one with a way in. */
  const recommended = {
    explain: chooseDefaultModel(config.models, 'explain'),
    chat: chooseDefaultModel(config.models, 'chat'),
    practice: chooseDefaultModel(config.models, 'practice'),
  };

  /* What an empty picker should say depends on why it is empty. It said
     "waiting for a key" in every case, including with a key sitting right above
     it that had just been refused. */
  const pickerPlaceholder = config.modelsLoading
    ? 'Loading…'
    : config.modelsError
      ? 'Unavailable — see above'
      : keyRequired && !hasKey
        ? 'Waiting for a key…'
        : 'No models available';

  const modelStatus = config.modelsLoading
    ? 'Asking Google which models this key can use…'
    : config.modelsError
      ? null
      : config.models.length > 0
        ? `${config.models.length} available. Each job starts on the one recommended for it.`
        : keyRequired && !hasKey
          ? 'Add a key above and the models it can call will appear here.'
          : null;

  const saveKey = () => {
    const value = draftKey.trim();
    if (!value) return;
    setApiKey(value, prefs.rememberKey);
    setDraftKey('');
  };

  const toggleRemember = () => {
    const next = !prefs.rememberKey;
    update({ rememberKey: next });
    if (hasKey) setApiKey(apiKey, next);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settings"
      description="Your key and study preferences stay on this device."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-7">
        {/* API key ------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <SectionLabel>Gemini API key</SectionLabel>
            <a
              href={KEY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[12px] font-medium text-accent-text hover:underline"
            >
              Get a key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {hasKey ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface-2 p-3">
              {/* The masked key, not the words "Key saved". People have more
                  than one Google key, and the only useful thing to say here is
                  which one this browser is holding. `keyStore.mask` existed for
                  this and had never been called; the `font-mono` was already
                  waiting on prose that did not need it. */}
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] text-ink">{keyStore.mask(apiKey)}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {prefs.rememberKey ? 'Stored on this device' : 'Stored for this tab only'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={clearApiKey}>
                  Remove
                </Button>
              </div>
            </div>
            <RememberKeyOption checked={prefs.rememberKey} onChange={toggleRemember} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    className="font-mono"
                    label="Paste your key"
                    type="password"
                    value={draftKey}
                    autoComplete="off"
                    spellCheck={false}
                    /* Settings is usually opened *to* do this — the button that
                       gets you here says "Add key". The sheet honours this hint
                       and focuses it without scrolling past its own heading. */
                    data-autofocus
                    placeholder="AIza… or AQ.…"
                    onChange={(event) => setDraftKey(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveKey();
                    }}
                    hint={
                      keyRequired
                        ? 'Required to generate notes, chat and practice.'
                        : 'Optional — this server already has a key configured.'
                    }
                  />
                </div>
                <div className="mb-[26px] shrink-0">
                  <Button variant="primary" onClick={saveKey} disabled={!draftKey.trim()}>
                    Save
                  </Button>
                </div>
              </div>
              <RememberKeyOption checked={prefs.rememberKey} onChange={toggleRemember} />
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-[12px] bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-good" />
            <p>
              The key is sent with each request to this app's server, which forwards it to Google and never logs or
              stores it. Slides are held in memory for the request only.
            </p>
          </div>
        </section>

        {/* Models -------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Models available to this key</SectionLabel>
            <Button
              size="sm"
              variant="quiet"
              icon={<RefreshCw className={config.modelsLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
              onClick={config.reloadModels}
              disabled={config.modelsLoading || (keyRequired && !hasKey)}
            >
              Reload
            </Button>
          </div>
          {/* One status line for the whole section: the three pickers all
              describe the same request, and saying so three times was noise. */}
          <p aria-live="polite" className="min-h-[16px] text-[12px] leading-snug text-ink-3">
            {modelStatus}
          </p>
          {config.modelsError ? (
            <Notice tone="error" onRetry={config.reloadModels} retryLabel="Try again">
              {config.modelsError}
            </Notice>
          ) : null}
          <ModelPicker
            label="Slide notes"
            hint="The heavy lifting. A stronger model writes better explanations."
            options={config.models}
            value={explainModel}
            recommended={recommended.explain}
            placeholder={pickerPlaceholder}
            onChange={(value) => update({ explainModel: value })}
          />
          <ModelPicker
            label="Tutor chat"
            hint="Fast replies matter more here than depth."
            options={config.models}
            value={chatModel}
            recommended={recommended.chat}
            placeholder={pickerPlaceholder}
            onChange={(value) => update({ chatModel: value })}
          />
          <ModelPicker
            label="Deck review"
            hint={
              config.models.length === 0
                ? 'Questions, matching pairs and blanks drawn from the whole deck.'
                : modelRequestsPerMinute(practiceModel) < 10
                  ? 'Around five requests a minute, so the review set is built in one pass over the whole deck.'
                  : 'Room for several requests, so the deck is reviewed in passes and questions appear as they arrive.'
            }
            options={config.models}
            value={practiceModel}
            recommended={recommended.practice}
            placeholder={pickerPlaceholder}
            onChange={(value) => update({ practiceModel: value })}
          />
        </section>

        {/* Appearance ---------------------------------------------------- */}
        <section className="space-y-3">
          <SectionLabel>Appearance</SectionLabel>
          <Segmented
            label="Appearance"
            className="w-full"
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={prefs.appearance}
            onChange={(value) => update({ appearance: value })}
          />

          <div className="space-y-1.5">
            <Segmented
              label="Notes layout"
              className="w-full"
              options={[
                { value: 'docked', label: 'Split', icon: <Columns2 className="h-3.5 w-3.5" />, tint: 'accent' },
                { value: 'overlay', label: 'Overlay', icon: <Layers className="h-3.5 w-3.5" />, tint: 'violet' },
              ]}
              value={prefs.panelMode}
              onChange={(value) => update({ panelMode: value, panelCollapsed: false })}
            />
            <p className="text-[12px] leading-relaxed text-ink-3">
              {prefs.panelMode === 'overlay'
                ? 'The slide fills the window and the notes float on top, fading out until you reach for them. Press O to switch.'
                : 'The window is split between the slide and your notes. Press O to float the notes instead.'}
            </p>
          </div>
        </section>

        {/* Data ---------------------------------------------------------- */}
        <section className="space-y-2">
          <SectionLabel>Saved work</SectionLabel>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            {sessions === 0
              ? 'No decks are saved on this device.'
              : `${sessions} deck${sessions === 1 ? '' : 's'} saved on this device, including notes and answers.`}
          </p>
          {sessions > 0 ? (
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={async () => {
                await sessionStore.clearAll();
                setSessions(0);
                setCleared(true);
              }}
            >
              Delete saved decks
            </Button>
          ) : null}
          {cleared ? <p className="text-[12.5px] text-good">Saved decks deleted.</p> : null}
        </section>
      </div>
    </Sheet>
  );
}

function RememberKeyOption({ checked, onChange }: { checked: boolean; onChange: () => void }): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-accent"
      />
      <span>Remember on this device</span>
    </label>
  );
}

/**
 * One job, one model.
 *
 * The option text used to be `{label} — {note}`, where the note is Google's own
 * description of the model. Three of those in a row is a wall of near-identical
 * sentences inside a control that truncates, and none of it answered the only
 * question a reader actually has, which is "which one should I pick?". The note
 * moved to the option's tooltip, and the answer to that question is now in the
 * list itself.
 */
function ModelPicker({
  label,
  hint,
  options,
  value,
  recommended,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  options: ModelOption[];
  value: string;
  /** What this job would choose on its own, marked so it can be chosen back. */
  recommended?: string;
  /** Shown when there is nothing to choose from, and says why there is not. */
  placeholder?: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  const empty = options.length === 0;
  return (
    <SelectField
      label={label}
      hint={hint}
      value={value}
      disabled={empty}
      onChange={(event) => onChange(event.target.value)}
    >
      {empty ? (
        <option value="">{placeholder ?? 'No models available'}</option>
      ) : (
        options.map((option) => (
          <option key={option.id} value={option.id} title={option.note || option.id}>
            {option.label}
            {option.id === recommended ? ' · recommended' : ''}
          </option>
        ))
      )}
    </SelectField>
  );
}
