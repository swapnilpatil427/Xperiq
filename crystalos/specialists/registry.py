"""SpecialistRegistry — loads YAML packs, matches org/survey context to specialists."""
from __future__ import annotations
import os
from pathlib import Path
import yaml
from crystalos.schemas.specialist import SpecialistManifest
from crystalos.schemas.context import OrgContextModel, SurveyContextModel
from crystalos.specialists.base import BaseSpecialist
from crystalos.lib.logger import logger

_PACKS_DIR = Path(__file__).parent / "packs"


def _load_pack(path: Path) -> BaseSpecialist | None:
    try:
        with open(path) as f:
            data = yaml.safe_load(f)
        manifest = SpecialistManifest.model_validate(data)
        return BaseSpecialist(manifest)
    except Exception as e:
        logger.warning({"msg": f"Failed to load specialist pack {path.name}", "err": str(e)})
        return None


class SpecialistRegistry:
    def __init__(self):
        self._specialists: dict[str, BaseSpecialist] = {}
        self._load_all()

    def _load_all(self):
        if not _PACKS_DIR.exists():
            logger.warning({"msg": "specialists/packs/ directory not found"})
            return
        for path in sorted(_PACKS_DIR.glob("*.yaml")):
            spec = _load_pack(path)
            if spec:
                self._specialists[spec.id] = spec
                logger.info({"msg": f"Loaded specialist: {spec.display_name}"})

    def all(self) -> list[BaseSpecialist]:
        return list(self._specialists.values())

    def get(self, id: str) -> BaseSpecialist | None:
        return self._specialists.get(id)

    def match(
        self,
        org: OrgContextModel,
        survey: SurveyContextModel,
    ) -> list[BaseSpecialist]:
        """Score all specialists against org+survey context; return ordered list.

        Returns at least one specialist (falls back to research_generic).
        Primary + any overlays scoring >= 70.
        """
        scored: list[tuple[float, BaseSpecialist]] = []

        for spec in self._specialists.values():
            m = spec.manifest.match
            score = 0.0

            # Industry match (50 pts)
            if org.industry.lower() in [i.lower() for i in m.industries]:
                score += 50
            elif any(org.industry.lower() in i.lower() for i in m.industries):
                score += 25  # partial

            # Sub-vertical match (10 pts)
            if org.sub_vertical and org.sub_vertical.lower() in [v.lower() for v in m.sub_verticals]:
                score += 10

            # Use case match (30 pts)
            if survey.use_case in m.use_cases or org.primary_use_case in m.use_cases:
                score += 30

            # Survey type match (20 pts)
            if survey.survey_type in m.survey_types:
                score += 20

            # Audience match (10 pts)
            if survey.audience in m.audiences:
                score += 10

            # Add specialist priority as tiebreaker
            final_score = score + spec.manifest.priority * 0.1

            if score > 0:
                scored.append((final_score, spec))

        if not scored:
            # Fall back to research_generic
            fallback = self._specialists.get("research_generic")
            return [fallback] if fallback else []

        scored.sort(key=lambda x: x[0], reverse=True)
        primary_score, primary = scored[0]

        # Include primary + any specialist scoring >= 70 (cross-cutting overlays)
        result = [primary]
        for score, spec in scored[1:]:
            if score >= 70 and spec.id != primary.id:
                result.append(spec)

        return result


def get_specialist_for_survey(org_industry: str, survey_type: str | None = None) -> str:
    """Map org industry + survey type to a specialist ID."""
    industry_map = {
        "healthcare":            "healthcare_cx",
        "retail":                "retail_cx",
        "financial_services":    "finserv_cx",
        "education":             "education_cx",
        "technology":            "saas_cx",
    }
    if survey_type in ("employee_engagement", "employee_satisfaction", "eNPS"):
        return "employee_ex"
    specialist = industry_map.get((org_industry or "").lower())
    return specialist or "research_generic"


# Singleton — loaded once at module import
_registry: SpecialistRegistry | None = None


def get_registry() -> SpecialistRegistry:
    global _registry
    if _registry is None:
        _registry = SpecialistRegistry()
    return _registry
