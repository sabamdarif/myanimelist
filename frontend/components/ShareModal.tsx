"use client";

// Port of share_modal.js — same markup/classes, same GET/POST/DELETE flow.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import "../app/styles/share_modal.css";

type ShareState = { enabled: boolean; token?: string; url?: string };

export function ShareModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const shareQ = useQuery({
    queryKey: queryKeys.share,
    queryFn: () => apiJson<ShareState>("/api/v1/share/"),
    enabled: open,
    staleTime: 0,
  });

  const toggle = useMutation({
    mutationFn: (enable: boolean) =>
      apiJson<ShareState>("/api/v1/share/", {
        method: enable ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: enable ? JSON.stringify({}) : undefined,
      }),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.share, data),
  });

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const data = shareQ.data;
  const enabled = toggle.isPending ? !data?.enabled : !!data?.enabled;

  const copy = () => {
    if (!data?.url) return;
    navigator.clipboard.writeText(data.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <div
        className={`share_modal_overlay${open ? " open" : ""}`}
        onClick={onClose}
      ></div>
      <div className={`share_modal${open ? " open" : ""}`}>
        <div className="share_modal_header">
          <span className="share_modal_title">
            <i className="nf nf-md-share_all"></i> Share Your List
          </span>
          <button
            type="button"
            className="share_modal_close"
            aria-label="Close"
            onClick={onClose}
          >
            <i className="nf nf-md-close"></i>
          </button>
        </div>
        <div className="share_modal_body">
          {shareQ.isPending && open ? (
            <div className="share_loading" id="share_loading">
              <div className="share_spinner"></div>
            </div>
          ) : (
            <div id="share_content">
              <div className="share_toggle_row">
                <div className="share_toggle_label">
                  <span className="share_toggle_text">Enable Public Link</span>
                  <span className="share_toggle_hint">
                    Anyone with the link can view your list
                  </span>
                </div>
                <label className="share_toggle_switch">
                  <input
                    type="checkbox"
                    id="share_toggle_input"
                    checked={enabled}
                    disabled={toggle.isPending || shareQ.isError}
                    onChange={(e) => toggle.mutate(e.target.checked)}
                  />
                  <span className="share_toggle_slider"></span>
                </label>
              </div>
              <div
                className={`share_link_section${data?.enabled ? " visible" : ""}`}
                id="share_link_section"
              >
                <div className="share_link_label">Your public link</div>
                <div className="share_link_box">
                  <input
                    className="share_link_url"
                    id="share_link_url"
                    readOnly
                    value={data?.url ?? ""}
                  />
                  <button
                    type="button"
                    className={`share_copy_btn${copied ? " copied" : ""}`}
                    id="share_copy_btn"
                    onClick={copy}
                  >
                    {copied ? (
                      <>
                        <i className="nf nf-md-check"></i> Copied!
                      </>
                    ) : (
                      <>
                        <i className="nf nf-md-content_copy"></i> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
              {(shareQ.isError || toggle.isError) && (
                <div className="share_error" id="share_error">
                  {shareQ.isError
                    ? "Failed to load share status."
                    : "Failed to update share settings."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
