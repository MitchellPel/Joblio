import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Check,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import type { Job, Order, OrderStatus } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import AppModal from '../components/AppModal';

function statusLabel(s: OrderStatus): string {
  if (s === 'placed') return 'Placed';
  if (s === 'done') return 'Done';
  return 'Open';
}

function orderSubtitle(order: Order): string {
  if (order.job_id) return order.client?.trim() || order.job_no || 'Linked job';
  return 'Named order';
}

function orderTitle(order: Order): string {
  if (order.job_id) return order.job_name || order.job_no || order.order_name || 'Job order';
  return order.order_name.trim() || 'Untitled order';
}

export default function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [linkMode, setLinkMode] = useState<'job' | 'name'>('job');
  const [jobQuery, setJobQuery] = useState('');
  const [jobResults, setJobResults] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [orderName, setOrderName] = useState('');
  const [itemsBody, setItemsBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setLoading(true);
        const [list, perms] = await Promise.all([
          window.tracker.listOrders(token),
          window.tracker.ordersPermissions(token),
        ]);
        if ('error' in list) setError(list.error);
        else {
          setOrders(list);
          setError('');
        }
        if (!('error' in perms)) {
          setCanCreate(!!perms.can_create);
          setCanManage(!!perms.can_manage);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load orders');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    void load();
    void window.tracker.markOrdersSeen(token).then(() => {
      window.dispatchEvent(new CustomEvent('joblio:orders-refresh'));
    });
  }, [token, load]);

  useDbSync(() => {
    void load(true);
    // Still viewing Orders — clear badge for anything that just arrived.
    if (!token) return;
    void window.tracker.markOrdersSeen(token).then(() => {
      window.dispatchEvent(new CustomEvent('joblio:orders-refresh'));
    });
  }, !!token);

  useEffect(() => {
    if (!token) return;
    const unsub = window.tracker.onOrdersChanged(() => {
      void load(true);
      window.dispatchEvent(new CustomEvent('joblio:orders-refresh'));
    });
    return unsub;
  }, [token, load]);

  useEffect(() => {
    if (!token || linkMode !== 'job' || jobQuery.trim().length < 2) {
      setJobResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const result = await window.tracker.searchJobs(token, jobQuery.trim());
      if (Array.isArray(result)) {
        setJobResults(result.filter((j) => !j.archived_at).slice(0, 8));
      }
    }, 160);
    return () => clearTimeout(t);
  }, [token, jobQuery, linkMode]);

  function resetForm() {
    setLinkMode('job');
    setSelectedJob(null);
    setJobQuery('');
    setJobResults([]);
    setOrderName('');
    setItemsBody('');
    setFormError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (linkMode === 'job' && !selectedJob) {
      setFormError('Link a job, or switch to Enter name.');
      return;
    }
    if (linkMode === 'name' && !orderName.trim()) {
      setFormError('Enter a name, or switch to Link job.');
      return;
    }
    if (!itemsBody.trim()) {
      setFormError('Add at least one item line.');
      return;
    }
    setSaving(true);
    setFormError('');
    const result = await window.tracker.createOrder(token, {
      job_id: linkMode === 'job' ? selectedJob!.id : null,
      order_name: linkMode === 'name' ? orderName.trim() : '',
      items_body: itemsBody,
    });
    setSaving(false);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    resetForm();
    void load(true);
  }

  async function setStatus(order: Order, status: OrderStatus) {
    if (!token) return;
    const result = await window.tracker.updateOrder(token, {
      id: order.id,
      version: order.version,
      status,
    });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    void load(true);
  }

  async function archive(order: Order) {
    if (!token) return;
    const result = await window.tracker.archiveOrder(token, order.id, order.version);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    void load(true);
  }

  async function saveEdit() {
    if (!token || !editOrder) return;
    if (!editItems.trim()) {
      setEditError('Add at least one item line.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    const result = await window.tracker.updateOrder(token, {
      id: editOrder.id,
      version: editOrder.version,
      items_body: editItems,
    });
    setEditSaving(false);
    if ('error' in result) {
      setEditError(result.error);
      return;
    }
    setEditOrder(null);
    void load(true);
  }

  const canEditContent = canCreate || canManage;

  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <div className="shrink-0 border-b border-ink-10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-ink-55" />
            <h1 className="text-base font-medium text-ink">Orders</h1>
            <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-ink-40">
              {orders.length}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="jt-btn-accent"
              >
                <Plus className="h-4 w-4" />
                New order
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-ink-40">
            <Package className="h-12 w-12 opacity-40" />
            <p className="text-lg text-ink-55">No open orders</p>
            <p className="text-sm">Link a board job or enter a name when creating an order.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orders.map((order) => {
              const done = order.status === 'done';
              const title = orderTitle(order);
              const subtitle = orderSubtitle(order);
              return (
                <div
                  key={order.id}
                  className={`jt-card flex min-w-0 flex-col p-3.5 ${
                    done ? 'opacity-55 grayscale' : ''
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    {order.job_id ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/jobs/${order.job_id}`)}
                        className="min-w-0 text-left"
                        title="Open job"
                      >
                        <span className="block truncate font-mono text-[11px] font-medium text-ink-40">
                          {subtitle}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-sm font-medium text-ink">
                          {title}
                        </span>
                      </button>
                    ) : (
                      <div className="min-w-0">
                        <span className="block truncate font-mono text-[11px] font-medium text-ink-40">
                          {subtitle}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-sm font-medium text-ink">
                          {title}
                        </span>
                      </div>
                    )}
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-caps ${
                        order.status === 'open'
                          ? 'bg-warn/15 text-[#8a6d10]'
                          : order.status === 'placed'
                            ? 'bg-stage-design/20 text-stage-design'
                            : 'bg-ink-6 text-ink-40'
                      }`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>

                  <pre className="mb-3 max-h-36 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface px-2 py-1.5 font-sans text-[12px] leading-snug text-ink-90">
                    {order.items_body}
                  </pre>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-ink-10 pt-2 text-[11px] text-ink-40">
                    <span className="truncate">{order.created_name || 'Someone'}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {canEditContent && (
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-ink-6 hover:text-ink"
                          title="Edit items"
                          onClick={() => {
                            setEditOrder(order);
                            setEditItems(order.items_body);
                            setEditError('');
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canManage && order.status === 'open' && (
                        <button
                          type="button"
                          className="jt-btn-ghost !px-2 !py-1 !text-[11px]"
                          onClick={() => setStatus(order, 'placed')}
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Place
                        </button>
                      )}
                      {canManage && order.status !== 'done' && (
                        <button
                          type="button"
                          className="jt-btn-ghost !px-2 !py-1 !text-[11px]"
                          onClick={() => setStatus(order, 'done')}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Done
                        </button>
                      )}
                      {canManage && order.status === 'done' && (
                        <button
                          type="button"
                          className="jt-btn-ghost !px-2 !py-1 !text-[11px]"
                          onClick={() => setStatus(order, 'open')}
                          title="Undo done"
                        >
                          Reopen
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="jt-btn-ghost !px-2 !py-1 !text-[11px]"
                          onClick={() => archive(order)}
                          title="Archive"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AppModal
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title="New order"
        maxWidth="md"
        footer={
          <>
            <button type="button" className="jt-btn-ghost" disabled={saving} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" form="order-create-form" className="jt-btn-accent" disabled={saving}>
              {saving ? 'Saving…' : 'Add order'}
            </button>
          </>
        }
      >
        <form id="order-create-form" onSubmit={handleCreate} className="space-y-3">
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div>
            <label className="jt-label">Order for</label>
            <div className="mb-2 flex rounded-lg bg-surface p-0.5">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  linkMode === 'job' ? 'bg-card text-ink shadow-sm' : 'text-ink-40 hover:text-ink'
                }`}
                onClick={() => {
                  setLinkMode('job');
                  setOrderName('');
                  setFormError('');
                }}
              >
                Link job
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  linkMode === 'name' ? 'bg-card text-ink shadow-sm' : 'text-ink-40 hover:text-ink'
                }`}
                onClick={() => {
                  setLinkMode('name');
                  setSelectedJob(null);
                  setJobQuery('');
                  setJobResults([]);
                  setFormError('');
                }}
              >
                Enter name
              </button>
            </div>
            {linkMode === 'job' ? (
              selectedJob ? (
                <div className="flex items-center gap-2 rounded-lg border border-ink-10 bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-ink-40">
                      {selectedJob.client?.trim() || selectedJob.job_no}
                    </p>
                    <p className="truncate text-sm text-ink">{selectedJob.job_name}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-ink-40 hover:bg-ink-6"
                    onClick={() => setSelectedJob(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
                  <input
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    className="jt-input !pl-9"
                    placeholder="Search job number or name…"
                    spellCheck={false}
                  />
                  {jobResults.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-ink-10 bg-canvas shadow-raised">
                      {jobResults.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left hover:bg-brand/10"
                          onClick={() => {
                            setSelectedJob(j);
                            setJobQuery('');
                            setJobResults([]);
                          }}
                        >
                          <span className="font-mono text-[11px] text-ink-40">
                            {j.client?.trim() || j.job_no}
                          </span>
                          <span className="truncate text-sm text-ink">{j.job_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <input
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                className="jt-input"
                placeholder="e.g. Shop stock / Van materials…"
                autoFocus
              />
            )}
          </div>
          <div>
            <label className="jt-label">Items to order</label>
            <textarea
              value={itemsBody}
              onChange={(e) => setItemsBody(e.target.value)}
              rows={6}
              className="jt-input resize-y"
              placeholder={'One item per line…\n2x acrylic sheets\n1x vinyl roll'}
            />
          </div>
        </form>
      </AppModal>

      <AppModal
        open={!!editOrder}
        onClose={() => !editSaving && setEditOrder(null)}
        title="Edit order items"
        maxWidth="md"
        footer={
          <>
            <button type="button" className="jt-btn-ghost" disabled={editSaving} onClick={() => setEditOrder(null)}>
              Cancel
            </button>
            <button type="button" className="jt-btn-accent" disabled={editSaving} onClick={saveEdit}>
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {editError && <p className="mb-2 text-sm text-danger">{editError}</p>}
        <textarea
          value={editItems}
          onChange={(e) => setEditItems(e.target.value)}
          rows={8}
          className="jt-input resize-y"
        />
      </AppModal>
    </div>
  );
}
