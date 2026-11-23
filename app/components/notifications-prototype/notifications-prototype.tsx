// PROTOTYPE — throwaway. Four radically different in-app Notification views,
// mounted in the real app shell (sidebar + main) and switchable with
// ?variant=A|B|C|D and the floating bar at the bottom (← / → keys).
// Data is mock and in memory (mock-data.ts); reloading resets it.
//
//   A  Bell dropdown      — bell in the sidebar header, popover list
//   B  Split drawer       — right-hand drawer, "Needs action" vs "Updates" tabs
//   C  Inbox page         — sidebar "Inbox" item, two-pane inbox over main
//   D  Ambient            — no inbox: action banner on top + toasts

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  Inbox,
  Mail,
  X,
  Zap,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { Button } from "~/components/ui/button";
import {
  incomingFor,
  mockNotificationsFor,
  timeAgo,
  type MockNotification,
} from "./mock-data";
import { PrototypeSwitcher } from "./prototype-switcher";

const VARIANTS = [
  { key: "A", name: "Bell dropdown" },
  { key: "B", name: "Split drawer" },
  { key: "C", name: "Inbox page" },
  { key: "D", name: "Ambient: banner + toasts" },
];

// Unread = informational and unread, or an Action Notification still open.
const isOpenAction = (x: MockNotification) =>
  x.kind === "action" && !x.decidedBy;
const isUnread = (x: MockNotification) =>
  x.kind === "action" ? isOpenAction(x) : !x.read;

export function useNotificationsPrototype({
  role,
  isTeamAdmin,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
}) {
  const [params] = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const navigate = useNavigate();
  const [items, setItems] = useState(() =>
    mockNotificationsFor(role, isTeamAdmin)
  );
  const [open, setOpen] = useState(false);

  // Reset when the dev user switches.
  useEffect(() => {
    setItems(mockNotificationsFor(role, isTeamAdmin));
  }, [role, isTeamAdmin]);

  useEffect(() => setOpen(false), [variant]);

  const unread = items.filter(isUnread).length;
  const openActions = items.filter(isOpenAction).length;

  const api: Api = {
    items,
    unread,
    open,
    setOpen,
    markRead: (id) =>
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x))),
    markAllRead: () => setItems((xs) => xs.map((x) => ({ ...x, read: true }))),
    follow: (x) => {
      setItems((xs) => xs.map((y) => (y.id === x.id ? { ...y, read: true } : y)));
      setOpen(false);
      navigate(x.href);
    },
  };

  function simulateIncoming() {
    const x = incomingFor(role);
    setItems((xs) => [x, ...xs]);
    if (variant === "D" || variant === "A")
      toast(x.title, {
        description: x.body,
        action: x.cta
          ? { label: x.cta, onClick: () => api.follow(x) }
          : undefined,
      });
  }

  function simulateOtherAdminDecides() {
    setItems((xs) => {
      const i = xs.findIndex(isOpenAction);
      if (i < 0) return xs;
      const copy = [...xs];
      copy[i] = { ...copy[i], decidedBy: "Sam Lee decided it" };
      return copy;
    });
  }

  const switcher = (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={variant}
      extra={
        <div className="ml-2 flex items-center gap-2 border-l border-white/20 pl-3 font-mono text-xs">
          <span title="State">
            unread {unread} · open actions {openActions} · total {items.length}
          </span>
          <button
            onClick={simulateIncoming}
            className="rounded-full bg-fuchsia-600 px-2 py-0.5 hover:bg-fuchsia-500"
          >
            + incoming
          </button>
          {role === UserRole.Admin && (
            <button
              onClick={simulateOtherAdminDecides}
              className="rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/25"
            >
              other admin decides
            </button>
          )}
        </div>
      }
    />
  );

  let headerSlot: React.ReactNode = null;
  let navSlot: React.ReactNode = null;
  let overlay: React.ReactNode = null;

  if (variant === "A") {
    headerSlot = <BellButton api={api} />;
    overlay = open ? <VariantADropdown api={api} /> : null;
  } else if (variant === "B") {
    headerSlot = <BellButton api={api} />;
    overlay = open ? <VariantBDrawer api={api} /> : null;
  } else if (variant === "C") {
    navSlot = <InboxNavItem api={api} />;
    overlay = open ? <VariantCInbox api={api} /> : null;
  } else {
    overlay = <VariantDAmbient api={api} role={role} />;
  }

  return {
    headerSlot,
    navSlot,
    overlay: (
      <>
        {overlay}
        {switcher}
      </>
    ),
  };
}

