import { useEffect, useRef } from "react";
import type { NodeProps } from "reactflow";
import { NodeResizer } from "reactflow";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../../lib/api";
import { wsUrl } from "../../lib/ws";
import { useCanvasStore } from "../../store/canvasStore";

export function TerminalNode({ id, data, selected }: NodeProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const didInit = useRef(false);

  const projectId = useCanvasStore((s) => s.projectId);
  const projectPath = useCanvasStore((s) => s.projectPath);
  const removeNode = useCanvasStore((s) => s.removeNodeFromCanvas);

  const title = (data as { title?: string })?.title ?? "shell";
  const agentIdInData = (data as { agent_id?: string })?.agent_id;

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    let cancelled = false;

    void (async () => {
      if (!projectId) return;

      // Ensure we have an agent
      let agentId = agentIdInData;
      if (!agentId) {
        try {
          const a = await api.agents.spawn(projectId, id, projectPath ?? undefined);
          agentId = a.agent_id;
          await api.canvas.updateNode(id, {
            data: { ...(data as Record<string, unknown>), agent_id: agentId },
          });
        } catch (e) {
          console.error("spawn agent failed", e);
          return;
        }
      }

      if (cancelled || !termContainerRef.current) return;

      // xterm setup
      const term = new XTerm({
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        theme: { background: "#0b0b0f" },
        cursorBlink: true,
        convertEol: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(termContainerRef.current);
      try { fit.fit(); } catch { /* ignore early fit */ }
      termRef.current = term;
      fitRef.current = fit;

      // WebSocket bridge
      const ws = new WebSocket(wsUrl(`/ws/pty/${agentId}`));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") term.write(ev.data);
        else term.write(new Uint8Array(ev.data as ArrayBuffer));
      };
      ws.onclose = () => term.writeln("\r\n[dazero: connection closed]");
      ws.onerror = () => term.writeln("\r\n[dazero: ws error]");
      term.onData((s) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(s);
      });
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      termRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // projectPath/agentIdInData changes would require re-spawn — out of scope

  // Re-fit xterm when the node container is resized
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const onClose = async () => {
    const agentId = (data as { agent_id?: string })?.agent_id;
    wsRef.current?.close();
    termRef.current?.dispose();
    if (removeNode) await removeNode(id, agentId);
  };

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 260,
        minHeight: 180,
        background: "#0b0b0f",
        border: `1px solid ${selected ? "#4a7cff" : "#2a6475"}`,
        borderRadius: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <NodeResizer
        minWidth={260}
        minHeight={180}
        handleStyle={{ width: 8, height: 8 }}
        onResizeEnd={(_, { width, height }) => {
          api.canvas.updateNode(id, { width, height }).catch(() => {});
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          background: "#0f1a1f",
          borderBottom: "1px solid #2a6475",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: "#9de6ff",
          flexShrink: 0,
        }}
      >
        <span>&#11035; {title}</span>
        <button
          onClick={() => void onClose()}
          title="close"
          style={{
            background: "transparent",
            border: "none",
            color: "#9de6ff",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>
      <div ref={termContainerRef} style={{ flex: 1, padding: 4, overflow: "hidden" }} />
    </div>
  );
}

// Re-export as TerminalNodePlaceholder so CanvasView import keeps working
export { TerminalNode as TerminalNodePlaceholder };
