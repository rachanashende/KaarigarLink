import { useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { FileText, Plus, X } from 'lucide-react';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/feedback';
import { todayInIndia } from '@/services/jobs';
import { JobField, jobControlClass } from './JobField';
import { jobFormSchema, type JobFormOutput, type JobFormValues } from './jobFormSchema';

export function PostJobPage() {
  const services = useServices();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // M12 live mode: the chosen files are uploaded to the new job after it is created.
  const chosenFiles = useRef<File[]>([]);
  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<JobFormValues, unknown, JobFormOutput>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: { title: '', capability: '', description: '', material: '', specification: '', unit: 'pieces', processes: '', deadline: '', location: { city: '', state: '' }, designFiles: [] },
  });
  const files = useWatch({ control, name: 'designFiles' });
  const mutation = useMutation({
    mutationFn: (input: JobFormOutput) => services.buyer.createJob(user!.id, input),
    async onSuccess(job) {
      const uploadFailures: string[] = [];
      if (services.files) {
        for (const file of chosenFiles.current) {
          try { await services.files.uploadJobFile(job.id, file); }
          catch (reason) { uploadFailures.push(file.name + ': ' + (reason instanceof Error ? reason.message : 'upload failed')); }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['buyer', user!.id] });
      queryClient.setQueryData(['buyer', user!.id, 'job', job.id], job);
      navigate('/buyer/jobs/' + encodeURIComponent(job.id), { state: { createdJobId: job.id, uploadFailures } });
    },
  });
  async function submit(values: JobFormOutput) {
    if (submitting.current) return;
    submitting.current = true;
    try { await mutation.mutateAsync(values); }
    catch { submitting.current = false; /* Preserve the draft and allow retry after failure. */ }
  }
  return <>
    <PageHeader title="Post a manufacturing job" description="Give workshops a clear brief: what to make, how much, and when you need it." />
    <form noValidate aria-busy={mutation.isPending} onSubmit={event => { void handleSubmit(submit)(event); }} className="max-w-4xl">
      <fieldset disabled={mutation.isPending || mutation.isSuccess} className="space-y-6">
        <section aria-labelledby="job-brief" className="rounded-lg border bg-card p-5 sm:p-7">
          <h2 id="job-brief" className="text-lg font-semibold">Manufacturing brief</h2><p className="mt-2 text-sm text-muted-foreground">All fields are required unless marked optional.</p>
          <div className="mt-6 space-y-5">
            <JobField id="title" label="Job title" error={errors.title?.message}>{props => <input {...props} {...register('title')} maxLength={140} className={jobControlClass} />}</JobField>
            <JobField id="capability" label="Manufacturing capability" hint="For example, CNC machining or sheet metal fabrication." error={errors.capability?.message}>{props => <input {...props} {...register('capability')} maxLength={120} list="manufacturing-capabilities" className={jobControlClass} />}</JobField>
            <datalist id="manufacturing-capabilities"><option value="CNC machining" /><option value="Sheet metal fabrication" /><option value="CNC turning" /><option value="Precision grinding" /><option value="Injection moulding" /></datalist>
            <JobField id="description" label="Job description" error={errors.description?.message}>{props => <textarea {...props} {...register('description')} rows={4} maxLength={4000} className={jobControlClass} />}</JobField>
            <div className="grid gap-5 sm:grid-cols-2">
              <JobField id="material" label="Material" hint="Start with the base material, then any grade or form, for example aluminium 6061 or mild steel sheet." error={errors.material?.message}>{props => <input {...props} {...register('material')} list="job-materials" maxLength={120} className={jobControlClass} />}</JobField>
              <datalist id="job-materials"><option value="aluminium" /><option value="mild steel" /><option value="stainless steel" /><option value="brass" /><option value="cast iron" /><option value="titanium" /><option value="nylon" /><option value="abs plastic" /><option value="polypropylene" /></datalist>
              <JobField id="processes" label="Required machinery or capabilities" hint="Separate requirements with commas, for example: CNC lathe, bore finishing." error={errors.processes?.message}>{props => <input {...props} {...register('processes')} className={jobControlClass} />}</JobField>
            </div>
            <JobField id="specification" label="Additional specifications" optional error={errors.specification?.message}>{props => <textarea {...props} {...register('specification')} rows={3} maxLength={4000} className={jobControlClass} />}</JobField>
          </div>
        </section>
        <section aria-labelledby="quantity-delivery" className="rounded-lg border bg-card p-5 sm:p-7">
          <h2 id="quantity-delivery" className="text-lg font-semibold">Quantity & delivery</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <JobField id="quantity" label="Quantity" error={errors.quantity?.message}>{props => <input {...props} {...register('quantity', { valueAsNumber: true })} type="number" inputMode="decimal" step="any" className={jobControlClass} />}</JobField>
            <JobField id="unit" label="Unit of measurement" error={errors.unit?.message}>{props => <input {...props} {...register('unit')} list="job-units" maxLength={40} className={jobControlClass} />}</JobField>
            <datalist id="job-units"><option value="pieces" /><option value="sets" /><option value="kg" /><option value="metres" /></datalist>
            <JobField id="deadline" label="Delivery deadline" hint="Choose a date after today. Dates use India time." error={errors.deadline?.message}>{props => <input {...props} {...register('deadline')} type="date" min={todayInIndia()} className={jobControlClass} />}</JobField>
            <JobField id="budget" label="Budget (INR)" optional hint="Total estimated budget, not a per-unit price." error={errors.budget?.message}>{props => <input {...props} {...register('budget', { setValueAs: (value: string) => value === '' ? undefined : Number(value) })} type="number" inputMode="decimal" step="0.01" className={jobControlClass} />}</JobField>
            <JobField id="city" label="Delivery city" error={errors.location?.city?.message}>{props => <input {...props} {...register('location.city')} autoComplete="address-level2" maxLength={120} className={jobControlClass} />}</JobField>
            <JobField id="state" label="State or union territory" error={errors.location?.state?.message}>{props => <input {...props} {...register('location.state')} autoComplete="address-level1" maxLength={120} className={jobControlClass} />}</JobField>
          </div>
        </section>
        <section aria-labelledby="design-files" className="rounded-lg border bg-card p-5 sm:p-7">
          <h2 id="design-files" className="text-lg font-semibold">Design references</h2>
          <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">{services.files ? 'Files are uploaded to the KaarigarLink server after the job is posted, and only invited or awarded workshops, the assigned inspector and administrators can download them. Choose up to 5 files, 10 MB each.' : 'Simulated attachment only. File names, types and sizes are recorded; contents are not uploaded or retained. Choose up to 5 files, 10 MB each. Use non-sensitive demo files.'}</p>
          <JobField id="attachments" label="Design files" optional error={errors.designFiles ? (errors.designFiles.message ?? 'Check file metadata: up to 5 files, 10 MB each.') : undefined}>{props => <input {...props} ref={fileInput} type="file" multiple {...(services.files ? { accept: services.files.accept } : {})} className={jobControlClass + ' file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-primary'} onChange={event => {
            chosenFiles.current = Array.from(event.target.files ?? []);
            setValue('designFiles', Array.from(event.target.files ?? []).map(file => ({ id: crypto.randomUUID(), name: file.name, mediaType: file.type || 'application/octet-stream', sizeBytes: file.size })), { shouldValidate: true, shouldDirty: true });
          }} />}</JobField>
          {files.length > 0 && <><ul className="mt-4 divide-y">{files.map(file => <li key={file.id} className="flex min-w-0 items-start gap-3 py-3 text-sm"><FileText aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{file.name}<span className="mt-1 block text-xs text-muted-foreground">{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(file.sizeBytes / 1024)} KB · {file.mediaType}</span></span></li>)}</ul><Button variant="outline" onClick={() => { chosenFiles.current = []; setValue('designFiles', [], { shouldValidate: true, shouldDirty: true }); if (fileInput.current) fileInput.current.value = ''; }}><X aria-hidden="true" className="size-4" />Clear attachments</Button></>}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-5 sm:p-7">
          {services.demo ? <p className="max-w-md text-xs leading-relaxed text-muted-foreground">Posting creates a job in the shared mock workspace. Development demo data is saved on this browser; attachment metadata stays in memory. Reset demo data from Manufacturing orders.</p> : <p className="max-w-md text-xs leading-relaxed text-muted-foreground">Posting publishes the job to verified workshops for matching. You can cancel it until a quotation is awarded.</p>}
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => navigate('/buyer/jobs')}>Cancel</Button><Button type="submit"><Plus aria-hidden="true" className="size-4" />{mutation.isPending ? 'Posting job…' : 'Post job'}</Button></div>
        </div>
      </fieldset>
      {mutation.isError && <div className="mt-6"><ErrorState title="Job was not posted" message={mutation.error.message} /></div>}
    </form>
  </>;
}
