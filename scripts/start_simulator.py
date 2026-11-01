from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote
import webbrowser


PROJECT_DIR = Path(__file__).resolve().parent.parent


def main():
    html_files = sorted(PROJECT_DIR.glob("*.html"))
    if len(html_files) != 1:
        raise RuntimeError(f"Expected exactly one HTML file in {PROJECT_DIR}, found {len(html_files)}")

    handler = partial(SimpleHTTPRequestHandler, directory=str(PROJECT_DIR))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        address, port = server.server_address
        url = f"http://{address}:{port}/{quote(html_files[0].name)}"
        print(f"Opening simulator: {url}", flush=True)
        if not webbrowser.open(url, new=2):
            print("Could not open a browser automatically. Open the URL above.")
        print("Keep this window open while using the simulator. Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nSimulator server stopped.")


if __name__ == "__main__":
    main()
