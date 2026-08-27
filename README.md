# Cobuccio Wallet API

NestJS backend for the wallet challenge — user registration, authentication, deposits, transfers with balance validation, and reversible transactions.

## Prerequisites

Everything below is needed on both macOS and Linux. Docker + `make` are enough to run the whole stack (`make up-dev`); Node + Yarn are only needed for commands that run on the host instead of inside a container (`make install`, `make migration-*`, or any direct `yarn ...` command).

### Docker + Docker Compose

- **macOS**: install [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) (bundles Docker Compose). Or via Homebrew: `brew install --cask docker`.
- **Linux**: install [Docker Engine](https://docs.docker.com/engine/install/) for your distro (e.g. `curl -fsSL https://get.docker.com | sh` works on most), then the Compose plugin if it isn't already bundled (Debian/Ubuntu: `sudo apt-get install docker-compose-plugin`). Add your user to the `docker` group so you don't need `sudo` for every command: `sudo usermod -aG docker $USER` (log out and back in for it to take effect).

Check with `docker --version` and `docker compose version`.

### `make`

Check first: `make --version`.

- **macOS**: ships with `make` via the Xcode Command Line Tools. If the check above fails: `xcode-select --install`.
- **Linux (Debian/Ubuntu)**: `sudo apt-get update && sudo apt-get install -y make`
- **Linux (Fedora/RHEL)**: `sudo dnf install -y make`
- **Linux (Arch)**: `sudo pacman -S make`

`make` itself also checks for Docker/Docker Compose (`check-docker`) and fails with a clear error if either is missing.

### Node.js (via nvm) + Yarn

This repo pins its Node version in `.nvmrc`. Install nvm following the [official instructions](https://github.com/nvm-sh/nvm#installing-and-updating) (same install script for macOS and Linux), then, from inside this repo:

```bash
$ nvm install   # reads .nvmrc automatically
$ nvm use
```

Yarn (Classic, v1) is the package manager used throughout. If it's not already installed:

```bash
$ npm install --global yarn
```

## Docker (Makefile)

This repo is self-contained: it has its own `Makefile`, `docker-compose.yml` and `.env.example`, and it also owns the Postgres database used by the API. Postgres has its own lifecycle, decoupled from the API container — start/stop it explicitly with `make database` / `make stop-database` (matching the ChartChampions reference project, `up`/`up-dev` never touch it).

### Getting started

From scratch, running these in order gets you a working API in dev mode:

```bash
$ cp .env.example .env    # the Makefile also does this automatically on the first run of any command
$ make install             # installs dependencies locally — migrations run on the host, not in a container
$ make database             # starts only the Postgres container
$ make migration-run         # creates every table
$ make build-dev               # builds the dev image
$ make up-dev                   # starts the API in dev mode (hot reload) at http://localhost:4000
```

Available commands, grouped the same way as in the `Makefile`:

```bash
# database
$ make database              # starts only the Postgres container
$ make stop-database         # stops the Postgres container
$ make psql                  # connects to Postgres via psql
$ make db-truncate           # deletes ALL DATA from every table, keeping the schema and migration history intact
$ make db-drop               # destroys EVERY table (including migration history) — leaves the database ready for `make migration-run`

# migrations (run yarn/ts-node on the host, not inside Docker — requires `make database` to be running)
$ make migration-generate NAME=CreateUsers   # generates a migration by diffing entities against the database
$ make migration-run                         # runs pending migrations
$ make migration-revert                      # reverts the last migration

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

## API

### `POST /users` — sign up

Creates a user and its address in a single database transaction (if either insert fails, both are rolled back). CPF is validated server-side (checksum digits, not just format) regardless of what the client already validated. Email and CPF must be unique; the password is hashed with argon2id and is never returned.

Request body:

```json
{
  "name": "Ana Silva",
  "email": "ana@example.com",
  "cpf": "52998224725",
  "phone": "11987654321",
  "address": {
    "zipCode": "01310100",
    "street": "Avenida Paulista",
    "number": "1000",
    "complement": "Apto 42",
    "neighborhood": "Bela Vista",
    "city": "São Paulo",
    "state": "SP"
  },
  "monthlyIncome": 3500,
  "password": "Senha123"
}
```

Responses:

- `201 Created` — the created user (`id`, `name`, `email`, `cpf`, `phone`, `monthlyIncome`, timestamps). Never includes the password.
- `400 Bad Request` — validation error (invalid CPF, weak password, invalid UF, unknown field, etc.), e.g. `{ "statusCode": 400, "message": ["cpf must be a valid CPF number"], "error": "Bad Request" }`.
- `409 Conflict` — email or CPF already registered, e.g. `{ "statusCode": 409, "code": "EMAIL_ALREADY_REGISTERED", "message": "This email is already registered" }` (`code` is also `CPF_ALREADY_REGISTERED`).

## Run tests

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```
