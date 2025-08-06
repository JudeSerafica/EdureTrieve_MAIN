import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import useAuthStatus from '../hooks/useAuthStatus';
import { FaBookmark, FaDownload } from 'react-icons/fa';
import { toast } from 'react-toastify';

function Saves() {
  const { user, authLoading } = useAuthStatus();
  const [savedModules, setSavedModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) {
      console.log('⏳ Waiting for auth...');
      return;
    }
    if (!user) {
      console.warn('⛔ No user is logged in');
      return;
    }
    console.log('✅ Authenticated user ID:', user.id);
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;

    const fetchSavedModules = async () => {
      try {
        setLoading(true);
        console.log('🔍 Fetching saved modules for user:', user.id);

        const { data, error } = await supabase
          .from('save_modules')
          .select(`
            module_id,
            saved_at,
            modules:module_id (
              id,
              title,
              description,
              file_url,
              file_name,
              created_at,
              user_id,
              uploaded_by
            )
          `)
          .eq('user_id', user.id)
          .order('saved_at', { ascending: false });

        if (error) {
          console.error('❌ Supabase error:', error);
          throw new Error(error.message);
        }

        console.log('✅ Raw saved modules data:', data);

        if (!data || data.length === 0) {
          setSavedModules([]);
          setError(null);
          return;
        }

        const moduleItems = data.filter(item => item.modules); 
        const userIds = [...new Set(moduleItems.map(item => item.modules.user_id))];
        
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, fullName')
          .in('id', userIds);

        if (profilesError) {
          console.warn('⚠️ Could not fetch profiles:', profilesError.message);
        }

        const profilesMap = new Map();
        profilesData?.forEach(profile => {
          profilesMap.set(profile.id, profile);
        });

        const modules = moduleItems.map(item => {
          const module = item.modules;
          const profile = profilesMap.get(module.user_id);
          
          let uploaderName = 'Unknown User';
          
          if (module.uploaded_by) {
            uploaderName = module.uploaded_by;
          } else if (profile?.fullName) {
            uploaderName = profile.fullName;
          } else if (profile?.username) {
            uploaderName = profile.username;
          } else {
            uploaderName = 'Unknown User';
          }

          return {
            ...module,
            savedAt: item.saved_at,
            uploadedAt: module.created_at,
            uploadedBy: uploaderName
          };
        });

        console.log('✅ Transformed modules with uploader names:', modules);
        setSavedModules(modules);
        setError(null);

      } catch (err) {
        console.error('🚨 Fetch error:', err.message);
        setError('Failed to load your saved modules: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedModules();
    
    const handleUpdate = () => {
      console.log('🔄 Refreshing saved modules...');
      fetchSavedModules();
    };

    window.addEventListener('saved-modules-updated', handleUpdate);
    return () => window.removeEventListener('saved-modules-updated', handleUpdate);
  }, [user, authLoading]);

  const handleUnsaveModule = async (moduleId) => {
    if (!user) {
      toast.warning('You must be logged in to unsave modules.');
      return;
    }

    try {
      console.log('🗑️ Unsaving module:', moduleId);

      const { error } = await supabase
        .from('save_modules')
        .delete()
        .eq('user_id', user.id)
        .eq('module_id', moduleId);

      if (error) {
        console.error('❌ Unsave error:', error);
        throw new Error(error.message);
      }

      setSavedModules((prev) => prev.filter((m) => m.id !== moduleId));
      setError(null);
      toast.success('✅ Module unsaved!');
      
      window.dispatchEvent(new Event('saved-modules-updated'));

    } catch (err) {
      console.error('❌ Unsave error:', err.message);
      setError('Failed to unsave module: ' + err.message);
      toast.error(`❌ ${err.message}`);
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

  if (authLoading) return <div className="dashboard-loading">Checking authentication...</div>;
  if (!user) return <div className="dashboard-not-logged-in">Please log in to view your saved modules.</div>;

  return (
    <div className="dashboard-content-page">
      <h2>📚 My Saved Modules</h2>

      {loading && <div className="dashboard-loading">Loading modules...</div>}
      {error && <div className="dashboard-error">{error}</div>}
      {!loading && savedModules.length === 0 && (
        <div className="dashboard-empty">You haven't saved any modules yet.</div>
      )}

      <div className="module-list">
        {savedModules.map((module) => (
          <div key={module.id} className="module-card">
            <div className="module-card-header">
              <h3>{module.title}</h3>
              <button
                className="save-module-button saved"
                onClick={() => handleUnsaveModule(module.id)}
                title="Unsave module"
              >
                <FaBookmark className="saved-icon" />
              </button>
            </div>
            <p><strong>Outline:</strong></p>
            <p className="module-description">{module.description}</p>

            {module.file_url && (
              <div className="file-actions">
                <button
                  className="view-file-button"
                  onClick={() => window.open(module.file_url, '_blank')}
                >
                  📄 View File
                </button>
                <button
                  className="download-file-button"
                  onClick={() => handleDownloadFile(module.file_url, module.file_name || `${module.title}.pdf`)}
                >
                  <FaDownload /> Download
                </button>
              </div>
            )}

            <p className="module-meta">
              Uploaded by: {module.uploadedBy}<br />
              at {module.uploadedAt ? new Date(module.uploadedAt).toLocaleString() : 'N/A'}<br />
              Saved: {module.savedAt ? new Date(module.savedAt).toLocaleString() : 'N/A'}
            </p>
          </div>
        ))}
      </div>

      <style jsx>{`
        .file-actions {
          display: flex;
          gap: 10px;
          margin: 10px 0;
        }

        .download-file-button {
          background-color: #28a745;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 14px;
        }

        .download-file-button:hover {
          background-color: #218838;
        }

        .dashboard-error {
          background-color: #f8d7da;
          color: #721c24;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
          border: 1px solid #f5c6cb;
        }

        .dashboard-loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .dashboard-empty {
          text-align: center;
          padding: 40px;
          color: #666;
          font-style: italic;
        }

        .dashboard-not-logged-in {
          text-align: center;
          padding: 40px;
          color: #dc3545;
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 5px;
          margin: 20px;
        }
      `}</style>
    </div>
  );
}

export default Saves;