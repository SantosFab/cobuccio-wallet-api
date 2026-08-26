# Cobuccio Wallet API

NestJS backend for the wallet challenge — user registration, authentication, deposits, transfers with balance validation, and reversible transactions.

## Docker (Makefile)

This repo is self-contained: it has its own `Makefile`, `docker-compose.yml` and `.env.example`, and it also owns the Postgres database used by the API. Postgres has its own lifecycle, decoupled from the API container — start/stop it explicitly with `make database` / `make stop-database` (matching the ChartChampions reference project, `up`/`up-dev` never touch it).

```bash
# copy the environment file (the Makefile also does this automatically
# on the first run of any command, if .env is missing)
$ cp .env.example .env
```

Available commands, grouped the same way as in the `Makefile`:

```bash
# database
$ make database              # starts only the Postgres container
$ make stop-database         # stops the Postgres container
$ make psql                  # connects to Postgres via psql

# dependencies
$ make install                # installs project dependencies locally (yarn, outside Docker)

# development
$ make build-dev               # [dev] builds the development image
$ make up-dev                  # [dev] recreates the development container (hot reload) — Postgres is not touched
$ make stop-dev                # [dev] stops the development container — Postgres is not touched

# production
$ make build                    # [prod] builds the production image
$ make up                       # [prod] recreates the production container — Postgres is not touched
$ make stop                     # [prod] stops the production container — Postgres is not touched

# misc
$ make logs SERVICE=api-dev      # follows the logs of a given service (api, api-dev or postgres)
$ make help                      # lists every available command
```

- API: http://localhost:4000 (port configurable via `DOCKER_API_PORT` in `.env`)
- Postgres: `localhost:5432` (port configurable via `DOCKER_DB_PORT` in `.env`)

`cobuccio-wallet-web` must use the same `COMPOSE_PROJECT_NAME` in its own `.env` so both repos join the same Docker network and can reach each other by hostname (`api`, `web`, `postgres`).

## Project setup

Use `make install` (see above) to install dependencies locally.

## Compile and run the project

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev

# production mode
$ yarn start:prod
```

## Run tests

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```
