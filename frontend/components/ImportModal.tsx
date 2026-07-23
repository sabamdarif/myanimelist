"use client";

// Port of the import half of import_export.js — same markup/classes.
// Success invalidates queries instead of the old full-page reload.

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runImport } from "@/lib/ods";
import "../app/styles/import_export.css";

type Status = { msg: string; kind: "success" | "error" } | null;

export function ImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [progress, setProgress] = useState({ text: "Preparing…", pct: 0 });
  const [status, setStatus] = useState<Status>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setImporting(false);
    setDone(false);
    setProgress({ text: "Preparing…", pct: 0 });
    setStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    if (importing) return; // don't close mid-import
    reset();
    onClose();
  };

  const selectFile = (f: File | undefined | null) => {
    if (!f) return;
    if (f.name.split(".").pop()?.toLowerCase() !== "ods") {
      setStatus({ msg: "Please select an .ods file", kind: "error" });
      return;
    }
    setFile(f);
    setStatus(null);
  };

  const start = async () => {
    if (!file || importing) return;
    setImporting(true);
    setStatus(null);
    try {
      const processed = await runImport(file, (text, pct) =>
        setProgress({ text, pct }),
      );
      setProgress({ text: "Import complete!", pct: 100 });
      setStatus({
        msg: `✓ Successfully imported ${processed} anime entries.`,
        kind: "success",
      });
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["animes"] });
      queryClient.invalidateQueries({ queryKey: ["search"] });
    } catch (e) {
      setStatus({
        msg: `Import failed: ${e instanceof Error ? e.message : e}`,
        kind: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div
        className={`import_overlay${open ? " open" : ""}`}
        id="import_overlay"
        onClick={close}
      ></div>
      <div className={`import_modal${open ? " open" : ""}`} id="import_modal">
        <div className="import_modal_header">
          <h3>Import from ODS</h3>
          <button
            type="button"
            className="import_close_btn"
            id="import_close_btn"
            onClick={close}
          >
            <i className="nf nf-cod-close"></i>
          </button>
        </div>
        <div className="import_modal_body">
          {!importing && !done && (
            <div
              className={`import_dropzone${dragover ? " dragover" : ""}`}
              id="import_dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragover(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragover(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragover(false);
                selectFile(e.dataTransfer?.files?.[0]);
              }}
            >
              <div className="import_dropzone_icon">
                <i className="nf nf-md-file_upload_outline"></i>
              </div>
              <div className="import_dropzone_text">
                <strong>Drop your .ods file here</strong>
                <br />
                or click to browse
              </div>
              <div className="import_dropzone_hint">
                Only .ods files exported from this app are supported
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="import_file_input"
                id="import_file_input"
                accept=".ods"
                onChange={(e) => selectFile(e.target.files?.[0])}
              />
            </div>
          )}
          {file && (
            <div className="import_file_info visible" id="import_file_info">
              <i className="nf nf-md-file_document_outline"></i>
              <span className="import_file_name" id="import_file_name">
                {file.name}
              </span>
              {!importing && !done && (
                <button
                  type="button"
                  className="import_file_remove"
                  id="import_file_remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <i className="nf nf-cod-close"></i>
                </button>
              )}
            </div>
          )}
          {file && !done && (
            <button
              type="button"
              className="import_start_btn visible"
              id="import_start_btn"
              disabled={importing}
              onClick={start}
            >
              {importing ? (
                <>
                  <span className="btn_spinner"></span> Importing…
                </>
              ) : (
                "Start Import"
              )}
            </button>
          )}
          {(importing || done) && (
            <div
              className="import_progress_wrapper visible"
              id="import_progress_wrapper"
            >
              <div className="import_progress_label">
                <span id="import_progress_text">{progress.text}</span>
                <span id="import_progress_pct">{progress.pct}%</span>
              </div>
              <div className="import_progress_bar_bg">
                <div
                  className="import_progress_bar_fill"
                  id="import_progress_fill"
                  style={{ width: `${progress.pct}%` }}
                ></div>
              </div>
            </div>
          )}
          {status && (
            <div className={`import_status visible ${status.kind}`} id="import_status">
              {status.msg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
