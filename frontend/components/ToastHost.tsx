"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type Toast, subscribe } from "@/lib/toast";
import "../app/styles/toast.css";

function ToastItem({ t }: { t: Toast }) {
  // mirror the old RAF-then-add-class enter transition (base.css asq_toast)
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`asq_toast${t.type === "error" ? " asq_toast_error" : ""}${
        visible ? " asq_toast_visible" : ""
      }`}
    >
      {t.msg}
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return subscribe(setToasts);
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="asq_toast_container" id="asq_toast_container">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>,
    document.body,
  );
}
