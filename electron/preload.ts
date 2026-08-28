import { contextBridge, ipcRenderer } from 'electron';

// ---- Shared types (mirrored in src/api/client.ts) ----------------------------

export type JobKind = 'vehicle' | 'sign' | 'vinyl';

export type DesignerStatus =
  | 'urgent'
  | 'proofing'
  | 'on_hold'
  | 'waiting_client'
  | 'approved'
  | 'ordered'
  | 'printed'
  | 'cut'
  | 'welded'
  | 'application';

export type Role = 'admin' | 'staff';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
  can_archive: boolean;
  can_move_any: boolean;
  can_edit_rigging: boolean;
  can_edit_vehicle_bookings: boolean;
  can_create_orders: boolean;
  can_manage_orders: boolean;
  can_use_ai: boolean;
  can_delete_notes: boolean;
  can_manage_quote_sizes: boolean;
  /** Hex #RRGGBB around this name on the board, or null for the default pill. */
  board_color: string | null;
  created_at: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export type StageKey =
  | 'new'
  | 'design'
  | 'production'
  | 'install'
  | 'collection'
  | 'completed';

export interface Job {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  stage: StageKey;
  assigned_to: number | null;
  assigned_name: string | null;
  assigned_color: string | null;
  due_date: string | null;
  scope_notes: string | null;
  pinned_brief: string | null;
  job_kind: JobKind | null;
  designer_status: DesignerStatus[];
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
  /** Truncated plain-text preview of the newest job note, or null if none. */
  last_note_preview: string | null;
}

export interface NewJobInput {
  job_no: string;
  job_name: string;
  client?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  due_date?: string | null;
  scope_notes?: string | null;
  assigned_to?: number | null;
  pinned_brief?: string | null;
  job_kind?: JobKind | null;
  designer_status?: DesignerStatus[];
}

export interface UpdateJobInput extends Partial<NewJobInput> {
  id: number;
  version: number;
}

export interface StageHistoryEntry {
  id: number;
  job_id: number;
  from_stage: StageKey | null;
  to_stage: StageKey;
  changed_by: number;
  changed_name: string;
  changed_at: string;
  note: string | null;
}

