#!/usr/bin/env python3
"""
Server locale per lo sviluppo di Space Race.

Serve la cartella client/ disabilitando la cache. Serve davvero: i moduli ES
e l'HTML vengono messi in cache da Chrome in modo aggressivo, e capita di
guardare una versione vecchia del gioco convinti che le modifiche non
funzionino (è già successo).

    python3 serve.py            → http://localhost:8899
    python3 serve.py 9000       → porta diversa
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'client')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # solo gli errori: il log di ogni richiesta è rumore
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler) as srv:
        print(f'Space Race → http://localhost:{PORT}')
        print(f'cartella:    {ROOT}')
        print('Ctrl+C per fermare')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\nfermato')
