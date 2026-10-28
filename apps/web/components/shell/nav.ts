// Sidebar order from SPEC §8. `phase` = the build phase that delivers the module.
// Items whose phase hasn't shipped render as disabled placeholders.
export const SHIPPED_PHASE = 1;

export type NavItem = { slug: string; label: string; phase: number; icon: string; tabs?: string[] };

export const LOCATION_NAV: NavItem[] = [
  { slug: "dashboard", label: "Dashboard", phase: 1, icon: "LayoutDashboard" },
  { slug: "conversations", label: "Conversations", phase: 3, icon: "MessagesSquare" },
  { slug: "calendars", label: "Calendars", phase: 3, icon: "CalendarDays" },
  { slug: "contacts", label: "Contacts", phase: 1, icon: "Users", tabs: ["Contacts", "Smart Lists", "Companies", "Tasks"] },
  { slug: "opportunities", label: "Opportunities", phase: 2, icon: "KanbanSquare", tabs: ["Pipelines", "Opportunities list"] },
  { slug: "automation", label: "Automation", phase: 4, icon: "Workflow", tabs: ["Workflows", "Snippets", "Templates"] },
  { slug: "sites", label: "Sites", phase: 3, icon: "Globe", tabs: ["Forms", "Surveys", "Booking pages"] },
  { slug: "marketing", label: "Marketing", phase: 4, icon: "Megaphone", tabs: ["Broadcasts", "Reviews"] },
  { slug: "payments", label: "Payments", phase: 4, icon: "CreditCard", tabs: ["Invoices", "Proposals"] },
  { slug: "reporting", label: "Reporting", phase: 4, icon: "BarChart3" },
  { slug: "settings", label: "Settings", phase: 1, icon: "Settings" },
];

export const AGENCY_NAV: NavItem[] = [
  { slug: "", label: "Agency dashboard", phase: 1, icon: "LayoutDashboard" },
  { slug: "sub-accounts", label: "Sub-accounts", phase: 1, icon: "Building2" },
  { slug: "snapshots", label: "Snapshots", phase: 4, icon: "Copy" },
  { slug: "reporting", label: "Agency reporting", phase: 4, icon: "BarChart3" },
  { slug: "team", label: "Team", phase: 1, icon: "UserCog" },
  { slug: "settings", label: "Agency settings", phase: 1, icon: "Settings" },
];

// SPEC §8 settings list. `phase` = when the page stops being a placeholder.
export const SETTINGS_NAV: { slug: string; label: string; phase: number }[] = [
  { slug: "business-profile", label: "Business profile", phase: 1 },
  { slug: "users", label: "Users", phase: 1 },
  { slug: "custom-fields", label: "Custom fields", phase: 2 },
  { slug: "tags", label: "Tags", phase: 2 },
  { slug: "pipelines", label: "Pipelines", phase: 2 },
  { slug: "calendars", label: "Calendars", phase: 3 },
  { slug: "phone-numbers", label: "Phone numbers", phase: 3 },
  { slug: "email-domains", label: "Email domains", phase: 3 },
  { slug: "integrations", label: "Integrations", phase: 3 },
  { slug: "api-keys", label: "API keys", phase: 4 },
  { slug: "webhooks", label: "Webhooks", phase: 4 },
];
