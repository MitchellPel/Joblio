// Global type declaration for the IPC bridge exposed by preload.ts.

import type {
  Role,
  User,
  AuthSession,
  StageKey,
  Job,
  NewJobInput,
  UpdateJobInput,
  StageHistoryEntry,
  JobNote,
  JobProof,
  Mention,
  RiggingInstall,
  RiggingJobOption,
  RiggingMonth,
  VehicleBooking,
  VehicleBookingMonth,
  ActivityItem,
  ChecklistTemplate,
  JobChecklistItem,
  Order,
  OrderStatus,
  QuoteSize,
  QuoteSizeStatus,
  QuoteSizeNote,
  QuoteSizeMention,
  AppFeedback,
  FeedbackKind,
} from '@/shared-types';

// ---- Update types ---------------------------------------------------------

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

// ---- API interface --------------------------------------------------------

interface TrackerApi {
  getBackendMode: () => Promise<{ backend: 'sqlite' | 'selfhost'; selfHost: boolean; cloudTest?: boolean }>;
  login: (username: string, password: string) => Promise<AuthSession | { error: string }>;
  logout: (token: string) => Promise<void>;
  getCurrentSession: (token: string) => Promise<AuthSession | null>;

  listUsers: (token: string) => Promise<User[] | { error: string }>;
  createUser: (
    token: string,
    data: { username: string; password: string; full_name: string; role: Role }
  ) => Promise<User | { error: string }>;
  updateUser: (
    token: string,
    data: { id: number; full_name?: string; role?: Role; active?: boolean; can_archive?: boolean; can_move_any?: boolean; can_edit_rigging?: boolean; can_edit_vehicle_bookings?: boolean; can_create_orders?: boolean; can_manage_orders?: boolean; can_use_ai?: boolean; can_delete_notes?: boolean; can_manage_quote_sizes?: boolean; board_color?: string | null; password?: string | null }
  ) => Promise<User | { error: string }>;
  setBoardColor: (token: string, color: string | null) => Promise<User | { error: string }>;
  listStaff: (token: string) => Promise<{ id: number; full_name: string }[] | { error: string }>;
  deleteUser: (token: string, userId: number) => Promise<{ ok: boolean } | { error: string }>;

  listJobs: (token: string) => Promise<Job[] | { error: string }>;
  searchJobs: (token: string, query: string) => Promise<Job[] | { error: string }>;
  listJobsWithDueDates: (token: string) => Promise<Job[] | { error: string }>;
  listActivity: (token: string) => Promise<ActivityItem[] | { error: string }>;
  getJob: (token: string, id: number) => Promise<Job | null | { error: string }>;
  createJob: (token: string, data: NewJobInput) => Promise<Job | { error: string }>;
  updateJob: (token: string, data: UpdateJobInput) => Promise<Job | { error: string }>;
  moveStage: (token: string, jobId: number, toStage: StageKey, version: number, note?: string | null) =>
    Promise<Job | { error: string }>;
  deleteJob: (token: string, jobId: number, version: number) => Promise<{ ok: boolean } | { error: string }>;
  archiveJob: (token: string, jobId: number, version: number) => Promise<Job | { error: string }>;
  unarchiveJob: (token: string, jobId: number, version: number) => Promise<Job | { error: string }>;
  listArchivedJobs: (token: string) => Promise<Job[] | { error: string }>;

  listChecklistTemplates: (token: string) => Promise<ChecklistTemplate[] | { error: string }>;
  createChecklistTemplate: (token: string, data: { name: string; items: string[] }) =>
    Promise<ChecklistTemplate | { error: string }>;
  deleteChecklistTemplate: (token: string, id: number) => Promise<{ ok: boolean } | { error: string }>;
  listJobChecklist: (token: string, jobId: number) => Promise<JobChecklistItem[] | { error: string }>;
  addChecklistItem: (token: string, jobId: number, body: string) => Promise<JobChecklistItem | { error: string }>;
  toggleChecklistItem: (token: string, id: number, done: boolean) => Promise<JobChecklistItem | { error: string }>;
  deleteChecklistItem: (token: string, id: number) => Promise<{ ok: boolean } | { error: string }>;
  applyChecklistTemplate: (token: string, jobId: number, templateId: number) =>
    Promise<JobChecklistItem[] | { error: string }>;

