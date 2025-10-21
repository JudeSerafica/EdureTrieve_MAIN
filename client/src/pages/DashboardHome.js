import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { FaRegBookmark, FaDownload, FaEye} from 'react-icons/fa';
import useAuthStatus from '../hooks/useAuthStatus';
import { toast } from 'react-toastify';
import FileViewer from "../components/FileViewer";
import { useDropzone } from 'react-dropzone';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function Dashboard() {
  const { user, authLoading } = useAuthStatus();
  const [modules, setModules] = useState([]); 
  const [savedModuleIds, setSavedModuleIds] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCannotDeleteModal, setShowCannotDeleteModal] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('latest');
  const [dateFilter, setDateFilter] = useState('all');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');

  const [showViewer, setShowViewer] = useState(false);
  const [currentFileUrl, setCurrentFileUrl] = useState(null);
  const [currentFileName, setCurrentFileName] = useState(null);


  // Store file info state (size, type, pages)
  const [fileInfo, setFileInfo] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const modulesPerPage = 50;

  useEffect(() => {
    if (authLoading || !user) return;
    console.log('✅ User ready:', user.id);
  }, [authLoading, user]);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoading(true);
        console.log('🔍 Attempting to fetch modules...');
        
        // Check if user is authenticated first
        if (!user) {
          console.log('⚠️ User not authenticated, skipping module fetch');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        if (!token) {
          console.error('❌ No valid session token found');
          toast.error('Authentication expired. Please log in again.');
          return;
        }

        console.log('🔑 Using token for authentication');

        const response = await fetch(`http://localhost:5000/get-modules?user_id=${user.id}`, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.error('❌ Authentication failed - token may be expired');
            toast.error('Authentication expired. Please log in again.');
            return;
          }
          throw new Error(`HTTP ${response.status}: Failed to fetch modules`);
        }

        const result = await response.json();
        const modulesData = result.modules || [];

        console.log(`✅ Fetched ${modulesData.length} modules from backend`);

        // Transform modules to show actual full names for all users
        const transformedModules = modulesData.map(module => ({
          ...module,
          uploadedBy: module.uploadedBy || 'Unknown User'
        }));

        setModules(transformedModules);

      } catch (err) {
        console.error('❌ Error fetching modules:', err);
        toast.error('Failed to load modules: ' + err.message);
        
        // Fallback to direct Supabase query
        try {
          console.log('🔄 Attempting fallback to direct Supabase query...');
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('modules')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
            
          if (!fallbackError && fallbackData) {
            const transformedData = fallbackData.map(module => ({
              ...module,
              uploadedBy: module.uploaded_by || 'Unknown User',
              uploadedAt: module.created_at
            }));
            setModules(transformedData);
            console.log('✅ Fallback successful - loaded', transformedData.length, 'modules');
            toast.success('Modules loaded via fallback method');
          } else {
            console.error('❌ Fallback also failed:', fallbackError);
          }
        } catch (fallbackErr) {
          console.error('❌ Even fallback failed:', fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    };

    // Only fetch modules if user is authenticated and not loading
    if (!authLoading && user) {
      fetchModules();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

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
  if (!module?.file_url) return;

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
}, []);

  useEffect(() => {
  if (modules.length > 0) {
    modules.forEach((m) => fetchFileInfo(m));
  }
}, [modules, fetchFileInfo]);

  const handleToggleSave = async (moduleId, moduleTitle) => {
    if (!user) {
      toast.warning('⚠️ You must be logged in to save modules.');
      return;
    };

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
    // Check if the module is saved
    if (savedModuleIds.has(id)) {
      // Module is saved, show "cannot delete" modal
      setShowCannotDeleteModal(true);
    } else {
      // Module is not saved, show regular delete confirmation modal
      setModuleToDelete(id);
      setShowDeleteModal(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!moduleToDelete) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
      console.log('Delete response:', result);

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
    
        if (!title || !description || !file) {
          setMessage('❌ Title, description, and file are required.');
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
    
          // Add the new module with actual full name
          const newModule = {
            ...result.data,
            uploadedBy: result.data.uploadedBy || 'Unknown User'
          };
          setModules(prev => [newModule, ...prev]);
    
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
          toast.error(`Upload failed: ${err.message}`, {
            autoClose: 5000,
          });
        } finally {
          setIsSubmitting(false);
          setUploadProgress(0);
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

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  
  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-headerss-wrapper">
          <div className="dashboard-headerss">
            <h2>📘 Available Modules</h2>
            <div className="module-controls">
              <Skeleton width={200} height={35} style={{ marginRight: '10px' }} />
              <Skeleton width={150} height={35} />
              <Skeleton width={150} height={35} />
              <Skeleton width={150} height={35} />
            </div>
          </div>
          <div className="dashboard-divider"></div>
        </div>

        <div className="module-list">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="module-card">
              <div className="module-card-header">
                <Skeleton width="80%" height={25} />
                <Skeleton width={30} height={30} circle />
              </div>
              <div className="module-card-content">
                <Skeleton width="100%" height={120} />
                <Skeleton width="60%" height={15} style={{ marginTop: '10px' }} />
                <Skeleton width="40%" height={15} />
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <Skeleton width={80} height={30} />
                  <Skeleton width={80} height={30} />
                </div>
              </div>
              <div className="module-card-footer">
                <Skeleton width="100%" height={35} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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

  const filteredModules = modules
    .filter(m => {
      const matchesSearch = m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           m.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = getDateFilter(m.uploadedAt);
      return matchesSearch && matchesDate;
    })
    .sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return new Date(a.uploadedAt) - new Date(b.uploadedAt);
        case 'alphabetical':
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
        default: // 'latest'
          return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      }
    });

  const totalPages = Math.ceil(filteredModules.length / modulesPerPage);
  const indexOfLastModule = currentPage * modulesPerPage;
  const indexOfFirstModule = indexOfLastModule - modulesPerPage;
  const currentModules = filteredModules.slice(indexOfFirstModule, indexOfLastModule);

  return (
    <div className="dashboard-page">
      <div className="dashboard-headerss-wrapper">
        <div className="dashboard-headerss">
          <h2>📘 Available Modules</h2>
          <div className="module-controls">
            <input
              type="text"
              placeholder="Search modules..."
              className="search-bar"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page when searching
              }}
              aria-label="Search modules by title or description"
            />
            <select
              onChange={e => {
                setSortOption(e.target.value);
                setCurrentPage(1); // Reset to first page when sorting
              }}
              className="sort-dropdown"
              value={sortOption}
              aria-label="Sort modules by"
            >
              <option value="latest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="alphabetical">A–Z (Title)</option>
              <option value="fileSize">File Size (Smallest)</option>
              <option value="fileSizeDesc">File Size (Largest)</option>
            </select>
            <select
              onChange={e => {
                setDateFilter(e.target.value);
                setCurrentPage(1); // Reset to first page when filtering
              }}
              className="sort-dropdown"
              value={dateFilter}
              aria-label="Filter modules by date"
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="month">This Month</option>
            </select>
            <button onClick={() => setShowUploadModal(true)} className="floating-upload-button">
              Upload Module
            </button>
          </div>
        </div>
        <div className="dashboard-divider"></div>
      </div>
    
        {!loading && filteredModules.length === 0 && (
          <div className="dashboard-empty">You haven't uploaded any modules yet.</div>
        )}
    
      <div className="module-list" style={{ transition: 'all 0.3s ease' }}>
        {currentModules.map((module) => (
          <div key={module.id} className="module-card" style={{ transition: 'all 0.3s ease' }}>
            <div className="module-card-header">
              <h3
                onClick={() => window.location.href = `/module/${module.id}`}
                className="module-title"
                tabIndex={0}
                role="button"
                aria-label={`View module: ${module.title}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    window.location.href = `/module/${module.id}`;
                  }
                }}
              >
                {module.title}
              </h3>
              <button
                onClick={() => handleToggleSave(module.id, module.title)}
                className="save-module-button"
                title={savedModuleIds.has(module.id) ? 'Remove Bookmark' : 'Save to Bookmarks'}
                aria-label={savedModuleIds.has(module.id) ? `Remove ${module.title} from bookmarks` : `Save ${module.title} to bookmarks`}
              >
                <FaRegBookmark
                  className={`save-icon ${savedModuleIds.has(module.id) ? 'saved' : 'unsaved'}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            <div className="module-card-content">
              {/* FILE PREVIEW FEATURE */}
      <div className="module-preview" style={{ transition: 'all 0.3s ease', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
  {module.file_url ? (
    <>
      {module.file_url.toLowerCase().endsWith(".pdf") && (
        <iframe
          src={module.file_url}
          width="300"
          height="150"
          left="10px"
          alignItems="center"
          justifyContent="center"
          alignContent="center"
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
</div>

          {fileInfo[module.id] && (
               <p style={{ fontSize: "14px", color: "#444" }}>
              {fileInfo[module.id].type} · {fileInfo[module.id].size}
              </p>
         )}

              <p><strong>Outline:</strong></p>
              <p>{module.description}</p>

              <div className="file-actions">
                {module.file_url ? (
                  <>
                    <button
                      className="view-file-button"
                      onClick={() => handleViewFile(module.file_url, module.file_name)}
                      aria-label={`View file: ${module.file_name || module.title}`}
                    >
                      <FaEye aria-hidden="true" /> View File
                    </button>
                    <button
                      className="download-file-button"
                      onClick={() => handleDownloadFile(module.file_url, module.file_name || `${module.title}.pdf`)}
                      aria-label={`Download file: ${module.file_name || module.title}`}
                    >
                      <FaDownload aria-hidden="true" /> Download
                    </button>
                  </>
                ) : (
                  <div className="no-file-message" aria-label="No file attached to this module">
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
                aria-label={`Delete module: ${module.title}`}
              >
                🗑️ Delete Module
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '20px 0' }}>
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            style={{ margin: '0 5px', padding: '5px 10px', border: '1px solid #ccc', background: 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
          >

          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              style={{
                margin: '0 5px',
                padding: '5px 10px',
                border: '1px solid #ccc',
                background: page === currentPage ? '#3458bb' : 'white',
                color: page === currentPage ? 'white' : 'black',
                cursor: 'pointer'
              }}
            >
              {page}
            </button>
          ))}
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            style={{ margin: '0 5px', padding: '5px 10px', border: '1px solid #ccc', background: 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
          >
          </button>
        </div>
      )}
    
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
              
              <label>Attach a file:</label>
              <DropzoneComponent setFile={setFile} file={file} />
              
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
  <div className="modal-overlaysss">
    <div className="modal-box">
      <p>Are you sure you want to delete this module?</p>
      <div className="modal-buttons">
        <button 
          className="modal-logout-btn" 
          onClick={handleConfirmDelete}
        >
          Delete
        </button>
        <button 
          className="modal-cancel-btn" 
          onClick={() => setShowDeleteModal(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

      {showCannotDeleteModal && (
  <div className="modal-overlaysss">
    <div className="modal-boxes">
      <p>⚠️ This module cannot be deleted because it has been saved to bookmarks.</p>
      <p>Please unsave it first from your Saved Modules page if you want to delete it.</p>
      <div className="modal-buttons">
        <button 
          className="modal-cancel-btns" 
          onClick={() => setShowCannotDeleteModal(false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}



      {showViewer && (
        <FileViewer
          fileUrl={currentFileUrl}
          fileName={currentFileName}
          onClose={() => setShowViewer(false)}
        />
      )}

      </div>
)}

function DropzoneComponent({ setFile, file }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
      }
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt']
    },
    multiple: false,
    maxSize: 50 * 1024 * 1024, // 50MB limit
    onDropRejected: (fileRejections) => {
      fileRejections.forEach(({ file, errors }) => {
        errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            toast.error(`File "${file.name}" is too large. Max size: 50MB`);
          } else if (error.code === 'file-invalid-type') {
            toast.error(`File type not supported: ${file.name}`);
          } else {
            toast.error(`Error with file "${file.name}": ${error.message}`);
          }
        });
      });
    }
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? '#3458bb' : '#ccc'}`,
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: isDragActive ? '#f0f8ff' : '#fafafa',
        transition: 'all 0.3s ease',
        marginBottom: '16px'
      }}
      aria-label="File upload area - drag and drop or click to select"
      role="button"
      tabIndex={0}
    >
      <input {...getInputProps()} />
      <div style={{ fontSize: '48px', color: '#3458bb', marginBottom: '10px' }}>
        📁
      </div>
      {file ? (
        <div style={{ color: '#28a745', fontWeight: 'bold' }}>
          <p>✅ File selected: {file.name}</p>
          <p style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
            Size: {(file.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      ) : isDragActive ? (
        <p style={{ color: '#3458bb', fontWeight: 'bold' }}>
          Drop the file here...
        </p>
      ) : (
        <p style={{ color: '#666' }}>
          Drag & drop a file here, or click to select
        </p>
      )}
      <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
        Supported: PDF, DOC, DOCX, PPT, PPTX, TXT (Max: 50MB)
      </p>
    </div>
  );
}

export default Dashboard;