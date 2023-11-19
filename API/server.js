// Express
const express = require('express');

const app = express();

app.use(express.urlencoded({
    extended: true
}));

const config = require('../config.json');

// API routes.
const items_endpoint = require('./routes/api/items.js');

app.use('/items', items_endpoint);

const port = config.pricerAPIPort || 3456;

const listen = () => {
    app.listen(port, () => console.log(`Server started on port ${port}`));
}

module.exports.listen = listen;