  listProofs: (token: string, jobId: number) => Promise<JobProof[] | { error: string }>;
  getProof: (token: string, proofId: number) => Promise<
    (JobProof & { dataBase64: string }) | { error: string }
  >;
  getProofThumb: (token: string, proofId: number) => Promise<
    (JobProof & { dataBase64: string }) | { error: string }
  >;
  addProof: (
    token: string,
    jobId: number,
    data: { file_name: string; mime_type: string; bytesBase64: string; size: number }
  ) => Promise<JobProof | { error: string }>;
  deleteProof: (token: string, proofId: number) => Promise<{ ok: boolean } | { error: string }>;

  getStageHistory: (token: string, jobId: number) => Promise<StageHistoryEntry[] | { error: string }>;
  addNote: (token: string, jobId: number, body: string, mentions?: number[]) => Promise<JobNote | { error: string }>;
  updateNote: (token: string, noteId: number, body: string) => Promise<JobNote | { error: string }>;
  deleteNote: (token: string, noteId: number) => Promise<{ ok: boolean } | { error: string }>;
  listNotes: (token: string, jobId: number) => Promise<JobNote[] | { error: string }>;

  // ---- Mentions (@name in job notes) ----
  listUnseenMentions: (token: string) => Promise<Mention[] | { error: string }>;
  listUnseenMentionJobIds: (token: string) => Promise<number[] | { error: string }>;
  listUnseenMentionsForJob: (token: string, jobId: number) => Promise<Mention[] | { error: string }>;
  markMentionsSeen: (token: string, jobId: number) => Promise<{ ok: boolean; marked: number } | { error: string }>;
  /** Fires when new mentions arrive for the logged-in user; returns unsubscribe. */
  onMentionsChanged: (callback: () => void) => () => void;
  /** Fires when a Windows mention notification is clicked; returns unsubscribe. */
  onMentionOpen: (callback: (payload: { job_id: number }) => void) => () => void;

  getDbPath: () => Promise<{ configured: boolean; path: string | null }>;
  setDbPath: (path: string) => Promise<{ ok: boolean } | { error: string }>;
  useLocalDb: () => Promise<{ ok: true; path: string } | { error: string }>;
  pickFolder: () => Promise<string | null>;
  getShareRoot: () => Promise<{ path: string | null }>;
  pickShareRoot: () => Promise<
    { ok: true; path: string } | { cancelled: true } | { error: string }
  >;
  setShareRoot: (path: string) => Promise<{ ok: true; path: string } | { error: string }>;
  getGraphicsMode: () => Promise<{ mode: 'soft' | 'hard' }>;
  setGraphicsMode: (
    mode: 'soft' | 'hard'
  ) => Promise<{ ok: boolean; mode: 'soft' | 'hard'; needsRestart: boolean } | { error: string }>;
  getAiSettings: (token: string) => Promise<
    | {
        provider: 'off' | 'ollama' | 'openai';
        source: 'this-pc' | 'share-file' | 'off';
        ollamaUrl: string;
        ollamaModel: string;
        openaiUrl: string;
        openaiModel: string;
        openaiKeySet: boolean;
      }
    | { error: string }
  >;
  setAiSettings: (
    token: string,
    body: {
      provider: 'off' | 'ollama' | 'openai';
      ollamaUrl: string;
      ollamaModel: string;
      openaiUrl: string;
      openaiModel: string;
      openaiApiKey?: string;
    }
  ) => Promise<
    | {
        ok: true;
        provider: 'off' | 'ollama' | 'openai';
        source: 'this-pc' | 'share-file' | 'off';
        ollamaUrl: string;
        ollamaModel: string;
        openaiUrl: string;
        openaiModel: string;
        openaiKeySet: boolean;
      }
    | { error: string }
  >;
  getDataBackend: () => Promise<{
    backend: 'sqlite' | 'selfhost';
    stored: 'sqlite' | 'selfhost';
    envLocked: boolean;
    envValue: 'sqlite' | 'selfhost' | null;
  }>;
  setDataBackend: (
    backend: 'sqlite' | 'selfhost'
  ) => Promise<{ ok: boolean; backend: 'sqlite' | 'selfhost'; needsRestart: boolean } | { error: string }>;
  relaunchApp: () => Promise<{ ok: boolean }>;
  setTitleBarOverlay: (opts: { theme: 'light' | 'dark'; glass: boolean }) => Promise<{ ok: boolean }>;

  /** Subscribe to external DB changes; returns an unsubscribe function. */
  onDbChanged: (callback: () => void) => () => void;

  // ---- App version ----
  getVersion: () => Promise<string>;

  // ---- Auto-updates ----
  checkForUpdatesNow: () => Promise<{ ok: boolean; current?: string; latest?: string } | { error: string }>;
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpToDate: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onUpdateError: (callback: (message: string) => void) => () => void;
  downloadUpdate: () => Promise<{ ok: boolean } | { error: string }>;
  installNow: () => Promise<{ ok: boolean } | { error: string }>;

