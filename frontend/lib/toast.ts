"use client";

// Port of the showToast helper from anime_modal_base.js — same asq_ classes,
// same 2.5s / 4s timings. Module-level emitter so any mutation callback can
// call toast() without threading React context through.

export type ToastType = "success" | "error";
export type Toast = { id: number; msg: string; type: ToastType };

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => listeners.delete(l);
}

export function toast(msg: string, type: ToastType = "success") {
  const id = nextId++;
  toasts = [...toasts, { id, msg, type }];
  emit();
  setTimeout(
    () => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    },
    type === "error" ? 4000 : 2500,
  );
}
