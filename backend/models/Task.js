const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['todo','in_progress','done','blocked'], default: 'todo' },
  priority: { type: String, enum: ['low','medium','high'], default: 'medium' },
  assigneeId: { type: String, default: '' },
  tags: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', TaskSchema);