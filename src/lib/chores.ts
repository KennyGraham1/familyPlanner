/** A thank-you that notices finishing touches: someone's last chore, or everyone's. */
export function cheer(
  tasks: { id: string; memberId: string; done: boolean }[],
  completed: { id: string; memberId: string },
  name: string,
) {
  const left = tasks.filter((t) => !t.done && t.id !== completed.id);
  if (left.length === 0) return "Every chore is done. Brilliant teamwork! 🎉";
  if (!left.some((t) => t.memberId === completed.memberId))
    return `${name} has finished all their chores! ⭐`;
  return `Done. Thanks, ${name}!`;
}
