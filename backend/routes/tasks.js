const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const History = require('../models/History');
const { canAssign } = require('../services/assignmentService');

// Helper to create history
async function createHistory(taskId, action, details) {
  try {
    await History.create({ taskId, action, details });
  } catch (err) {
    console.error('Error creating history:', err);
  }
}

// Create
router.post('/', async (req, res) => {
  try {
    const task = await Task.create(req.body);
    await createHistory(task._id, 'create', `Task created: ${task.title}`);
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Read (list) with optional filters: status, assigneeId, tag, date range
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
    if (req.query.tag) filter.tags = req.query.tag;
    if (req.query.priority) filter.priority = req.query.priority;

    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        // Set end date to end of day
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    req.body.updatedAt = new Date();
    const oldTask = await Task.findById(req.params.id);
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (oldTask) {
      const changes = [];
      if (oldTask.status !== task.status) changes.push(`Status changed from ${oldTask.status} to ${task.status}`);
      if (oldTask.priority !== task.priority) changes.push(`Priority changed from ${oldTask.priority} to ${task.priority}`);
      if (oldTask.assigneeId !== task.assigneeId) changes.push(`Assignee changed`);
      if (oldTask.title !== task.title) changes.push(`Title updated`);

      if (changes.length > 0) {
        await createHistory(task._id, 'update', changes.join(', '));
      }
    }

    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    // Note: History is kept even if task is deleted, or could be deleted too
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Advance status endpoint (todo -> in_progress -> done)
router.post('/:id/advance', async (req, res) => {
  try {
    const t = await Task.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    const order = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(t.status);
    if (idx === -1 || idx === order.length - 1) return res.json(t);

    // If advancing to in_progress, check assignee capacity
    const nextStatus = order[idx + 1];
    if (nextStatus === 'in_progress' && t.assigneeId) {
      const ok = await canAssign(t.assigneeId);
      if (!ok) return res.status(400).json({ error: 'Assignee has too many in_progress tasks (limit 5).' });
    }

    const oldStatus = t.status;
    t.status = nextStatus;
    t.updatedAt = new Date();
    await t.save();

    await createHistory(t._id, 'status_change', `Status advanced from ${oldStatus} to ${nextStatus}`);

    res.json(t);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign task to member (body: { assigneeId })
router.post('/:id/assign', async (req, res) => {
  try {
    const { assigneeId } = req.body;
    if (!assigneeId) return res.status(400).json({ error: 'assigneeId required' });
    const ok = await canAssign(assigneeId);
    if (!ok) return res.status(400).json({ error: 'Assignee has too many in_progress tasks (limit 5).' });

    const t = await Task.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });

    t.assigneeId = assigneeId;
    t.updatedAt = new Date();
    await t.save();

    await createHistory(t._id, 'update', `Task assigned to member`);

    res.json(t);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;