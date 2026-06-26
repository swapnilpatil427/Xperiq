#!/usr/bin/env python3
"""POST generated docs to the backend /api/internal/support/refresh-doc endpoint.

Reads enriched artifact files from /tmp/doc-outputs/ (written by call-doc-writer.py)
and POSTs each one to the backend support doc refresh endpoint.

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


def _validate_env() -> None:
    missing = []
    if not BACKEND_URL:
        missing.append('BACKEND_URL')
    if not INTERNAL_KEY:
        missing.append('AGENTS_INTERNAL_KEY')
    if missing:
        print(f'ERROR: Missing required env vars: {", ".join(missing)}', file=sys.stderr)
        raise SystemExit(1)


def _build_content(doc_output: dict) -> str:
    """Render doc_output sections into a single Markdown string."""
    sections = doc_output.get('sections') or []
    if not sections:
        # Fallback: use top-level 'content' if sections are absent
        return doc_output.get('content', '')

    parts: list[str] = []
    for section in sections:
        heading = section.get('heading', '')
        body = section.get('content', '')
        if heading:
            parts.append(f'## {heading}')
        if body:
            parts.append(body)
    return '\n\n'.join(parts)


def ingest_doc(doc_data: dict) -> dict:
    """POST a single enriched artifact to /api/internal/support/refresh-doc."""
    doc_output = doc_data.get('doc_output', {})

    # Support both camelCase (TS) and snake_case (Python) artifact keys
    doc_key = doc_data.get('docKey') or doc_data.get('doc_key', '')
    source_type = doc_data.get('sourceType') or doc_data.get('source_type', '')
    source_ref = doc_data.get('sourceRef') or doc_data.get('source_ref', '')

    payload = {
        'key': doc_key,
        'title': doc_output.get('title', doc_data.get('title', doc_key)),
        'content': _build_content(doc_output),
        'sourceType': source_type,
        'sourceRef': source_ref,
        'qualityScore': doc_output.get('quality_score'),
    }

    url = f'{BACKEND_URL.rstrip("/")}/api/internal/support/refresh-doc'
    response = requests.post(
        url,
        json=payload,
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

    outputs_dir = Path('/tmp/doc-outputs')

    if not outputs_dir.exists():
        print('ERROR: /tmp/doc-outputs does not exist — run call-doc-writer.py first.', file=sys.stderr)
        raise SystemExit(1)

    doc_files = sorted(outputs_dir.glob('*.json'))

    if not doc_files:
        print('No doc output files found in /tmp/doc-outputs — nothing to ingest.')
        return

    print(f'Ingesting {len(doc_files)} doc(s) into backend...')
    successes = 0
    failures = 0

    for doc_file in doc_files:
        try:
            doc_data = json.loads(doc_file.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError) as exc:
            failures += 1
            print(f'  ERROR reading {doc_file.name}: {exc}', file=sys.stderr)
            continue

        doc_key = doc_data.get('docKey') or doc_data.get('doc_key') or doc_file.stem

        try:
            ingest_doc(doc_data)
            successes += 1
            print(f'  {doc_key}')
        except requests.HTTPError as exc:
            failures += 1
            status = exc.response.status_code if exc.response is not None else '?'
            body_preview = ''
            if exc.response is not None:
                try:
                    body_preview = exc.response.text[:200]
                except Exception:
                    pass
            print(f'  ERROR {doc_key}: HTTP {status} — {body_preview}', file=sys.stderr)
        except requests.RequestException as exc:
            failures += 1
            print(f'  ERROR {doc_key}: {exc}', file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f'  ERROR {doc_key}: unexpected error — {exc}', file=sys.stderr)

    print(f'\nCompleted: {successes} succeeded, {failures} failed')

    if failures > 0:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
