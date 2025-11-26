const express = require('express');
const router = express.Router();
const Project = require('../models/Project');

// Get all projects
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a project
router.post('/', async (req, res) => {
  const { name, key, description } = req.body;
  
  if (!name || !key) {
    return res.status(400).json({ message: 'Name and Key are required' });
  }

  try {
    const existingProject = await Project.findOne({ key: key.toUpperCase() });
    if (existingProject) {
      return res.status(400).json({ message: 'Project key already exists' });
    }

    const project = new Project({
      name,
      key: key.toUpperCase(),
      description
    });

    const newProject = await project.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
