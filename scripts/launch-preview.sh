#!/usr/bin/env bash
set -euo pipefail

project_dir="/home/luc/Projects/question-sort-pdf"
url="http://127.0.0.1:1420/"
log_file="$HOME/.cache/question-sort-pdf-preview.log"

if ! curl --silent --fail "$url" >/dev/null; then
  mkdir -p "$HOME/.cache"
  cd "$project_dir"
  nohup npm run dev -- --host 127.0.0.1 --strictPort >"$log_file" 2>&1 </dev/null &
  ready=0
  for _ in $(seq 1 40); do
    if curl --silent --fail "$url" >/dev/null; then
      ready=1
      break
    fi
    sleep 0.25
  done
  if [ "$ready" -ne 1 ]; then
    if command -v notify-send >/dev/null 2>&1; then
      notify-send "QuestionSort PDF" "Could not start the preview. See $log_file."
    fi
    exit 1
  fi
fi

exec xdg-open "$url"
