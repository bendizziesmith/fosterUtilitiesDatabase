import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, RotateCcw, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { getAuditFileUrl, removeDraftFile, uploadAuditPhoto } from '../../../../lib/siteAuditService';
import { photoProgress, suggestedNote } from '../../../../lib/photoLogic';
import { StampInfo } from '../../../../lib/photoUpload';
import { AuditPhotoRow, AuditPhotoSlot } from '../../../../lib/supabase';
import { Field, Sheet } from './ui';
import { btn, card, inputCls } from './styles';

/** a photo row in the form, plus a local key and (just taken) a local preview */
export type DraftPhoto = AuditPhotoRow & { key: string; localUrl?: string };

type Pending = { key: string; slotId: string | null; file: File; status: 'preparing' | 'uploading' | 'error'; error?: string };

let seq = 0;
const newKey = () => `ph:${Date.now()}:${seq++}`;

/** Signed thumbnail for an uploaded photo (or the local preview right after taking it). */
function Thumb({ photo, onOpen, label }: { photo: DraftPhoto; onOpen: () => void; label: string }) {
  const [url, setUrl] = useState<string | null>(photo.localUrl ?? null);
  useEffect(() => {
    if (url || !photo.path) return;
    let live = true;
    getAuditFileUrl(photo.path).then((u) => live && setUrl(u)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [photo.path, url]);
  return (
    <button type="button" onClick={onOpen} aria-label={`View ${label} photo`}
      className="relative h-20 w-20 flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {url ? <img src={url} alt={`${label} photo`} className="h-full w-full object-cover" /> : <Loader2 className="h-5 w-5 m-auto text-slate-500 animate-spin" />}
    </button>
  );
}

/** Two buttons: back camera, or the photo library. */
function PickButtons({ onFile, takeLabel = 'Take photo', disabled }: { onFile: (f: File) => void; takeLabel?: string; disabled?: boolean }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button type="button" className={`${btn.primary} min-h-[52px]`} disabled={disabled} onClick={() => cam.current?.click()}>
        <Camera className="h-5 w-5" aria-hidden="true" />{takeLabel}
      </button>
      <button type="button" className={btn.secondary} disabled={disabled} onClick={() => lib.current?.click()}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" />Choose from library
      </button>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
      <input ref={lib} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
    </div>
  );
}

/**
 * Standard photos on every new audit (slot list is data), then any additional photos.
 * Photos are shrunk and stamped on the phone before upload; a failed upload can be retried.
 * Photos are optional (round 11): the slots are suggested, and a gentle note says how many are not taken.
 */
export function PhotosSection({ slots, photos, setPhotos, stamp, onError }: {
  slots: AuditPhotoSlot[];
  photos: DraftPhoto[];
  setPhotos: (fn: (p: DraftPhoto[]) => DraftPhoto[]) => void;
  stamp: StampInfo;
  onError: (m: string | null) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewing, setViewing] = useState<DraftPhoto | null>(null);
  const progress = photoProgress(slots, photos);

  const upload = async (p: Pending, replaceKey?: string) => {
    setPending((xs) => [...xs.filter((x) => x.key !== p.key), { ...p, status: 'preparing', error: undefined }]);
    onError(null);
    try {
      const { path, takenAt } = await uploadAuditPhoto(p.file, 'photos', stamp,
        () => setPending((xs) => xs.map((x) => (x.key === p.key ? { ...x, status: 'uploading' } : x))));
      const slot = slots.find((s) => s.id === p.slotId);
      const localUrl = URL.createObjectURL(p.file);
      setPhotos((xs) => {
        const old = replaceKey ? xs.find((x) => x.key === replaceKey) : undefined;
        const row: DraftPhoto = {
          key: newKey(), slot_id: p.slotId, slot_name: slot?.name ?? null, path, caption: old?.caption ?? null,
          skip_reason: null, taken_at: takenAt, sort_order: xs.length, localUrl,
        };
        // a photo replaces any old "Can't take photo" reason on the same slot
        const kept = xs.filter((x) => x.key !== replaceKey && !(p.slotId && x.slot_id === p.slotId && !x.path));
        return [...kept, row];
      });
      setPending((xs) => xs.filter((x) => x.key !== p.key));
    } catch (e) {
      setPending((xs) => xs.map((x) => (x.key === p.key ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' } : x)));
    }
  };

  const remove = async (ph: DraftPhoto) => {
    setPhotos((xs) => xs.filter((x) => x.key !== ph.key));
    setViewing(null);
    // a draft photo that was never submitted: remove the file too (best effort)
    if (ph.path) removeDraftFile(ph.path).catch(() => undefined);
  };

  const PendingRows = ({ slotId }: { slotId: string | null }) => (
    <>
      {pending.filter((p) => p.slotId === slotId).map((p) => (
        <div key={p.key} role="status" className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${p.status === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          <span className="flex items-center gap-2">
            {p.status !== 'error' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {p.status === 'preparing' ? 'Preparing photo…' : p.status === 'uploading' ? 'Uploading…' : `Upload failed: ${p.error}`}
          </span>
          {p.status === 'error' && (
            <span className="flex gap-2">
              <button type="button" className={btn.small} onClick={() => upload(p)}><RotateCcw className="h-4 w-4" aria-hidden="true" />Retry</button>
              <button type="button" className={btn.small} onClick={() => setPending((xs) => xs.filter((x) => x.key !== p.key))}>Cancel</button>
            </span>
          )}
        </div>
      ))}
    </>
  );

  const extra = photos.filter((p) => !p.slot_id && p.path);

  return (
    <section id="sec-photos" className="scroll-mt-20 space-y-2" aria-labelledby="sec-h-photos">
      <h2 id="sec-h-photos" className={`${card} min-h-[56px] flex items-center justify-between gap-3 px-4 sm:px-5`}>
        <span className="flex items-center gap-2">
          {progress.complete ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-white" aria-hidden="true"><Check className="h-4 w-4" strokeWidth={3} /></span>
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300" aria-hidden="true" />
          )}
          <span className="text-lg font-bold text-slate-900">Photos</span>
          <span className="text-sm font-semibold text-slate-600">{progress.done}/{progress.total}{progress.complete ? ' · done' : ''}</span>
        </span>
      </h2>

      {suggestedNote(progress) && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-base sm:text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span><strong>{suggestedNote(progress)}:</strong> {progress.missing.map((m) => m.name).join(', ')}. Photos are optional.</span>
        </p>
      )}

      <ul className="space-y-2">
        {slots.map((slot) => {
          const mine = photos.filter((p) => p.slot_id === slot.id && p.path);
          const done = mine.length > 0;
          return (
            <li key={slot.id} id={`photo-${slot.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-900">{slot.name}</p>
                  {slot.hint && <p className="text-sm text-slate-600 mt-0.5">{slot.hint}</p>}
                </div>
                {slot.required && (
                  <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                    {done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{done ? 'Taken' : 'Suggested'}
                  </span>
                )}
              </div>
              {mine.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mine.map((p) => <Thumb key={p.key} photo={p} label={slot.name} onOpen={() => setViewing(p)} />)}
                </div>
              )}
              <div className="mt-3 space-y-2">
                <PendingRows slotId={slot.id} />
                <PickButtons takeLabel={mine.length ? 'Take another' : 'Take photo'} onFile={(file) => upload({ key: newKey(), slotId: slot.id, file, status: 'preparing' })} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* additional photos: optional, any number, each with a caption */}
      <div className={`${card} p-4 space-y-3`}>
        <div>
          <p className="text-base font-bold text-slate-900">Additional photos</p>
          <p className="text-sm text-slate-600">Optional. Add as many as you need, each with a caption.</p>
        </div>
        {extra.length > 0 && (
          <ul className="space-y-2">
            {extra.map((p) => (
              <li key={p.key} className="flex items-start gap-3">
                <Thumb photo={p} label={p.caption || 'Additional'} onOpen={() => setViewing(p)} />
                <div className="flex-1 min-w-0">
                  <Field label="Caption (optional)">
                    {(id) => <input id={id} className={inputCls} value={p.caption ?? ''} onChange={(e) => setPhotos((xs) => xs.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))} />}
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
        <PendingRows slotId={null} />
        <PickButtons takeLabel="+ Add another photo" onFile={(file) => upload({ key: newKey(), slotId: null, file, status: 'preparing' })} />
      </div>

      {viewing && (
        <Sheet
          title={viewing.slot_name ?? (viewing.caption || 'Additional photo')}
          subtitle={viewing.taken_at ? `Taken ${new Date(viewing.taken_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : undefined}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button type="button" className={btn.danger} onClick={() => remove(viewing)}><Trash2 className="h-4 w-4" aria-hidden="true" />Delete photo</button>
              <RetakeButton onFile={(file) => { const v = viewing; setViewing(null); upload({ key: newKey(), slotId: v.slot_id, file, status: 'preparing' }, v.key); if (v.path) removeDraftFile(v.path).catch(() => undefined); }} />
            </>
          }
        >
          <ViewImage photo={viewing} />
        </Sheet>
      )}
    </section>
  );
}

function RetakeButton({ onFile }: { onFile: (f: File) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={btn.secondary} onClick={() => cam.current?.click()}><Camera className="h-4 w-4" aria-hidden="true" />Retake</button>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

function ViewImage({ photo }: { photo: DraftPhoto }) {
  const [url, setUrl] = useState<string | null>(photo.localUrl ?? null);
  useEffect(() => {
    if (url || !photo.path) return;
    getAuditFileUrl(photo.path).then(setUrl).catch(() => undefined);
  }, [photo.path, url]);
  return url ? <img src={url} alt={photo.slot_name ?? photo.caption ?? 'Photo'} className="w-full rounded-lg border border-slate-200" /> : <Loader2 className="h-6 w-6 mx-auto text-slate-500 animate-spin" />;
}
