export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

// Compatibility for existing menu screens that store their notice as text.
// New callers can provide an explicit tone through data-notice-tone.
export function getNoticeTone(message: string, serverError = false): NoticeTone {
  if (serverError || /\b(unable|failed|cannot|could not|error|invalid|duplicate|already exists)\b/i.test(message)) return 'error';
  if (/\b(loading|saving|cancelled|discarded)\b/i.test(message)) return 'info';
  if (/\b(saved|archived|updated|duplicated|imported|activated|deactivated|copied|completed|queued|marked|applied)\b/i.test(message) && !/^(please|choose|select|enter|use|check)\b/i.test(message)) return 'success';
  return 'warning';
}
