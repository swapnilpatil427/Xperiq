#!/usr/bin/env python3
"""Parse docs/TRACKER.md into structured JSON for the roadmap page.

Outputs /tmp/doc-artifacts/tracker.json with the shape:
  {
    "sections": [TrackerSection, ...],
    "stats": {"total": int, "done": int, "in_flight": int, "not_started": int}
  }
"""

import re
import json
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Optional


@dataclass
class TrackerItem:
    text: str
    done: bool
    priority: Optional[str]   # 'P0' | 'P1' | 'P2' | None
    sprint: Optional[str]
    tags: list[str]
    id: Optional[str]         # e.g. 'P0-1', extracted from leading marker


@dataclass
class TrackerSection:
    title: str
    sprint: Optional[str]
    items: list[TrackerItem]
    in_flight: bool  # True when the section has a mix of done and undone items


# Status emoji used in the tracker
_STATUS_DONE = {'✅', '🧪'}
_STATUS_SKIP = {'⏭️'}

# Regex patterns
_SECTION_RE = re.compile(r'^##\s+(.+)$', re.MULTILINE)
_SUBSECTION_RE = re.compile(r'^###\s+(.+)$', re.MULTILINE)
_TABLE_ITEM_RE = re.compile(
    r'^\|\s*(?P<id>[A-Z0-9]+-\d+|)\s*\|'    # optional task ID
    r'\s*(?P<text>[^|]+)\|'                  # task description
    r'\s*(?P<status>[^|]+)\|'               # status column
    r'(?P<rest>.*)',                          # rest
    re.MULTILINE,
)
_CHECKBOX_RE = re.compile(r'^\s*-\s+\[(?P<check>[xX ])\]\s+(?P<text>.+)$', re.MULTILINE)
_PRIORITY_RE = re.compile(r'\[?(?P<p>P[012])\]?')
_SPRINT_RE = re.compile(r'Sprint\s+(\d+)', re.IGNORECASE)
_ID_RE = re.compile(r'^(?P<id>[A-Z]+\d*-\d+)\s+')


def _extract_priority(text: str) -> Optional[str]:
    m = _PRIORITY_RE.search(text)
    return m.group('p') if m else None


def _extract_sprint(text: str) -> Optional[str]:
    m = _SPRINT_RE.search(text)
    return f"Sprint {m.group(1)}" if m else None


def _extract_tags(text: str) -> list[str]:
    """Extract hashtag-style or bracket-style tags."""
    tags: list[str] = []
    # Bracket tags: [tag]
    bracket = re.findall(r'\[([A-Za-z0-9_\-]+)\]', text)
    tags.extend(t for t in bracket if t not in ('x', ' ', 'X'))
    # Remove priority tags, they're already captured separately
    return [t for t in tags if not re.match(r'^P[012]$', t)]


def _parse_status_text(status_text: str) -> bool:
    """Return True if the status emoji/text indicates done."""
    for marker in _STATUS_DONE:
        if marker in status_text:
            return True
    return False


def _parse_table_rows(section_text: str) -> list[TrackerItem]:
    """Parse tracker table rows of the form: | ID | Task | Status | Notes |"""
    items: list[TrackerItem] = []

    # Split into lines and look for table rows (start with |)
    lines = section_text.split('\n')
    in_table = False
    header_found = False

    for line in lines:
        stripped = line.strip()
        if not stripped.startswith('|'):
            if in_table:
                # Table ended
                in_table = False
                header_found = False
            continue

        # Skip separator rows (e.g. |---|---|)
        if re.match(r'^\|[-|: ]+\|$', stripped):
            in_table = True
            continue

        # Skip header rows that contain column names
        if not in_table:
            in_table = True
            # Check if this looks like a header
            lower = stripped.lower()
            if 'task' in lower and ('status' in lower or 'done' in lower):
                header_found = True
                continue

        if header_found and '|' in stripped:
            header_found = False
            continue

        # Parse data row
        parts = [p.strip() for p in stripped.split('|')]
        # Remove empty first/last from leading/trailing |
        if parts and parts[0] == '':
            parts = parts[1:]
        if parts and parts[-1] == '':
            parts = parts[:-1]

        if len(parts) < 2:
            continue

        # Columns: ID?, Task, Status, Notes
        if len(parts) >= 3:
            # Try to detect which column is the ID
            col0, col1, col2 = parts[0], parts[1], parts[2]
            # If col0 looks like an ID (e.g. P0-1, T1-2)
            if re.match(r'^[A-Z]+\d*-\d+$', col0):
                task_id = col0
                task_text = col1
                status_col = col2
            else:
                task_id = None
                task_text = col0
                status_col = col1
        elif len(parts) == 2:
            task_id = None
            task_text = parts[0]
            status_col = parts[1]
        else:
            continue

        if not task_text or task_text.lower() in ('task', 'description', 'item'):
            continue

        done = _parse_status_text(status_col)

        # Skip separator or header-like rows
        if re.match(r'^[-=]+$', task_text):
            continue

        priority = _extract_priority(task_text) or _extract_priority(status_col)
        sprint = _extract_sprint(task_text) or _extract_sprint(status_col)
        tags = _extract_tags(task_text)

        # Clean the task text of status markers
        clean_text = task_text
        for marker in _STATUS_DONE | _STATUS_SKIP:
            clean_text = clean_text.replace(marker, '').strip()

        items.append(TrackerItem(
            text=clean_text,
            done=done,
            priority=priority,
            sprint=sprint,
            tags=tags,
            id=task_id,
        ))

    return items


