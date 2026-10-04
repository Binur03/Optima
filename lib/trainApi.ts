// Client helpers shared by the Train screen and the program editor.

export interface ProgramSummary {
  id: string;
  name: string;
  isActive: boolean;
  days: string[];
}

// JSON request that throws with the server's error code so the UI can explain it.
export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "request_failed");
  return json as T;
}

export async function getPrograms(): Promise<ProgramSummary[]> {
  return (await send<{ programs: ProgramSummary[] }>("/api/lifts/programs", "GET")).programs;
}

export const TRAIN_ERRORS: Record<string, string> = {
  split_exists: "This program already has a day with that name.",
  program_exists: "You already have a program with that name.",
  invalid_name: "Names need 2–40 characters.",
};

export function trainError(e: unknown, fallback = "Couldn’t save that change.") {
  return (e instanceof Error && TRAIN_ERRORS[e.message]) || fallback;
}
