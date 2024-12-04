const express = require('express');
const buildController = require('../controllers/buildController');

const router = express.Router();

// Endpoint to trigger build
router.post('/trigger-build', buildController.triggerBuild);

module.exports = router;
