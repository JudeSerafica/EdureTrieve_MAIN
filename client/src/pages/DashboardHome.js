import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { FaRegBookmark, FaDownload, FaEye } from 'react-icons/fa';
import useAuthStatus from '../hooks/useAuthStatus';
import { toast } from 'react-toastify';

function Dashboard() {
  const { user, authLoading } = useAuthStatus();
  const [modules, setModules] = useState([]); 
  const [savedModuleIds, setSavedModuleIds] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('latest');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (authLoading || !user) return;
    console.log('✅ User ready:', user.id);
  }, [authLoading, user]);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoading(true);
        console.log('🔍 Attempting to fetch modules...');
        
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        if (!token) throw new Error('Missing token');

        const response = await fetch('http://localhost:5000/get-modules', {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to fetch modules`);
        }

        const result = await response.json();
        const modulesData = result.modules || [];

        console.log(`✅ Fetched ${modulesData.length} modules from backend`);
        setModules(modulesData);

      } catch (err) {
        console.error('❌ Error fetching modules:', err);
        toast.error('Failed to load modules: ' + err.message);
        
        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('modules')
            .select('*')
            .order('created_at', { ascending: false });
            
          if (!fallbackError && fallbackData) {
            const transformedData = fallbackData.map(module => ({
              ...module,
              uploadedBy: module.uploaded_by?.includes('@') 
                ? module.uploaded_by.split('@')[0].split('.').map(part => 
                    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                  ).join(' ').toUpperCase()
                : (module.uploaded_by || 'UNKNOWN USER').toUpperCase(),
              uploadedAt: module.created_at
            }));
            setModules(transformedData);
            console.log('✅ Fallback successful');
          }
        } catch (fallbackErr) {
          console.error('❌ Even fallback failed:', fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchSaved = async () => {
      try {
        const { data, error } = await supabase
          .from('save_modules')
          .select('module_id')
          .eq('user_id', user.id);

        if (error) {
          console.error('❌ Saved fetch error:', error.message);
        } else {
          setSavedModuleIds(new Set(data.map(row => row.module_id)));
        }
      } catch (err) {
        console.error('❌ Unexpected error fetching saved modules:', err);
      }
    };

    fetchSaved();
  }, [user]);

  const handleToggleSave = async (moduleId, moduleTitle) => {
    if (!user) {
      toast.warning('⚠️ You must be logged in to save modules.');
      return;
    }

    const isSaved = savedModuleIds.has(moduleId);
    if (isSaved) {
      toast.info('⚠️ Module already saved.');
      return;
    }

    try {
      const { error } = await supabase.from('save_modules').insert({
        module_id: moduleId,
        user_id: user.id,
        title: moduleTitle,
      });

      if (error) throw new Error(error.message);

      setSavedModuleIds(prev => new Set(prev).add(moduleId));
      window.dispatchEvent(new Event('saved-modules-updated'));
      toast.success('✅ Module saved!');
    } catch (err) {
      console.error('❌ Save error:', err.message);
      toast.error(`❌ Save failed: ${err.message}`);
    }
  };

  const handleDeleteClick = (id) => {
    setModuleToDelete(id);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!moduleToDelete) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) throw new Error('Missing token');

      const res = await fetch(`http://localhost:5000/delete-module/${moduleToDelete}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || `HTTP ${res.status}: Failed to delete`);
      }

      const result = await res.json();
      
      setModules(prev => prev.filter(m => m.id !== moduleToDelete));
      const updatedSaved = new Set(savedModuleIds);
      updatedSaved.delete(moduleToDelete);
      setSavedModuleIds(updatedSaved);

      toast.success('🗑️ Module deleted!');
    } catch (err) {
      console.error('❌ Delete error:', err.message);
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setShowDeleteModal(false);
      setModuleToDelete(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setUploadProgress(0);

    if (!title || !description) {
      setMessage('❌ Title and description are required.');
      setIsSubmitting(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) throw new Error('Missing auth token');

      setUploadProgress(20);
      setMessage('📤 Preparing upload...');

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      
      if (file) {
        formData.append('file', file);
        setMessage('📎 Uploading file...');
        setUploadProgress(50);
      }

      setMessage('💾 Saving module...');
      setUploadProgress(80);

      const res = await fetch('http://localhost:5000/upload-module', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || `HTTP ${res.status}: Upload failed`);
      }

      const result = await res.json();
      console.log('✅ Upload successful:', result);
      
      setModules(prev => [result.data, ...prev]);
      
      setUploadProgress(100);
      setMessage('✅ Module uploaded successfully!');
      toast.success('✅ Module uploaded successfully!');
      
      setTimeout(() => {
        setShowUploadModal(false);
        setTitle('');
        setDescription('');
        setFile(null);
        setMessage('');
      }, 1000);
      
    } catch (err) {
      console.error('❌ Upload error:', err.message);
      setMessage(`❌ Upload failed: ${err.message}`);
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleViewFile = async (fileUrl, fileName) => {
    if (!fileUrl) {
      toast.error('No file available to view');
      return;
    }

    try {
      window.open(fileUrl, '_blank');
      toast.success('📄 Opening file in new tab!');
    } catch (err) {
      console.error('❌ View file error:', err);
      toast.error('Failed to open file');
    }
  };

  const handleDownloadFile = async (fileUrl, fileName) => {
    if (!fileUrl) {
      toast.error('No file available for download');
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName || 'module-file';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('📥 Download started!');
    } catch (err) {
      console.error('❌ Download error:', err);
      toast.error('Download failed');
    }
  };

  const formatDate = (dateString) => {
    try {
      if (!dateString) return 'Date not available';
      const date = new Date(dateString);
      const options = { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      return date.toLocaleDateString('en-US', options).replace(',', ' -');
    } catch (err) {
      return 'Invalid date';
    }
  };
  
  if (loading) {
    return (
      <div className="dashboard-page">
        <h2>Available Modules</h2>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <p>Loading modules...</p>
        </div>
      </div>
    );
  }

  const filteredModules = modules
  .filter(m => m.title.toLowerCase().includes(searchTerm.toLowerCase()))
  .sort((a, b) => {
    if (sortOption === 'alphabetical') return a.title.localeCompare(b.title);
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-headers-wrapper">
    <div className="dashboard-headers">
    <h2><span role="img" aria-label="modules">📘</span> Available Modules</h2>
    <div className="module-controls">
      <input
        type="text"
        placeholder="🔍 Search modules..."
        className="search-bar"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />
      <select 
        onChange={e => setSortOption(e.target.value)} 
        className="sort-dropdown"
        value={sortOption}
      >
        <option value="latest">Newest First</option>
        <option value="alphabetical">A–Z</option>
      </select>
      <button onClick={() => setShowUploadModal(true)} className="floating-upload-button">
        ＋Upload   Module
      </button>
</div>
</div>
      <div className="dashboard-divider"></div>
</div>
    
      <div className="module-list">
        {filteredModules.map((module) => (
          <div key={module.id} className="module-card">
            <div className="module-card-header">
              <h3
                onClick={() => window.location.href = `/module/${module.id}`}
                className="module-title"
              >
                {module.title}
              </h3>
              <button
                onClick={() => handleToggleSave(module.id, module.title)}
                className="save-module-button"
                title={savedModuleIds.has(module.id) ? 'Remove Bookmark' : 'Save to Bookmarks'}
              >
                <FaRegBookmark
                  className={`save-icon ${savedModuleIds.has(module.id) ? 'saved' : 'unsaved'}`}
                />
              </button>
            </div>

              <div className="module-card-content">
                <p><strong>Outline:</strong></p>
                <p>{module.description}</p>

                <div className="file-actions">
                  {module.file_url ? (
                    <>
                      <button
                        className="view-file-button"
                        onClick={() => handleViewFile(module.file_url, module.file_name)}
                      >
                        <FaEye /> View File
                      </button>
                      <button
                        className="download-file-button"
                        onClick={() => handleDownloadFile(module.file_url, module.file_name || `${module.title}.pdf`)}
                      >
                        <FaDownload /> Download
                      </button>
                    </>
                  ) : (
                    <div className="no-file-message">
                      <span style={{ color: '#666', fontSize: '14px' }}>📄 No file attached</span>
                    </div>
                  )}
                </div>
                
                <p>
                  Uploaded by: <strong>{module.uploadedBy}</strong> <br />
                  on {formatDate(module.uploadedAt)}
                </p>
              </div>

              <div className="module-card-footer">
                <button
                  onClick={() => handleDeleteClick(module.id)}
                  className="delete-module-button"
                >
                  🗑️ Delete Module
                </button>
              </div>
            </div>
        )
        )}
      </div>
    
      {showUploadModal && (
        <div className="modals-overlay">
          <div className="modals-box">
            <h3>Upload Module</h3>
            <form onSubmit={handleUpload}>
              <label>Module Title:</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required 
              placeholder="e.g., Introduction to Calculus"/>
              
              <label>Module Outline/Description:</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows="6" required
                placeholder="Provide a detailed outline of the module topics, learning objectives, etc."></textarea>
              
              <label>Attach a file (optional):</label>
              <input 
                type="file" 
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" 
                onChange={e => setFile(e.target.files[0])} 
              />
              
              {isSubmitting && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{width: `${uploadProgress}%`}}
                    ></div>
                  </div>
                  <p>{uploadProgress}% complete</p>
                </div>
              )}
              
              <div className="modals-buttons">
                <button 
                  type="button" 
                  onClick={() => setShowUploadModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Uploading...' : 'Submit Module Outline'}
                </button>
              </div>
              {message && <p>{message}</p>}
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p>Are you sure you want to delete?</p>
            <div className="modal-buttons">
              <button className="modal-logout-btn" onClick={handleConfirmDelete}>
                Delete
              </button>
              <button className="modal-cancel-btn" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;