  // ---- Remember-me credentials ----
  saveCredentials: (data: { username: string; password: string }) => Promise<{ ok: boolean } | { error: string }>;
  loadCredentials: () => Promise<{ username: string; password: string } | null>;
  clearCredentials: () => Promise<{ ok: boolean } | { error: string }>;

  riggingGetCurrentMonth: (token: string) => Promise<{ year_month: string } | { error: string }>;
  riggingListArchivedMonths: (token: string) => Promise<RiggingMonth[] | { error: string }>;
  riggingListInstalls: (token: string, yearMonth: string) => Promise<RiggingInstall[] | { error: string }>;
  riggingListInstallsForDate: (token: string, date: string) => Promise<RiggingInstall[] | { error: string }>;
  riggingSearchJobs: (token: string, query: string) => Promise<RiggingJobOption[] | { error: string }>;
  riggingAddInstall: (
    token: string,
    data: { job_id: number; scheduled_date: string; note?: string | null; duration_days?: number | null }
  ) => Promise<RiggingInstall | { error: string }>;
  riggingUpdateInstall: (
    token: string,
    data: { id: number; scheduled_date?: string; note?: string | null; duration_days?: number | null }
  ) => Promise<RiggingInstall | { error: string }>;
  riggingRemoveInstall: (token: string, id: number) => Promise<{ ok: boolean } | { error: string }>;
  riggingCanEdit: (token: string) => Promise<{ can_edit: boolean }>;
  onRiggingAlert: (
    callback: (payload: {
      alert_type: string;
      message: string;
      install_id: number;
      scheduled_date: string;
      job_no: string;
    }) => void
  ) => () => void;

  vehiclesGetCurrentMonth: (token: string) => Promise<{ year_month: string } | { error: string }>;
  vehiclesListArchivedMonths: (token: string) => Promise<VehicleBookingMonth[] | { error: string }>;
  vehiclesListBookings: (token: string, yearMonth: string) => Promise<VehicleBooking[] | { error: string }>;
  vehiclesSearchJobs: (
    token: string,
    query: string
  ) => Promise<
    | { id: number; job_no: string; job_name: string; client: string; stage: string; has_booking: boolean }[]
    | { error: string }
  >;
  vehiclesListUnbookedJobs: (
    token: string
  ) => Promise<
    | { id: number; job_no: string; job_name: string; client: string; stage: string; due_date: string | null }[]
    | { error: string }
  >;
  vehiclesAddBooking: (
    token: string,
    data: { job_id: number; scheduled_date: string; note?: string | null }
  ) => Promise<VehicleBooking | { error: string }>;
  vehiclesUpdateBooking: (
    token: string,
    data: { id: number; scheduled_date?: string; note?: string | null }
  ) => Promise<VehicleBooking | { error: string }>;
  vehiclesRemoveBooking: (token: string, id: number) => Promise<{ ok: boolean } | { error: string }>;
  vehiclesCanEdit: (token: string) => Promise<{ can_edit: boolean } | { error: string }>;

