const express = require('express');
const router = express.Router();
const Member = require('../models/Member');

// Create member
router.post('/', async (req, res) => {
  try {
    const m = await Member.create(req.body);
    res.status(201).json(m);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List members
router.get('/', async (req, res) => {
  const members = await Member.find().sort({ name: 1 });
  res.json(members);
});

// Delete member
router.delete('/:id', async (req, res) => {
  await Member.findByIdAndDelete(req.params.id);
  res.json({ message: 'Member deleted' });
});

module.exports = router;