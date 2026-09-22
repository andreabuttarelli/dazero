#!/usr/bin/env bash
# Ogni riga di cases.tsv è un comando e l'esito atteso. Esce 1 al primo scarto.
cd "$(dirname "$0")"
fail=0
while IFS=$'\t' read -r want cmd; do
  [ -z "$want" ] && continue
  json=$(python3 -c 'import json,sys;print(json.dumps({"tool_input":{"command":sys.argv[1]}}))' "$cmd")
  printf '%s' "$json" | ./block-destructive-git.sh >/dev/null 2>&1
  [ $? -eq 2 ] && got=block || got=allow
  [ "$got" = "$want" ] || { printf 'FAIL want=%s got=%s  %s\n' "$want" "$got" "$cmd"; fail=1; }
done < cases.tsv
[ $fail -eq 0 ] && echo "hook ok"
exit $fail
