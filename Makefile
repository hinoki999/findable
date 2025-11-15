# DROP-LINK Development & Production Commands

.PHONY: help
help:
	@echo "DROP-LINK Commands:"
	@echo "  make logs-prod    - View last 100 production logs"
	@echo "  make fix-db       - Fix database migrations on Railway"
	@echo "  make monitor      - Start production monitoring dashboard"
	@echo "  make debug        - Full debug mode (logs + monitoring)"

.PHONY: logs-prod
logs-prod:
	railway logs --tail -n 100

.PHONY: fix-db
fix-db:
	railway run python backend/migrations/fix_migrations.py

.PHONY: monitor
monitor:
	python scripts/monitor_production.py

.PHONY: debug
debug:
	@echo "🔍 Starting full debug mode..."
	@echo "Press Ctrl+C to stop"
	python scripts/monitor_production.py

