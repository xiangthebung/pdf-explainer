import { useEffect, useState } from 'react';
import { Columns2, Eye, EyeOff, ExternalLink, Layers, ShieldCheck, Trash2 } from 'lucide-react';
import { modelRequestsPerMinute } from '~shared/models';
import { STUDY_STYLES } from '~shared/types';
import type { ModelOption, StudyStyle } from '~shared/types';
import { sessionStore } from '../lib/storage';
import { useServerConfig } from '../hooks/useServerConfig';
import { usePreferences } from '../state/PreferencesContext';
import { useStudy } from '../state/StudyContext';
import { Button } from '../components/ui/Button';
import { SelectField, TextArea, TextField, Toggle } from '../components/ui/Field';
import { Sheet } from '../components/ui/Sheet';
import { SectionLabel, Segmented, STYLE_TINTS, TINT_CLASS } from '../components/ui/Surface';
import { cx } from '../lib/utils';

const KEY_URL = 'https://aistudio.google.com/apikey';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { prefs, update, apiKey, setApiKey, clearApiKey } = usePreferences();
  const { state, actions } = useStudy();
  const config = useServerConfig();
  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftKey('');
    setShowKey(false);
    setCleared(false);
    void sessionStore.list().then((list) => setSessions(list.length));
  }, [open]);

  const hasKey = apiKey.trim().length > 0;
  const keyRequired = config.requireUserKey || !config.hasServerKey;
  const deckOpen = Boolean(state.source);

  const saveKey = () => {
    const value = draftKey.trim();
    if (!value) return;
    setApiKey(value, prefs.rememberKey);
    setDraftKey('');
    setShowKey(false);
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
          <SectionLabel>Gemini API key</SectionLabel>

          {hasKey ? (
            <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface-2 p-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">Key saved</p>
                <p className="mt-0.5 font-mono text-[12px] text-ink-3">
                  {prefs.rememberKey ? 'Stored on this device' : 'Stored for this tab only'}
                </p>
              </div>
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={clearApiKey}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <TextField
                className="font-mono"
                label="Paste your key"
                type={showKey ? 'text' : 'password'}
                value={draftKey}
                autoComplete="off"
                spellCheck={false}
                placeholder="AIza…"
                onChange={(event) => setDraftKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveKey();
                }}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowKey((value) => !value)}
                    className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                }
                hint={
                  keyRequired
                    ? 'Required to generate notes, chat and practice.'
                    : 'Optional — this server already has a key configured.'
                }
              />
              <Button variant="primary" onClick={saveKey} disabled={!draftKey.trim()} className="mb-[26px]">
                Save
              </Button>
            </div>
          )}

          <Toggle
            checked={prefs.rememberKey}
            onChange={(next) => {
              update({ rememberKey: next });
              if (hasKey) setApiKey(apiKey, next);
            }}
            label="Remember on this device"
            description="Off by default. When off, the key is cleared as soon as you close the tab."
          />

          <div className="flex items-start gap-2.5 rounded-[12px] bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-good" />
            <p>
              The key is sent with each request to this app's server, which forwards it to Google and never logs or
              stores it. Slides are held in memory for the request only.{' '}
              <a
                href={KEY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-text hover:underline"
              >
                Get a key
                <ExternalLink className="ml-0.5 inline h-3 w-3" />
              </a>
            </p>
          </div>
        </section>

        {/* Models -------------------------------------------------------- */}
        <section className="space-y-3">
          <SectionLabel>Models</SectionLabel>
          <ModelPicker
            label="Slide notes"
            hint="The heavy lifting. Better models write better explanations."
            options={config.models}
            value={prefs.explainModel}
            onChange={(value) => update({ explainModel: value })}
          />
          <ModelPicker
            label="Tutor chat"
            hint="Fast replies matter more here."
            options={config.models}
            value={prefs.chatModel}
            onChange={(value) => update({ chatModel: value })}
          />
          <ModelPicker
            label="Deck review"
            hint={
              modelRequestsPerMinute(prefs.practiceModel) < 10
                ? 'Five requests a minute, so the review set is built in one pass over the whole deck.'
                : 'Room for several requests, so the deck is reviewed in passes and questions appear as they arrive.'
            }
            options={config.models}
            value={prefs.practiceModel}
            onChange={(value) => update({ practiceModel: value })}
          />
        </section>

        {/* Teaching ------------------------------------------------------ */}
        <section className="space-y-3">
          <SectionLabel>How it teaches</SectionLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STUDY_STYLES.map((style) => {
              const active = (deckOpen ? state.style : prefs.style) === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    update({ style: style.id as StudyStyle });
                    if (deckOpen) actions.setStyle(style.id);
                  }}
                  className={cx(
                    'rounded-[13px] border p-3 text-left transition-colors',
                    TINT_CLASS[STYLE_TINTS[style.id] ?? 'accent'],
                    active ? 'tint-ring bg-[var(--tint-soft)]' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span className={cx('text-[13.5px] font-medium', active ? 'tint-text' : 'text-ink')}>
                    {style.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">{style.description}</span>
                </button>
              );
            })}
          </div>

          <TextArea
            label="Anything else the tutor should know"
            placeholder="e.g. I am revising for a written exam, focus on the derivations in chapter 3."
            value={deckOpen ? state.customInstructions : prefs.customInstructions}
            maxLength={1200}
            onChange={(event) => {
              update({ customInstructions: event.target.value });
              if (deckOpen) actions.setInstructions(event.target.value);
            }}
            hint="Applied to notes generated from now on."
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

/**
 * Catalogue picker that quietly supports any model id: if the stored value is
 * not in the list, the field switches to a free-text input.
 */
function ModelPicker({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: ModelOption[];
  value: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  const known = options.some((option) => option.id === value);
  const [custom, setCustom] = useState(!known);

  useEffect(() => {
    setCustom(!options.some((option) => option.id === value));
  }, [options, value]);

  return (
    <div className="space-y-1.5">
      <SelectField
        label={label}
        hint={hint}
        value={custom ? 'custom' : value}
        onChange={(event) => {
          if (event.target.value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} — {option.note}
          </option>
        ))}
        <option value="custom">Custom model ID…</option>
      </SelectField>
      {custom ? (
        <TextField
          className="font-mono text-[13px]"
          placeholder="gemini-3.5-flash"
          value={known ? '' : value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.trim())}
        />
      ) : null}
    </div>
  );
}
