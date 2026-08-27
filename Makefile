#!make
SHELL := $(shell which bash || echo 'no-bash')
GIT := $(shell which git || echo 'no-git')

all: help

# Creates .env from .env.example, if it does not exist yet
ENV_FILE := ./.env
$(ENV_FILE):
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "Creating .env file..."; \
		cp ./.env.example $(ENV_FILE); \
	else \
		echo ".env file already exists. Keeping current file."; \
	fi

include $(ENV_FILE)

SYSTEM_VERSION := $(if ${IMAGE_VERSION},$(shell echo "${IMAGE_VERSION}"),$(shell $(GIT) describe --tag --dirty=-local-changes --always 2>/dev/null || echo "dev"))

# Checks if Docker and Docker Compose are installed
DOCKER_CMD_PATH=$(shell which docker >/dev/null 2>&1 && echo "docker" || echo "no-docker")
DOCKER_COMPOSE_CMD=$(shell (docker compose version >/dev/null 2>&1 && echo "docker compose") || (which docker-compose >/dev/null 2>&1 && echo "docker-compose") || echo "no-docker")

DOCKER_ENV=SYSTEM_VERSION=${SYSTEM_VERSION}
DOCKER_CMD=${DOCKER_ENV} docker
DOCKER_COMPOSE=${DOCKER_ENV} ${DOCKER_COMPOSE_CMD} -f docker-compose.yml

# BSD sed (macOS) requires a backup suffix right after -i, GNU sed (Linux) does not.
# Without this, macOS treats the next "-e" as the suffix and leaves a stray ".env-e" file behind.
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	SED_INPLACE := sed -i ''
else
	SED_INPLACE := sed -i
endif

check-docker:
	@echo "Checking Docker and Docker Compose..."
ifeq ($(DOCKER_CMD_PATH), no-docker)
	$(error "Docker not found")
endif
ifeq ($(DOCKER_COMPOSE_CMD), no-docker)
	$(error "Docker Compose not found")
endif

versions: ## Sets NODE_VERSION and SYSTEM_VERSION into the .env file
	@echo "System version: ${SYSTEM_VERSION}"
	@echo "${SYSTEM_VERSION}" > ./.version
	@export NODE_VERSION=$$(cat ./.nvmrc | sed -e 's/v//g' | sed -e 's/\//-/g'); \
		echo "Node [$$NODE_VERSION]"; \
		${SED_INPLACE} -e "s|^NODE_ENV=.*|NODE_ENV=${ENV_RUN}|" ./.env; \
		${SED_INPLACE} -e "s|^NODE_VERSION=.*|NODE_VERSION=$$NODE_VERSION|" ./.env; \
		${SED_INPLACE} -e "s|^SYSTEM_VERSION=.*|SYSTEM_VERSION=${SYSTEM_VERSION}|" ./.env

## --- Database ---

database: check-docker versions ## Starts only the Postgres container
	@${DOCKER_COMPOSE} up -d postgres

stop-database: check-docker versions ## Stops the Postgres container
	@${DOCKER_COMPOSE} stop postgres

psql: check-docker versions ## Connects to Postgres via psql
	@$(eval DATABASE_CONTAINER_ID := $(shell ${DOCKER_CMD} ps -f name=${COMPOSE_PROJECT_NAME} --format "{{.Names}}" | grep postgres))
	@${DOCKER_CMD} exec -it ${DATABASE_CONTAINER_ID} psql -U ${DATABASE_USERNAME} -d ${DATABASE_NAME}

db-truncate: check-docker versions ## Deletes ALL DATA from every table, keeping the schema and migration history intact
	@$(eval DATABASE_CONTAINER_ID := $(shell ${DOCKER_CMD} ps -f name=${COMPOSE_PROJECT_NAME} --format "{{.Names}}" | grep postgres))
	@${DOCKER_CMD} exec -it ${DATABASE_CONTAINER_ID} psql -U ${DATABASE_USERNAME} -d ${DATABASE_NAME} -c "SELECT format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE;', tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations' \gexec"

db-drop: check-docker versions ## Destroys EVERY table (including migration history), leaving the database empty and ready for `make migration-run`
	@$(eval DATABASE_CONTAINER_ID := $(shell ${DOCKER_CMD} ps -f name=${COMPOSE_PROJECT_NAME} --format "{{.Names}}" | grep postgres))
	@${DOCKER_CMD} exec -it ${DATABASE_CONTAINER_ID} psql -U ${DATABASE_USERNAME} -d ${DATABASE_NAME} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${DATABASE_USERNAME}; GRANT ALL ON SCHEMA public TO public; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

## --- Mail (Mailhog) ---

mailhog: check-docker versions ## Starts only the Mailhog container
	@${DOCKER_COMPOSE} up -d mailhog

stop-mailhog: check-docker versions ## Stops the Mailhog container
	@${DOCKER_COMPOSE} stop mailhog

## --- Migrations ---
## These run yarn/ts-node directly on the host (like `make install`), not
## inside Docker. The .env value for DATABASE_HOST ("postgres") only
## resolves inside the compose network, so it's overridden below — but
## via its own variable (not DATABASE_HOST itself), so it doesn't affect
## any other target, and so it can be pointed elsewhere (CI, a deployed
## environment) without editing this file, e.g.:
##   make migration-run MIGRATION_DATABASE_HOST=my-prod-db.example.com
## Requires `make database` to be running first when using the default.
MIGRATION_DATABASE_HOST ?= 127.0.0.1

migration-generate: versions ## Generates a migration by diffing entities against the database. Usage: make migration-generate NAME=CreateUsers
	@DATABASE_HOST=$(MIGRATION_DATABASE_HOST) yarn migration:generate src/migrations/$(NAME)

migration-run: versions ## Runs pending migrations
	@DATABASE_HOST=$(MIGRATION_DATABASE_HOST) yarn migration:run

migration-revert: versions ## Reverts the last migration
	@DATABASE_HOST=$(MIGRATION_DATABASE_HOST) yarn migration:revert

## --- Dependencies ---

install: ## Installs project dependencies locally (yarn, outside Docker)
	@yarn install

## --- Development ---

build-dev: check-docker versions ## [dev] Builds the development image
	@${DOCKER_COMPOSE} build api-dev

up-dev: check-docker versions ## [dev] Recreates the development container (hot reload). Postgres is not touched — see `make database`
	@${DOCKER_COMPOSE} up -d --force-recreate --no-deps api-dev

stop-dev: check-docker versions ## [dev] Stops the development container. Postgres is not touched — see `make stop-database`
	@${DOCKER_COMPOSE} stop api-dev

## --- Production ---

build: check-docker versions ## [prod] Builds the production image
	@${DOCKER_COMPOSE} build api

up: check-docker versions ## [prod] Recreates the production container. Postgres is not touched — see `make database`
	@${DOCKER_COMPOSE} up -d --force-recreate --no-deps api

stop: check-docker versions ## [prod] Stops the production container. Postgres is not touched — see `make stop-database`
	@${DOCKER_COMPOSE} stop api

## --- Misc ---

logs: check-docker ## Shows the logs. Usage: make logs SERVICE=api|api-dev|postgres|mailhog
	@${DOCKER_COMPOSE} logs -f $(SERVICE)

help: versions ## Shows this help
	@echo
	@echo "Available commands:"
	@echo
	@sed -n -E -e 's|^([a-zA-Z_-]+):.+## (.+)|\1@\2|p' $(MAKEFILE_LIST) | column -s '@' -t
	@echo

# vim: set ts=4 sw=4 tw=0 noet :
