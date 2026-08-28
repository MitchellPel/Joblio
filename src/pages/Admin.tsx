import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, Role } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import { UserPlus, Pencil, Trash2, Check, Archive, CalendarDays, Truck, Lock, ShoppingCart, Sparkles, StickyNote, Scissors } from 'lucide-react';
import AppModal from '../components/AppModal';
import BoardColorPicker from '../components/BoardColorPicker';
import { boardColorText, sanitizeBoardColor } from '../utils/boardColor';

export default function Admin() {
  const { token, isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<Role>('staff');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('staff');
  const [editActive, setEditActive] = useState(true);
  const [editCanArchive, setEditCanArchive] = useState(false);
  const [editCanMoveAny, setEditCanMoveAny] = useState(false);
  const [editCanEditRigging, setEditCanEditRigging] = useState(false);
  const [editCanEditVehicles, setEditCanEditVehicles] = useState(false);
  const [editCanCreateOrders, setEditCanCreateOrders] = useState(false);
  const [editCanManageOrders, setEditCanManageOrders] = useState(false);
  const [editCanUseAi, setEditCanUseAi] = useState(false);
  const [editCanDeleteNotes, setEditCanDeleteNotes] = useState(false);
  const [editCanManageQuoteSizes, setEditCanManageQuoteSizes] = useState(false);
  const [editBoardColor, setEditBoardColor] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      const result = await window.tracker.listUsers(token);
      if ('error' in result) {
        setError(result.error);
      } else {
        setUsers(result as unknown as User[]);
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadUsers();
  }, [token, loadUsers]);

  useDbSync(() => loadUsers(true), !!token);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!newUsername.trim() || !newPassword.trim()) {
      setFormError('Username and password are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    const result = await window.tracker.createUser(token, {
      username: newUsername.trim(),
      password: newPassword.trim(),
      full_name: newFullName.trim() || newUsername.trim(),
      role: newRole,
    });
    if ('error' in result) {
      setFormError(result.error);
      setSaving(false);
    } else {
      setShowForm(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewRole('staff');
      setFormError('');
      loadUsers();
      setSaving(false);
    }
  }

  function openEdit(user: User) {
    setEditUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditActive(!!user.active);
    setEditCanArchive(!!user.can_archive);
    setEditCanMoveAny(!!user.can_move_any);
    setEditCanEditRigging(!!user.can_edit_rigging);
    setEditCanEditVehicles(!!user.can_edit_vehicle_bookings);
    setEditCanCreateOrders(!!user.can_create_orders);
    setEditCanManageOrders(!!user.can_manage_orders);
    setEditCanUseAi(!!user.can_use_ai);
    setEditCanDeleteNotes(!!user.can_delete_notes);
    setEditCanManageQuoteSizes(!!user.can_manage_quote_sizes);
    setEditBoardColor(sanitizeBoardColor(user.board_color));
    setEditPassword('');
    setEditError('');
  }

  async function handleEditSave() {
    if (!token || !editUser) return;
    if (!editName.trim()) {
      setEditError('Name is required.');
      return;
    }
    setEditSaving(true);
    setEditError('');

    const data: any = {
      id: editUser.id,
      full_name: editName.trim(),
      board_color: editBoardColor,
    };
    if (editRole !== editUser.role) data.role = editRole;
    if (editActive !== !!editUser.active) data.active = editActive;
    if (editCanArchive !== !!editUser.can_archive) data.can_archive = editCanArchive;
    if (editCanMoveAny !== !!editUser.can_move_any) data.can_move_any = editCanMoveAny;
    if (editCanEditRigging !== !!editUser.can_edit_rigging) data.can_edit_rigging = editCanEditRigging;
    if (editCanEditVehicles !== !!editUser.can_edit_vehicle_bookings) {
      data.can_edit_vehicle_bookings = editCanEditVehicles;
    }
    if (editCanCreateOrders !== !!editUser.can_create_orders) {
      data.can_create_orders = editCanCreateOrders;
    }
    if (editCanManageOrders !== !!editUser.can_manage_orders) {
      data.can_manage_orders = editCanManageOrders;
    }
    if (editCanUseAi !== !!editUser.can_use_ai) {
      data.can_use_ai = editCanUseAi;
    }
    if (editCanDeleteNotes !== !!editUser.can_delete_notes) {
      data.can_delete_notes = editCanDeleteNotes;
    }
    if (editCanManageQuoteSizes !== !!editUser.can_manage_quote_sizes) {
      data.can_manage_quote_sizes = editCanManageQuoteSizes;
    }
    if (editPassword.trim()) data.password = editPassword.trim();

    const result = await window.tracker.updateUser(token, data);
    if ('error' in result) {
      setEditError(result.error);
      setEditSaving(false);
    } else {
      setEditUser(null);
      loadUsers();
      setEditSaving(false);
    }
  }

  async function handleDelete(user: User) {
    if (!token) return;
    setDeleting(true);
    const result = await window.tracker.deleteUser(token, user.id);
    if ('error' in result) {
      setError(result.error);
    }
    setDeleteTarget(null);
    setDeleting(false);
    loadUsers();
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <p className="text-ink-55">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="jt-page flex flex-col overflow-hidden p-6">
      <div className="jt-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="jt-eyebrow mb-1">Team</p>
            <h1 className="jt-section-title">User Management</h1>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="jt-btn-accent">
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreateUser}
            className="jt-card mb-6 space-y-3 bg-surface-soft p-5"
          >
            <h3 className="text-sm font-medium text-ink">New User</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="jt-label !text-xs">Username *</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="jt-input"
                  required
                />
              </div>
              <div>
                <label className="jt-label !text-xs">Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="jt-input"
                  required
                />
              </div>
              <div>
                <label className="jt-label !text-xs">Full Name</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="jt-input"
                />
              </div>
              <div>
                <label className="jt-label !text-xs">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="jt-input bg-input/80"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-xs text-danger">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="jt-btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="jt-btn-accent disabled:opacity-40">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className={`jt-card flex items-center justify-between p-4 transition-colors ${
                  u.active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const hex = sanitizeBoardColor(u.board_color);
                    return (
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                          hex
                            ? ''
                            : u.role === 'admin'
                              ? 'bg-stage-collection/20 text-stage-collection'
                              : 'bg-surface text-ink'
                        }`}
                        style={hex ? { backgroundColor: hex, color: boardColorText(hex) } : undefined}
                      >
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                    );
                  })()}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{u.full_name}</span>
                      {u.role === 'admin' && (
                        <span className="rounded-pill bg-stage-collection/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-collection">
                          Admin
                        </span>
                      )}
                      {!!u.can_archive && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-production/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-production">
                          Can Archive & Restore
                        </span>
                      )}
                      {!!u.can_move_any && u.role !== 'admin' && (
                        <span className="rounded-pill bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                          Can Move
                        </span>
                      )}
                      {!!u.can_edit_rigging && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-install/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-install">
                          Rigging
                        </span>
                      )}
                      {!!u.can_edit_vehicle_bookings && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-design/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-design">
                          Vehicles
                        </span>
                      )}
                      {!!u.can_create_orders && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-production/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-production">
                          Create Orders
                        </span>
                      )}
                      {!!u.can_manage_orders && u.role !== 'admin' && (
                        <span className="rounded-pill bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                          Manage Orders
                        </span>
                      )}
                      {!!u.can_use_ai && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-collection/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-collection">
                          Joblio AI
                        </span>
                      )}
                      {!!u.can_delete_notes && u.role !== 'admin' && (
                        <span className="rounded-pill bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                          Delete notes
                        </span>
                      )}
                      {!!u.can_manage_quote_sizes && u.role !== 'admin' && (
                        <span className="rounded-pill bg-stage-production/15 px-1.5 py-0.5 text-[10px] font-medium text-stage-production">
                          Cut / Print List
                        </span>
                      )}
                      {!u.active && (
                        <span className="rounded-pill bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                          Disabled
                        </span>
                      )}
                      {currentUser?.id === u.id && (
                        <span className="rounded-pill bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-ink-40">@{u.username}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(u)}
                    className="rounded-lg p-2 text-ink-40 transition-colors hover:bg-ink-6 hover:text-ink"
                    title="Edit user"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="rounded-lg p-2 text-ink-40 transition-colors hover:bg-danger/10 hover:text-danger"
                    title="Delete user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-40">No users yet.</p>
            )}
          </div>
        )}

        {deleteTarget && (
          <AppModal
            open={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            title="Delete user"
            subtitle={`@${deleteTarget.username}`}
            footer={
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteTarget(null)} className="jt-btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteTarget)}
                  disabled={deleting}
                  className="jt-btn-danger disabled:opacity-40"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            }
          >
            <p className="text-sm text-ink-55">
              Delete <strong className="text-ink">{deleteTarget.full_name}</strong>? This cannot be
              undone.
            </p>
          </AppModal>
        )}

        <AppModal
          open={!!editUser}
          onClose={() => setEditUser(null)}
          title="Edit user"
          subtitle={editUser ? `@${editUser.username}` : undefined}
          maxWidth="lg"
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {editError ? (
                <p className="min-w-0 flex-1 text-sm text-danger">{editError}</p>
              ) : (
                <span className="hidden sm:block" />
              )}
              <div className="flex shrink-0 justify-end gap-2">
                <button type="button" onClick={() => setEditUser(null)} className="jt-btn-ghost">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="jt-btn-accent disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          }
        >
          {editUser && (
            <div className="space-y-5">
              <section className="space-y-3">
                <h3 className="jt-eyebrow">Profile</h3>
                <div>
                  <label className="jt-label">Full name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="jt-input"
                  />
                </div>
                <div>
                  <label className="jt-label">Username</label>
                  <input
                    type="text"
                    value={editUser.username}
                    disabled
                    className="jt-input cursor-not-allowed bg-surface-soft text-ink-55"
                  />
                  <p className="mt-1 text-xs text-ink-40">Username cannot be changed.</p>
                </div>
                <div>
                  <label className="jt-label">Board colour</label>
                  <BoardColorPicker
                    value={editBoardColor}
                    onChange={setEditBoardColor}
                    previewName={editName.trim() || editUser.full_name}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="jt-label">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as Role)}
                      className="jt-input bg-input/80"
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="jt-label">Status</label>
                    <select
                      value={editActive ? 'active' : 'disabled'}
                      onChange={(e) => setEditActive(e.target.value === 'active')}
                      className="jt-input bg-input/80"
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>
              </section>

              <div className="border-t border-ink-10" />

              <section className="space-y-3">
                <div>
                  <h3 className="jt-eyebrow">Permissions</h3>
                  <p className="mt-0.5 text-xs text-ink-40">Admins always have full access</p>
                </div>

                <PermissionToggle
                  icon={<Archive className="h-4 w-4 text-stage-production" />}
                  label="Archive & restore"
                  hint="Archive completed jobs and restore from Archive"
                  on={editCanArchive}
                  onToggle={() => setEditCanArchive(!editCanArchive)}
                  onColor="bg-stage-production"
                />
                <PermissionToggle
                  icon={<Lock className="h-4 w-4 text-brand" />}
                  label="Move any job"
                  hint="Move jobs assigned to other people"
                  on={editCanMoveAny}
                  onToggle={() => setEditCanMoveAny(!editCanMoveAny)}
                  onColor="bg-brand"
                />
                <PermissionToggle
                  icon={<CalendarDays className="h-4 w-4 text-stage-install" />}
                  label="Edit rigging schedule"
                  hint="Add, move, and remove installs"
                  on={editCanEditRigging}
                  onToggle={() => setEditCanEditRigging(!editCanEditRigging)}
                  onColor="bg-stage-install"
                />
                <PermissionToggle
                  icon={<Truck className="h-4 w-4 text-stage-design" />}
                  label="Edit vehicle bookings"
                  hint="Book jobs on the vehicle calendar"
                  on={editCanEditVehicles}
                  onToggle={() => setEditCanEditVehicles(!editCanEditVehicles)}
                  onColor="bg-stage-design"
                />
                <PermissionToggle
                  icon={<ShoppingCart className="h-4 w-4 text-stage-production" />}
                  label="Create orders"
                  hint="Add new order cards linked to jobs"
                  on={editCanCreateOrders}
                  onToggle={() => setEditCanCreateOrders(!editCanCreateOrders)}
                  onColor="bg-stage-production"
                />
                <PermissionToggle
                  icon={<ShoppingCart className="h-4 w-4 text-brand" />}
                  label="Manage orders"
                  hint="Place, mark done, archive, and restore orders"
                  on={editCanManageOrders}
                  onToggle={() => setEditCanManageOrders(!editCanManageOrders)}
                  onColor="bg-brand"
                />
                <PermissionToggle
                  icon={<Sparkles className="h-4 w-4 text-stage-collection" />}
                  label="Use Joblio AI"
                  hint="Chat, supplier price lists, and saved notes"
                  on={editCanUseAi}
                  onToggle={() => setEditCanUseAi(!editCanUseAi)}
                  onColor="bg-stage-collection"
                />
                <PermissionToggle
                  icon={<StickyNote className="h-4 w-4 text-danger" />}
                  label="Delete notes"
                  hint="Remove any job note"
                  on={editCanDeleteNotes}
                  onToggle={() => setEditCanDeleteNotes(!editCanDeleteNotes)}
                  onColor="bg-danger"
                />
                <PermissionToggle
                  icon={<Scissors className="h-4 w-4 text-stage-production" />}
                  label="Cut / Print List"
                  hint="Post, edit, complete, and delete requests. Everyone can still reply and tick Done."
                  on={editCanManageQuoteSizes}
                  onToggle={() => setEditCanManageQuoteSizes(!editCanManageQuoteSizes)}
                  onColor="bg-stage-production"
                />
              </section>

              <div className="border-t border-ink-10" />

              <section className="space-y-3">
                <h3 className="jt-eyebrow">Security</h3>
                <div>
                  <label className="jt-label">New password</label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="jt-input"
                    autoComplete="new-password"
                  />
                </div>
              </section>
            </div>
          )}
        </AppModal>
      </div>
    </div>
  );
}

function PermissionToggle({
  icon,
  label,
  hint,
  on,
  onToggle,
  onColor,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  onColor: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-ink-10 bg-card px-3 py-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-55">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? onColor : 'bg-surface-deep'
        }`}
        aria-pressed={on}
        aria-label={label}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
