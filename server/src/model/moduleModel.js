const { supabase } = require('../config/supabaseClient');
/**
 * Creates a new module record in Supabase.
 * @param {Object} moduleData The data for the new module (title, description, uploadedBy).
 * @returns {Promise<Object>} The created module record including its ID.
 */
async function createModule(moduleData) {
  const { title, description, uploadedBy } = moduleData;
  const { data, error } = await supabase
    .from('modules')
    .insert([{ title, description, uploadedBy }])
    .select()
    .single();

  if (error) {
    console.error('Error creating module:', error);
    throw new Error('Could not create module.');
  }

  return data;
}

/**
 * Fetches all modules from Supabase, ordered by uploadedAt descending.
 * @returns {Promise<Array<Object>>} Array of module records.
 */
async function getAllModules() {
  const { data, error } = await supabase
    .from('modules')
    .select('*')
    .order('uploadedAt', { ascending: false });

  if (error) {
    console.error('Error fetching all modules:', error);
    throw new Error('Could not fetch modules.');
  }

  return data;
}

/**
 * Fetches a single module by ID.
 * @param {string} moduleId
 * @returns {Promise<Object|null>}
 */
async function getModuleById(moduleId) {
  const { data, error } = await supabase
    .from('modules')
    .select('*')
    .eq('id', moduleId)
    .single();

  if (error) {
    console.error('Error fetching module by ID:', error);
    return null;
  }

  return data;
}

/**
 * Updates a module by ID.
 * @param {string} moduleId
 * @param {Object} updateData
 */
async function updateModule(moduleId, updateData) {
  const { error } = await supabase
    .from('modules')
    .update(updateData)
    .eq('id', moduleId);

  if (error) {
    console.error('Error updating module:', error);
    throw new Error('Could not update module.');
  }
}

/**
 * Deletes a module by ID.
 * @param {string} moduleId
 */
async function deleteModule(moduleId) {
  const { error } = await supabase
    .from('modules')
    .delete()
    .eq('id', moduleId);

  if (error) {
    console.error('Error deleting module:', error);
    throw new Error('Could not delete module.');
  }
}

module.exports = {
  createModule,
  getAllModules,
  getModuleById,
  updateModule,
  deleteModule,
};