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
