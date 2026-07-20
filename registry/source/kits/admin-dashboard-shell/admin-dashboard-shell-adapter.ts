export type AdminDashboardRole = "analyst" | "editor" | "owner" | "viewer";

export interface AdminDashboardNavigationItem {
  /** Same-page hash destination owned by the dashboard section router. */
  readonly href: `#${string}`;
  /** Stable navigation item identifier used for selection and rendering identity. */
  readonly id: string;
  /** Human-readable navigation link label. */
  readonly label: string;
  /** Roles allowed to see this item when permission filtering is enabled. */
  readonly roles: readonly AdminDashboardRole[];
}

export interface AdminDashboardNavigationGroup {
  /** Stable group identifier used for sidebar rendering identity. */
  readonly id: string;
  /** Ordered navigation items contained by this labelled group. */
  readonly items: readonly AdminDashboardNavigationItem[];
  /** Human-readable sidebar group heading. */
  readonly label: string;
}

export interface AdminDashboardNotification {
  /** ISO-compatible creation instant used for localized display ordering and context. */
  readonly createdAt: string;
  /** Stable identifier passed to optional read-state mutation. */
  readonly id: string;
  /** Human-readable notification detail. */
  readonly message: string;
  /** Whether the notification has already been read. */
  readonly read: boolean;
  /** Concise notification heading. */
  readonly title: string;
}

export interface AdminDashboardActivity {
  /** Human-readable person or system responsible for the activity. */
  readonly actor: string;
  /** Stable activity identifier used for table row identity. */
  readonly id: string;
  /** ISO-compatible activity instant used for sorting and localized display. */
  readonly occurredAt: string;
  /** Activity lifecycle used for status text and semantic color treatment. */
  readonly status: "attention" | "complete" | "in-progress";
  /** Concise human-readable activity description. */
  readonly summary: string;
}

export interface AdminDashboardTrendPoint {
  /** Stable chart point identifier used for deterministic rendering. */
  readonly id: string;
  /** Human-readable category or time-period label. */
  readonly label: string;
  /** Finite numeric measure supplied to chart and data-table alternatives. */
  readonly value: number;
}

export interface AdminDashboardSnapshot {
  /** Immutable activity records rendered in the queryable activity table. */
  readonly activities: readonly AdminDashboardActivity[];
  /** Ordered breadcrumb descriptors for the dashboard heading context. */
  readonly breadcrumbs: readonly {
    /** Optional same-page hash destination; omission renders non-interactive current context. */
    readonly href?: `#${string}`;
    /** Stable breadcrumb identifier used for rendering identity. */
    readonly id: string;
    /** Human-readable breadcrumb label. */
    readonly label: string;
  }[];
  /** Immutable navigation groups used to build the sidebar. */
  readonly navigation: readonly AdminDashboardNavigationGroup[];
  /** Immutable notification records used by the optional notification surface. */
  readonly notifications: readonly AdminDashboardNotification[];
  /** Dashboard page title rendered above the primary content. */
  readonly title: string;
  /** Immutable trend points rendered by the chart and optional table alternative. */
  readonly trend: readonly AdminDashboardTrendPoint[];
  /** ISO-compatible snapshot update instant rendered as freshness context. */
  readonly updatedAt: string;
}

export interface AdminDashboardShellAdapter {
  /** Loads the role-aware immutable dashboard snapshot with lifecycle cancellation. */
  readonly load: (role: AdminDashboardRole, signal: AbortSignal) => Promise<AdminDashboardSnapshot>;
  /** Optionally persists read state; omission cleanly disables read actions. */
  readonly markNotificationRead?: (notificationId: string, signal: AbortSignal) => Promise<void>;
}

const FIXTURE_TIMES = {
  activityExport: "1969-12-31T23:18:00.000Z",
  activityFollowUp: "1969-12-31T22:56:00.000Z",
  activityReview: "1969-12-31T23:42:00.000Z",
  notificationEvidence: "1969-12-31T23:50:00.000Z",
  notificationExport: "1969-12-31T22:35:00.000Z",
  updated: "1970-01-01T00:00:00.000Z",
} as const;

export function createDeterministicAdminDashboardShellAdapter(): AdminDashboardShellAdapter {
  return {
    async load(_role, signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return {
        activities: [
          {
            actor: "Asha Rao",
            id: "activity-review",
            occurredAt: FIXTURE_TIMES.activityReview,
            status: "complete",
            summary: "Reviewed the component evidence bundle",
          },
          {
            actor: "Mina Park",
            id: "activity-export",
            occurredAt: FIXTURE_TIMES.activityExport,
            status: "in-progress",
            summary: "Prepared the static documentation export",
          },
          {
            actor: "Jon Bell",
            id: "activity-follow-up",
            occurredAt: FIXTURE_TIMES.activityFollowUp,
            status: "attention",
            summary: "Requested a keyboard evidence follow-up",
          },
        ],
        breadcrumbs: [
          { href: "#overview", id: "workspace", label: "Workspace" },
          { id: "operations", label: "Operations" },
        ],
        navigation: [
          {
            id: "monitoring",
            items: [
              {
                href: "#overview",
                id: "overview",
                label: "Overview",
                roles: ["analyst", "editor", "owner", "viewer"],
              },
              {
                href: "#activity",
                id: "activity",
                label: "Activity",
                roles: ["analyst", "editor", "owner"],
              },
            ],
            label: "Monitoring",
          },
          {
            id: "management",
            items: [
              {
                href: "#members",
                id: "members",
                label: "Members",
                roles: ["owner"],
              },
              {
                href: "#settings",
                id: "settings",
                label: "Settings",
                roles: ["editor", "owner"],
              },
            ],
            label: "Management",
          },
        ],
        notifications: [
          {
            createdAt: FIXTURE_TIMES.notificationEvidence,
            id: "notification-evidence",
            message: "The keyboard evidence record is ready for review.",
            read: false,
            title: "Evidence ready",
          },
          {
            createdAt: FIXTURE_TIMES.notificationExport,
            id: "notification-export",
            message: "The last static export completed without drift.",
            read: true,
            title: "Export complete",
          },
        ],
        title: "Operations overview",
        trend: [
          { id: "mon", label: "Monday", value: 18 },
          { id: "tue", label: "Tuesday", value: 24 },
          { id: "wed", label: "Wednesday", value: 21 },
          { id: "thu", label: "Thursday", value: 31 },
          { id: "fri", label: "Friday", value: 28 },
        ],
        updatedAt: FIXTURE_TIMES.updated,
      };
    },
    async markNotificationRead(_notificationId, signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    },
  };
}
