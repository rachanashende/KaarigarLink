import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import type { StoredDocument } from '@/services/platform';

const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(bytes / 1024) + ' KB' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB';
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));

/**
 * Stored files of a job (design files) or an order (inspection evidence). Live mode
 * only (M12); renders nothing without a file service. The server decides who may
 * read, upload or delete; `canUpload` only controls whether the upload control shows.
 */
export function DocumentList({ scope, id, title, description, canUpload = false }: { scope: 'job' | 'order'; id: string; title: string; description?: string; canUpload?: boolean }) {
  const { files } = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const key = ['files', scope, id];
  const query = useQuery({ queryKey: key, queryFn: () => scope === 'job' ? files!.listJobFiles(id) : files!.listOrderFiles(id), enabled: !!files });
  const upload = useMutation({
    mutationFn: async (selected: File[]) => {
      const failed: string[] = [];
      for (const file of selected) {
        try { await (scope === 'job' ? files!.uploadJobFile(id, file) : files!.uploadEvidence(id, file)); }
        catch (reason) { failed.push(file.name + ': ' + (reason instanceof Error ? reason.message : 'upload failed')); }
      }
      return { uploaded: selected.length - failed.length, failed };
    },
    onSuccess: ({ uploaded, failed }) => { setNotice(uploaded ? uploaded + ' file(s) uploaded.' : ''); setError(failed.join(' ')); },
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (document: StoredDocument) => files!.remove(document.id),
    onSuccess: () => setNotice('File deleted.'),
    onError: reason => setError(reason instanceof Error ? reason.message : 'The file could not be deleted.'),
    onSettled: () => cache.invalidateQueries({ queryKey: key }),
  });
  const download = useMutation({ mutationFn: (document: StoredDocument) => files!.download(document), onError: reason => setError(reason instanceof Error ? reason.message : 'The file could not be downloaded.') });
  if (!files) return null;
  return <section aria-label={title} className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">{title}</h2>
    {description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>}
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {query.isPending ? <p className="mt-4 text-sm text-muted-foreground">Loading files…</p>
      : query.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{query.error.message}</p>
      : query.data.length ? <ul className="mt-4 divide-y">{query.data.map(document => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span className="flex min-w-0 items-start gap-3"><FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{document.name}<span className="mt-1 block text-xs text-muted-foreground">{sizeLabel(document.sizeBytes)} · {document.uploaderName} · {dateLabel(document.uploadedAt)}{document.inspectionId ? ' · part of a submitted inspection' : ''}</span></span></span>
        <span className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={download.isPending} onClick={() => { setError(''); download.mutate(document); }}>Download</Button>
          {document.uploaderId === user?.id && !document.inspectionId && <Button variant="outline" disabled={remove.isPending} onClick={() => { setError(''); setNotice(''); remove.mutate(document); }}>Delete</Button>}
        </span>
      </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No files uploaded.</p>}
    {canUpload && <div className="mt-5 border-t pt-4">
      <label htmlFor={'upload-' + scope + '-' + id} className="mb-2 block text-sm font-medium">Upload files</label>
      <input id={'upload-' + scope + '-' + id} ref={input} type="file" multiple accept={files.accept} disabled={upload.isPending} className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
        onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ''; if (selected.length) { setNotice(''); setError(''); upload.mutate(selected); } }} />
      <p className="mt-2 text-xs text-muted-foreground">{upload.isPending ? 'Uploading…' : 'PDF, images, CAD (DXF, DWG, STEP, STL, IGES), DOCX, XLSX, CSV or TXT. Up to 10 MB each.'}</p>
    </div>}
  </section>;
}