export interface JobNote {
  id: number;
  job_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

export interface JobProof {
  id: number;
  job_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: number;
  uploaded_name: string | null;
  created_at: string;
}

export interface Mention {
  id: number;
  note_id: number;
  job_id: number;
  mentioned_user_id: number;
  created_by: number;
  created_at: string;
  seen: number;
  job_no: string;
  job_name: string;
  author_name: string;
  note_body: string;
}

export interface RiggingInstall {
  id: number;
  job_id: number;
  scheduled_date: string;
  duration_days?: 1 | 3;
  note: string | null;
  created_by: number;
  created_at: string;
  job_no: string;
  job_name: string;
  client: string;
}

export interface RiggingJobOption {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  has_rigging: boolean;
}

export interface RiggingMonth {
  year_month: string;
  status: 'active' | 'archived';
  archived_at: string | null;
}

export interface VehicleBooking {
  id: number;
  job_id: number;
  scheduled_date: string;
  note: string | null;
  created_by: number;
  created_at: string;
  created_name: string | null;
  job_no: string;
  job_name: string;
  client: string;
}

export interface VehicleBookingMonth {
  year_month: string;
  status: 'active' | 'archived';
  archived_at: string | null;
}

export interface ActivityItem {
  id: string;
  kind: 'stage' | 'note' | 'mention' | 'created' | 'archived';
  job_id: number;
  job_no: string;
  job_name: string;
  actor_name: string;
  summary: string;
  created_at: string;
}

export interface ChecklistTemplate {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
  item_count: number;
}

export interface JobChecklistItem {
  id: number;
  job_id: number;
  body: string;
  done: number;
  sort_order: number;
  created_at: string;
}

export type OrderStatus = 'open' | 'placed' | 'done';

export interface Order {
  id: number;
  job_id: number | null;
  job_no: string;
  job_name: string;
  client: string;
  order_name: string;
  items_body: string;
  status: OrderStatus;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

export type QuoteSizeStatus = 'open' | 'done';

export interface QuoteSize {
  id: number;
  job_name: string;
  scope: string;
  status: QuoteSizeStatus;
  has_image: boolean;
  file_name: string;
  mime_type: string;
  size: number;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

export interface QuoteSizeNote {
  id: number;
  quote_size_id: number;
  author_id: number;
  author_name: string;
  body: string;
  has_image: boolean;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface QuoteSizeMention {
  id: number;
  note_id: number;
  quote_size_id: number;
  mentioned_user_id: number;
  created_by: number;
  created_at: string;
  seen: number;
  job_name: string;
  author_name: string;
  note_body: string;
}

export type FeedbackKind = 'bug' | 'change';
export type FeedbackStatus = 'open' | 'done';

export interface AppFeedback {
  id: number;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  done_by: number | null;
  done_name: string | null;
  done_at: string | null;
  version: number;
}

// ---- Update types -----------------------------------------------------------

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

export interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

// ---- API exposed to the renderer ---------------------------------------------

const api = {
  // Auth
  getBackendMode: () =>
    ipcRenderer.invoke('auth:backendMode') as Promise<{
      backend: 'sqlite' | 'selfhost';
      selfHost: boolean;
      cloudTest?: boolean;
    }>,
  login: (username: string, password: string) =>
    ipcRenderer.invoke('auth:login', username, password) as Promise<AuthSession | { error: string }>,
  logout: (token: string) =>
    ipcRenderer.invoke('auth:logout', token) as Promise<void>,
  getCurrentSession: (token: string) =>
    ipcRenderer.invoke('auth:currentSession', token) as Promise<AuthSession | null>,

  // Users
  listUsers: (token: string) =>
    ipcRenderer.invoke('users:list', token) as Promise<User[] | { error: string }>,
  createUser: (token: string, data: { username: string; password: string; full_name: string; role: Role }) =>
    ipcRenderer.invoke('users:create', token, data) as Promise<User | { error: string }>,
  updateUser: (token: string, data: { id: number; full_name?: string; role?: Role; active?: boolean; can_archive?: boolean; can_move_any?: boolean; can_edit_rigging?: boolean; can_edit_vehicle_bookings?: boolean; can_create_orders?: boolean; can_manage_orders?: boolean; can_use_ai?: boolean; can_delete_notes?: boolean; can_manage_quote_sizes?: boolean; board_color?: string | null; password?: string | null }) =>
    ipcRenderer.invoke('users:update', token, data) as Promise<User | { error: string }>,
  setBoardColor: (token: string, color: string | null) =>
    ipcRenderer.invoke('users:setBoardColor', token, color) as Promise<User | { error: string }>,
  listStaff: (token: string) =>
    ipcRenderer.invoke('users:staff', token) as Promise<{ id: number; full_name: string }[] | { error: string }>,
  deleteUser: (token: string, userId: number) =>
    ipcRenderer.invoke('users:delete', token, userId) as Promise<{ ok: boolean } | { error: string }>,

  // Jobs
  listJobs: (token: string) =>
    ipcRenderer.invoke('jobs:list', token) as Promise<Job[] | { error: string }>,
  searchJobs: (token: string, query: string) =>
    ipcRenderer.invoke('jobs:search', token, query) as Promise<Job[] | { error: string }>,
  listJobsWithDueDates: (token: string) =>
    ipcRenderer.invoke('jobs:listDueDates', token) as Promise<Job[] | { error: string }>,
  listActivity: (token: string) =>
    ipcRenderer.invoke('activity:list', token) as Promise<ActivityItem[] | { error: string }>,
  getJob: (token: string, id: number) =>
    ipcRenderer.invoke('jobs:get', token, id) as Promise<Job | null | { error: string }>,
  createJob: (token: string, data: NewJobInput) =>
    ipcRenderer.invoke('jobs:create', token, data) as Promise<Job | { error: string }>,
  updateJob: (token: string, data: UpdateJobInput) =>
    ipcRenderer.invoke('jobs:update', token, data) as Promise<Job | { error: string }>,
  moveStage: (token: string, jobId: number, toStage: StageKey, version: number, note?: string | null) =>
    ipcRenderer.invoke('jobs:moveStage', token, jobId, toStage, version, note) as Promise<Job | { error: string }>,
  deleteJob: (token: string, jobId: number, version: number) =>
    ipcRenderer.invoke('jobs:delete', token, jobId, version) as Promise<{ ok: boolean } | { error: string }>,
  archiveJob: (token: string, jobId: number, version: number) =>
    ipcRenderer.invoke('jobs:archive', token, jobId, version) as Promise<Job | { error: string }>,
  unarchiveJob: (token: string, jobId: number, version: number) =>
    ipcRenderer.invoke('jobs:unarchive', token, jobId, version) as Promise<Job | { error: string }>,
  listArchivedJobs: (token: string) =>
    ipcRenderer.invoke('jobs:listArchived', token) as Promise<Job[] | { error: string }>,

  // Checklists
  listChecklistTemplates: (token: string) =>
    ipcRenderer.invoke('checklist:listTemplates', token) as Promise<ChecklistTemplate[] | { error: string }>,
  createChecklistTemplate: (token: string, data: { name: string; items: string[] }) =>
    ipcRenderer.invoke('checklist:createTemplate', token, data) as Promise<ChecklistTemplate | { error: string }>,
  deleteChecklistTemplate: (token: string, id: number) =>
    ipcRenderer.invoke('checklist:deleteTemplate', token, id) as Promise<{ ok: boolean } | { error: string }>,
  listJobChecklist: (token: string, jobId: number) =>
    ipcRenderer.invoke('checklist:listForJob', token, jobId) as Promise<JobChecklistItem[] | { error: string }>,
  addChecklistItem: (token: string, jobId: number, body: string) =>
    ipcRenderer.invoke('checklist:addItem', token, jobId, body) as Promise<JobChecklistItem | { error: string }>,
  toggleChecklistItem: (token: string, id: number, done: boolean) =>
    ipcRenderer.invoke('checklist:toggleItem', token, id, done) as Promise<JobChecklistItem | { error: string }>,
  deleteChecklistItem: (token: string, id: number) =>
    ipcRenderer.invoke('checklist:deleteItem', token, id) as Promise<{ ok: boolean } | { error: string }>,
  applyChecklistTemplate: (token: string, jobId: number, templateId: number) =>
    ipcRenderer.invoke('checklist:applyTemplate', token, jobId, templateId) as Promise<JobChecklistItem[] | { error: string }>,

  // Job proofs (sent-to-client images)
  listProofs: (token: string, jobId: number) =>
    ipcRenderer.invoke('jobs:listProofs', token, jobId) as Promise<JobProof[] | { error: string }>,
  getProof: (token: string, proofId: number) =>
    ipcRenderer.invoke('jobs:getProof', token, proofId) as Promise<
      (JobProof & { dataBase64: string }) | { error: string }
    >,
  getProofThumb: (token: string, proofId: number) =>
    ipcRenderer.invoke('jobs:getProofThumb', token, proofId) as Promise<
      (JobProof & { dataBase64: string }) | { error: string }
    >,
  addProof: (
    token: string,
    jobId: number,
    data: { file_name: string; mime_type: string; bytesBase64: string; size: number }
  ) =>
    ipcRenderer.invoke('jobs:addProof', token, jobId, data) as Promise<JobProof | { error: string }>,
  deleteProof: (token: string, proofId: number) =>
    ipcRenderer.invoke('jobs:deleteProof', token, proofId) as Promise<{ ok: boolean } | { error: string }>,

  // Job detail / audit
  getStageHistory: (token: string, jobId: number) =>
    ipcRenderer.invoke('jobs:stageHistory', token, jobId) as Promise<StageHistoryEntry[] | { error: string }>,
  addNote: (token: string, jobId: number, body: string, mentions?: number[]) =>
    ipcRenderer.invoke('jobs:addNote', token, jobId, body, mentions) as Promise<JobNote | { error: string }>,
  updateNote: (token: string, noteId: number, body: string) =>
    ipcRenderer.invoke('jobs:updateNote', token, noteId, body) as Promise<JobNote | { error: string }>,
  deleteNote: (token: string, noteId: number) =>
    ipcRenderer.invoke('jobs:deleteNote', token, noteId) as Promise<{ ok: boolean } | { error: string }>,
  listNotes: (token: string, jobId: number) =>
    ipcRenderer.invoke('jobs:listNotes', token, jobId) as Promise<JobNote[] | { error: string }>,

  // Mentions (@name in job notes)
  listUnseenMentions: (token: string) =>
    ipcRenderer.invoke('mentions:listUnseen', token) as Promise<Mention[] | { error: string }>,
  listUnseenMentionJobIds: (token: string) =>
    ipcRenderer.invoke('mentions:listUnseenJobIds', token) as Promise<number[] | { error: string }>,
  listUnseenMentionsForJob: (token: string, jobId: number) =>
    ipcRenderer.invoke('mentions:listUnseenForJob', token, jobId) as Promise<Mention[] | { error: string }>,
  markMentionsSeen: (token: string, jobId: number) =>
    ipcRenderer.invoke('mentions:markSeen', token, jobId) as Promise<{ ok: boolean; marked: number } | { error: string }>,
  onMentionsChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('mentions:new', handler);
    return () => {
      ipcRenderer.removeListener('mentions:new', handler);
    };
  },
  onMentionOpen: (callback: (payload: { job_id: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { job_id: number }) => callback(payload);
    ipcRenderer.on('mentions:open', handler);
    return () => {
      ipcRenderer.removeListener('mentions:open', handler);
    };
  },

  // Settings (DB path)
  getDbPath: () =>
    ipcRenderer.invoke('settings:getDbPath') as Promise<{ configured: boolean; path: string | null }>,
  setDbPath: (path: string) =>
    ipcRenderer.invoke('settings:setDbPath', path) as Promise<{ ok: boolean } | { error: string }>,
  pickFolder: () =>
    ipcRenderer.invoke('settings:pickFolder') as Promise<string | null>,
  getShareRoot: () =>
    ipcRenderer.invoke('settings:getShareRoot') as Promise<{ path: string | null }>,
  pickShareRoot: () =>
    ipcRenderer.invoke('settings:pickShareRoot') as Promise<
      { ok: true; path: string } | { cancelled: true } | { error: string }
    >,
  setShareRoot: (path: string) =>
    ipcRenderer.invoke('settings:setShareRoot', path) as Promise<
      { ok: true; path: string } | { error: string }
    >,
  getGraphicsMode: () =>
    ipcRenderer.invoke('settings:getGraphicsMode') as Promise<{ mode: 'soft' | 'hard' }>,
  setGraphicsMode: (mode: 'soft' | 'hard') =>
    ipcRenderer.invoke('settings:setGraphicsMode', mode) as Promise<
      { ok: boolean; mode: 'soft' | 'hard'; needsRestart: boolean } | { error: string }
    >,
  getDataBackend: () =>
    ipcRenderer.invoke('settings:getDataBackend') as Promise<{
      backend: 'sqlite' | 'selfhost';
      stored: 'sqlite' | 'selfhost';
      envLocked: boolean;
      envValue: 'sqlite' | 'selfhost' | null;
    }>,
  setDataBackend: (backend: 'sqlite' | 'selfhost') =>
    ipcRenderer.invoke('settings:setDataBackend', backend) as Promise<
      { ok: boolean; backend: 'sqlite' | 'selfhost'; needsRestart: boolean } | { error: string }
    >,
  relaunchApp: () =>
    ipcRenderer.invoke('settings:relaunchApp') as Promise<{ ok: boolean }>,
  setTitleBarOverlay: (opts: { theme: 'light' | 'dark'; glass: boolean }) =>
    ipcRenderer.invoke('window:setTitleBarOverlay', opts) as Promise<{ ok: boolean }>,

  // Live sync — called when another user changes the shared database
  onDbChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('db:changed', handler);
    return () => {
      ipcRenderer.removeListener('db:changed', handler);
    };
  },

