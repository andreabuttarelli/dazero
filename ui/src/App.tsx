import { useEffect, useState } from "react";

export function App() {
  const [status, setStatus] = useState<string>("…");
  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((j) => setStatus(`dazero v${j.version}`))
      .catch((e) => setStatus(`error: ${e.message}`));
  }, []);
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>dazero</h1>
      <p style={{ opacity: 0.7 }}>{status}</p>
    </main>
  );
}
