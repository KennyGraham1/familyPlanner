"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Cloud,
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
  eventsOn,
  formatDate,
  occurrenceLabel,
  recipes,
  type Recipe,
} from "@/lib/data";
import { PlannerProvider, usePlanner } from "./planner-provider";
import { Avatar, EmptyState, Modal, useDismiss } from "./ui";
import { EditorModal, type Editor } from "./forms";
import { Overview, type View } from "./overview";
import { Calendar } from "./calendar";
import { Meals, RecipeModal } from "./meals";
import { Shopping, Chores, Board } from "./lists";
import { Settings } from "./settings";
import { AuthScreen, SetupScreen, ProfileScreen } from "./onboarding";

const navigation: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: House },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "meals", label: "Meals", Icon: Utensils },
  { id: "shopping", label: "Shopping", Icon: ShoppingBasket },
  { id: "chores", label: "Chores", Icon: CheckSquare },
  { id: "board", label: "Family board", Icon: StickyNote },
];
const titles: Record<
  View,
  { title: string; button: string; editor?: Editor["kind"] }
> = {
  overview: { title: "Overview", button: "Add something", editor: "quick" },
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
    const sync = () => {
      const hash = window.location.hash.slice(1);
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
        <span className="loading-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    );
  return (
    <div className="app-shell">
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
              {eventsOn(data, today).length > 0 && <span />}
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
                onClick={() =>
                  heading.editor
                    ? open({ kind: heading.editor } as Editor)
                    : document
                        .querySelector(".recipe-library-heading")
                        ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <Plus size={17} />
                {heading.button}
              </button>
            </div>
          )}
          {syncError && household && (
            <div className="sync-warning" role="alert">
              <Cloud size={16} />
              {syncError}
              <button onClick={() => navigate("settings")}>
                Connection settings
              </button>
            </div>
          )}
          {view === "overview" && <Overview {...props} />}{" "}
          {view === "calendar" && <Calendar {...props} />}{" "}
          {view === "meals" && <Meals {...props} />}{" "}
          {view === "shopping" && <Shopping {...props} />}{" "}
          {view === "chores" && <Chores {...props} />}{" "}
          {view === "board" && <Board {...props} />}{" "}
          {view === "settings" && <Settings {...props} />}
          <div className="save-status">
            <span className={`status-dot ${syncError ? "warning" : ""}`} />
            {busy
              ? "Saving…"
              : household
                ? syncError
                  ? "Connection problem"
                  : live
                    ? "Live: family changes appear instantly"
                    : "Connected to your family space"
                : "Your plans are saved on this device"}
          </div>
        </main>
      </div>
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
          <p className="form-hint">
            These are in-app reminders. Keep Kinfolk handy to see what’s next.
          </p>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <span>{toast.error ? <X size={17} /> : <Check size={17} />}</span>
          <p>{toast.message}</p>
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
  const q = query.trim().toLowerCase();
  const results = [
    ...data.events.map((e) => ({
      id: e.id,
      title: e.title,
      detail: `Calendar · ${formatDate(e.date)}`,
      Icon: CalendarDays,
      action: () => open({ kind: "event", item: e }),
    })),
    ...data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      detail: `Chore · ${t.done ? "Done" : "To do"}`,
      Icon: CheckSquare,
      action: () => open({ kind: "task", item: t }),
    })),
    ...data.shopping.map((i) => ({
      id: i.id,
      title: i.name,
      detail: `Shopping · ${i.category}`,
      Icon: ShoppingBasket,
      action: () => open({ kind: "shopping", item: i }),
    })),
    ...recipes.map((r) => ({
      id: r.id,
      title: r.name,
      detail: `Recipe · ${r.time} minutes`,
      Icon: Utensils,
      action: () => openRecipe(r),
    })),
    ...data.notes.map((n) => ({
      id: n.id,
      title: n.title,
      detail: "Family board",
      Icon: StickyNote,
      action: () => open({ kind: "note", item: n }),
    })),
  ]
    .filter((r) => r.title.toLowerCase().includes(q))
    .slice(0, 12);
  return (
    <Modal
      title="Search"
      subtitle="Search your plans, recipes, lists and notes."
      onClose={onClose}
    >
      <label className="search-field modal-search">
        <Search size={20} />
        <input
          autoFocus
          placeholder="Try ‘pasta’, ‘football’ or ‘milk’…"
          aria-label="Search your family planner"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>esc</kbd>
      </label>
      {q ? (
        <div className="search-results">
          {results.length ? (
            results.map((r, i) => (
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
              text="Try a different word or check the spelling."
            />
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
