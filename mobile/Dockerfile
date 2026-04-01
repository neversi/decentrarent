FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose Expo Metro server port
EXPOSE 8081

# Start Expo development server — bind to 0.0.0.0 to allow external access
CMD ["npm", "start", "--", "--clear"]
