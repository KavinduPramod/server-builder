const express = require('express');
const config = require('./config/env');
const buildRoutes = require('./routes/build');

const app = express();
app.use(express.json());

// Load Routes
app.use('/api/build', buildRoutes);

// Start the server
app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
});
