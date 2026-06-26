#!/usr/bin/env python3
"""Extract skill metadata from SKILL.md files for doc generation.

For each skill directory under crystalos/skills/ that contains a SKILL.md,
this script produces a JSON artifact at /tmp/doc-artifacts/skills/<name>.json.
"""

import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

# yaml is available in the crystalos requirements.txt (pyyaml)
try:
    import yaml
except ImportError:
    print("ERROR: pyyaml is required. Run: pip install pyyaml", file=sys.stderr)
    raise SystemExit(1)


@dataclass
class SkillArtifact:
    doc_key: str          # e.g. 'crystal/crystal-analyst'
    title: str
    category: str         # 'crystal'
    source_type: str      # 'skill-extract'
    source_ref: str       # relative file path
    content: str          # formatted human-readable documentation


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split YAML frontmatter from Markdown body.

    Returns (frontmatter_dict, body_text). If no frontmatter markers
    are present, returns ({}, text).
    """
    if not text.startswith('---'):
        return {}, text

    end = text.find('\n---', 3)
    if end == -1:
        return {}, text

    yaml_block = text[3:end].strip()
    body = text[end + 4:].strip()

    try:
        data = yaml.safe_load(yaml_block) or {}
    except yaml.YAMLError:
        data = {}

    return data, body


def _extract_section(body: str, heading: str) -> Optional[str]:
    """Return the content of a Markdown section by its heading (case-insensitive)."""
    pattern = re.compile(
        r'^#{1,3}\s+' + re.escape(heading) + r'\s*\n([\s\S]*?)(?=^#{1,3}\s|\Z)',
        re.MULTILINE | re.IGNORECASE,
    )
    m = pattern.search(body)
    if m:
        return m.group(1).strip()
    return None


def _first_paragraph(body: str) -> str:
    """Return the first non-empty paragraph of the body text."""
    paragraphs = [p.strip() for p in body.split('\n\n') if p.strip()]
    return paragraphs[0] if paragraphs else ''


def extract_skill(skill_dir: Path) -> Optional[SkillArtifact]:
    """Extract a SkillArtifact from a skill directory containing SKILL.md."""
    skill_md = skill_dir / 'SKILL.md'
    if not skill_md.exists():
        return None

    raw = skill_md.read_text(encoding='utf-8')
    frontmatter, body = _parse_frontmatter(raw)

    skill_name = frontmatter.get('name') or skill_dir.name
    version = frontmatter.get('version', '1.0.0')
    description = frontmatter.get('description', '').strip()
    compatibility = frontmatter.get('compatibility', '').strip()
    allowed_tools_raw = frontmatter.get('allowed-tools', '')
    if isinstance(allowed_tools_raw, str):
        allowed_tools = [t.strip() for t in allowed_tools_raw.split() if t.strip()]
    elif isinstance(allowed_tools_raw, list):
        allowed_tools = [str(t).strip() for t in allowed_tools_raw]
    else:
        allowed_tools = []

    max_output_tokens = frontmatter.get('max_output_tokens')
    timeout_seconds = frontmatter.get('timeout_seconds')

    # Extract key body sections
    context_section = _extract_section(body, 'Context')
    output_schema_section = _extract_section(body, 'Output Schema') or _extract_section(body, 'Output')
    input_section = _extract_section(body, 'Input') or _extract_section(body, 'Input Schema')

    # Fall back to first paragraph if no context section
    if not context_section:
        context_section = _first_paragraph(body)

    # Build human-readable content
    lines: list[str] = []

    # Title and version
    title = f"{skill_name.replace('-', ' ').title()} Skill"
    lines.append(f"# {title}")
    lines.append(f"**Version:** {version}")
    lines.append('')

    # Description
    if description:
        lines.append('## Description')
        lines.append(description)
        lines.append('')

    # Context / what this skill does
    if context_section:
        lines.append('## What this skill does')
        # Truncate if very long — doc-writer will synthesise; keep first 400 chars
        truncated = context_section[:600] + ('...' if len(context_section) > 600 else '')
        lines.append(truncated)
        lines.append('')

    # Allowed tools
    if allowed_tools:
        lines.append('## Tools this skill can call')
        for tool in allowed_tools:
            lines.append(f'- `{tool}`')
        lines.append('')

    # Input schema excerpt
    if input_section:
        lines.append('## Input schema (excerpt)')
        lines.append(input_section[:400] + ('...' if len(input_section) > 400 else ''))
        lines.append('')

    # Output schema excerpt
    if output_schema_section:
        lines.append('## Output schema (excerpt)')
        lines.append(output_schema_section[:400] + ('...' if len(output_schema_section) > 400 else ''))
        lines.append('')

    # Compatibility
    if compatibility:
        lines.append('## Compatibility')
        lines.append(compatibility[:300] + ('...' if len(compatibility) > 300 else ''))
        lines.append('')

    # Operational limits
    limits: list[str] = []
    if max_output_tokens:
        limits.append(f'Max output tokens: {max_output_tokens}')
    if timeout_seconds:
        limits.append(f'Timeout: {timeout_seconds}s')
    if limits:
        lines.append('## Operational limits')
        for limit in limits:
            lines.append(f'- {limit}')
        lines.append('')

    # Relative path for source_ref
    try:
        source_ref = str(skill_md.relative_to(Path(__file__).parent.parent.parent))
    except ValueError:
        source_ref = str(skill_md)

    return SkillArtifact(
        doc_key=f'crystal/{skill_name}',
        title=title,
        category='crystal',
        source_type='skill-extract',
        source_ref=source_ref,
        content='\n'.join(lines),
    )


if __name__ == '__main__':
    # Skills are in crystalos/skills/ relative to the repo root
    # This script lives at crystalos/scripts/extract-skills.py
    scripts_dir = Path(__file__).parent
    crystalos_dir = scripts_dir.parent
    skills_dir = crystalos_dir / 'skills'

    if not skills_dir.exists():
        print(f'ERROR: skills directory not found at {skills_dir}', file=sys.stderr)
        raise SystemExit(1)

    output_dir = Path('/tmp/doc-artifacts/skills')
    output_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    errors = 0

    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue
        # Skip __pycache__ and hidden dirs
        if skill_dir.name.startswith('__') or skill_dir.name.startswith('.'):
            continue

        try:
            artifact = extract_skill(skill_dir)
            if artifact:
                # Sanitise the doc_key for use as a filename
                safe_name = artifact.doc_key.replace('/', '_')
                output_path = output_dir / f'{safe_name}.json'
                output_path.write_text(
                    json.dumps(asdict(artifact), indent=2, ensure_ascii=False),
                    encoding='utf-8',
                )
                count += 1
                print(f'  {artifact.doc_key}')
            else:
                print(f'  (skipped {skill_dir.name} — no SKILL.md)')
        except Exception as exc:
            errors += 1
            print(f'  ERROR {skill_dir.name}: {exc}', file=sys.stderr)

    print(f'\nExtracted {count} skill artifacts', end='')
    if errors:
        print(f', {errors} errors', end='')
    print()

    if errors:
        raise SystemExit(1)
