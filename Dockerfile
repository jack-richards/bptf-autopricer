# Install node 18
FROM node:18

# Set work folder
WORKDIR /app

# Copy the content to /app
COPY . /app

# Expose bptf-autopricer port
EXPOSE 3456

# Install node modules
RUN npm install

# Start
CMD ["node", "bptf-autopricer.js"]
