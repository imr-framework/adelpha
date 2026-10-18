"""Local CLI for deterministic digital-twin assessment (no live LLM required)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dtam.agents.core.models import DigitalTwinAssessment


def _print_human(assessment: DigitalTwinAssessment) -> None:
    print(f"correlation_id: {assessment.correlation_id}")
    print(f"mode:           {assessment.operating_mode.value}")
    print(f"status:         {assessment.overall_status.value}")
    print(f"confidence:     {assessment.overall_confidence:.2f}")
    print(f"activated:      {', '.join(assessment.activated_agents) or '(none)'}")
    if assessment.skipped_agents:
        skipped = "; ".join(f"{k} ({v})" for k, v in assessment.skipped_agents.items())
        print(f"skipped:        {skipped}")
    print(f"summary:        {assessment.state_summary}")
    print(f"explanation:    {assessment.explanation}")
    if assessment.findings:
        print("findings:")
        for f in assessment.findings[:12]:
            print(
                f"  - [{f.severity.value}] {f.code}: {f.summary} "
                f"(conf={f.confidence:.2f})"
            )
    if assessment.cross_domain_relationships:
        print("cross-domain:")
        for r in assessment.cross_domain_relationships:
            print(f"  - {r.summary} (consistent={r.consistent})")
    if assessment.approved_recommendations:
        print("approved:")
        for a in assessment.approved_recommendations:
            print(f"  - {a.action_type.value}: {a.description}")
    if assessment.rejected_recommendations:
        print("rejected:")
        for a in assessment.rejected_recommendations:
            print(f"  - {a.action_type.value}: {a.description}")
    if assessment.human_review_items:
        print("human-review:")
        for item in assessment.human_review_items:
            print(f"  - {item}")
    if assessment.data_quality_warnings:
        print("data-quality:")
        for w in assessment.data_quality_warnings[:10]:
            print(f"  - {w}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="DTAM multi-agent digital-twin assessment (research)"
    )
    p.add_argument(
        "--input",
        "-i",
        default=None,
        help="Path to observation JSON (required unless --from-twin)",
    )
    p.add_argument(
        "--mode",
        choices=["observe", "recommend", "act"],
        default=None,
        help="Override operating mode (act disabled unless simulation flag set)",
    )
    p.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    p.add_argument(
        "--from-twin",
        action="store_true",
        help="Ignore --input JSON body and assess live twin via estimate_twin_state",
    )
    p.add_argument(
        "--scanner-id",
        default="simulated_scanner",
        help="Scanner id when using --from-twin",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    from dtam.agents.core.adk_tools import assess_from_twin_scanner
    from dtam.agents.core.enums import OperatingMode
    from dtam.agents.core.logging_utils import configure_logging
    from dtam.agents.core.models import DigitalTwinObservation
    from dtam.agents.core.orchestrator import run_assessment

    configure_logging()
    args = build_parser().parse_args(argv)

    if args.from_twin:
        payload = assess_from_twin_scanner(
            scanner_id=args.scanner_id,
            mode=args.mode or "observe",
        )
        if args.json:
            print(json.dumps(payload, indent=2, default=str))
        else:
            data = payload.get("data", payload)
            print(json.dumps(data.get("assessment", data), indent=2, default=str))
        return 0 if payload.get("ok", False) else 1

    if not args.input:
        print("error: --input is required unless --from-twin is set", file=sys.stderr)
        return 2

    path = Path(args.input)
    if not path.is_file():
        print(f"error: input file not found: {path}", file=sys.stderr)
        return 2

    try:
        observation = DigitalTwinObservation.model_validate(
            json.loads(path.read_text(encoding="utf-8"))
        )
    except Exception as exc:  # noqa: BLE001
        print(f"error: invalid input: {exc}", file=sys.stderr)
        return 2

    mode = OperatingMode(args.mode) if args.mode else None
    try:
        assessment = run_assessment(observation, mode=mode)
    except Exception as exc:  # noqa: BLE001
        print(f"error: execution failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(assessment.model_dump(mode="json"), indent=2))
    else:
        _print_human(assessment)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
