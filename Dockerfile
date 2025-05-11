# Use Node base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Expose port if your app uses one (e.g. 3000)
EXPOSE 3000

# Run the app
CMD ["node", "index.js"]
