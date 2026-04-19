import { Terminal } from "./Terminal";

export function App() {
  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header style={{ padding: "8px 16px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between" }}>
        <strong>dazero</strong>
        <span style={{ opacity: 0.6, fontSize: 12 }}>M1 foundations</span>
      </header>
      <section style={{ padding: 12 }}>
        <div style={{ height: "calc(100vh - 60px)", background: "#0b0b0f", border: "1px solid #222", borderRadius: 8, padding: 8 }}>
          <Terminal />
        </div>
      </section>
    </main>
  );
}
