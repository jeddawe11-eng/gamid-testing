// Shared across every Play Together game. The existing scheduling validator remains authoritative.
export function syncScheduleControl(kind, label, input) {
  const scheduled = kind === "SCHEDULED";
  label.hidden = !scheduled;
  input.disabled = !scheduled;
  if (!scheduled) input.value = "";
}

// Never let a stale or manipulated hidden date participate in Play Now creation.
export const scheduledStartForSubmission = (kind, value) => kind === "SCHEDULED" ? value : null;
