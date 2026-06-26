#!/usr/bin/env python3
"""POST changelog entries to the backend /api/internal/support/ingest-changelog endpoint.

Reads /tmp/doc-artifacts/changelog.json (written by extract-changelog.ts) and
POSTs each entry individually to the backend changelog ingest endpoint.

Environment:
  BACKEND_URL          Base URL of the backend (e.g. https://api.experient.io)
  AGENTS_INTERNAL_KEY  Shared secret for X-Internal-Key header
"""

import json
import os
import sys
from pathlib import Path

import requests

BACKEND_URL = os.environ.get('BACKEND_URL')
INTERNAL_KEY = os.environ.get('AGENTS_INTERNAL_KEY')

_TIMEOUT_SECONDS = 30
_CHANGELOG_PATH = Path('/tmp/doc-artifacts/changelog.json')


def _validate_env() -> None:
    missing = []
    if not BACKEND_URL:
        missing.append('BACKEND_URL')
    if not INTERNAL_KEY:
        missing.append('AGENTS_INTERNAL_KEY')
    if missing:
        print(f'ERROR: Missing required env vars: {", ".join(missing)}', file=sys.stderr)
        raise SystemExit(1)


def ingest_entry(entry: dict) -> dict:
    """POST a single changelog entry to /api/internal/support/ingest-changelog."""
    url = f'{BACKEND_URL.rstrip("/")}/api/internal/support/ingest-changelog'
    response = requests.post(
        url,
        json=entry,
        headers={
            'X-Internal-Key': INTERNAL_KEY,
            'Content-Type': 'application/json',
        },
        timeout=_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def main() -> None:
    _validate_env()

    if not _CHANGELOG_PATH.exists():
        print(
            f'ERROR: {_CHANGELOG_PATH} not found — run extract-changelog.ts first.',
            file=sys.stderr,
        )
        raise SystemExit(1)

    try:
        entries: list[dict] = json.loads(_CHANGELOG_PATH.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        print(f'ERROR: Failed to parse changelog.json: {exc}', file=sys.stderr)
        raise SystemExit(1)

    if not entries:
        print('Changelog is empty — nothing to ingest.')
        return

    print(f'Ingesting {len(entries)} changelog entry/entries into backend...')
    successes = 0
    failures = 0

    for entry in entries:
        version = entry.get('version', '(unknown)')
        released_at = entry.get('releasedAt', '')
        label = f'{version} ({released_at[:10]})' if released_at else version

        try:
            ingest_entry(entry)
            successes += 1
            print(f'  {label}')
        except requests.HTTPError as exc:
            failures += 1
            status = exc.response.status_code if exc.response is not None else '?'
            body_preview = ''
            if exc.response is not None:
                try:
                    body_preview = exc.response.text[:200]
                except Exception:
                    pass
            print(f'  ERROR {label}: HTTP {status} — {body_preview}', file=sys.stderr)
        except requests.RequestException as exc:
            failures += 1
            print(f'  ERROR {label}: {exc}', file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f'  ERROR {label}: unexpected error — {exc}', file=sys.stderr)

    print(f'\nCompleted: {successes} succeeded, {failures} failed')

    if failures > 0:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
