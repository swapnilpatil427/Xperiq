#!/usr/bin/env python3
"""Call CrystalOS doc-writer skill for each extracted artifact.

Reads all JSON artifacts from /tmp/doc-artifacts/ (recursively, excluding
tracker.json and changelog.json which are handled separately), calls the
CrystalOS /insights/doc-writer endpoint for each, and writes the enriched
artifact (with doc_output) to /tmp/doc-outputs/.

Environment:
  CRYSTALOS_URL        Base URL of the CrystalOS service (e.g. https://crystalos.fly.dev)
  AGENTS_INTERNAL_KEY  Shared secret for X-Internal-Key header
"""

import json
import os
import sys
from pathlib import Path

import requests

CRYSTALOS_URL = os.environ.get('CRYSTALOS_URL')
INTERNAL_KEY = os.environ.get('AGENTS_INTERNAL_KEY')

# Artifacts skipped here — handled by dedicated ingest scripts
_SKIP_FILES = {'tracker.json', 'changelog.json'}

# Timeout per doc-writer call (LLM synthesis can be slow)
_TIMEOUT_SECONDS = 120


def _validate_env() -> None:
    missing = []
    if not CRYSTALOS_URL:
        missing.append('CRYSTALOS_URL')
    if not INTERNAL_KEY:
        missing.append('AGENTS_INTERNAL_KEY')
    if missing:
        print(f'ERROR: Missing required env vars: {", ".join(missing)}', file=sys.stderr)
        raise SystemExit(1)


def call_doc_writer(artifact: dict) -> dict:
    """POST to /insights/doc-writer and return the generated doc output dict."""
    url = f'{CRYSTALOS_URL.rstrip("/")}/insights/doc-writer'
    payload = {
        'artifact_type': artifact.get('sourceType') or artifact.get('source_type'),
        'artifact_content': artifact.get('content', ''),
        'doc_key': artifact.get('docKey') or artifact.get('doc_key'),
        'doc_category': artifact.get('category'),
    }
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

    artifacts_dir = Path('/tmp/doc-artifacts')
    output_dir = Path('/tmp/doc-outputs')
    output_dir.mkdir(parents=True, exist_ok=True)

    if not artifacts_dir.exists():
        print('ERROR: /tmp/doc-artifacts does not exist — run extraction scripts first.', file=sys.stderr)
        raise SystemExit(1)

    # Collect all artifact files recursively, skip sentinel files
    artifact_files = [
        f for f in artifacts_dir.rglob('*.json')
        if f.name not in _SKIP_FILES
    ]

    if not artifact_files:
        print('No artifact files found in /tmp/doc-artifacts — nothing to do.')
        return

    print(f'Processing {len(artifact_files)} artifact(s)...')
    successes = 0
    failures = 0

    for artifact_file in sorted(artifact_files):
        try:
            artifact = json.loads(artifact_file.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError) as exc:
            failures += 1
            print(f'  ERROR reading {artifact_file.name}: {exc}', file=sys.stderr)
            continue

        doc_key = artifact.get('docKey') or artifact.get('doc_key') or artifact_file.stem

        try:
            doc_output = call_doc_writer(artifact)
            # Merge artifact with doc_output for the next stage
            enriched = {**artifact, 'doc_output': doc_output}
            output_path = output_dir / artifact_file.name
            output_path.write_text(json.dumps(enriched, indent=2, ensure_ascii=False), encoding='utf-8')
            successes += 1
            print(f'  {doc_key}')
        except requests.HTTPError as exc:
            failures += 1
            status = exc.response.status_code if exc.response is not None else '?'
            print(f'  ERROR {doc_key}: HTTP {status} — {exc}', file=sys.stderr)
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
