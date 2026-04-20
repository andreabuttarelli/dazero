import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./Dashboard/Dashboard";
import { CanvasView } from "./CanvasView/CanvasView";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/projects/:id" element={<CanvasView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
