const express = require('express');
const router = express.Router();
const History = require('../models/History');

// Get history for a specific task
router.get('/:taskId', async (req, res) => {
    try {
        const history = await History.find({ taskId: req.params.taskId }).sort({ timestamp: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
