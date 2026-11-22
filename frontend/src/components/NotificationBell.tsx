import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import type { AppNotification } from '@/services/platform';

const timeLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));

/**
 * In-app notifications (M12, live mode only). The unread count refreshes every
 * minute and when the panel opens; notifications are stored on the server, so they
 * survive refreshes and new sessions. Renders nothing in mock mode.
 */
export function NotificationBell() {
  const { notifications } = useServices(); const { user } = useAuth(); const cache = useQueryClient(); const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const enabled = !!notifications && !!user;
  const count = useQuery({ queryKey: ['notifications', user?.id, 'count'], queryFn: () => notifications!.unreadCount(), enabled, refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ['notifications', user?.id, 'list'], queryFn: () => notifications!.list({ page: 1 }), enabled: enabled && open });
  const refresh = () => cache.invalidateQueries({ queryKey: ['notifications', user?.id] });
  const markRead = useMutation({ mutationFn: (id: string) => notifications!.markRead(id), onSettled: refresh });
  const markAll = useMutation({ mutationFn: () => notifications!.markAllRead(), onSettled: refresh });
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!enabled) return null;
  const unread = count.data ?? 0;
  function openItem(item: AppNotification) {
    if (!item.read) markRead.mutate(item.id);
    setOpen(false);
    if (item.link) navigate(item.link);
  }
  return <div ref={panel} className="relative">
    <Button variant="outline" aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} aria-expanded={open} onClick={() => setOpen(value => !value)} className="relative">
      <Bell aria-hidden="true" className="size-4" />
      {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
    </Button>
    {open && <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-semibold">Notifications</p>
        <Button variant="outline" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>Mark all read</Button></div>
      {list.isPending ? <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        : list.isError ? <p role="alert" className="p-2 text-sm text-destructive">{list.error.message}</p>
        : list.data.items.length ? <ul className="max-h-96 divide-y overflow-y-auto">{list.data.items.map(item => <li key={item.id}>
          <button type="button" onClick={() => openItem(item)} className={'w-full rounded-md p-2 text-left text-sm hover:bg-muted ' + (item.read ? 'text-muted-foreground' : 'font-medium')}>
            <span className="flex items-center gap-2">{!item.read && <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-primary" />}{item.title}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{item.body}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{timeLabel(item.createdAt)}</span>
          </button>
        </li>)}</ul> : <p className="p-2 text-sm text-muted-foreground">No notifications yet.</p>}
    </div>}
  </div>;
}
