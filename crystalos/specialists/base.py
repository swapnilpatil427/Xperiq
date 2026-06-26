"""Base class for all specialist agents."""
from __future__ import annotations
from crystalos.schemas.specialist import SpecialistManifest
from crystalos.schemas.context import OrgContextModel, SurveyContextModel


class BaseSpecialist:
    """Wraps a SpecialistManifest and provides runtime hooks."""

    def __init__(self, manifest: SpecialistManifest):
        self.manifest = manifest

    @property
    def id(self) -> str:
        return self.manifest.id

    @property
    def display_name(self) -> str:
        return self.manifest.display_name

    def overlay_system_prompt(self, base: str, node: str) -> str:
        """Prepend specialist system overlay to an existing prompt."""
        overlay_map = {
            "narrate": self.manifest.prompt_overlays.narrate_system,
            "topics":  self.manifest.prompt_overlays.topics_system,
            "crystal": self.manifest.prompt_overlays.crystal_system,
            "creator": self.manifest.prompt_overlays.creator_system,
        }
        overlay = overlay_map.get(node, "")
        if not overlay:
            return base
        return f"{overlay}\n\n{base}"

    def benchmark_for(self, metric: str) -> dict | None:
        band = self.manifest.benchmarks.get(metric)
        if band is None:
            return None
        return band.model_dump()

    def canonical_topics(self) -> list[dict]:
        return [t.model_dump() for t in self.manifest.taxonomy.canonical_topics]

    def vocabulary(self) -> dict:
        return self.manifest.vocabulary.model_dump()

    def question_templates(self) -> list[dict]:
        return [q.model_dump() for q in self.manifest.question_templates]

    def post_score_priority(self, insight: dict, ctx: dict) -> float:
        """Override in subclasses for compliance/domain-specific priority adjustments."""
        # Boost insights that mention red-flag vocabulary
        red_flags = self.manifest.vocabulary.red_flags
        if red_flags:
            text = (insight.get("headline", "") + " " + insight.get("narrative", "")).lower()
            if any(rf.lower() in text for rf in red_flags):
                return min(1.0, insight.get("priority", 0.5) + 0.25)
        return insight.get("priority", 0.5)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} id={self.id!r}>"
