const Task = require('../models/Task');

/**
 * AssignmentService:
 * - countInProgress(memberId) -> number
 * - canAssign(memberId) -> boolean (no more than 5 in_progress)
 */
async function countInProgress(memberId){
  if(!memberId) return 0;
  return Task.countDocuments({ assigneeId: memberId, status: 'in_progress' });
}

async function canAssign(memberId){
  const count = await countInProgress(memberId);
  return count < 5;
}

module.exports = { countInProgress, canAssign };