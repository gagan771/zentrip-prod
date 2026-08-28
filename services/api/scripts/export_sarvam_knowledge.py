"""Export Zenny's citation-first corpus as markdown files for Sarvam Voice Agents KB."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from app.knowledge_corpus import DEEP_CORRIDOR_CLAIMS, INDIA_PLACES, MONUMENT_FEATURES, SOURCES
from app.travel_ops_corpus import MORE_PLACES, TRAVEL_OPS, TRAVEL_SOURCES

ROOT = Path(__file__).resolve().parents[3] / "docs" / "sarvam-zenny-agent" / "kb"


def _cite(source_key: str) -> str:
    pack = {**SOURCES, **TRAVEL_SOURCES}
    row = pack.get(source_key)
    if not row:
        return source_key
    name, url, *_rest = row
    return f"{name} — {url}"


def _write(name: str, title: str, body: str) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / name
    path.write_text(f"# {title}\n\n{body.strip()}\n", encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size} bytes)")


def _group_places() -> str:
    by_city: dict[str, list[str]] = defaultdict(list)
    for name, city, aliases, source_key, _entity_type, claim in INDIA_PLACES:
        alias = f" Also known as: {', '.join(aliases)}." if aliases else ""
        by_city[city].append(f"### {name}\n\n{claim}{alias}\n\nSource: {_cite(source_key)}")
    for name, city, aliases, source_key, _entity_type, claim in MORE_PLACES:
        alias = f" Also known as: {', '.join(aliases)}." if aliases else ""
        by_city[city].append(f"### {name}\n\n{claim}{alias}\n\nSource: {_cite(source_key)}")
    parts = []
    for city in sorted(by_city):
        parts.append(f"## {city}\n\n" + "\n\n".join(by_city[city]))
    return "\n\n".join(parts)


def _group_corridor() -> str:
    by_name: dict[str, list[str]] = defaultdict(list)
    for name, city, aliases, source_key, claim, confidence in DEEP_CORRIDOR_CLAIMS:
        by_name[f"{name} ({city})"].append(
            f"- ({confidence}) {claim} Also: {', '.join(aliases)}. Source: {_cite(source_key)}"
        )
    for name, city, aliases, source_key, claim in MONUMENT_FEATURES:
        by_name[f"{name} ({city})"].append(
            f"- {claim} Also: {', '.join(aliases)}. Source: {_cite(source_key)}"
        )
    parts = []
    for heading in sorted(by_name):
        parts.append(f"## {heading}\n\n" + "\n".join(by_name[heading]))
    return "\n\n".join(parts)


def _travel_ops() -> str:
    by_type: dict[str, list[str]] = defaultdict(list)
    for name, city, aliases, source_key, entity_type, claim, confidence in TRAVEL_OPS:
        by_type[entity_type].append(
            f"### {name} — {city}\n\n({confidence}) {claim}\n\nAlso: {', '.join(aliases)}.\n\nSource: {_cite(source_key)}"
        )
    parts = []
    for kind in sorted(by_type):
        parts.append(f"## {kind.replace('_', ' ').title()}\n\n" + "\n\n".join(by_type[kind]))
    return "\n\n".join(parts)


def main() -> None:
    _write(
        "01-golden-triangle.md",
        "Golden Triangle monuments (Delhi, Agra, Jaipur)",
        "Sourced claims for the corridor Zenny knows deepest. Prefer these over general knowledge.\n\n"
        + _group_corridor(),
    )
    _write(
        "02-india-places.md",
        "India places and monuments",
        "Most-visited and UNESCO-linked places across India. Each fact has a source.\n\n" + _group_places(),
    )
    _write(
        "03-travel-ops.md",
        "Travel operations: cities, seasons, routes, food districts",
        "Planning guidance. Distances and seasons are typical, not live ETAs or weather.\n\n" + _travel_ops(),
    )


if __name__ == "__main__":
    main()
