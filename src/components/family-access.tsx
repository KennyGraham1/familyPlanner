"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { errorMessage } from "@/lib/errors";
import { disableDevicePush } from "@/lib/push-client";
import { usePlanner } from "./planner-provider";
import { ProfilePicker } from "./onboarding";
import { Modal, SectionHeader } from "./ui";

type Action =
  | { kind: "remove" | "transfer"; user: string; name: string }
  | { kind: "leave" };
export function FamilyAccessSettings() {
  const {
    household,
    access,
    userId,
    isOwner,
    currentMemberId,
    data,
    refreshCloud,
    notify,
    busy,
  } = usePlanner();
  const [action, setAction] = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!household) return null;
  async function confirm() {
    if (!action) return;
    setLoading(true);
    setError("");
    try {
      const procedure = {
        remove: "planner_remove_access",
        transfer: "planner_transfer_ownership",
        leave: "planner_leave_family",
      }[action.kind];
      const args =
        action.kind === "leave"
          ? { family_id: household }
          : { family_id: household, target_user: action.user };
      const { error } = await getCloud()!.rpc(procedure, args);
      if (error) throw error;
      if (action.kind === "leave") {
        try {
          await disableDevicePush();
        } catch {
          /* Membership deletion already removes reminder subscriptions. */
        }
      }
      setAction(null);
      await refreshCloud();
      notify(
        action.kind === "leave"
          ? "You’ve left the family."
          : "Family access updated.",
      );
    } catch (e) {
      setError(errorMessage(e, "Could not update family access."));
    } finally {
      setLoading(false);
    }
  }
  const title =
    action?.kind === "remove"
      ? `Remove ${action.name}’s access?`
      : action?.kind === "transfer"
        ? `Make ${action.name} the owner?`
        : "Leave this family?";
  return (
    <section className="card settings-card">
      <SectionHeader icon={Users} title="People with access" />
      <p className="settings-description">
        Your profile:{" "}
        <strong>
          {data.members.find((m) => m.id === currentMemberId)?.name}
        </strong>
      </p>
      <details className="profile-choice">
        <summary>Change my profile</summary>
        <ProfilePicker key={currentMemberId} />
      </details>
      <ul className="access-list">
        {access.map((person) => (
          <li key={person.user_id}>
            <div>
              <strong>
                {person.name}
                {person.user_id === userId ? " (you)" : ""}
              </strong>
              <small>
                {person.is_owner ? "Family owner" : "Family member"}
              </small>
            </div>
            {isOwner && person.user_id !== userId && (
              <div className="access-actions">
                <button
                  className="text-button"
                  disabled={busy}
                  aria-label={`Transfer ownership to ${person.name}`}
                  onClick={() => {
                    setError("");
                    setAction({
                      kind: "transfer",
                      user: person.user_id,
                      name: person.name,
                    });
                  }}
                >
                  Make owner
                </button>
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  aria-label={`Remove access for ${person.name}`}
                  onClick={() => {
                    setError("");
                    setAction({
                      kind: "remove",
                      user: person.user_id,
                      name: person.name,
                    });
                  }}
                >
                  Remove access
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <p className="form-hint">
          To leave, transfer ownership to another member first. Removing access
          keeps their profile and plans, and cancels existing invite codes.
        </p>
      ) : (
        <button
          className="button danger-quiet"
          disabled={busy}
          onClick={() => {
            setError("");
            setAction({ kind: "leave" });
          }}
        >
          Leave family
        </button>
      )}
      {action && (
        <Modal
          title={title}
          onClose={() => {
            if (!loading) setAction(null);
          }}
        >
          <p>
            {action.kind === "transfer"
              ? "They will control invitations, member access and shared backup restores. You will remain a family member."
              : action.kind === "remove"
                ? "They will lose access and stop receiving reminders. Their existing plans and profile will remain. Old invite codes will stop working."
                : "You will lose access to this family’s plans and stop receiving its reminders. Your profile and existing plans will remain with the family."}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={loading}
              onClick={() => void confirm()}
            >
              {loading
                ? "Updating…"
                : action.kind === "transfer"
                  ? "Transfer ownership"
                  : action.kind === "remove"
                    ? "Remove access"
                    : "Leave family"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
