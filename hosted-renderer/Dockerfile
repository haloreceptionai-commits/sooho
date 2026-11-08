FROM apify/actor-node-playwright-chrome:22
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
CMD ["node", "main.js"]