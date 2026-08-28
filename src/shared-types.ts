// Shared type definitions for the renderer (mirrors types from electron/preload.ts)

export type JobKind = 'vehicle' | 'sign' | 'vinyl';

/** Job status — designer / addon / urgent. Multiple may be selected. */
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
  /** Assignee's board colour (#RRGGBB), or null for the default name pill. */
  assigned_color: string | null;
  due_date: string | null;
  scope_notes: string | null;
  pinned_brief: string | null;
  /** Vehicle or Sign — shown as an icon on board cards. */
  job_kind: JobKind | null;
  /** Job statuses — multi-select (Proofing, Urgent, Ordered, …). */
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
  /** Free-text name when no job is linked. */
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