  listOrders: (token: string) => Promise<Order[] | { error: string }>;
  listArchivedOrders: (token: string) => Promise<Order[] | { error: string }>;
  createOrder: (
    token: string,
    data: { job_id?: number | null; order_name?: string; items_body: string }
  ) => Promise<Order | { error: string }>;
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
  ) => Promise<Order | { error: string }>;
  archiveOrder: (token: string, id: number, version: number) => Promise<Order | { error: string }>;
  unarchiveOrder: (token: string, id: number, version: number) => Promise<Order | { error: string }>;
  listUnseenOrderIds: (token: string) => Promise<number[] | { error: string }>;
  markOrdersSeen: (token: string) => Promise<{ ok: boolean; marked: number } | { error: string }>;
  ordersPermissions: (
    token: string
  ) => Promise<{ can_create: boolean; can_manage: boolean } | { error: string }>;
  onOrdersChanged: (callback: () => void) => () => void;
  onOrderOpen: (callback: (payload: { order_id: number }) => void) => () => void;

  listQuoteSizes: (token: string) => Promise<QuoteSize[] | { error: string }>;
  listCompletedQuoteSizes: (token: string) => Promise<QuoteSize[] | { error: string }>;
  createQuoteSize: (
    token: string,
    data: {
      job_name: string;
      scope: string;
      image?: { file_name: string; mime_type: string; bytesBase64: string } | null;
    }
  ) => Promise<QuoteSize | { error: string }>;
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
  ) => Promise<QuoteSize | { error: string }>;
  deleteQuoteSize: (
    token: string,
    data: { id: number; version: number }
  ) => Promise<{ ok: true } | { error: string }>;
  listQuoteSizeNotes: (token: string, id: number) => Promise<QuoteSizeNote[] | { error: string }>;
  addQuoteSizeNote: (
    token: string,
    id: number,
    body: string,
    mentions?: number[],
    image?: { file_name: string; mime_type: string; bytesBase64: string } | null
  ) => Promise<QuoteSizeNote | { error: string }>;
  listUnseenQuoteSizeIds: (token: string) => Promise<number[] | { error: string }>;
  markQuoteSizesSeen: (
    token: string,
    ids?: number[]
  ) => Promise<{ ok: boolean; marked: number } | { error: string }>;
  listUnseenQuoteSizeMentions: (token: string) => Promise<QuoteSizeMention[] | { error: string }>;
  markQuoteSizeMentionsSeen: (
    token: string,
    quoteSizeId: number
  ) => Promise<{ ok: boolean; marked: number } | { error: string }>;
  getQuoteSizeThumb: (
    token: string,
    id: number
  ) => Promise<{ mime_type: string; dataBase64: string } | { error: string }>;
  getQuoteSizeImage: (
    token: string,
    id: number
  ) => Promise<{ mime_type: string; dataBase64: string } | { error: string }>;
  getQuoteSizeNoteThumb: (
    token: string,
    noteId: number
  ) => Promise<{ mime_type: string; dataBase64: string } | { error: string }>;
  getQuoteSizeNoteImage: (
    token: string,
    noteId: number
  ) => Promise<{ mime_type: string; dataBase64: string } | { error: string }>;
  onQuoteSizesChanged: (callback: () => void) => () => void;
  onQuoteSizeOpen: (callback: (payload: { quote_size_id: number }) => void) => () => void;

  aiPermissions: (token: string) => Promise<{ can_use: boolean } | { error: string }>;
  aiStatus: (
    token: string
  ) => Promise<
    | { ready: boolean; model: string; url: string; provider?: 'off' | 'ollama' | 'openai'; error?: string }
    | { error: string }
  >;
  aiListPriceFiles: (
    token: string
  ) => Promise<{ name: string; size: number; updated_at: string }[] | { error: string }>;
  aiAddPriceFiles: (
    token: string
  ) => Promise<{ ok: true; name: string } | { cancelled: true } | { error: string }>;
  aiRemovePriceFile: (token: string, name: string) => Promise<{ ok: true } | { error: string }>;
  aiListNotes: (
    token: string
  ) => Promise<{ count: number; recent: string[] } | { error: string }>;
  aiChat: (
    token: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    session?: {
      currentJobId: number | null;
      currentJobNo: string | null;
      currentJobName: string | null;
      currentContact: string | null;
      currentMaterial: string | null;
      currentSupplier: string | null;
      lastSearchTerms: string[];
    },
    threadId?: string
  ) => Promise<
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
  >;
  aiCancelChat: (token: string) => Promise<{ ok: true } | { error: string }>;
  aiLoadChat: (token: string) => Promise<
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
  >;
  aiSaveChat: (
    token: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    session?: unknown,
    threadId?: string
  ) => Promise<{ ok: true } | { error: string }>;
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
  ) => Promise<{ ok: true } | { error: string }>;
  aiListStaffChats: (token: string) => Promise<
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
  >;
  aiLoadStaffChat: (
    token: string,
    userId: number,
    threadId?: string
  ) => Promise<
    | {
        messages: { role: 'user' | 'assistant'; content: string }[];
        fullName: string;
        username: string;
        title?: string;
      }
    | { error: string }
  >;

  listFeedback: (token: string) => Promise<AppFeedback[] | { error: string }>;
  createFeedback: (
    token: string,
    data: { kind: FeedbackKind; body: string }
  ) => Promise<AppFeedback | { error: string }>;
  markFeedbackDone: (token: string, id: number) => Promise<AppFeedback | { error: string }>;
  feedbackUnseenCount: (token: string) => Promise<{ count: number } | { error: string }>;
  markFeedbackSeen: (token: string) => Promise<{ ok: boolean; marked: number } | { error: string }>;
  onFeedbackChanged: (callback: () => void) => () => void;
  onFeedbackOpen: (callback: () => void) => () => void;
  onAiStatus: (callback: (label: string | null) => void) => () => void;
}

declare global {
  interface Window {
    tracker: TrackerApi;
  }
}

export {};
