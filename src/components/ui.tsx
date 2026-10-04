"use client";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactElement,
  type RefObject,
} from "react";
import { ArrowRight, Check, X, type LucideIcon } from "lucide-react";
import { type Member } from "@/lib/data";

/** Whether a CSS media query matches, e.g. PHONE for phone-sized screens. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
/** Matches the phone layout breakpoint in globals.css. */
export const PHONE = "(max-width: 760px)";

/** Closes a popover on Escape or a click outside `ref`. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        onClose();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [ref, open, onClose]);
}

export function Avatar({
  member,
  small = false,
}: {
  member?: Member;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${member?.color ?? "lavender"} ${small ? "avatar-small" : ""}`}
      title={member?.name}
    >
      {member?.name.slice(0, 1).toUpperCase() ?? "?"}
    </span>
  );
}
export function AvatarGroup({ members }: { members: Member[] }) {
  return (
    <span className="avatar-group">
      {members.map((m) => (
        <Avatar key={m.id} member={m} small />
      ))}
    </span>
  );
}
export function CheckButton({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`check-button ${done ? "checked" : ""}`}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
    >
      {done && <Check size={13} strokeWidth={3} />}
    </button>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function SectionHeader({
  icon: Icon,
  title,
  action,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-header">
      <h2>
        {Icon && <Icon size={19} />} {title}
      </h2>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      focused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            {
              id: fieldId,
              "aria-describedby": hint ? `${fieldId}-hint` : undefined,
            },
          )
        : children}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </div>
  );
}
export function FormActions({
  onClose,
  saving,
  label = "Save",
  onDelete,
  deleteLabel = "Delete",
}: {
  onClose: () => void;
  saving?: boolean;
  label?: string;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <div className="form-actions">
      {onDelete && (
        <button
          type="button"
          className="button danger-quiet"
          onClick={onDelete}
          disabled={saving}
        >
          {deleteLabel}
        </button>
      )}
      <span />
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="button primary" disabled={saving}>
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}