type Api = {
  items: MockNotification[];
  unread: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  follow: (x: MockNotification) => void;
};

// ─── Shared bits (small on purpose; layouts are per-variant) ───

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Meta({ x }: { x: MockNotification }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{timeAgo(x.minutesAgo)}</span>
      {x.course && <span>· {x.course}</span>}
      {x.channels.includes("email") && (
        <span className="inline-flex items-center gap-1" title="Also sent by email">
          · <Mail className="size-3" /> email too
        </span>
      )}
      {x.badge && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {x.badge}
        </span>
      )}
      {x.needsPaymentProvider && (
        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          ⚠ needs payment provider
        </span>
      )}
    </div>
  );
}

function BellButton({ api }: { api: Api }) {
  return (
    <button
      onClick={() => api.setOpen(!api.open)}
      className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
      title="Notifications"
    >
      <Bell className="size-4" />
      <span className="absolute -right-1 -top-1">
        <UnreadBadge count={api.unread} />
      </span>
    </button>
  );
}

// ─── A: Bell dropdown ───

function VariantADropdown({ api }: { api: Api }) {
  const ref = useRef<HTMLDivElement>(null);
  const actions = api.items.filter((x) => x.kind === "action");
  const infos = api.items.filter((x) => x.kind === "info");

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => api.setOpen(false)} />
      <div
        ref={ref}
        className="fixed left-56 top-2 z-50 ml-2 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">Notifications</span>
          <button
            onClick={api.markAllRead}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        <div className="overflow-y-auto">
          {actions.length > 0 && (
            <div className="border-b bg-amber-50/60 dark:bg-amber-950/20">
              <div className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Needs action
              </div>
              {actions.map((x) => (
                <RowA key={x.id} x={x} api={api} />
              ))}
            </div>
          )}
          {infos.map((x) => (
            <RowA key={x.id} x={x} api={api} />
          ))}
        </div>
      </div>
    </>
  );
}

function RowA({ x, api }: { x: MockNotification; api: Api }) {
  const decided = x.kind === "action" && x.decidedBy;
  return (
    <button
      onClick={() => api.follow(x)}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left hover:bg-accent",
        decided && "opacity-50"
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          isUnread(x) ? "bg-blue-500" : "bg-transparent"
        )}
      />
      <span className="min-w-0">
        <span className={cn("block text-sm", isUnread(x) && "font-semibold")}>
          {x.title}
        </span>
        <span className="line-clamp-2 block text-sm text-muted-foreground">
          {x.body}
        </span>
        {decided && (
          <span className="mt-1 block text-xs font-medium">✓ {x.decidedBy}</span>
        )}
        <Meta x={x} />
      </span>
    </button>
  );
}

// ─── B: Split drawer ───

