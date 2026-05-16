.PHONY: scheduler scheduler-dev

scheduler:
	PYTHONPATH=.. .venv/bin/python -m agents.scheduler

scheduler-dev:
	PYTHONPATH=.. AGENTS_ENV=dev INSIGHT_INTERVAL_FREE_MIN=1 SCHEDULER_POLL_SEC=10 .venv/bin/python -m agents.scheduler
