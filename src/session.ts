// In-memory session state shared across modules
export let sessionId: string | null = null;
export let sequence: number | null = null;

export function setSessionId(id: string | null): void {
  sessionId = id;
}
export function setSequence(s: number | null): void {
  sequence = s;
}
