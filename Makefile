.PHONY: dev-shell dev-personal dev-backend dev-frontend install-backend install-frontend install-shell \
        build-personal-mac build-business-mac \
        docker-up-personal docker-down-personal docker-down-personal-clean docker-down-personal-purge \
        docker-up-business docker-down-business docker-down-business-clean docker-down-business-purge \
        docker-up docker-down docker-down-clean docker-down-purge

# ── Shell launcher ────────────────────────────────────────────────────────────

dev-shell:
	cd shell/frontend && npm run dev -- --port 3001

build-shell:
	cd shell/src-tauri && cargo tauri build

# ── Personal app ──────────────────────────────────────────────────────────────

dev-backend:
	cd apps/personal/backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd apps/personal/frontend && npm run dev

dev-personal:
	make -j2 dev-backend dev-frontend

dev-business-backend:
	cd apps/business/backend && .venv/bin/uvicorn app.main:app --reload --port 8001

dev-business-frontend:
	cd apps/business/frontend && npm run dev -- --port 3002

dev-business:
	make -j2 dev-business-backend dev-business-frontend

# ── Install ───────────────────────────────────────────────────────────────────

install-backend:
	cd apps/personal/backend && pip install -r requirements.txt

install-frontend:
	cd apps/personal/frontend && npm install

install-shell:
	cd shell/frontend && npm install

install: install-backend install-frontend install-shell

# ── Build ─────────────────────────────────────────────────────────────────────
#
#   macOS (run on a Mac):
#     make build-personal-mac
#     make build-business-mac
#
#   Windows (run on Windows, from project root):
#     build-personal-windows.bat            (CPU)
#     build-personal-windows.bat --cuda     (NVIDIA GPU)
#     build-business-windows.bat            (CPU)
#     build-business-windows.bat --cuda     (NVIDIA GPU)

build-personal-mac:
	chmod +x build-personal-mac.sh
	./build-personal-mac.sh

build-business-mac:
	chmod +x build-business-mac.sh
	./build-business-mac.sh

# ── Docker: Personal ──────────────────────────────────────────────────────────
#
#   Volumes:
#     loqa-personal-models  — model files (.gguf, embed, reranker)
#     loqa-personal-data    — databases, chromadb, uploaded documents
#
#   down              → stop containers only  (models ✓ data ✓)
#   down-clean        → stop + delete data    (models ✓ data ✗)
#   down-purge        → stop + delete all     (models ✗ data ✗)

docker-up-personal:
	docker compose -f docker/personal/docker-compose.yml up --build -d
	@echo ""
	@echo "LOQA Personal running at http://localhost:3000"

docker-down-personal:
	docker compose -f docker/personal/docker-compose.yml down
	@echo "Containers stopped. Models and data volumes preserved."

docker-down-personal-clean:
	docker compose -f docker/personal/docker-compose.yml down
	docker volume rm -f loqa-personal-data
	@echo "Containers stopped. Data volume removed. Models preserved."

docker-down-personal-purge:
	docker compose -f docker/personal/docker-compose.yml down
	docker volume rm -f loqa-personal-data loqa-personal-models
	@echo "Containers stopped. All volumes removed."

# ── Docker: Business ──────────────────────────────────────────────────────────
#
#   Volumes:
#     loqa-business-models  — model files (.gguf, embed, reranker)
#     loqa-business-data    — databases, chromadb, uploaded documents
#
#   down              → stop containers only  (models ✓ data ✓)
#   down-clean        → stop + delete data    (models ✓ data ✗)
#   down-purge        → stop + delete all     (models ✗ data ✗)

docker-up-business:
	docker compose -f docker/business/docker-compose.yml up --build -d
	@echo ""
	@echo "LOQA Business running at http://localhost:3002"

docker-down-business:
	docker compose -f docker/business/docker-compose.yml down
	@echo "Containers stopped. Models and data volumes preserved."

docker-down-business-clean:
	docker compose -f docker/business/docker-compose.yml down
	docker volume rm -f loqa-business-data
	@echo "Containers stopped. Data volume removed. Models preserved."

docker-down-business-purge:
	docker compose -f docker/business/docker-compose.yml down
	docker volume rm -f loqa-business-data loqa-business-models
	@echo "Containers stopped. All volumes removed."

# ── Docker: Both apps ─────────────────────────────────────────────────────────

docker-up:
	$(MAKE) docker-up-personal
	$(MAKE) docker-up-business

docker-down:
	$(MAKE) docker-down-personal
	$(MAKE) docker-down-business

docker-down-clean:
	$(MAKE) docker-down-personal-clean
	$(MAKE) docker-down-business-clean

docker-down-purge:
	$(MAKE) docker-down-personal-purge
	$(MAKE) docker-down-business-purge
