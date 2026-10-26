"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  useDeferredValue,
} from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Heart,
  House,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShoppingBasket,
  Sparkles,
  StickyNote,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  dateKey,
  dateSchema,
  eventsOn,
  occurrenceLabel,
  allRecipes,
  type Recipe,
} from "@/lib/data";
import { offlineMessage } from "@/lib/network";
import { registerServiceWorker } from "@/lib/service-worker";
import { PlannerProvider, usePlanner } from "./planner-provider";
import { Avatar, EmptyState, Modal, useDismiss } from "./ui";
import { EditorModal, type Editor } from "./forms";
import { Overview, type View } from "./overview";
import { Calendar } from "./calendar";
import { Meals, RecipeModal } from "./meals";
import { Shopping, Chores, Board } from "./lists";
import { Settings } from "./settings";
import { AuthScreen, SetupScreen, ProfileScreen } from "./onboarding";
import { GoogleCalendarAutoSync } from "./google-calendar";
import { DeviceReminders } from "./device-reminders";
import { FamilyTools } from "./family-tools";
import { plannerSearch, buildSearchIndex, type SearchKind } from "@/lib/search";

const navigation: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Today", Icon: House },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "meals", label: "Meals", Icon: Utensils },
  { id: "shopping", label: "Shopping", Icon: ShoppingBasket },
  { id: "chores", label: "Chores", Icon: CheckSquare },
  { id: "board", label: "Family board", Icon: StickyNote },
  { id: "tools", label: "Family tools", Icon: Users },
];
// Phone tab bar: the four places families visit daily; the rest live under "More".
const tabs: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Today", Icon: House },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "shopping", label: "Shopping", Icon: ShoppingBasket },
  { id: "chores", label: "Chores", Icon: CheckSquare },
];
const titles: Record<
  View,
  { title: string; button: string; editor?: Editor["kind"] }
