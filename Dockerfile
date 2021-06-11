FROM node:buster
RUN apt-get update && apt-get install -y ffmpeg ca-certificates python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install


COPY . .
RUN npx prisma generate

RUN npm run build

EXPOSE ${PORT}
CMD [ "node","--trace-deprecation", "dist/index.js" ]