  // ---- App version ----
  getVersion: () =>
    ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // ---- Auto-updates ----
  checkForUpdatesNow: () =>
    ipcRenderer.invoke('updater:checkNow') as Promise<{ ok: boolean; current?: string; latest?: string } | { error: string }>,
  onUpdateChecking: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('updater:checking', handler);
    return () => ipcRenderer.removeListener('updater:checking', handler);
  },
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:update-available', handler);
    return () => ipcRenderer.removeListener('updater:update-available', handler);
  },
  onUpToDate: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:up-to-date', handler);
    return () => ipcRenderer.removeListener('updater:up-to-date', handler);
  },
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:update-downloaded', handler);
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
  },
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress) => callback(progress);
    ipcRenderer.on('updater:download-progress', handler);
    return () => ipcRenderer.removeListener('updater:download-progress', handler);
  },
  onUpdateError: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },
  downloadUpdate: () =>
    ipcRenderer.invoke('updater:downloadUpdate') as Promise<{ ok: boolean } | { error: string }>,
  installNow: () =>
    ipcRenderer.invoke('updater:installNow') as Promise<{ ok: boolean } | { error: string }>,

  // ---- Remember-me credentials (encrypted via safeStorage) ----
  saveCredentials: (data: { username: string; password: string }) =>
    ipcRenderer.invoke('auth:saveCredentials', data) as Promise<{ ok: boolean } | { error: string }>,
  loadCredentials: () =>
    ipcRenderer.invoke('auth:loadCredentials') as Promise<{ username: string; password: string } | null>,
  clearCredentials: () =>
    ipcRenderer.invoke('auth:clearCredentials') as Promise<{ ok: boolean } | { error: string }>,

  // Rigging schedule
  riggingGetCurrentMonth: (token: string) =>
    ipcRenderer.invoke('rigging:getCurrentMonth', token) as Promise<{ year_month: string } | { error: string }>,
  riggingListArchivedMonths: (token: string) =>
    ipcRenderer.invoke('rigging:listArchivedMonths', token) as Promise<
      { year_month: string; status: string; archived_at: string | null }[] | { error: string }
    >,
  riggingListInstalls: (token: string, yearMonth: string) =>
    ipcRenderer.invoke('rigging:listInstalls', token, yearMonth) as Promise<RiggingInstall[] | { error: string }>,
  riggingListInstallsForDate: (token: string, date: string) =>
    ipcRenderer.invoke('rigging:listInstallsForDate', token, date) as Promise<RiggingInstall[] | { error: string }>,
  riggingSearchJobs: (token: string, query: string) =>
    ipcRenderer.invoke('rigging:searchJobs', token, query) as Promise<RiggingJobOption[] | { error: string }>,
  riggingAddInstall: (
    token: string,
    data: { job_id: number; scheduled_date: string; note?: string | null; duration_days?: number | null }
  ) =>
    ipcRenderer.invoke('rigging:addInstall', token, data) as Promise<RiggingInstall | { error: string }>,
  riggingUpdateInstall: (
    token: string,
    data: { id: number; scheduled_date?: string; note?: string | null; duration_days?: number | null }
  ) =>
    ipcRenderer.invoke('rigging:updateInstall', token, data) as Promise<RiggingInstall | { error: string }>,
  riggingRemoveInstall: (token: string, id: number) =>
    ipcRenderer.invoke('rigging:removeInstall', token, id) as Promise<{ ok: boolean } | { error: string }>,
  riggingCanEdit: (token: string) =>
    ipcRenderer.invoke('rigging:canEdit', token) as Promise<{ can_edit: boolean }>,
  onRiggingAlert: (
    callback: (payload: {
      alert_type: string;
      message: string;
      install_id: number;
      scheduled_date: string;
      job_no: string;
    }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: {
      alert_type: string;
      message: string;
      install_id: number;
      scheduled_date: string;
      job_no: string;
    }) => callback(payload);
    ipcRenderer.on('rigging:alert', handler);
    return () => ipcRenderer.removeListener('rigging:alert', handler);
  },

  // Vehicle bookings (same add flow as Rigging — search job, click to schedule)
  vehiclesGetCurrentMonth: (token: string) =>
    ipcRenderer.invoke('vehicles:getCurrentMonth', token) as Promise<{ year_month: string } | { error: string }>,
  vehiclesListArchivedMonths: (token: string) =>
    ipcRenderer.invoke('vehicles:listArchivedMonths', token) as Promise<VehicleBookingMonth[] | { error: string }>,
  vehiclesListBookings: (token: string, yearMonth: string) =>
    ipcRenderer.invoke('vehicles:listBookings', token, yearMonth) as Promise<VehicleBooking[] | { error: string }>,
  vehiclesSearchJobs: (token: string, query: string) =>
    ipcRenderer.invoke('vehicles:searchJobs', token, query) as Promise<
      | { id: number; job_no: string; job_name: string; client: string; stage: string; has_booking: boolean }[]
      | { error: string }
    >,
  vehiclesListUnbookedJobs: (token: string) =>
    ipcRenderer.invoke('vehicles:listUnbookedJobs', token) as Promise<
      | { id: number; job_no: string; job_name: string; client: string; stage: string; due_date: string | null }[]
      | { error: string }
    >,
  vehiclesAddBooking: (
    token: string,
    data: { job_id: number; scheduled_date: string; note?: string | null }
  ) =>
    ipcRenderer.invoke('vehicles:addBooking', token, data) as Promise<VehicleBooking | { error: string }>,
  vehiclesUpdateBooking: (
    token: string,
    data: { id: number; scheduled_date?: string; note?: string | null }
  ) =>
    ipcRenderer.invoke('vehicles:updateBooking', token, data) as Promise<VehicleBooking | { error: string }>,
  vehiclesRemoveBooking: (token: string, id: number) =>
    ipcRenderer.invoke('vehicles:removeBooking', token, id) as Promise<{ ok: boolean } | { error: string }>,
  vehiclesCanEdit: (token: string) =>
    ipcRenderer.invoke('vehicles:canEdit', token) as Promise<{ can_edit: boolean } | { error: string }>,

  // Orders
  listOrders: (token: string) =>
    ipcRenderer.invoke('orders:list', token) as Promise<Order[] | { error: string }>,
  listArchivedOrders: (token: string) =>
    ipcRenderer.invoke('orders:listArchived', token) as Promise<Order[] | { error: string }>,
  createOrder: (
    token: string,
    data: { job_id?: number | null; order_name?: string; items_body: string }
  ) => ipcRenderer.invoke('orders:create', token, data) as Promise<Order | { error: string }>,
  updateOrder: (
    token: string,
    data: {
      id: number;
      version: number;
      job_id?: number | null;
      order_name?: string;
      items_body?: string;
      status?: OrderStatus;
    }
  ) => ipcRenderer.invoke('orders:update', token, data) as Promise<Order | { error: string }>,
  archiveOrder: (token: string, id: number, version: number) =>
    ipcRenderer.invoke('orders:archive', token, id, version) as Promise<Order | { error: string }>,
  unarchiveOrder: (token: string, id: number, version: number) =>
    ipcRenderer.invoke('orders:unarchive', token, id, version) as Promise<Order | { error: string }>,
  listUnseenOrderIds: (token: string) =>
    ipcRenderer.invoke('orders:listUnseenIds', token) as Promise<number[] | { error: string }>,
  markOrdersSeen: (token: string) =>
    ipcRenderer.invoke('orders:markSeen', token) as Promise<{ ok: boolean; marked: number } | { error: string }>,
  ordersPermissions: (token: string) =>
    ipcRenderer.invoke('orders:permissions', token) as Promise<
      { can_create: boolean; can_manage: boolean } | { error: string }
    >,
  onOrdersChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('orders:new', handler);
    return () => ipcRenderer.removeListener('orders:new', handler);
  },
  onOrderOpen: (callback: (payload: { order_id: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { order_id: number }) => callback(payload);
    ipcRenderer.on('orders:open', handler);
    return () => ipcRenderer.removeListener('orders:open', handler);
  },

  listQuoteSizes: (token: string) =>
    ipcRenderer.invoke('quoteSizes:list', token) as Promise<QuoteSize[] | { error: string }>,
  listCompletedQuoteSizes: (token: string) =>
    ipcRenderer.invoke('quoteSizes:listCompleted', token) as Promise<QuoteSize[] | { error: string }>,
  createQuoteSize: (
    token: string,
    data: {
      job_name: string;
      scope: string;
      image?: { file_name: string; mime_type: string; bytesBase64: string } | null;
    }
  ) => ipcRenderer.invoke('quoteSizes:create', token, data) as Promise<QuoteSize | { error: string }>,
  updateQuoteSize: (
    token: string,
    data: {
      id: number;
      version: number;
      job_name?: string;
      scope?: string;
      status?: QuoteSizeStatus;
      complete?: boolean;
      image?: { file_name: string; mime_type: string; bytesBase64: string } | null;
    }
  ) => ipcRenderer.invoke('quoteSizes:update', token, data) as Promise<QuoteSize | { error: string }>,
  deleteQuoteSize: (token: string, data: { id: number; version: number }) =>
    ipcRenderer.invoke('quoteSizes:delete', token, data) as Promise<{ ok: true } | { error: string }>,
  listQuoteSizeNotes: (token: string, id: number) =>
    ipcRenderer.invoke('quoteSizes:listNotes', token, id) as Promise<QuoteSizeNote[] | { error: string }>,
  addQuoteSizeNote: (
    token: string,
    id: number,
    body: string,
    mentions?: number[],
    image?: { file_name: string; mime_type: string; bytesBase64: string } | null
  ) =>
    ipcRenderer.invoke('quoteSizes:addNote', token, id, body, mentions, image) as Promise<
      QuoteSizeNote | { error: string }
    >,
  listUnseenQuoteSizeIds: (token: string) =>
    ipcRenderer.invoke('quoteSizes:listUnseenIds', token) as Promise<number[] | { error: string }>,
  markQuoteSizesSeen: (token: string, ids?: number[]) =>
    ipcRenderer.invoke('quoteSizes:markSeen', token, ids) as Promise<
      { ok: boolean; marked: number } | { error: string }
    >,
  listUnseenQuoteSizeMentions: (token: string) =>
    ipcRenderer.invoke('quoteSizes:listUnseenMentions', token) as Promise<
      QuoteSizeMention[] | { error: string }
    >,
  markQuoteSizeMentionsSeen: (token: string, quoteSizeId: number) =>
    ipcRenderer.invoke('quoteSizes:markMentionsSeen', token, quoteSizeId) as Promise<
      { ok: boolean; marked: number } | { error: string }
    >,
  getQuoteSizeThumb: (token: string, id: number) =>
    ipcRenderer.invoke('quoteSizes:getThumb', token, id) as Promise<
      { mime_type: string; dataBase64: string } | { error: string }
    >,
  getQuoteSizeImage: (token: string, id: number) =>
    ipcRenderer.invoke('quoteSizes:getImage', token, id) as Promise<
      { mime_type: string; dataBase64: string } | { error: string }
    >,
  getQuoteSizeNoteThumb: (token: string, noteId: number) =>
    ipcRenderer.invoke('quoteSizes:getNoteThumb', token, noteId) as Promise<
      { mime_type: string; dataBase64: string } | { error: string }
    >,
  getQuoteSizeNoteImage: (token: string, noteId: number) =>
    ipcRenderer.invoke('quoteSizes:getNoteImage', token, noteId) as Promise<
      { mime_type: string; dataBase64: string } | { error: string }
    >,
  onQuoteSizesChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('quote-sizes:new', handler);
    return () => ipcRenderer.removeListener('quote-sizes:new', handler);
  },
  onQuoteSizeOpen: (callback: (payload: { quote_size_id: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { quote_size_id: number }) =>
      callback(payload);
    ipcRenderer.on('quote-sizes:open', handler);
    return () => ipcRenderer.removeListener('quote-sizes:open', handler);
  },

  aiPermissions: (token: string) =>
    ipcRenderer.invoke('ai:permissions', token) as Promise<{ can_use: boolean } | { error: string }>,
  aiStatus: (token: string) =>
    ipcRenderer.invoke('ai:status', token) as Promise<
      { ready: boolean; model: string; url: string; error?: string } | { error: string }
    >,
  aiListPriceFiles: (token: string) =>
    ipcRenderer.invoke('ai:listPriceFiles', token) as Promise<
      { name: string; size: number; updated_at: string }[] | { error: string }
    >,
  aiAddPriceFiles: (token: string) =>
    ipcRenderer.invoke('ai:addPriceFiles', token) as Promise<
      { ok: true; name: string } | { cancelled: true } | { error: string }
    >,
  aiRemovePriceFile: (token: string, name: string) =>
    ipcRenderer.invoke('ai:removePriceFile', token, name) as Promise<{ ok: true } | { error: string }>,
  aiListNotes: (token: string) =>
    ipcRenderer.invoke('ai:listNotes', token) as Promise<
      { count: number; recent: string[] } | { error: string }
    >,
  aiChat: (
    token: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    session?: unknown,
    threadId?: string
  ) =>
    ipcRenderer.invoke('ai:chat', token, messages, session, threadId) as Promise<
      | {
          reply: string;
          used_web: boolean;
          saved: boolean;
          model: string;
          session: {
            currentJobId: number | null;
            currentJobNo: string | null;
            currentJobName: string | null;
            currentContact: string | null;
            currentMaterial: string | null;
            currentSupplier: string | null;
            lastSearchTerms: string[];
          };
          cancelled?: boolean;
        }
      | { error: string }
    >,
  aiCancelChat: (token: string) =>
    ipcRenderer.invoke('ai:cancel', token) as Promise<{ ok: true } | { error: string }>,
  aiLoadChat: (token: string) =>
    ipcRenderer.invoke('ai:loadChat', token) as Promise<
      | {
          messages: { role: 'user' | 'assistant'; content: string }[];
          session: {
            currentJobId: number | null;
            currentJobNo: string | null;
            currentJobName: string | null;
            currentContact: string | null;
            currentMaterial: string | null;
            currentSupplier: string | null;
            lastSearchTerms: string[];
          } | null;
          stored: boolean;
          threads: {
            id: string;
            title: string;
            messages: { role: 'user' | 'assistant'; content: string }[];
            session: {
              currentJobId: number | null;
              currentJobNo: string | null;
              currentJobName: string | null;
              currentContact: string | null;
              currentMaterial: string | null;
              currentSupplier: string | null;
              lastSearchTerms: string[];
            };
            updatedAt: string;
          }[];
          activeId: string | null;
        }
      | { error: string }
    >,
  aiSaveChat: (
    token: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    session?: unknown,
    threadId?: string
  ) => ipcRenderer.invoke('ai:saveChat', token, messages, session, threadId) as Promise<{ ok: true } | { error: string }>,
  aiSaveInbox: (
    token: string,
    inbox: {
      threads: {
        id: string;
        title: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
        session: unknown;
        updatedAt: string;
      }[];
      activeId: string | null;
    }
  ) => ipcRenderer.invoke('ai:saveInbox', token, inbox) as Promise<{ ok: true } | { error: string }>,
  aiListStaffChats: (token: string) =>
    ipcRenderer.invoke('ai:listStaffChats', token) as Promise<
      | {
          userId: number;
          threadId: string;
          username: string;
          fullName: string;
          title: string;
          updatedAt: string | null;
          preview: string;
        }[]
      | { error: string }
    >,
  aiLoadStaffChat: (token: string, userId: number, threadId?: string) =>
    ipcRenderer.invoke('ai:loadStaffChat', token, userId, threadId) as Promise<
      | {
          messages: { role: 'user' | 'assistant'; content: string }[];
          fullName: string;
          username: string;
          title?: string;
        }
      | { error: string }
    >,

  listFeedback: (token: string) =>
    ipcRenderer.invoke('feedback:list', token) as Promise<AppFeedback[] | { error: string }>,
  createFeedback: (token: string, data: { kind: FeedbackKind; body: string }) =>
    ipcRenderer.invoke('feedback:create', token, data) as Promise<AppFeedback | { error: string }>,
  markFeedbackDone: (token: string, id: number) =>
    ipcRenderer.invoke('feedback:markDone', token, id) as Promise<AppFeedback | { error: string }>,
  feedbackUnseenCount: (token: string) =>
    ipcRenderer.invoke('feedback:unseenCount', token) as Promise<{ count: number } | { error: string }>,
  markFeedbackSeen: (token: string) =>
    ipcRenderer.invoke('feedback:markSeen', token) as Promise<{ ok: boolean; marked: number } | { error: string }>,
  onFeedbackChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('feedback:new', handler);
    return () => ipcRenderer.removeListener('feedback:new', handler);
  },
  onFeedbackOpen: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('feedback:open', handler);
    return () => ipcRenderer.removeListener('feedback:open', handler);
  },
  onAiStatus: (callback: (label: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, label: string | null) => callback(label);
    ipcRenderer.on('ai:status', handler);
    return () => ipcRenderer.removeListener('ai:status', handler);
  },
};

export type TrackerApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('tracker', api);
  } catch (err) {
    console.error('[preload] failed to expose API:', err);
  }
} else {
  // Fallback for non-isolated context (shouldn't happen in normal use)
  (globalThis as Record<string, unknown>).tracker = api;
}
