import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./Dashboard/Dashboard";
import { CanvasView } from "./CanvasView/CanvasView";
import { Settings } from "./Settings/Settings";
import { usePresetsStore } from "./store/presetsStore";

export function App() {
  const load = usePresetsStore((s) => s.load);
  useEffect(() => { load().catch(console.error); }, [load]);

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/projects/:id" element={<CanvasView />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
