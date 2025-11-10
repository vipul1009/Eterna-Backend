
FROM node:18-alpine AS base
WORKDIR /usr/src/app

FROM base AS dependencies
COPY package*.json ./
RUN npm install

FROM dependencies AS build
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

COPY . .
RUN npx prisma generate

RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json .
COPY --from=build /usr/src/app/prisma ./prisma

CMD [ "node", "dist/server.js" ]