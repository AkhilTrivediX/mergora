"use client";

import "./admin-dashboard-shell.css";

import { useId, useMemo, useState, type HTMLAttributes } from "react";

import { Alert } from "../../components/alert/alert.js";
import { Badge } from "../../components/badge/badge.js";
import { Breadcrumb } from "../../components/breadcrumb/breadcrumb.js";
import { Button } from "../../components/button/button.js";
import { Chart } from "../../components/chart/chart.js";
import { DataTable, type DataTableColumn } from "../../components/data-table/data-table.js";
import { EmptyState } from "../../components/empty-state/empty-state.js";
import { Navbar } from "../../components/navbar/navbar.js";
import { Sidebar, type SidebarGroup } from "../../components/sidebar/sidebar.js";
import { Skeleton } from "../../components/skeleton/skeleton.js";
import type {
  AdminDashboardActivity,
  AdminDashboardRole,
  AdminDashboardShellAdapter,
} from "./admin-dashboard-shell-adapter.js";
import { useAdminDashboardShell } from "./admin-dashboard-shell-state.js";

export interface AdminDashboardShellProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onChange"
> {
  /** Consumer adapter that owns dashboard data, authorization, and notification persistence. */
  readonly adapter: AdminDashboardShellAdapter;
  /** Controlled current navigation section identifier; use with `onSectionChange`. */
  readonly currentSectionId?: string;
  /** Initial navigation section identifier for uncontrolled use. */
  readonly defaultSectionId?: string;
  /** Enables chart interaction; false keeps the chart as a static readable summary. */
  readonly interactiveChart?: boolean;
  /** Prevents adapter requests and presents explicit offline recovery context. */
  readonly offline?: boolean;
  /** Reports controlled or uncontrolled dashboard section changes. */
  readonly onSectionChange?: (sectionId: string) => void;
  /** Filters navigation by the supplied role; false shows the adapter's complete navigation. */
  readonly permissionFilteredNavigation?: boolean;
  /** Current dashboard role used for loading and optional navigation filtering. */
  readonly role?: AdminDashboardRole;
  /** Adds activity filtering and sorting controls; false removes query UI while retaining the table. */
  readonly showActivityQueryTools?: boolean;
  /** Adds a tabular trend alternative; false removes the duplicate table semantics. */
  readonly showChartDataTable?: boolean;
  /** Adds notification review and optional read actions; false removes that entire surface. */
  readonly showNotifications?: boolean;
  /** Adds visible role context near the dashboard heading; false removes that explanatory output. */
  readonly showRoleContext?: boolean;
}

const activityColumns: readonly DataTableColumn<AdminDashboardActivity>[] = [
  {
    cell: (row) => row.summary,
    filterValue: (row) => `${row.summary} ${row.actor} ${row.status}`,
    header: "Activity",
    id: "summary",
    sortable: true,
    sortValue: (row) => row.summary,
  },
  {
    cell: (row) => row.actor,
    filterValue: (row) => row.actor,
    header: "Owner",
    id: "actor",
    sortable: true,
    sortValue: (row) => row.actor,
  },
  {
    cell: (row) => (
      <Badge
        kind="status"
        variant={
          row.status === "complete" ? "success" : row.status === "attention" ? "warning" : "info"
        }
      >
        {row.status === "in-progress" ? "In progress" : row.status}
      </Badge>
    ),
    header: "Status",
    id: "status",
    sortable: true,
    sortValue: (row) => row.status,
  },
  {
    cell: (row) =>
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(row.occurredAt),
      ),
    header: "Updated",
    id: "updated",
    sortable: true,
    sortValue: (row) => row.occurredAt,
  },
];

