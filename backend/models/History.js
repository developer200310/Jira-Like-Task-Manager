const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    action: { type: String, required: true }, // 'create', 'update', 'status_change', 'delete'
    details: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('History', HistorySchema);