> = {
  overview: { title: "Today", button: "Add something", editor: "quick" },
  calendar: {
    title: "Family calendar",
    button: "Add an event",
    editor: "event",
  },
  meals: { title: "Meal planner", button: "Browse recipes" },
  shopping: {
    title: "Shopping list",
    button: "Add an item",
    editor: "shopping",
  },
  chores: { title: "Chores", button: "Add a chore", editor: "task" },
  board: { title: "Family board", button: "Leave a note", editor: "note" },
  tools: { title: "Family tools", button: "Weekly review" },
  settings: {
    title: "Family settings",
    button: "Add a member",
    editor: "member",
  },
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function PlannerApp() {
  return (
    <PlannerProvider>
      <SessionView />
    </PlannerProvider>
  );
}
function SessionView() {
  const { household, userId } = usePlanner();
  return <AppContent key={household ?? userId ?? "local"} />;
}
function AppContent() {
  const {
    data,
    phase,
    toast,
    dismissToast,
    household,
    syncError,
    busy,
    live,
    connection,
    email,
    currentMemberId,
    signOut,
  } = usePlanner();
  const [view, setView] = useState<View>("overview");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  useDismiss(accountMenu, accountOpen, closeAccount);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    // Lets the app open without a connection (production builds only).
    void registerServiceWorker()?.catch(() => undefined);
  }, []);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1).split("?")[0];
      setView(Object.hasOwn(titles, hash) ? (hash as View) : "overview");
    };
    sync();
    window.addEventListener("hashchange", sync);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    const showLinkedPlan = () => {
      if (phase !== "ready") return;
      const [section, query] = window.location.hash.slice(1).split("?");
      if (!query) return;
      const params = new URLSearchParams(query);
      if (section === "calendar" && params.get("event")) {
        const event = data.events.find((e) => e.id === params.get("event"));
        if (event)
          setEditor({
            kind: "event",
            item: event,
            ...(dateSchema.safeParse(params.get("day")).success
              ? { day: params.get("day")! }
              : {}),
          });
      }
      if (section === "chores" && params.get("task")) {
        const task = data.tasks.find((t) => t.id === params.get("task"));
        if (task) setEditor({ kind: "task", item: task });
      }
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#${section}`,
      );
    };
    showLinkedPlan();
    window.addEventListener("hashchange", showLinkedPlan);
    return () => window.removeEventListener("hashchange", showLinkedPlan);
  }, [phase, data.events, data.tasks]);
  function navigate(next: View) {
    setView(next);
    window.location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openAccount() {
    navigate("settings");
    requestAnimationFrame(() => {
      const account = document.getElementById("account");
      account?.scrollIntoView({ behavior: "smooth", block: "start" });
      account?.querySelector<HTMLInputElement>("input[type=email]")?.focus({
        preventScroll: true,
      });
    });
  }
  // The page's main action, shared by its heading button and the phone + button.
  function pageAction() {
    if (view === "tools") {
      document.getElementById("tool-review")?.click();
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (view === "shopping") {
      // Adding is quickest in the list's own box: focus it and open the keyboard.
      const input = document.querySelector<HTMLInputElement>(
        ".quick-add-form input",
      );
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
    } else if (heading.editor) open({ kind: heading.editor } as Editor);
    else
      document
        .querySelector(".recipe-library-heading")
        ?.scrollIntoView({ behavior: "smooth" });
  }
  function open(value: Editor) {
    setRecipe(null);
    setEditor(value);
  }
  const props = { navigate, open, openRecipe: (r: Recipe) => setRecipe(r) };
  const current =
    data.members.find((m) => m.id === currentMemberId) ?? data.members[0];
  const remaining = data.shopping.filter((i) => !i.done).length;
  const today = dateKey(new Date());
  const heading = titles[view];
  const tasksDone = data.tasks.filter((t) => t.done).length;
  const subtitle = {
    shopping: data.shopping.length
      ? `${remaining} to buy · ${data.shopping.length - remaining} in the bag`
      : "",
    chores: data.tasks.length
      ? `${tasksDone} of ${data.tasks.length} done`
      : "",
    board: plural(data.notes.length, "note"),
  }[view as string];
  if (phase === "signin") return <AuthScreen />;
  if (phase === "setup") return <SetupScreen />;
  if (phase === "profile") return <ProfileScreen />;
  if (phase === "loading")
    return (
      <div className="loading-screen">
        <span className="brand-icon">
          <House size={28} />
          <Heart size={12} />
        </span>
        <strong>kinfolk.</strong>
        <p>Loading your family planner…</p>
        {connection !== "connected" ? (
          <p role="status">{offlineMessage()}</p>
        ) : (
          syncError && <p role="status">{syncError}</p>
        )}
        <span className="loading-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    );
  return (
    <div className="app-shell">
      <GoogleCalendarAutoSync />
      <DeviceReminders />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Main navigation"
      >
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="Kinfolk home"
        >
          <span className="brand-icon">
            <House size={27} />
            <Heart size={11} />
          </span>
          <span>
            kinfolk<span className="brand-period">.</span>
          </span>
        </button>
        <button
          className="family-switcher"
          onClick={() => navigate("settings")}
        >
          <span className="family-switcher-icon">
            <Users size={19} />
          </span>
          <span>
            <strong>{data.settings.familyName}</strong>
            <small>{plural(data.members.length, "member")}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav>
          {navigation.map(({ id, label, Icon }) => (
            <a
              href={`#${id}`}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              key={id}
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {id === "shopping" && remaining > 0 && (
                <span className="nav-count">{remaining}</span>
              )}
              {id === "board" && data.notes.some((n) => n.pinned) && (
                <span className="nav-new-dot" />
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-family">
          <div className="sidebar-section-heading">
            <span className="nav-section-label">FAMILY</span>
            <button
              className="icon-button small"
              aria-label="Add family member"
              onClick={() => open({ kind: "member" })}
            >
              <Plus size={15} />
            </button>
          </div>
          {data.members.map((m) => (
            <button
              className="sidebar-member"
              key={m.id}
              onClick={() => open({ kind: "member", item: m })}
            >
              <Avatar member={m} small />
              <span>
                {m.name}
                {m.id === current.id && <small> (you)</small>}
              </span>
              <span className={`member-dot ${m.color}`} />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item settings-nav ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={19} />
            <span>Family settings</span>
          </button>
          {email && (
            <button
              className="nav-item signout-nav"
              onClick={() => void signOut()}
            >
              <LogOut size={19} />
              <span>Sign out</span>
            </button>
          )}
          <button className="sidebar-profile" onClick={openAccount}>
            <Avatar member={current} />
            <span>
              <strong>{current.name}</strong>
              <small>{email ?? "Not signed in"}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              <House size={15} />
              <ChevronRight size={13} />
              <span>
                {navigation.find((n) => n.id === view)?.label ??
                  "Family settings"}
              </span>
            </span>
          </div>
          <div className="topbar-right">
            <button
              className="global-search"
              aria-label="Search family planner"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Search…</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label="See today’s reminders"
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell size={19} />
              {(eventsOn(data, today).length > 0 ||
                data.tasks.some((t) => !t.done && t.due <= today)) && <span />}
            </button>
            {email ? (
              <div className="account-menu-wrap" ref={accountMenu}>
                <button
                  className="profile-button"
                  aria-label={`Account: ${email}`}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen(!accountOpen)}
                >
                  <Avatar member={current} small />
                </button>
                {accountOpen && (
                  <div className="account-menu" role="menu">
                    <div className="account-menu-who">
                      <strong>{current.name}</strong>
                      <small>{email}</small>
                    </div>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        openAccount();
                      }}
                    >
                      <SettingsIcon size={16} /> Account settings
                    </button>
                    <button
                      role="menuitem"
                      className="account-menu-signout"
                      onClick={() => {
                        setAccountOpen(false);
                        void signOut();
                      }}
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="button secondary signin-button"
                onClick={openAccount}
              >
                <LogIn size={16} />
                Sign in
              </button>
            )}
          </div>
        </header>
        <main className="main-content" id="main-content">
          {view !== "overview" && (
            <div className="page-heading">
              <div>
                <h1>{heading.title}</h1>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button
                className="button primary heading-action"
                onClick={pageAction}
              >
                <Plus size={17} />
                {heading.button}
              </button>
            </div>
          )}
          {household && connection === "offline" ? (
            // Calm and polite: the app keeps working with the last saved plans.
            <div className="connection-notice" role="status">
              <CloudOff size={16} />
              {offlineMessage()}
            </div>
          ) : (
            syncError &&
            household && (
              <div className="sync-warning" role="alert">
                <Cloud size={16} />
                {syncError}
                <button onClick={() => navigate("settings")}>
                  Connection settings
                </button>
              </div>
            )
          )}
          {view === "overview" && <Overview {...props} />}{" "}
          {view === "calendar" && <Calendar {...props} />}{" "}
          {view === "meals" && <Meals {...props} />}{" "}
          {view === "shopping" && <Shopping {...props} />}{" "}
          {view === "chores" && <Chores {...props} />}{" "}
          {view === "board" && <Board {...props} />}{" "}
          {view === "settings" && <Settings {...props} />}
          {view === "tools" && <FamilyTools {...props} />}
          <div className="save-status">
            <span
              className={`status-dot ${syncError || connection === "offline" ? "warning" : ""}`}
            />
            {busy
              ? "Saving…"
              : household
                ? connection === "offline"
                  ? "Offline: showing your last saved plans"
                  : syncError
                    ? "Connection problem"
                    : live
                      ? "Live: family changes appear instantly"
                      : "Connected to your family space"
                : "Your plans are saved on this device"}
          </div>
        </main>
      </div>
      <button className="fab" aria-label={heading.button} onClick={pageAction}>
        <Plus size={26} />
      </button>
      <nav className="tab-bar" aria-label="Sections">
        {tabs.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(id);
            }}
          >
            <Icon size={22} strokeWidth={view === id ? 2.2 : 1.8} />
            <span>{label}</span>
            {id === "shopping" && remaining > 0 && (
              <i className="tab-count">{remaining}</i>
            )}
          </a>
        ))}
        <button
          className={tabs.some((t) => t.id === view) ? "" : "active"}
          aria-label="More: meals, family board and settings"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={22} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>
      {editor && (
        <EditorModal
          key={
            editor.kind +
            ("item" in editor ? (editor.item?.id ?? "new") : "new")
          }
          editor={editor}
          onClose={() => setEditor(null)}
          open={open}
        />
      )}
      {recipe && (
        <RecipeModal recipe={recipe} onClose={() => setRecipe(null)} />
      )}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          navigate={navigate}
          open={(e) => {
            setSearchOpen(false);
            open(e);
          }}
          openRecipe={(r) => {
            setSearchOpen(false);
            setRecipe(r);
          }}
        />
      )}
      {notificationsOpen && (
        <Modal
          title="Today"
          subtitle="Events and chores due today."
          onClose={() => setNotificationsOpen(false)}
        >
          <div className="notification-list">
            {eventsOn(data, today).map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setNotificationsOpen(false);
                  open({ kind: "event", item: e });
                }}
              >
                <span className="quick-icon lavender">
                  <CalendarDays size={20} />
                </span>
                <span>
                  <strong>{e.title}</strong>
                  <small>
                    Today · {occurrenceLabel(e, today)}
                    {e.location ? " · " + e.location : ""}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {data.tasks
              .filter((t) => !t.done && t.due <= today)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setNotificationsOpen(false);
                    open({ kind: "task", item: t });
                  }}
                >
                  <span className="quick-icon sage">
                    <CheckSquare size={20} />
                  </span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {data.members.find((m) => m.id === t.memberId)?.name} ·{" "}
                      {t.due < today ? "Overdue" : "Due today"}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            {!eventsOn(data, today).length &&
              !data.tasks.some((t) => !t.done && t.due <= today) && (
                <EmptyState
                  icon={Sparkles}
                  title="All caught up"
                  text="Nothing due today."
                />
              )}
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setNotificationsOpen(false);
              navigate("tools");
              requestAnimationFrame(() =>
                document.getElementById("tool-activity")?.click(),
              );
            }}
          >
            Recent family changes
          </button>
          <p className="form-hint">
            Choose event and chore notifications for this device in notification
            settings.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setNotificationsOpen(false);
              navigate("settings");
              requestAnimationFrame(() =>
                document
                  .getElementById("phone-reminders")
                  ?.scrollIntoView({ block: "start" }),
              );
            }}
          >
            <Bell size={16} /> Notification settings
          </button>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <span>{toast.error ? <X size={17} /> : <Check size={17} />}</span>
          <p>{toast.message}</p>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={dismissToast}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function SearchModal({
  onClose,
  navigate,
  open,
  openRecipe,
}: {
  onClose: () => void;
  navigate: (v: View) => void;
  open: (e: Editor) => void;
  openRecipe: (r: Recipe) => void;
}) {
  const { data } = usePlanner();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchKind | "All">("All");
  const [limit, setLimit] = useState(20);
  const q = query.trim();
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const deferredQuery = useDeferredValue(q);
  const matches = useMemo(
    () => plannerSearch(data, deferredQuery, filter, new Date(), index),
    [data, deferredQuery, filter, index],
  );
  const results = matches.map((entry) => ({
    ...entry,
    Icon: {
      Calendar: CalendarDays,
      Recipes: Utensils,
      Chores: CheckSquare,
      Shopping: ShoppingBasket,
      Notes: StickyNote,
      Routines: CheckSquare,
      Pantry: ShoppingBasket,
      Spending: House,
    }[entry.kind],
    action: () => {
      if (entry.kind === "Calendar") {
        const item = data.events.find((e) => e.id === entry.id);
        if (item) open({ kind: "event", item });
      } else if (entry.kind === "Recipes") {
        const recipe = allRecipes(data).find((r) => r.id === entry.id);
        if (recipe) openRecipe(recipe);
      } else if (entry.kind === "Chores") {
        const item = data.tasks.find((e) => e.id === entry.id);
        if (item) open({ kind: "task", item });
      } else if (entry.kind === "Shopping") {
        const item = data.shopping.find((e) => e.id === entry.id);
        if (item) open({ kind: "shopping", item });
      } else if (entry.kind === "Notes") {
        const item = data.notes.find((e) => e.id === entry.id);
        if (item) open({ kind: "note", item });
      } else {
        onClose();
        navigate("tools");
        requestAnimationFrame(() =>
          document.getElementById(`tool-${entry.kind.toLowerCase()}`)?.click(),
        );
      }
    },
  }));
  return (
    <Modal
      title="Search"
      subtitle="Search titles, ingredients, places, people and notes. Try ‘chores overdue’ or ‘events tomorrow’."
      onClose={onClose}
    >
      <label className="search-field modal-search">
        <Search size={20} />
        <input
          autoFocus
          placeholder="Try ‘pasta’, ‘football’ or ‘milk’…"
          aria-label="Search your family planner"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(20);
          }}
        />
        <kbd>esc</kbd>
      </label>
      <div className="family-filters search-filters">
        {(
          ["All", "Calendar", "Recipes", "Chores", "Shopping", "Notes"] as const
        ).map((kind) => (
          <button
            key={kind}
            className={`filter-chip ${filter === kind ? "active" : ""}`}
            aria-pressed={filter === kind}
            onClick={() => {
              setFilter(kind);
              setLimit(20);
            }}
          >
            {kind}
          </button>
        ))}
      </div>
      {q ? (
        <div className="search-results">
          <p className="form-hint" role="status">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </p>
          {results.length ? (
            results.slice(0, limit).map((r, i) => (
              <button key={`${r.id}-${i}`} onClick={r.action}>
                <r.Icon size={19} />
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.detail}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))
          ) : (
            <EmptyState
              icon={Search}
              title="No matches"
              text="Try a dish, ingredient, location or family member. Short phrases work best."
            />
          )}
          {results.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit(limit + 20)}
            >
              Show more matches
            </button>
          )}
        </div>
      ) : (
        <>
          <span className="search-quick-label">JUMP TO</span>
          <div className="search-results">
            {navigation.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  onClose();
                  navigate(n.id);
                }}
              >
                <n.Icon size={19} />
                <span>{n.label}</span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
