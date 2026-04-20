CREATE TABLE task_lists (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
  title TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  task_list_id TEXT NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  position INTEGER NOT NULL
);

CREATE INDEX idx_tasks_list ON tasks(task_list_id, position);
