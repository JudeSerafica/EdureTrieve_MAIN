import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import useAuthStatus from '../hooks/useAuthStatus';
import { FaBookmark, FaDownload, FaEye, FaLink, FaFolder, FaPlus, FaTimes, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import FileViewer from "../components/FileViewer"; 

function Saves() {
  const { user, authLoading } = useAuthStatus();
  const [savedModules, setSavedModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('recent');
  const [dateFilter, setDateFilter] = useState('all');

  const [showViewer, setShowViewer] = useState(false);
  const [currentFileUrl, setCurrentFileUrl] = useState(null);
  const [currentFileName, setCurrentFileName] = useState(null);

  const [fileInfo, setFileInfo] = useState({});
  const [folders, setFolders] = useState([
    { id: 'default', name: 'All Bookmarks' },
    { id: 'uncategorized', name: 'Uncategorized' }
  ]);
  const [activeFolder, setActiveFolder] = useState('default');

  // 🆕 Modal states
  const [showModal, setShowModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);

  // ✅ Fetch folders from DB
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchFolders = async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("❌ Error fetching folders:", error);
        return;
      }

      setFolders([
        { id: 'default', name: 'All Bookmarks' },
        { id: 'uncategorized', name: 'Uncategorized' },
        ...(data || [])
      ]);
    };

    fetchFolders();
  }, [user, authLoading]);

  // ✅ Add folder with modal
  const handleAddFolder = () => {
    setNewFolderName('');
    setShowModal(true);
  };

  // ✅ Show delete folder modal
  const handleDeleteFolderClick = (folderId, folderName) => {
    if (!user) return;

    // Prevent deletion of default folders
    if (folderId === 'default' || folderId === 'uncategorized') {
      toast.error('Cannot delete default folders');
      return;
    }

    setFolderToDelete({ id: folderId, name: folderName });
    setShowDeleteModal(true);
  };

  // ✅ Confirm delete folder
  const handleConfirmDeleteFolder = async () => {
    if (!user || !folderToDelete) return;

    try {
      // Move all modules in this folder to uncategorized
      const { error: moveError } = await supabase
        .from('save_modules')
        .update({ folder_id: null })
        .eq('user_id', user.id)
        .eq('folder_id', folderToDelete.id);

      if (moveError) throw moveError;

      // Delete the folder
      const { error: deleteError } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderToDelete.id)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      // Update local state
      setFolders((prev) => prev.filter(f => f.id !== folderToDelete.id));
      
      // If the deleted folder was active, switch to default
      if (activeFolder === folderToDelete.id) {
        setActiveFolder('default');
      }

      // Update modules state to reflect folder changes
      setSavedModules((prev) =>
        prev.map((m) =>
          m.folder_id === folderToDelete.id ? { ...m, folder_id: null } : m
        )
      );

      toast.success('🗑️ Folder deleted successfully!');
      setShowDeleteModal(false);
      setFolderToDelete(null);
    } catch (error) {
      console.error('❌ Error deleting folder:', error);
      toast.error('Failed to delete folder');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;

    const { data, error } = await supabase
      .from('folders')
      .insert([{ name: newFolderName.trim(), user_id: user.id }])
      .select();

    if (error) {
      console.error("❌ Error creating folder:", error);
      toast.error("Failed to create folder");
      return;
    }

    setFolders((prev) => [...prev, data[0]]);
    toast.success("📂 Folder created!");
    setShowModal(false);
    setNewFolderName('');
  };

  // ✅ Fetch saved modules
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchSavedModules = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('save_modules')
          .select(`
            module_id,
            saved_at,
            folder_id,
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

        if (error) throw new Error(error.message);

        if (!data || data.length === 0) {
          setSavedModules([]);
          setError(null);
          return;
        }

        const moduleItems = data.filter(item => item.modules); 
        const userIds = [...new Set(moduleItems.map(item => item.modules.user_id))];
        
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, username, fullName')
          .in('id', userIds);

        const profilesMap = new Map();
        profilesData?.forEach(profile => {
          profilesMap.set(profile.id, profile);
        });

        const modules = moduleItems.map(item => {
          const module = item.modules;
          const profile = profilesMap.get(module.user_id);

          let uploaderName = module.uploaded_by || profile?.fullName || profile?.username || 'Unknown User';

          return {
            ...module,
            savedAt: item.saved_at,
            uploadedAt: module.created_at,
            uploadedBy: uploaderName,
            folder_id: item.folder_id || null
          };
        });

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
      fetchSavedModules();
    };

    window.addEventListener('saved-modules-updated', handleUpdate);
    return () => window.removeEventListener('saved-modules-updated', handleUpdate);
  }, [user, authLoading]);

  const getFriendlyFileType = (mimeType, fileName = "") => {
      const ext = fileName.split(".").pop().toLowerCase();
      const map = {
        pdf: "PDF",
        doc: "DOC",
        docx: "DOCX",
        ppt: "PPT",
        pptx: "PPTX",
        txt: "TXT",
      };
      if (map[ext]) return map[ext];
      if (!mimeType) return "FILE";
      if (mimeType.includes("pdf")) return "PDF";
      if (mimeType.includes("word")) return "DOCX";
      if (mimeType.includes("presentation")) return "PPTX";
      if (mimeType.includes("text")) return "TXT";
      return "FILE";
    };
  
    const fetchFileInfo = useCallback(async (module) => {
  if (!module?.file_url || fileInfo[module.id]) return; // Skip if already fetched

  try {
    const response = await fetch(module.file_url);
    const blob = await response.blob();
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2) + " MB";

    const type = getFriendlyFileType(blob.type, module.file_name);

    setFileInfo((prev) => ({
      ...prev,
      [module.id]: { size: sizeMB, type },
    }));
  } catch (err) {
    console.error("Error fetching file info:", err);
  }
}, [fileInfo]); // Only re-create if fileInfo changes

// 🖇 Effect to fetch info for new modules
useEffect(() => {
  savedModules.forEach((m) => {
    if (!fileInfo[m.id]) fetchFileInfo(m); // Only fetch if missing
  });
}, [savedModules, fileInfo, fetchFileInfo]);
  

  // ✅ Move module to folder
  const handleMoveToFolder = async (moduleId, folderId) => {
    if (!user) return;

    const { error } = await supabase
      .from('save_modules')
      .update({ folder_id: folderId === 'uncategorized' ? null : folderId })
      .eq('user_id', user.id)
      .eq('module_id', moduleId);

    if (error) {
      console.error("❌ Error moving module:", error);
      toast.error("Failed to move module");
      return;
    }

    setSavedModules((prev) =>
      prev.map((m) =>
        m.id === moduleId ? { ...m, folder_id: folderId === 'uncategorized' ? null : folderId } : m
      )
    );

    toast.success("📂 Module moved!");
  };

  // ✅ Unsave
  const handleUnsaveModule = async (moduleId) => {
    if (!user) {
      toast.warning('You must be logged in to unsave modules.');
      return;
    }

    try {
      const { error } = await supabase
        .from('save_modules')
        .delete()
        .eq('user_id', user.id)
        .eq('module_id', moduleId);

      if (error) throw new Error(error.message);

      setSavedModules((prev) => prev.filter((m) => m.id !== moduleId));
      setError(null);
      toast.success('✅ Module unsaved!');
      
      window.dispatchEvent(new Event('saved-modules-updated'));
    } catch (err) {
      setError('Failed to unsave module: ' + err.message);
      toast.error(`❌ ${err.message}`);
    }
  };

  const handleViewFile = (fileUrl, fileName) => {
    if (!fileUrl) {
      toast.error("No file available to view");
      return;
    }
    setCurrentFileUrl(fileUrl);
    setCurrentFileName(fileName);
    setShowViewer(true);
  };

  const handleDownloadFile = async (fileUrl, fileName) => {
    if (!fileUrl) {
      toast.error('No file available for download');
      return;
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Failed to fetch file');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'module-file';
      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('📥 Download started!');
    } catch (err) {
      toast.error('Download failed');
    }
  };

  const getDateFilter = (dateString) => {
    if (dateFilter === 'all') return true;
    const moduleDate = new Date(dateString);
    const now = new Date();
    const diffTime = now - moduleDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    switch (dateFilter) {
      case '7days': return diffDays <= 7;
      case '30days': return diffDays <= 30;
      case 'month': return moduleDate.getMonth() === now.getMonth() && moduleDate.getFullYear() === now.getFullYear();
      default: return true;
    }
  };

  // ✅ Filter modules by folder + search + sort
  const filteredSavedModules = savedModules
    .filter((module) => {
      if (activeFolder === 'default') return true;
      if (activeFolder === 'uncategorized') return !module.folder_id;
      return module.folder_id === activeFolder;
    })
    .filter((module) => {
      const matchesSearch = module.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           module.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = getDateFilter(module.savedAt || module.uploadedAt);
      return matchesSearch && matchesDate;
    })
    .sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return new Date(a.uploadedAt) - new Date(b.uploadedAt);
        case 'recentlySaved':
          return new Date(b.savedAt) - new Date(a.savedAt);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'fileSize':
          const aSize = fileInfo[a.id]?.size ? parseFloat(fileInfo[a.id].size) : 0;
          const bSize = fileInfo[b.id]?.size ? parseFloat(fileInfo[b.id].size) : 0;
          return aSize - bSize;
        case 'fileSizeDesc':
          const aSizeDesc = fileInfo[a.id]?.size ? parseFloat(fileInfo[a.id].size) : 0;
          const bSizeDesc = fileInfo[b.id]?.size ? parseFloat(fileInfo[b.id].size) : 0;
          return bSizeDesc - aSizeDesc;
        case 'fileType':
          const aType = fileInfo[a.id]?.type || '';
          const bType = fileInfo[b.id]?.type || '';
          return aType.localeCompare(bType);
        default: // 'recent'
          return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      }
    });

  if (authLoading) return <div className="dashboard-loading">Checking authentication...</div>;
  if (!user) return <div className="dashboard-not-logged-in">Please log in to view your saved modules.</div>;

  return (
    <div className="saves-container">
      {/* 🆕 Sidebar for folders */}
      <aside className="folders-sidebar">
        <h3><FaFolder /> Folders</h3>
        <ul>
          {folders.map(folder => (
            <li
              key={folder.id}
              className={`folder-item ${activeFolder === folder.id ? 'active' : ''}`}
            >
              <span 
                className="folder-name"
                onClick={() => setActiveFolder(folder.id)}
              >
                {folder.name}
              </span>
              {/* Only show delete button for custom folders */}
              {folder.id !== 'default' && folder.id !== 'uncategorized' && (
                <button
                  className="delete-folder-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolderClick(folder.id, folder.name);
                  }}
                  title={`Delete folder "${folder.name}"`}
                >
                  <FaTrash size="0.8em" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="add-folder-button" onClick={handleAddFolder}>
          <FaPlus /> New Folder
        </button>
      </aside>

      {/* Create Folder Modal */}
      {showModal && (
        <div className="modal-overlays">
          <div className="modal-contents">
            <button className="modal-close" onClick={() => setShowModal(false)}>
              <FaTimes />
            </button>
            <h3>Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <div className="modal-actions">
              <button className="create-btn" onClick={handleCreateFolder}>Create</button>
              <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Modal */}
      {showDeleteModal && folderToDelete && (
        <div className="modal-overlays">
          <div className="modal-contents delete-modal">
            <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
              <FaTimes />
            </button>
            <div className="delete-modal-icon">
              <FaTrash size="3em" color="#dc3545" />
            </div>
            <h3>Delete Folder</h3>
            <p className="delete-warning">
              Are you sure you want to delete the folder <strong>"{folderToDelete.name}"</strong>?
            </p>
            <p className="delete-info">
              All modules in this folder will be moved to <strong>Uncategorized</strong>.
            </p>
            <div className="modal-actions">
              <button 
                className="delete-btn" 
                onClick={handleConfirmDeleteFolder}
              >
                <FaTrash /> Delete
              </button>
              <button 
                className="cancel-btn" 
                onClick={() => {
                  setShowDeleteModal(false);
                  setFolderToDelete(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="saves-main">
        <div className="dashboard-headers-wrapper">
          <div className="dashboard-headers">
            <h2>📚 Saved Modules</h2>
            <div className="module-controls">
              <input
                type="text"
                placeholder="🔍 Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-bar"
              />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="sort-dropdown"
              >
                <option value="recentlySaved">Recently Saved</option>
                <option value="oldest">Oldest First</option>
                <option value="title">A–Z (Title)</option>
                <option value="fileSize">File Size (Smallest)</option>
                <option value="fileSizeDesc">File Size (Largest)</option>
              </select>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="sort-dropdown"
              >
                <option value="all">All Time</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="month">This Month</option>
              </select>
            </div>
          </div>
          <div className="dashboard-divider"></div>
        </div>

        {loading && <div className="dashboard-loading">Loading modules...</div>}
        {error && <div className="dashboard-error">{error}</div>}
        {!loading && filteredSavedModules.length === 0 && (
          <div className="dashboard-empty">You haven't saved any modules yet.</div>
        )}

        <div className="module-list">
          {filteredSavedModules.map((module) => (
            <div key={module.id} className="module-card-hoverable">
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
              <div className="module-card-content">

                {/* FILE PREVIEW FEATURE */}
  {module.file_url ? (
    <>
      {module.file_url.toLowerCase().endsWith(".pdf") && (
        <iframe
          src={module.file_url}
          width="300"
          height="150"
          style={{ border: "1px solid #ccc", borderRadius: "4px" }}
          title="PDF preview"
        />
      )}

      {/* DOCX / PPTX via Office Viewer */}
      {(module.file_url.endsWith(".docx") || module.file_url.endsWith(".pptx")) && (
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(module.file_url)}`}
          width="300"
          height="150"
          style={{ border: "1px solid #ccc", borderRadius: "4px" }}
          title="Office preview"
        />
      )}

      {/* TXT preview */}
      {module.file_url.endsWith(".txt") && (
        <iframe
          src={module.file_url}
          width="300"
          height="150"
          style={{ border: "1px solid #ccc", borderRadius: "4px" }}
          title="Text preview"
        />
      )}

      {/* Fallback for unsupported types */}
      {!(module.file_url.endsWith(".pdf") ||
         module.file_url.endsWith(".docx") ||
         module.file_url.endsWith(".pptx") ||
         module.file_url.endsWith(".txt")) && (
        <div
          style={{
            width: "300px",
            height: "150px",
            border: "1px dashed #aaa",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "#666",
            fontSize: "14px",
          }}
        >
          No Preview
        </div>
      )}
    </>
  ) : (
    <div
      style={{
        width: "200px",
        height: "120px",
        border: "1px dashed #aaa",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "#666",
        fontSize: "14px",
      }}
    >
      📄 No File
    </div>
  )}

           {fileInfo[module.id] && (
               <p style={{ fontSize: "14px", color: "#444" }}>
              {fileInfo[module.id].type} · {fileInfo[module.id].size}
              </p>
         )}
          
              <p><strong>Outline:</strong></p>
              <p className="module-description">{module.description}</p>

              {module.file_url && (
                <div className="file-actions">
          
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
                  <button
                    className="copy-link-button"
                    onClick={() => {navigator.clipboard.writeText(module.file_url); toast.success("📋 Link copied!")}}
                  >
                    <FaLink /> Copy Link
                  </button>
                </div>
              )}

              <div className="move-to-folder">
                <label>Move to:</label>
                <select
                  value={module.folder_id || 'uncategorized'}
                  onChange={(e) => handleMoveToFolder(module.id, e.target.value)}
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <p className="module-meta">
                Uploaded by: {module.uploadedBy}<br />
                at {module.uploadedAt ? new Date(module.uploadedAt).toLocaleString() : 'N/A'}<br />
                Saved: {module.savedAt ? new Date(module.savedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
            
          
          {showViewer && (
            <FileViewer
              fileUrl={currentFileUrl}
              fileName={currentFileName}
              onClose={() => setShowViewer(false)}
            />
          )}
          </div>
          ))}
        </div>
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

        .folder-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          margin: 2px 0;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .folder-item:hover {
          background-color: #f5f5f5;
        }

        .folder-item.active {
          background-color: #007bff;
          color: white;
        }

        .folder-name {
          flex: 1;
          cursor: pointer;
        }

        .delete-folder-button {
          background: none;
          border: none;
          color: #dc3545;
          cursor: pointer;
          padding: 4px;
          border-radius: 3px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s, visibility 0.2s, background-color 0.2s;
          margin-left: 8px;
        }

        .folder-item:hover .delete-folder-button {
          opacity: 0.7;
          visibility: visible;
        }

        .delete-folder-button:hover {
          opacity: 1 !important;
          background-color: rgba(220, 53, 69, 0.1);
        }

        .folder-item.active:hover .delete-folder-button {
          opacity: 0.8;
          visibility: visible;
          color: rgba(255, 255, 255, 0.8);
        }

        .folder-item.active .delete-folder-button:hover {
          opacity: 1 !important;
          color: white;
          background-color: rgba(255, 255, 255, 0.2);
        }

        .delete-modal {
          text-align: center;
          max-width: 400px;
        }

        .delete-modal-icon {
          margin: 20px 0;
        }

        .delete-warning {
          font-size: 16px;
          margin: 15px 0;
          color: #333;
        }

        .delete-info {
          font-size: 14px;
          color: #666;
          margin: 10px 0 20px 0;
        }

        .delete-btn {
          background-color: #dc3545;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background-color 0.2s;
        }
        .delete-btn:hover {
          background-color: #c82333;
        }

        .cancel-btn {
          background-color: #6c757d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .cancel-btn:hover {
          background-color: #5a6268;
        }

        .create-btn {
          background-color: #3458bb;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .create-btn:hover {
          background-color: #0b215fff;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 20px;
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