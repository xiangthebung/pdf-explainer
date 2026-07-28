import { Sheet } from '../components/ui/Sheet';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Move around',
    items: [
      ['→  ·  J  ·  Space', 'Next slide'],
      ['←  ·  K', 'Previous slide'],
      ['Home  ·  End', 'First or last slide'],
      ['/', 'Search the deck'],
    ],
  },
  {
    title: 'Study',
    items: [
      ['1  ·  2  ·  3', 'Notes, Ask, Review'],
      ['E', 'Explain from this slide'],
      ['R', 'Reset this slide’s practice'],
    ],
  },
  {
    title: 'Layout',
    items: [
      ['L', 'Split → Overlay → Slide only'],
      ['N  ·  double-click', 'Notes on or off'],
      ['F', 'Thumbnails on or off'],
      ['⇧ F', 'Full screen'],
      ['Esc', 'Bring the notes back, or close what is open'],
    ],
  },
  {
    title: 'View',
    items: [
      ['+  ·  −', 'Zoom in or out'],
      ['0', 'Fit the slide'],
      ['?', 'This list'],
    ],
  },
];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts" width="sm">
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{group.title}</h3>
            <dl className="space-y-1.5">
              {group.items.map(([keys, description]) => (
                <div key={keys} className="flex items-baseline justify-between gap-4">
                  <dt className="font-mono text-[12px] text-ink-2">{keys}</dt>
                  <dd className="text-right text-[13px] text-ink">{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
