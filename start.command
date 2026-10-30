#!/bin/bash
# macOS: double-click to start (or restart) Trạm Orbit. Close the Terminal window to stop it.
# Bấm đúp để mở (hoặc khởi động lại) Trạm Orbit. Đóng cửa sổ Terminal để tắt trạm.
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -x /opt/homebrew/bin/node ] && export PATH="/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required: https://nodejs.org"
  read -r -p "Press Enter to close…"; exit 1
fi
PORT=$(node -e 'try{console.log(process.env.ORBIT_PORT||require("./config.json").port||7799)}catch(e){console.log(7799)}')
# stop an older instance of THIS station (same folder) so the newest code runs
for PID in $(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  CMD=$(ps -p "$PID" -o command= 2>/dev/null)
  CWD=$(lsof -a -p "$PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  if [[ "$CMD" == *server.js* && "$CWD" == "$PWD" ]]; then
    echo "Restarting station (PID $PID)…"; kill "$PID"
    for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$PID" 2>/dev/null || break; sleep 0.3; done
  else
    echo "Port $PORT is used by another program: $CMD"
    echo "Change \"port\" in config.json and try again."; read -r -p "Press Enter to close…"; exit 1
  fi
done
MODE=""; [ "$1" = "--demo" ] && MODE="--demo"
(sleep 1.5; open "http://localhost:$PORT") &
exec node server.js $MODE
