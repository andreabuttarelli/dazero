import { useParams } from "react-router-dom";

export function CanvasView() {
  const { id } = useParams<{ id: string }>();
  return (
    <main style={{ padding: 24 }}>
      <h1>Canvas</h1>
      <p>Project id: {id}</p>
      <p>React Flow canvas arrives in Task 16.</p>
    </main>
  );
}
