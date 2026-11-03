/**
 * Why the planner's own rules turned a change down (say, quiet hours with only a
 * start time), or null when something else failed, such as browser storage.
 */
export function validationMessage(error: unknown): string | null {
  const issues = (error as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues) || !issues.length) return null;
  // Custom checks are written for people; built-in ones describe the data format.
  const custom = issues.find(
    (issue: { code?: unknown }) => issue?.code === "custom",
  ) as { message?: unknown } | undefined;
  return typeof custom?.message === "string"
    ? custom.message
    : "Some details aren’t valid. Please check them and try again.";
}
export function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return fallback;
}