export function AdminDashboardShell({
  adapter,
  className,
  currentSectionId,
  defaultSectionId = "overview",
  interactiveChart = false,
  offline = false,
  onSectionChange,
  permissionFilteredNavigation = false,
  role = "owner",
  showActivityQueryTools = false,
  showChartDataTable = false,
  showNotifications = false,
  showRoleContext = false,
  ...props
}: AdminDashboardShellProps) {
  const dashboard = useAdminDashboardShell({ adapter, offline, role });
  const [uncontrolledSection, setUncontrolledSection] = useState(defaultSectionId);
  const selectedSection = currentSectionId ?? uncontrolledSection;
  const mainId = `mrg-admin-dashboard-main-${useId().replaceAll(":", "")}`;
  const snapshot = dashboard.snapshot;
  const navigation = useMemo<readonly SidebarGroup[]>(() => {
    if (snapshot === null) return [];
    return snapshot.navigation
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => !permissionFilteredNavigation || item.roles.includes(role))
          .map(({ roles: _roles, ...item }) => item),
      }))
      .filter((group) => group.items.length > 0);
  }, [permissionFilteredNavigation, role, snapshot]);

  const chooseSection = (sectionId: string) => {
    if (currentSectionId === undefined) setUncontrolledSection(sectionId);
    onSectionChange?.(sectionId);
  };

  return (
    <div
      {...props}
      className={
        className === undefined
          ? "mrg-admin-dashboard-shell"
          : `mrg-admin-dashboard-shell ${className}`
      }
      data-slot="admin-dashboard-shell"
    >
      <Navbar
        brand={<strong>Mergora workspace</strong>}
        currentId="dashboard"
        items={[
          { href: "#dashboard", id: "dashboard", label: "Dashboard" },
          { href: "#evidence", id: "evidence", label: "Evidence" },
          { href: "#settings", id: "settings", label: "Settings" },
        ]}
        label="Workspace navigation"
        onNavigate={(event, item) => {
          event.preventDefault();
          chooseSection(item.id);
        }}
        skipLink={{ href: `#${mainId}`, label: "Skip to dashboard content" }}
      />
      {dashboard.state === "loading" ? (
        <div
          aria-busy="true"
          aria-label="Loading dashboard"
          data-slot="admin-dashboard-loading"
          role="status"
        >
          <Skeleton blockSize={40} />
          <Skeleton blockSize={160} />
          <span>Loading dashboard…</span>
        </div>
      ) : null}
      {dashboard.state === "error" ? (
        <Alert
          actions={<Button onClick={() => void dashboard.reload()}>Retry dashboard</Button>}
          description={dashboard.error || "The dashboard could not continue."}
          title="Dashboard unavailable"
          variant="error"
        />
      ) : null}
      {dashboard.state === "offline" ? (
        <Alert
          description="Reconnect to refresh activity and notification state. Previously supplied content remains consumer-owned."
          title="Dashboard is offline"
          variant="warning"
        />
      ) : null}
      {snapshot === null ? null : (
        <div data-slot="admin-dashboard-layout">
          <Sidebar
            {...(navigation.some((group) => group.items.some((item) => item.id === selectedSection))
              ? { currentId: selectedSection }
              : {})}
            groups={navigation}
            label="Dashboard sections"
            onNavigate={(event, item) => {
              event.preventDefault();
              chooseSection(item.id);
            }}
          />
          <main data-slot="admin-dashboard-main" id={mainId} tabIndex={-1}>
            <Breadcrumb
              collapse
              items={snapshot.breadcrumbs.map((item, index) => ({
                ...item,
                current: index === snapshot.breadcrumbs.length - 1,
              }))}
            />
            <header data-slot="admin-dashboard-heading">
              <div>
                <h1>{snapshot.title}</h1>
                <p>
                  Updated{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date(snapshot.updatedAt))}
                </p>
              </div>
              {showRoleContext ? (
                <p data-slot="admin-dashboard-role-context">
                  Navigation preview for the <strong>{role}</strong> role. Backend authorization
                  remains consumer-owned.
                </p>
              ) : null}
            </header>
            {dashboard.state === "empty" ? (
              <EmptyState
                context="first-use"
                description="The adapter returned no trend or activity records."
                primaryAction={
                  <Button onClick={() => void dashboard.reload()}>Refresh dashboard</Button>
                }
                title="No dashboard evidence yet"
              />
            ) : (
              <>
                <section aria-labelledby={`${mainId}-trend`} data-slot="admin-dashboard-trend">
                  <h2 id={`${mainId}-trend`}>Review activity</h2>
                  <Chart
                    dataTableFallback={showChartDataTable ? "visible" : "disclosure"}
                    description="Completed evidence reviews during the current working week."
                    interactive={interactiveChart}
                    name="Weekly evidence reviews"
                    points={snapshot.trend}
                    valueLabel="Reviews"
                  />
                </section>
                <section
                  aria-labelledby={`${mainId}-activity`}
                  data-slot="admin-dashboard-activity"
                >
                  <h2 id={`${mainId}-activity`}>Recent activity</h2>
                  <DataTable
                    caption="Recent workspace activity"
                    columns={activityColumns}
                    getRowId={(row) => row.id}
                    paginated={showActivityQueryTools}
                    rows={snapshot.activities}
                    searchable={showActivityQueryTools}
                    showQuerySummary={showActivityQueryTools}
                  />
                </section>
              </>
            )}
            {showNotifications ? (
              <aside
                aria-labelledby={`${mainId}-notifications`}
                data-slot="admin-dashboard-notifications"
              >
                <div>
                  <h2 id={`${mainId}-notifications`}>Notifications</h2>
                  <Badge
                    count={snapshot.notifications.filter((item) => !item.read).length}
                    kind="count"
                    label="Unread notifications"
                  />
                </div>
                {snapshot.notifications.length === 0 ? (
                  <p>No notifications.</p>
                ) : (
                  <ul>
                    {snapshot.notifications.map((notification) => (
                      <li data-read={notification.read || undefined} key={notification.id}>
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                        </div>
                        {notification.read || adapter.markNotificationRead === undefined ? null : (
                          <Button
                            onClick={() => void dashboard.markNotificationRead(notification.id)}
                            size="small"
                            variant="quiet"
                          >
                            Mark read
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}

export const AdminDashboardShellPage = AdminDashboardShell;
