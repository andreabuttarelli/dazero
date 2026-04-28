import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiHttpError } from "../lib/api";
import type { Project } from "../types";
import { ProjectCard } from "./ProjectCard";
import { NewProjectWizard } from "./NewProjectWizard";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.projects.list()
      .then((list) => { if (!cancelled) setProjects(list); })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof ApiHttpError ? e.message : String(e);
        setError(msg);
      });
    return () => { cancelled = true; };
  }, []);

  const openProject = async (p: Project) => {
    try {
      await api.projects.update(p.id, { last_opened_at: Math.floor(Date.now() / 1000) });
    } catch { /* non-fatal */ }
    navigate(`/projects/${p.id}`);
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "280px 1fr",
      height: "100vh",
      background: "#0b0b0f",
      color: "#eaeaea",
      fontFamily: "ui-monospace, SFMono-Regular, monospace",
    }}>
      <aside style={{ borderRight: "1px solid #222", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 18, margin: 0, letterSpacing: 0.5 }}>dazero</h1>
          <Link
            to="/settings"
            title="Settings"
            style={{ color: "#8af", textDecoration: "none", fontSize: 18, lineHeight: 1 }}
          >
            ⚙
          </Link>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{
            padding: "8px 12px",
            background: "#2a2a3a",
            border: "1px solid #3a3a4a",
            color: "#eaeaea",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            textAlign: "left",
          }}
        >
          + New project
        </button>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>Recent</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {projects?.map((p) => (
            <button
              key={p.id}
              onClick={() => openProject(p)}
              style={{
                background: "transparent", border: "none", color: "#ccc",
                textAlign: "left", padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a22")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {p.name}
            </button>
          )) ?? null}
        </nav>
      </aside>

      <main style={{ padding: 32, overflowY: "auto" }}>
        {error && (
          <div style={{ padding: 16, background: "#2a1a1a", border: "1px solid #a33", borderRadius: 8, marginBottom: 16 }}>
            <strong>Failed to load projects:</strong> {error}
          </div>
        )}

        {projects === null && !error && <p style={{ opacity: 0.5 }}>Loading…</p>}

        {projects && projects.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 14, marginTop: 80, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>No projects yet.</div>
            <div>Click <code>+ New project</code> on the left to start.</div>
          </div>
        )}

        {projects && projects.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={() => openProject(p)} />
            ))}
          </div>
        )}
      </main>

      {showWizard && (
        <NewProjectWizard
          onClose={() => setShowWizard(false)}
          onCreated={(p) => {
            setProjects((cur) => (cur ? [p, ...cur] : [p]));
            setShowWizard(false);
            navigate(`/projects/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