def _parse_checkbox_items(section_text: str) -> list[TrackerItem]:
    """Parse Markdown checkbox items: - [x] text or - [ ] text."""
    items: list[TrackerItem] = []
    for m in _CHECKBOX_RE.finditer(section_text):
        check = m.group('check').lower()
        text = m.group('text').strip()
        done = check == 'x'
        priority = _extract_priority(text)
        sprint = _extract_sprint(text)
        tags = _extract_tags(text)
        items.append(TrackerItem(
            text=text,
            done=done,
            priority=priority,
            sprint=sprint,
            tags=tags,
            id=None,
        ))
    return items


def parse_tracker(content: str) -> dict:
    """
    Parse the TRACKER.md content and return a structured dict with:
      - sections: list of TrackerSection
      - stats: { total, done, in_flight, not_started }
    """
    sections: list[TrackerSection] = []

    # Find all ## section headers and their positions
    section_matches = list(_SECTION_RE.finditer(content))

    for i, sec_match in enumerate(section_matches):
        title = sec_match.group(1).strip()

        # Skip meta sections that aren't task lists
        skip_titles = {'overall progress', 'current recommendation', 'how to use'}
        if title.lower() in skip_titles or title.startswith('⚡'):
            continue

        # Capture the section body up to the next ## header
        start = sec_match.end()
        end = section_matches[i + 1].start() if i + 1 < len(section_matches) else len(content)
        body = content[start:end]

        sprint = _extract_sprint(title) or _extract_sprint(body[:200])

        # Try table rows first, fall back to checkboxes
        items = _parse_table_rows(body)
        if not items:
            items = _parse_checkbox_items(body)

        if not items:
            continue

        done_count = sum(1 for it in items if it.done)
        in_flight = 0 < done_count < len(items)

        sections.append(TrackerSection(
            title=title,
            sprint=sprint,
            items=items,
            in_flight=in_flight,
        ))

    # Compute aggregate stats
    total = sum(len(s.items) for s in sections)
    done = sum(sum(1 for it in s.items if it.done) for s in sections)
    in_flight_sections = sum(1 for s in sections if s.in_flight)
    not_started = sum(
        sum(1 for it in s.items if not it.done) for s in sections
    )

    return {
        'sections': [asdict(s) for s in sections],
        'stats': {
            'total': total,
            'done': done,
            'not_started': not_started,
            'in_flight_sections': in_flight_sections,
            'completion_pct': round(done / total * 100, 1) if total > 0 else 0,
        },
    }


if __name__ == '__main__':
    tracker_path = Path(__file__).parent.parent / 'docs' / 'TRACKER.md'
    if not tracker_path.exists():
        print(f'ERROR: TRACKER.md not found at {tracker_path}', flush=True)
        raise SystemExit(1)

    content = tracker_path.read_text(encoding='utf-8')
    result = parse_tracker(content)

    output_path = Path('/tmp/doc-artifacts/tracker.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))

    stats = result['stats']
    print(
        f"Parsed {stats['total']} tracker items: "
        f"{stats['done']} done, "
        f"{stats['not_started']} not started, "
        f"{stats['in_flight_sections']} sections in-flight "
        f"({stats['completion_pct']}% complete)"
    )
