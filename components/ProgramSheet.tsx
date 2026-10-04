"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROGRAM_TEMPLATES, templatesFor, type Equipment } from "@/lib/lifts";
import { getPrograms, send, trainError } from "@/lib/trainApi";

interface Props {
  open: boolean;
  onClose: () => void;
  equipment?: Equipment; // home setups see home templates first
}

// Bottom sheet: switch programs in one tap, jump to a program's editor, or
// create a new program from a template.
export function ProgramSheet({ open, onClose, equipment = "gym" }: Props) {
  const templates = templatesFor(equipment);
  const qc = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<"list" | "new">("list");
  const [template, setTemplate] = useState<string | null>(PROGRAM_TEMPLATES[0].key);
  const [name, setName] = useState(PROGRAM_TEMPLATES[0].name);

  const { data: programs, isLoading } = useQuery({ queryKey: ["lift-programs"], queryFn: getPrograms, enabled: open });

  useEffect(() => {
    if (!open) return;
    setView("list");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lift-splits"] });
    qc.invalidateQueries({ queryKey: ["lift-programs"] });
  };

  const activate = useMutation({
    mutationFn: (id: string) => send(`/api/lifts/programs/${id}`, "PATCH", { activate: true }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const create = useMutation({
    mutationFn: () =>
      send<{ program: { id: string } }>("/api/lifts/programs", "POST", { name: name.trim(), template, activate: true }),
    onSuccess: ({ program }) => {
      refresh();
      onClose();
      // An empty program needs days before it's useful — go straight to the editor.
      if (!template) router.push(`/train/program/${program.id}`);
    },
  });

  if (!open) return null;

  const taken = (programs ?? []).map((p) => p.name.toLowerCase());
  const duplicate = taken.includes(name.trim().toLowerCase());
  const pickTemplate = (key: string | null) => {
    setTemplate(key);
    const t = PROGRAM_TEMPLATES.find((x) => x.key === key);
    let base = t?.name ?? "My Program";
    for (let n = 2; taken.includes(base.toLowerCase()); n++) base = `${t?.name ?? "My Program"} ${n}`;
    setName(base);
    create.reset();
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Programs">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-[480px] animate-sheet-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />

        {view === "list" ? (
          <>
            <h2 className="m-0 text-lg font-semibold text-white">Programs</h2>
            <p className="m-0 mt-0.5 text-sm text-neutral-400">Tap one to train it. Your lift history follows you.</p>

            <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {isLoading &&
                [0, 1].map((i) => <li key={i} className="h-[68px] animate-pulse rounded-2xl bg-white/5" />)}
              {programs?.map((p) => (
                <li key={p.id} className={`flex items-stretch overflow-hidden rounded-2xl ring-1 ring-inset ${p.isActive ? "bg-sky-400/[0.08] ring-sky-400/30" : "bg-white/[0.03] ring-white/5"}`}>
                  <button
                    type="button"
                    disabled={activate.isPending}
                    onClick={() => (p.isActive ? onClose() : activate.mutate(p.id))}
                    aria-pressed={p.isActive}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        p.isActive ? "bg-sky-400 text-zinc-950" : "ring-2 ring-inset ring-white/15"
                      }`}
                      aria-hidden
                    >
                      {p.isActive ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-white">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {p.days.length ? p.days.join(" · ") : "No days yet"}
                      </span>
                    </span>
                  </button>
                  <Link
                    href={`/train/program/${p.id}`}
                    onClick={onClose}
                    className="grid shrink-0 place-items-center border-l border-white/5 px-4 text-sm font-semibold text-neutral-300 transition hover:bg-white/5 hover:text-white"
                  >
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
            {activate.isError && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">Couldn’t switch programs. Try again.</p>}

            <button
              type="button"
              onClick={() => {
                pickTemplate(templates[0].key);
                setView("new");
              }}
              className="mt-4 w-full rounded-2xl border border-dashed border-white/15 py-3.5 text-sm font-semibold text-sky-300 transition hover:bg-white/[0.03]"
            >
              + New program
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2 && !duplicate) create.mutate();
            }}
          >
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setView("list")} aria-label="Back to programs" className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-xl text-neutral-400 hover:bg-white/5 hover:text-white">
                ‹
              </button>
              <h2 className="m-0 text-lg font-semibold text-white">New program</h2>
            </div>

            <p className="m-0 mb-2 mt-4 text-xs font-medium text-neutral-500">Start from</p>
            <div className="grid grid-cols-2 gap-2">
              {[...templates, null].map((t) => {
                const key = t?.key ?? null;
                const selected = template === key;
                return (
                  <button
                    key={key ?? "blank"}
                    type="button"
                    onClick={() => pickTemplate(key)}
                    aria-pressed={selected}
                    className={`rounded-2xl p-3 text-left ring-1 ring-inset transition ${
                      selected ? "bg-sky-400/10 ring-sky-400/50" : "bg-white/[0.03] ring-white/5 hover:ring-white/15"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{t?.name ?? "Blank"}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                      {t ? t.days.join(" · ") : "Build every day yourself"}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium text-sky-300/80">{t?.blurb ?? "Custom"}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-neutral-400">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-sky-400/50 focus:outline-none"
              />
            </label>
            {duplicate && <p className="m-0 mt-1.5 text-xs text-amber-300">You already have a program with this name.</p>}
            {create.isError && <p role="alert" className="m-0 mt-2 text-xs text-rose-400">{trainError(create.error, "Couldn’t create that program.")}</p>}

            <button
              type="submit"
              disabled={create.isPending || name.trim().length < 2 || duplicate}
              className="mt-4 w-full rounded-xl bg-sky-400 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-300 disabled:bg-white/10 disabled:text-neutral-500"
            >
              {create.isPending ? "Creating…" : template ? "Create & start training" : "Create & add days"}
            </button>
            <p className="m-0 mt-2 text-center text-[11px] text-neutral-600">You can rename days, swap exercises, or delete anything later.</p>
          </form>
        )}
      </div>
    </div>
  );
}
