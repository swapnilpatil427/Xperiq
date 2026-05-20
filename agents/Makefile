.PHONY: run run-dev scheduler scheduler-dev logs logs-pretty

# Start the FastAPI agents service locally (stream consumer auto-enabled via REDIS_URL)
run:
	PYTHONPATH=.. AGENTS_ENV=dev-paid REDIS_URL=redis://localhost:6379 \
	  .venv/bin/uvicorn agents.main:app --host 0.0.0.0 --port 8001 --reload

run-dev:
	PYTHONPATH=.. AGENTS_ENV=dev REDIS_URL=redis://localhost:6379 LOG_PRETTY=1 \
	  .venv/bin/uvicorn agents.main:app --host 0.0.0.0 --port 8001 --reload

scheduler:
	PYTHONPATH=.. .venv/bin/python -m agents.scheduler

scheduler-dev:
	PYTHONPATH=.. AGENTS_ENV=dev INSIGHT_INTERVAL_FREE_MIN=1 SCHEDULER_POLL_SEC=10 .venv/bin/python -m agents.scheduler

# Pretty-print live Docker logs (colorized errors/warnings)
logs:
	docker compose logs -f agents 2>&1 | python3 agents/logfmt.py

# Run scheduler locally with LOG_PRETTY=1 (colored output, dev-paid thresholds)
logs-pretty:
	PYTHONPATH=.. AGENTS_ENV=dev-paid LOG_PRETTY=1 INSIGHT_INTERVAL_FREE_MIN=1 SCHEDULER_POLL_SEC=10 .venv/bin/python -m agents.scheduler
