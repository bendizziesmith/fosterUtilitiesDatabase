import { useState } from 'react';
import { Download, Loader2, FileText, Sheet as SheetIcon } from 'lucide-react';
import { Sheet, ErrorNote } from './ui';
import { btn } from './styles';

export interface DownloadChoice {
  title: string;
  hint?: string;
  kind: 'pdf' | 'csv';
  run: () => Promise<void>;
}

/** "Download" with a choice of files; a spinner while a big file is made. Works on phone and computer. */
export function DownloadMenu({ choices, label = 'Download' }: { choices: DownloadChoice[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (c: DownloadChoice) => {
    setBusy(c.title);
    setError(null);
    try {
      await c.run();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the file.');
    } finally {
      setBusy(null);
    }
  };

  // one choice: no menu, just the button
  if (choices.length === 1) {
    return (
      <>
        <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run(choices[0])}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Making file…' : label}
        </button>
        <ErrorNote message={error} />
      </>
    );
  }

  return (
    <>
      <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" aria-hidden="true" />{label}
      </button>
      {open && (
        <Sheet title={label} subtitle="Choose what to download." onClose={() => !busy && setOpen(false)}>
          <ul className="space-y-2">
            {choices.map((c) => {
              const Icon = c.kind === 'pdf' ? FileText : SheetIcon;
              return (
                <li key={c.title}>
                  <button type="button" disabled={!!busy} onClick={() => run(c)}
                    className="w-full min-h-[56px] flex items-center gap-3 px-3 rounded-lg border border-slate-200 text-left hover:bg-slate-50 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {busy === c.title ? <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" aria-hidden="true" /> : <Icon className="h-5 w-5 text-blue-600 flex-shrink-0" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="block text-base sm:text-sm font-semibold text-slate-900">{c.title} <span className="text-xs font-bold text-slate-600 uppercase">{c.kind}</span></span>
                      {c.hint && <span className="block text-sm text-slate-600">{busy === c.title ? 'Making file…' : c.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ErrorNote message={error} />
        </Sheet>
      )}
    </>
  );
}
