#!/usr/bin/env bash
# Legge il JSON di PreToolUse su stdin, esce 2 per rifiutare il comando.
# Il corpo di un heredoc è prosa (messaggi di commit, documentazione): non va ispezionato,
# altrimenti un commit che PARLA di un comando vietato viene scambiato per quel comando.
set -uo pipefail

command=$(python3 -c '
import json, re, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    print("")
    raise SystemExit

while True:
    opener = re.search(r"<<-?\s*[\x27\"]?([A-Za-z_][A-Za-z0-9_]*)[\x27\"]?", cmd)
    if not opener:
        break
    rest = cmd[opener.end():]
    closer = re.search(r"^\s*" + re.escape(opener.group(1)) + r"\s*$", rest, re.M)
    if not closer:
        cmd = cmd[:opener.start()] + rest
        break
    cmd = cmd[:opener.start()] + rest[closer.end():]

print(cmd)
' 2>/dev/null) || exit 0

refuse() {
  echo "$1" >&2
  exit 2
}

# Il verbo di ogni invocazione di git nella riga, una per riga: le opzioni globali
# (`-C <dir>`, `-c k=v`, `--git-dir=…`) e i loro argomenti vengono saltati.
verbs=$(printf '%s' "$command" | python3 -c '
import re, sys

TAKES_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
line = sys.stdin.read()

for m in re.finditer(r"(?:^|[;&|(`\s])git\s+(.*)", line):
    words = m.group(1).split()
    i = 0
    while i < len(words):
        w = words[i]
        if not w.startswith("-"):
            break
        i += 2 if w in TAKES_ARG else 1
    if i < len(words):
        print(words[i], " ".join(words[i + 1:]))
' 2>/dev/null)

git_verb() {
  printf '%s' "$verbs" | grep -Eq "^$1"
}

if git_verb 'stash([[:space:]]+(list|show)([[:space:]]|$))'; then
  exit 0
fi

if git_verb 'stash([[:space:]]|$)'; then
  refuse "git stash è vietato: refs/stash è condiviso da tutti i worktree, e uno stash preso qui può riemergere altrove. Ha già cancellato il lavoro non committato di otto agenti (LESSONS.md). Committa sul branch, oppure: git diff > /tmp/patch.diff && git checkout -- <file>."
fi

if git_verb 'reset[[:space:]]+(--hard|--merge|--keep)'; then
  refuse "git reset --hard/--merge/--keep è vietato: butta via il lavoro non committato di ogni agente in corso. Committa prima, poi riscrivi con rebase -i."
fi

if git_verb 'clean[[:space:]]+-[a-zA-Z]*[fdx]'; then
  refuse "git clean -f/-d/-x è vietato: cancella i file non tracciati che un altro agente ha appena creato."
fi

exit 0
