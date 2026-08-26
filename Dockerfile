# Load variables from .env file
ARG NODE_VERSION

## Base image contains the build environment, without application code.
FROM node:${NODE_VERSION} AS base

RUN mkdir /app
WORKDIR /app

EXPOSE 3000

## DEV is used in development environment (hot reload via mounted volume)
FROM base AS dev

CMD ["sh", "-c", "yarn install && yarn start:dev"]

## FINAL is built on top of BASE, with a production build.
FROM base AS final

COPY --chown=node:node ./ /app/

RUN rm -rf /app/node_modules /app/dist

RUN yarn install --frozen-lockfile

ENV NODE_ENV=production

RUN yarn build

CMD ["yarn", "start:prod"]
