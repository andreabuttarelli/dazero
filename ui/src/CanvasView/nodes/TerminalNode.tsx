import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../../lib/ws";

export function Terminal() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#0b0b0f" },
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const ws = new WebSocket(wsUrl("/ws/pty"));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") term.write(ev.data);
      else term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = () => term.writeln("\r\n[dazero: connection closed]");
    ws.onerror = () => term.writeln("\r\n[dazero: ws error]");

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

export { Terminal as TerminalNode };

// --- React Flow placeholder node (Task 16) — replaced by real impl in Task 17 ---
import type { NodeProps } from "reactflow";

export function TerminalNodePlaceholder({ data }: NodeProps) {
  const title = (data as { title?: string })?.title ?? "terminal";
  return (
    <div
      style={{
        width: 220,
        height: 120,
        background: "#0f1a1f",
        border: "1px solid #2a6475",
        borderRadius: 8,
        color: "#9de6ff",
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <strong style={{ color: "#cceeff" }}>&#11035; {title}</strong>
      <div style={{ opacity: 0.5, marginTop: 8, fontSize: 11 }}>
        Terminal placeholder
        <br />
        (wired in Task 17)
      </div>
    </div>
  );
}
