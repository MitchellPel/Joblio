import { useState, useEffect, useCallback } from 'react';
import type { Job, Order } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import { mergeList } from '../utils/mergeList';
import { Search, Archive, RotateCcw, X } from 'lucide-react';
import JobDetail from './JobDetail';

type ArchiveTab = 'jobs' | 'orders';

function archivedOrderLabel(order: Order): string {
  if (order.job_id) {
    return (
      [order.job_no, order.job_name].filter((s) => s?.trim()).join(' — ') ||
      order.order_name.trim() ||
      'Job order'
    );
  }
  return order.order_name.trim() || 'Untitled order';
}

export default function Archived() {
  const { token, user, isAdmin } = useAuth();
  const [tab, setTab] = useState<ArchiveTab>('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadArchived = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setLoading(true);
        const [jobsRes, ordersRes, perms] = await Promise.all([
          window.tracker.listArchivedJobs(token),
          window.tracker.listArchivedOrders(token),
          window.tracker.ordersPermissions(token),
        ]);
        if (!('error' in jobsRes)) {
          setJobs((prev) => mergeList(prev, jobsRes as Job[]));
        }
        if (!('error' in ordersRes)) {
          setOrders(ordersRes);
        }
        if (!('error' in perms)) {
          setCanManageOrders(!!perms.can_manage || isAdmin);
        }
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, isAdmin]
  );

  useEffect(() => {
    if (token) loadArchived();
  }, [token, loadArchived]);

  useDbSync(() => loadArchived(true), !!token);

  const filteredJobs = searchQuery.trim()
    ? jobs.filter((j) => {
        const q = searchQuery.toLowerCase().trim();
        return (
          j.client.toLowerCase().includes(q) ||
          j.job_no.toLowerCase().includes(q) ||
          j.job_name.toLowerCase().includes(q)
        );
      })
    : jobs;

  const filteredOrders = searchQuery.trim()
    ? orders.filter((o) => {
        const q = searchQuery.toLowerCase().trim();
        return (
          (o.client || '').toLowerCase().includes(q) ||
          (o.job_no || '').toLowerCase().includes(q) ||
          (o.job_name || '').toLowerCase().includes(q) ||
          (o.order_name || '').toLowerCase().includes(q) ||
          (o.items_body || '').toLowerCase().includes(q)
        );
      })
    : orders;

  async function restoreOrder(order: Order) {
    if (!token) return;
    setActionError('');
    const result = await window.tracker.unarchiveOrder(token, order.id, order.version);
    if ('error' in result) {
      setActionError(result.error);
      return;
    }
    void loadArchived(true);
    setSelectedOrder(null);
  }

  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <div className="shrink-0 border-b border-ink-10 bg-canvas px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-ink-55" />
            <h1 className="text-base font-medium text-ink">Archived</h1>
          </div>
          <div className="flex rounded-lg bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setTab('jobs')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium sm:text-sm ${
                tab === 'jobs' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
              }`}
            >
              Jobs ({jobs.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('orders')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium sm:text-sm ${
                tab === 'orders' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
              }`}
            >
              Orders ({orders.length})
            </button>
          </div>
          <div className="relative ml-auto max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tab === 'jobs' ? 'Search job number…' : 'Search orders…'}
              className="jt-input !pl-9"
              spellCheck={false}
            />
          </div>
        </div>
        {actionError && <p className="mt-2 text-sm text-danger">{actionError}</p>}
      </div>

      <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
          </div>
        ) : tab === 'jobs' ? (
          filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-ink-40">
              <Archive className="h-12 w-12 opacity-40" />
              <p className="text-lg text-ink-55">
                {searchQuery ? 'No archived jobs match your search' : 'No archived jobs yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {filteredJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJob(job)}
                  title={[job.job_no, job.job_name].filter(Boolean).join(' — ') || job.job_name}
                  className="jt-card min-w-0 cursor-pointer px-2 py-2.5 text-left transition-shadow hover:border-brand/30 hover:shadow-card-hover"
                >
                  <span className="block truncate font-mono text-[11px] font-medium text-ink">
                    {[job.job_no, job.job_name].filter((s) => s?.trim()).join(' — ') || '—'}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-ink-40">
            <Archive className="h-12 w-12 opacity-40" />
            <p className="text-lg text-ink-55">
              {searchQuery ? 'No archived orders match your search' : 'No archived orders yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {filteredOrders.map((order) => {
              const label = archivedOrderLabel(order);
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  title={label}
                  className="jt-card min-w-0 cursor-pointer px-2 py-2.5 text-left transition-shadow hover:border-brand/30 hover:shadow-card-hover"
                >
                  <span className="block truncate font-mono text-[11px] font-medium text-ink">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedOrder && (
        <div
          className="jt-anim-overlay absolute inset-0 z-[100] flex min-h-0 items-stretch justify-center bg-ink/40 p-2 sm:p-3 md:p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="jt-anim-panel flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-canvas shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ink-10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-medium text-ink">
                  {archivedOrderLabel(selectedOrder)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-40">
                  {selectedOrder.created_name || 'Someone'}
                  {selectedOrder.client?.trim() ? ` · ${selectedOrder.client.trim()}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="jt-btn-ghost shrink-0 !px-2 !py-1.5"
                onClick={() => setSelectedOrder(null)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-snug text-ink">
                {selectedOrder.items_body || '(No items listed)'}
              </pre>
            </div>
            {(canManageOrders || user?.role === 'admin') && (
              <div className="shrink-0 border-t border-ink-10 px-4 py-3">
                <button
                  type="button"
                  className="jt-btn-ghost !py-1.5"
                  onClick={() => restoreOrder(selectedOrder)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore to Orders
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedJob && (
        <div
          className="jt-anim-overlay absolute inset-0 z-[100] flex min-h-0 items-stretch justify-center bg-ink/40 p-2 sm:p-3 md:p-4"
          onClick={() => setSelectedJob(null)}
        >
          <div
            className="jt-anim-panel jt-sheet flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-canvas shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <JobDetail
                jobId={selectedJob.id}
                initialJob={selectedJob}
                onClose={() => setSelectedJob(null)}
                onUpdated={(updated) => {
                  if (updated.archived_at) {
                    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
                    setSelectedJob(updated);
                  } else {
                    setJobs((prev) => prev.filter((j) => j.id !== updated.id));
                    setSelectedJob(null);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