function VariantBDrawer({ api }: { api: Api }) {
  const [tab, setTab] = useState<"action" | "info">(
    api.items.some(isOpenAction) ? "action" : "info"
  );
  const actions = api.items.filter((x) => x.kind === "action");
  const infos = api.items.filter((x) => x.kind === "info");
  const list = tab === "action" ? actions : infos;
  const today = list.filter((x) => x.minutesAgo < 60 * 24);
  const earlier = list.filter((x) => x.minutesAgo >= 60 * 24);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => api.setOpen(false)}
      />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[440px] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b px-5">
          <span className="text-lg font-semibold">Notifications</span>
          <button onClick={() => api.setOpen(false)} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 border-b text-sm">
          {(
            [
              ["action", `Needs action (${actions.filter(isOpenAction).length})`],
              ["info", `Updates (${infos.filter((x) => !x.read).length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "py-3 font-medium",
                tab === k
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {tab === "action" ? "Nothing needs you right now." : "No updates."}
            </div>
          )}
          {[
            ["Today", today],
            ["Earlier", earlier],
          ].map(([label, xs]) =>
            (xs as MockNotification[]).length ? (
              <section key={label as string}>
                <div className="bg-muted/50 px-5 py-1.5 text-xs font-semibold text-muted-foreground">
                  {label as string}
                </div>
                {(xs as MockNotification[]).map((x) => (
                  <CardB key={x.id} x={x} api={api} />
                ))}
              </section>
            ) : null
          )}
        </div>
        {tab === "info" && (
          <div className="border-t p-3 text-right">
            <Button variant="ghost" size="sm" onClick={api.markAllRead}>
              Mark all updates read
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

function CardB({ x, api }: { x: MockNotification; api: Api }) {
  const decided = x.kind === "action" && x.decidedBy;
  return (
    <div
      className={cn(
        "group border-b px-5 py-4",
        isUnread(x) && x.kind === "info" && "bg-blue-50/50 dark:bg-blue-950/20",
        decided && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{x.title}</div>
        {x.kind === "info" && !x.read && (
          <button
            onClick={() => api.markRead(x.id)}
            className="invisible text-xs text-muted-foreground hover:text-foreground group-hover:visible"
          >
            Mark read
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{x.body}</p>
      <Meta x={x} />
      {decided ? (
        <div className="mt-2 text-xs font-medium">✓ {x.decidedBy}</div>
      ) : x.cta ? (
        <Button size="sm" className="mt-3" onClick={() => api.follow(x)}>
          {x.cta}
        </Button>
      ) : null}
    </div>
  );
}

// ─── C: Inbox page ───

function InboxNavItem({ api }: { api: Api }) {
  return (
    <button
      onClick={() => api.setOpen(!api.open)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        api.open
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Inbox className="size-4" />
      Inbox
      <span className="ml-auto">
        <UnreadBadge count={api.unread} />
      </span>
    </button>
  );
}

function VariantCInbox({ api }: { api: Api }) {
  const [filter, setFilter] = useState<"all" | "unread" | "action">("all");
  const list = useMemo(
    () =>
      api.items.filter((x) =>
        filter === "all" ? true : filter === "unread" ? isUnread(x) : x.kind === "action"
      ),
    [api.items, filter]
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    api.items[0]?.id ?? null
  );
  const selected = api.items.find((x) => x.id === selectedId) ?? null;

  function select(x: MockNotification) {
    setSelectedId(x.id);
    api.markRead(x.id);
  }

  return (
    <div className="fixed bottom-0 left-56 right-0 top-0 z-30 flex flex-col bg-background">
      <div className="flex h-14 items-center gap-4 border-b px-6">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <div className="flex gap-1 text-sm">
          {(["all", "unread", "action"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1",
                filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {f === "all" ? "All" : f === "unread" ? "Unread" : "Needs action"}
            </button>
          ))}
        </div>
        <button
          onClick={api.markAllRead}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          Mark all read
        </button>
        <button onClick={() => api.setOpen(false)} className="rounded p-1 hover:bg-accent">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <ul className="w-[380px] shrink-0 overflow-y-auto border-r">
          {list.map((x) => (
            <li key={x.id}>
              <button
                onClick={() => select(x)}
                className={cn(
                  "w-full border-b px-5 py-3 text-left",
                  x.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
                  x.kind === "action" && x.decidedBy && "opacity-50"
                )}
              >
                <div className="flex items-center gap-2">
                  {x.kind === "action" && <Zap className="size-3.5 text-amber-500" />}
                  <span className={cn("truncate text-sm", isUnread(x) && "font-semibold")}>
                    {x.title}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {timeAgo(x.minutesAgo)}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{x.body}</div>
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">Inbox zero.</li>
          )}
        </ul>
        <div className="flex-1 overflow-y-auto p-10">
          {selected ? (
            <article className="max-w-xl">
              {selected.kind === "action" && (
                <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  <Zap className="size-3" /> Needs action
                </div>
              )}
              <h2 className="text-2xl font-bold">{selected.title}</h2>
              <Meta x={selected} />
              <p className="mt-6 text-base leading-relaxed">{selected.body}</p>
              {selected.kind === "action" && selected.decidedBy ? (
                <div className="mt-6 rounded-md border p-3 text-sm">
                  ✓ Already handled: {selected.decidedBy}.
                </div>
              ) : selected.cta ? (
                <Button className="mt-6" onClick={() => api.follow(selected)}>
                  {selected.cta}
                </Button>
              ) : (
                <Button variant="outline" className="mt-6" onClick={() => api.follow(selected)}>
                  Open
                </Button>
              )}
            </article>
          ) : (
            <div className="text-muted-foreground">Select a Notification.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── D: Ambient — no inbox ───

function VariantDAmbient({ api, role }: { api: Api; role: UserRole | null }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const actions = api.items.filter(isOpenAction);
  const updates = api.items.filter((x) => x.kind === "info" && !x.read);
  const shown = useRef(false);

  // On arrival, unread updates surface once as toasts, then are read.
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    updates.slice(0, 3).forEach((x, i) =>
      setTimeout(
        () =>
          toast(x.title, {
            description: x.body,
            action: x.cta ? { label: x.cta, onClick: () => api.follow(x) } : undefined,
          }),
        400 + i * 600
      )
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (dismissed) return null;

  const hasActions = actions.length > 0;
  if (!hasActions && updates.length === 0) return null;

  return (
    <div className="fixed left-56 right-0 top-0 z-30">
      <div
        className={cn(
          "flex items-center gap-3 border-b px-6 py-2.5 text-sm shadow-sm",
          hasActions
            ? "bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50"
            : "bg-blue-50 text-blue-950 dark:bg-blue-950/60 dark:text-blue-50"
        )}
      >
        {hasActions ? <CircleAlert className="size-4" /> : <Bell className="size-4" />}
        <span className="font-medium">
          {hasActions
            ? `${actions.length} ${actions.length === 1 ? "thing needs" : "things need"} you`
            : `${updates.length} ${updates.length === 1 ? "update" : "updates"} since your last visit`}
        </span>
        {hasActions && (
          <span className="truncate opacity-80">
            {actions[0].title} — {actions[0].course}
            {actions[0].badge ? ` (${actions[0].badge})` : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {hasActions && (
            <Button size="sm" onClick={() => api.follow(actions[0])}>
              {actions[0].cta ?? "Open"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Hide" : "Show all"}
          </Button>
          {!hasActions && (
            <button
              onClick={() => {
                api.markAllRead();
                setDismissed(true);
              }}
              className="rounded p-1 hover:bg-black/10"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="max-h-[50vh] overflow-y-auto border-b bg-background px-6 py-2 shadow-lg">
          {[...actions, ...updates].map((x) => (
            <div key={x.id} className="flex items-center gap-3 border-b py-2 last:border-b-0">
              {x.kind === "action" && <Zap className="size-3.5 text-amber-500" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{x.title}</div>
                <div className="truncate text-xs text-muted-foreground">{x.body}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => api.follow(x)}>
                {x.cta ?? "Open"}
              </Button>
            </div>
          ))}
          <div className="py-2 text-xs text-muted-foreground">
            No inbox in this variant: older Notifications live only in email
            {role === UserRole.Admin ? " and the Refund Requests queue" : ""}.
          </div>
        </div>
      )}
    </div>
  );
}
