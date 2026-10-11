#!/bin/bash
# Serve the app on the local network so an iPad can open it.
cd "$(dirname "$0")"
PORT="${1:-8000}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
echo ""
echo "  Дино-раскраска запущена."
echo "  На iPad откройте:  http://${IP:-<IP этого Mac>}:${PORT}"
echo "  (Ctrl+C — остановить)"
echo ""
exec python3 -m http.server "$PORT" --bind 0.0.0.0
