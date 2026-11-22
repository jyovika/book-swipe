"""Local test server that stops browsers caching, so phones always get the latest code.

Run: python3 scripts/serve.py   (then open http://<your Mac's IP>:8000)
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent  # serve the app, wherever this is run from


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"Serving {REPO_ROOT} on port 8000 with caching off")
    ThreadingHTTPServer(("", 8000), partial(NoCacheHandler, directory=str(REPO_ROOT))).serve_forever()
