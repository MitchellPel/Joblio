/**
 * Plain-English release notes for staff.
 * Update this file when preparing a publish — the app shows it after update
 * and from Settings → What's New.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.4.24',
    date: '2026-08-28',
    highlights: [
      'Admin → Settings: Joblio AI can be Off, Local (Ollama on this PC), or Cloud (your API URL and key)',
      'Out-of-office / self-host login uses the URLs you set — no office tunnel address baked into the app',
    ],
  },
  {
    version: '0.4.23',
    date: '2026-08-28',
    highlights: [
      'First launch: Start on this PC — jobs stay on this computer, no office share or server needed',
      'If the office update folder is not on this PC, Joblio skips the check instead of showing an error',
      'Settings → Database: Use this PC only, or keep pointing at a shared folder for the shop',
    ],
  },
  {
    version: '0.4.22',
    date: '2026-08-27',
    highlights: [
      'Opening a proof no longer covers Minimise / Maximise / Close — you can close the proof and still use the window buttons',
      'The job window shrinks with the app window instead of cutting off when Joblio is made smaller',
    ],
  },
  {
    version: '0.4.21',
    date: '2026-08-27',
    highlights: [
      'Each job status has its own colour (board pills and when selected) so Urgent, On hold, Printed, Approved and the rest no longer look the same',
      'Minimise, maximise, and close sit in Joblio’s top bar — logo on the first line, Board and the rest on the line below',
      'Settings → Appearance: optional Glass look (warm colour wash). Standard stays the usual look. Each PC remembers its own choice',
    ],
  },
  {
    version: '0.4.20',
    date: '2026-08-27',
    highlights: [
      'Admin can grant Cut / Print List to staff — they can post, edit, complete, and delete; everyone can still reply and tick Done',
      'Archived orders use the same compact grid as jobs — click one to see what was ordered and restore it',
    ],
  },
  {
    version: '0.4.19',
    date: '2026-08-26',
    highlights: [
      'Cut / Print List tab next to Board — post a job name, scope, and picture; staff reply with sizes or artwork in the chat',
      'Staff tick Done to grey a request and notify the person who posted it; Complete files it into a scrollable Completed list at the bottom',
      'Delete removes a Cut / Print List request for everyone (not only on this PC)',
      'Owner can edit any Cut / Print List request; chat can include images, and proofs on jobs can be printed',
      'Bell and Windows pop-ups cover new Cut / Print List requests as well as @mentions',
      'Board name colours update on other PCs without restarting Joblio',
    ],
  },
  {
    version: '0.4.18',
    date: '2026-08-26',
    highlights: [
      'Joblio AI is a chatbot first — talk normally; jobs and prices are extras when you ask',
      'Each login has private chats on the office database — start, close, or delete as many as you need',
      'Joblio AI looks up live facts (weather, rates, load shedding, news) instead of guessing, and shows what it is doing while it works',
      'Admins can review staff chats from Joblio AI',
      'Board and job window: assigned person sits next to the job number, not mixed in with status',
      'Pick a colour in Settings (or Admin) so your name shows in a colour bubble on the board',
      'Rand amounts (R…) no longer mistaken for job numbers',
    ],
  },
  {
    version: '0.4.17',
    date: '2026-08-19',
    highlights: [
      'Joblio AI auto-detects which model is installed — no manual config when the server model changes',
      'Upgraded AI model: phi3 medium 14B (smarter answers, bigger context)',
    ],
  },
  {
    version: '0.4.16',
    date: '2026-08-18',
    highlights: [
      'Joblio AI remembers the job you are talking about — no need to repeat the number',
      'Joblio AI reads the notes on that job',
      'Each staff member has their own AI chat on this PC — Stop if you send by mistake',
      'Archived orders show what was ordered',
      'Proofs: look in both the current and old share folders so older images still open',
    ],
  },
  {
    version: '0.4.15',
    date: '2026-08-18',
    highlights: [
      'Joblio AI: chat with stored supplier price lists (one Excel per supplier) for a fast ballpark',
      'Say “remember …” in chat to store a note for every PC',
      'Small local model on the Joblio server (Llama 3.2 3B, capped CPU)',
      'Can search the web when the AI judges the answer needs live internet facts',
      'Joblio AI: concise answers from lists, notes, and web — says when it doesn’t know',
      'Joblio AI: looks up jobs on the board (stage, assignee, due date)',
      'Joblio AI: decides when a web search is needed — not on every question',
      'Joblio AI intelligence file on the share (joblio-ai-intelligence.md) — edit like CLAUDE.md',
      'Admin: turn Joblio AI on per staff member',
      'Settings: report a bug or change — you see your own posts; admin sees all, gets a notification, and can mark Done',
      'Vehicles: drag vehicle jobs onto days; the job due date follows the booking',
      'Rigging: mark a 3-day install so it shows on three consecutive days',
      'Notes: admin (or staff with Delete notes) can remove a note',
    ],
  },
  {
    version: '0.4.14',
    date: '2026-08-11',
    highlights: [
      'If the API key path fails, login offers Locate share folder so staff can point Joblio at the new location',
    ],
  },
  {
    version: '0.4.13',
    date: '2026-08-11',
    highlights: [
      'Self-host API key now read from \\\\server\\D\\Joblio DB\\Jobtracker (new share location)',
    ],
  },
  {
    version: '0.4.12',
    date: '2026-08-07',
    highlights: [
      'Fix: editing a job due date now saves reliably (form no longer resets mid-edit)',
    ],
  },
  {
    version: '0.4.11',
    date: '2026-08-07',
    highlights: [
      'Print job opens as Ikwezi Signs delivery note (no checklist, notes, or stage history)',
      'Delivery note includes Print Name / Sign / Date lines at the bottom',
    ],
  },
  {
    version: '0.4.10',
    date: '2026-08-06',
    highlights: [
      'Job status: select multiple options at once (Proofing, Ordered, Urgent, …)',
      'Urgent status turns the board job card red',
      'Orders: link a board job or just enter a name — job is optional',
      'Orders nav shows a red count badge when teammates add new orders',
    ],
  },
  {
    version: '0.4.9',
    date: '2026-08-03',
    highlights: [
      'Orders shows as a text link (not cart icon)',
      'Admin list shows Create Orders / Manage Orders tags',
      'Order permissions apply without logging out and back in',
    ],
  },
  {
    version: '0.4.8',
    date: '2026-08-03',
    highlights: [
      'Orders: link orders to jobs, item lists, Place / Done, archive tab, notifications',
      'Admin permissions: Create orders and Manage orders',
      'Notes: Enter adds a new line; Ctrl+Enter sends (same as edit)',
    ],
  },
  {
    version: '0.4.7',
    date: '2026-07-28',
    highlights: [
      'Addon status options added: Ordered, Printed, Cut, Welded, Application (alongside Proofing, On hold, Waiting client, Approved)',
      'Status pill on the board matches assignee chip size',
    ],
  },
  {
    version: '0.4.6',
    date: '2026-07-28',
    highlights: [
      'Delete job works on self-host',
      'Admin can add, edit, and remove users on self-host',
      'Rigging morning install alerts work on self-host',
      'Ctrl+K search includes archived jobs, contacts, and assignees',
      'Calendars and proofs refresh automatically when others change them',
      'Archive / restore recorded in job history again',
    ],
  },
  {
    version: '0.4.5',
    date: '2026-07-28',
    highlights: [
      'Board refreshes automatically when others change jobs (no need to switch tabs)',
      'Activity feed works on self-host again',
      '@Mentions (bell, badges, notifications) work on self-host again',
    ],
  },
  {
    version: '0.4.4',
    date: '2026-07-27',
    highlights: [
      'Designer status colours: Proofing yellow, On hold red, Waiting for client blue, Approved green',
    ],
  },
  {
    version: '0.4.3',
    date: '2026-07-27',
    highlights: [
      'Designer status on jobs: Proofing, On hold, Waiting for client, Approved — shows on board cards',
    ],
  },
  {
    version: '0.4.2',
    date: '2026-07-27',
    highlights: [
      'Self-host mode: auto-updates from the share work again (Restart & Install)',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-07-27',
    highlights: [
      'Cleaner login screen (no technical status banner)',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-07-27',
    highlights: [
      'Jobs and notes now use the office Docker database (faster, works for remote staff)',
      'App picks the fast office network when available, otherwise the remote tunnel',
    ],
  },
  {
    version: '0.3.10',
    date: '2026-07-23',
    highlights: [
      'Job type: Vehicle, Sign, or Vinyl — icons on board cards and the job window',
      'Clearer Sign icon (framed wall board)',
      'Highlighting text in New Job no longer closes the window by accident',
    ],
  },
  {
    version: '0.3.9',
    date: '2026-07-23',
    highlights: [
      'New jobs: choose Vehicle or Sign — icons show on board cards and the job window',
      'Any team member can edit job notes (not admin-only)',
      'Job number is what you type (e.g. SO…) — no more auto J-2026 numbers',
      'Notes as a side chat on the job window; checklist removed',
      'Admin edit-user window scrolls on smaller screens',
      'Larger Joblio logo on the login screen',
    ],
  },
  {
    version: '0.3.8',
    date: '2026-07-22',
    highlights: [
      'New Vehicle Bookings calendar next to Board — same layout and add flow as Rigging',
      'Type a job name, pick it from the board, schedule it on a day',
      'Cleaner job chips on Rigging and Vehicles calendars — text fits inside each day',
      'Admin permission: Can Edit Vehicle Bookings',
    ],
  },
  {
    version: '0.3.7',
    date: '2026-07-22',
    highlights: [
      'English spell check in notes and text fields — right-click for suggestions',
      'Select multiple jobs on the board — reassign, move stage, or archive in bulk',
      'When you are @mentioned, the job card and job detail show the note clearly',
      'Pinned brief on each job — short team note that stays at the top',
      'Restore archived jobs to the board — same permission as Archive',
      'Proof viewer: readable text in light mode, image fills the screen',
    ],
  },
  {
    version: '0.3.6',
    date: '2026-07-21',
    highlights: [
      'Proof images stored as files next to the database — stops freezes as the library grows',
      'Board cards show the latest note under the assignee for fast scanning',
      'Mentions bell and alerts stay on top of the board (no more hidden behind jobs)',
      'Compatible graphics mode by default for shop laptops without a strong GPU',
      'Settings → Display: switch Compatible / Performance per PC',
      'Faster, cleaner startup — heavy proof cleanup no longer blocks login',
    ],
  },
  {
    version: '0.3.5',
    date: '2026-07-21',
    highlights: [
      'Proof images stored as files next to the database (not inside it) — stops multi‑MB freezes',
      'Shared jobs.db stays small so saves/sync no longer lock up the app',
      'Existing proofs are moved out automatically on first open',
    ],
  },
  {
    version: '0.3.4',
    date: '2026-07-21',
    highlights: [
      'Stop “Not Responding” freezes while the shared database syncs over the network',
      'Database saves and reloads no longer lock up the whole app',
      'Smoother multi-user use when several people edit jobs at once',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-07-21',
    highlights: [
      'Rigging alerts stay on top of the board (no more toast hidden behind jobs)',
      'Today’s Installs popup and update banner also stay above the board',
      'Clicking a Windows alert brings Joblio to the front',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-07-21',
    highlights: [
      'Fix blank window on laptops waiting on the network database',
      'App window shows immediately; database loads in the background',
      'Extra graphics fallbacks for PCs that still showed a blank screen',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-07-21',
    highlights: [
      'Fix blank window on some laptops after install (more reliable graphics mode)',
      'Show a clear error screen instead of an empty window if something fails to load',
      'Slightly smaller minimum window size for laptop screens',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-07-20',
    highlights: [
      'Mention teammates in job comments with @ — Windows notification + in-app bell',
      'Search any job from anywhere with Ctrl+K',
      'Activity feed of recent moves, comments, and archives',
      'Job checklists and reusable templates',
      'Printable job sheet from the job detail page',
      'Rigging calendar (install dates) — jobs auto-schedule when they enter Install',
      'New job: pick 14 / 28 / 48 day install lead times',
      'Much more stable proofs — compressed uploads, thumbnails, fewer freezes when many designers add images',
      "What's New panel so you know what to test after each update",
      'Cleaner top bar — Settings gear, Activity next to Overdue, Installs inside Rigging',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-07-20',
    highlights: [
      'Sharper layout at every window size (no more blurry zoom)',
      'Smoother board, modals, and drag-and-drop',
      'Faster startup — window opens while the database connects',
      'Installs tab + daily installs popup',
      'Job Number field on jobs and in Archive',
      'Usernames are no longer case-sensitive',
    ],
  },
];

export function changelogForVersion(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((e) => e.version === version);
}

export function latestChangelog(): ChangelogEntry {
  return CHANGELOG[0];
}
