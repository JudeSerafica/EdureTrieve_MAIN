import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAuthStatus from '../hooks/useAuthStatus';
import ReactMarkdown from 'react-markdown';
import { FaPaperPlane, FaStop, FaPlus, FaComments, FaTrash, FaFileUpload } from 'react-icons/fa';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import {
  formatFirebaseTimestamp,
  generateUniqueId,
  fetchChatHistoryApi,
  saveChatEntryApi,
  deleteChatSessionApi,
  generateContentApi,
  processChatFileApi,
  getUserChatKey
} from '../utils/ChatHelpers';

function Chats() {
  const { user, loading: authLoading } = useAuthStatus();

  const [prompt, setPrompt] = useState('');
  const [activeChatMessages, setActiveChatMessages] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatHistorySessions, setChatHistorySessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const chatMessagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleNewChat = useCallback(() => {
    if (activeChatMessages.length > 0 && activeSessionId) {
      setChatHistorySessions(prev =>
        prev.map(session => {
          if (session.id === activeSessionId && (session.title === 'New Chat' || session.title.startsWith('Chat from'))) {
            const firstUserMessage = session.messages.find(msg => msg.type === 'user');
            const sessionTitle = firstUserMessage?.text
                ? (firstUserMessage.text.length > 30 ? firstUserMessage.text.slice(0, 30) + '...' : firstUserMessage.text)
                : 'Untitled Chat';
            return { ...session, title: sessionTitle };
          }
          return session;
        })
      );
    }

    const newSessionId = generateUniqueId();
    setChatHistorySessions(prev => [
      {
        id: newSessionId,
        title: 'New Chat',
        messages: []
      },
      ...prev
    ]);
    setActiveSessionId(newSessionId);
    setActiveChatMessages([]);
    setPrompt('');
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
  }, [activeChatMessages, activeSessionId]);

 useEffect(() => {
  let isMounted = true;

  const loadInitialChatHistory = async () => {
    if (user && !authLoading) {
      try {
        const sessions = await fetchChatHistoryApi(user);
        if (!isMounted) return;

        setChatHistorySessions(sessions);

        if (sessions.length > 0) {
          setActiveChatMessages(sessions[0].messages);
          setActiveSessionId(sessions[0].id);
        } else {
          // 🚨 Instead of calling handleNewChat directly
          const newSessionId = generateUniqueId();
          setChatHistorySessions([{
            id: newSessionId,
            title: "New Chat",
            messages: []
          }]);
          setActiveSessionId(newSessionId);
          setActiveChatMessages([]);
          setPrompt("");
          setError("");
          
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Error loading initial chat history:", err);
        setError(err.message || "Failed to load chat history.");
      }
    } else if (!user && !authLoading) {
      setChatHistorySessions([]);
      setActiveChatMessages([]);
      setActiveSessionId(null);
    }
  };

  loadInitialChatHistory();
  return () => { isMounted = false; };
}, [user, authLoading]); // 👈 removed handleNewChat


  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatMessages]);

  // Sync chatHistorySessions to localStorage
  useEffect(() => {
    if (user && chatHistorySessions.length > 0) {
      localStorage.setItem(getUserChatKey(user.id), JSON.stringify(chatHistorySessions));
    }
  }, [chatHistorySessions, user]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null); // No preview for non-image files
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleImageDoubleClick = (imageSrc) => {
    setEnlargedImage(imageSrc);
  };

  const handleCloseEnlargedImage = () => {
    setEnlargedImage(null);
  };

  const handleGenerateContent = async (e) => {
    e.preventDefault();
    if (!prompt.trim() && !selectedFile) return;

    setApiLoading(true);
    setError('');

    if (!user) {
      setError("You must be logged in to chat.");
      setApiLoading(false);
      return;
    }

    const currentPrompt = prompt;
    const currentFile = selectedFile;
    const currentFilePreview = filePreview;

    setPrompt('');
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const now = Date.now();
    const newTimestamp = {
      _seconds: Math.floor(now / 1000),
      _nanoseconds: (now % 1000) * 1_000_000
    };

    let currentConversationId = activeSessionId;
    if (!currentConversationId) {
      currentConversationId = generateUniqueId();
      setActiveSessionId(currentConversationId);
    }

    // Handle file upload if present
    if (currentFile) {
      try {
        console.log('Chats.js: Processing file upload');
        const fileData = await processChatFileApi(user, currentFile, currentConversationId, currentPrompt || null);

        const newUserMessage = {
          type: 'user',
          text: currentPrompt
            ? `${currentPrompt}\n\n[${fileData.fileType === 'image' ? 'Image' : 'File'} uploaded] ${fileData.extractedText}`
            : `[${fileData.fileType === 'image' ? 'Image' : 'File'} uploaded] ${fileData.extractedText}`,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          filePreview: currentFilePreview,
          fileName: fileData.fileName,
          fileType: fileData.fileType
        };
        setActiveChatMessages(prev => [...prev, newUserMessage]);

        const newAiMessage = {
          type: 'ai',
          text: fileData.aiResponse,
          timestamp: {
            _seconds: Math.floor(Date.now() / 1000),
            _nanoseconds: (Date.now() % 1000) * 1_000_000
          },
          conversationId: currentConversationId,
        };
        setActiveChatMessages(prev => [...prev, newAiMessage]);

        setChatHistorySessions(prevSessions => {
          const sessionToUpdateIndex = prevSessions.findIndex(session => session.id === currentConversationId);
          if (sessionToUpdateIndex !== -1) {
            const updatedSessions = [...prevSessions];
            const session = updatedSessions[sessionToUpdateIndex];
            // Check if messages are already added to prevent duplication
            const lastMessage = session.messages[session.messages.length - 1];
            if (!lastMessage || lastMessage.text !== newAiMessage.text) {
              session.messages = [...session.messages, newUserMessage, newAiMessage];
            }
            if (session.title === 'New Chat' || session.title.startsWith('Chat from')) {
              session.title = fileData.fileType === 'image' ? 'Image Analysis Chat' : 'Document Analysis Chat';
            }
            return updatedSessions;
          } else {
            return [{
              id: currentConversationId,
              title: fileData.fileType === 'image' ? 'Image Analysis Chat' : 'Document Analysis Chat',
              messages: [newUserMessage, newAiMessage]
            }, ...prevSessions];
          }
        });

        await saveChatEntryApi(user, {
          prompt: newUserMessage.text,
          response: newAiMessage.text,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          filePreview: currentFilePreview,
        });

      } catch (err) {
        console.error('Image processing error:', err);
        setError(err.message || 'Failed to process image.');
        setApiLoading(false);
        return;
      }
    } else {
      // Handle text-only message
      const newUserMessage = {
        type: 'user',
        text: currentPrompt,
        timestamp: newTimestamp,
        conversationId: currentConversationId,
      };
      setActiveChatMessages(prev => [...prev, newUserMessage]);

      try {
        console.log('Chats.js: Calling generateContentApi with:', {
          userId: user?.id,
          prompt: currentPrompt?.substring(0, 50) + '...',
          conversationId: currentConversationId
        });
        const generateData = await generateContentApi(user, currentPrompt, currentConversationId);
        const newResponse = generateData.generatedContent;

        const newAiMessage = {
          type: 'ai',
          text: newResponse,
          timestamp: {
            _seconds: Math.floor(Date.now() / 1000),
            _nanoseconds: (Date.now() % 1000) * 1_000_000
          },
          conversationId: currentConversationId,
        };
        setActiveChatMessages(prev => [...prev, newAiMessage]);

        setChatHistorySessions(prevSessions => {
          const sessionToUpdateIndex = prevSessions.findIndex(session => session.id === currentConversationId);
          if (sessionToUpdateIndex !== -1) {
            const updatedSessions = [...prevSessions];
            const session = updatedSessions[sessionToUpdateIndex];
            // Check if messages are already added to prevent duplication
            const lastMessage = session.messages[session.messages.length - 1];
            if (!lastMessage || lastMessage.text !== newAiMessage.text) {
              session.messages = [...session.messages, newUserMessage, newAiMessage];
            }
            if (session.title === 'New Chat' || session.title.startsWith('Chat from')) {
              const firstPrompt = session.messages.find(msg => msg.type === 'user')?.text || 'Untitled Chat';
              session.title = firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt;
            }
            return updatedSessions;
          } else {
            const firstPrompt = newUserMessage.text || 'Untitled Chat';
            const newSessionTitle = firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt;
            return [{
              id: currentConversationId,
              title: newSessionTitle,
              messages: [newUserMessage, newAiMessage]
            }, ...prevSessions];
          }
        });

        await saveChatEntryApi(user, {
          prompt: currentPrompt,
          response: newResponse,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
        });

      } catch (err) {
        console.error('Frontend error:', err);
        setError(err.message || 'Failed to get response or save chat.');
        setActiveChatMessages(prev => {
          const userMsgIndex = prev.findIndex(msg => msg === newUserMessage);
          return userMsgIndex !== -1 ? prev.slice(0, userMsgIndex) : prev;
        });
        setChatHistorySessions(prevSessions => {
          if (!activeSessionId) {
              return prevSessions.filter(session => session.id !== currentConversationId);
          }
          return prevSessions.map(session => {
              if (session.id === activeSessionId && session.messages.length > 1) {
                  return { ...session, messages: session.messages.slice(0, -2) };
              }
              return session;
          });
        });
      }
    }

    setApiLoading(false);
  };

  const loadChatSession = (session) => {
    setActiveChatMessages(session.messages);
    setActiveSessionId(session.id);
    setPrompt('');
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
  };

  const handleDeleteChatSession = async (sessionIdToDelete) => {
    if (!user) {
      setError("You must be logged in to delete chats.");
      return;
    }

    const sessionToDelete = chatHistorySessions.find(session => session.id === sessionIdToDelete);

    if (sessionToDelete && sessionToDelete.messages.length === 0) {
      const isCurrentlyActive = activeSessionId === sessionIdToDelete;
      const updatedSessions = chatHistorySessions.filter(session => session.id !== sessionIdToDelete);
      setChatHistorySessions(updatedSessions);

      if (isCurrentlyActive) {
        if (updatedSessions.length === 0) {
          setActiveChatMessages([]);
          setActiveSessionId(null);
        } else {
          handleNewChat();
        }
      }
      setError('');
      console.log(`Frontend: Deleted empty chat session ${sessionIdToDelete} from UI.`);
      return;
    }

    try {
      await deleteChatSessionApi(user, sessionIdToDelete);

      const isCurrentlyActive = activeSessionId === sessionIdToDelete;
      const updatedSessions = chatHistorySessions.filter(session => session.id !== sessionIdToDelete);
      setChatHistorySessions(updatedSessions);

      if (isCurrentlyActive) {
        if (updatedSessions.length === 0) {
          setActiveChatMessages([]);
          setActiveSessionId(null);
        } else {
          handleNewChat();
        }
      }
      setError('');
      console.log(`Frontend: Successfully deleted chat session ${sessionIdToDelete} from backend and UI.`);
    } catch (err) {
      console.error('Error deleting chat session:', err);
      setError(err.message || 'Failed to delete chat session.');
    }
  };

  if (authLoading) {
    return (
      <div className="chat-page-content">
        <div className="chat-history-sidebar-section">
          <div className="history-panel-header">
            <Skeleton width="60%" height={30} />
            <Skeleton width={120} height={35} />
          </div>
          <div style={{ padding: '10px' }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} style={{ marginBottom: '10px' }}>
                <Skeleton width="100%" height={40} />
              </div>
            ))}
          </div>
        </div>
        <div className="chat-main-section">
          <div className="chat-messages-display">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="chat-message-card ai-message" style={{ marginBottom: '15px' }}>
                <div className="message-content">
                  <Skeleton width="80%" height={20} />
                  <Skeleton width="60%" height={20} style={{ marginTop: '5px' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <Skeleton width="100%" height={50} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page-content">
      <div className="chat-history-sidebar-section">
        <div className="history-panel-header">
          <h2>Your Chats</h2>
          <button className="new-chat-button" onClick={handleNewChat} disabled={apiLoading || !user}>
            <FaPlus size="1.2em" /> New Chat
          </button>
        </div>
        <ul className="chat-history-list">
          {chatHistorySessions.map((session) => (
            <li
              key={session.id}
                className={`chat-history-item ${activeSessionId === session.id ? 'active-session' : ''}`}
              onClick={() => loadChatSession(session)}
            >
              <FaComments className="chat-folder-icon" size="1.2em" />
              <strong className="chat-title-text">{session.title}</strong>
              <small>({session.messages.length} msg)</small>
              <button
                className="delete-session-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChatSession(session.id);
                }}
                title="Delete Chat"
              >
                <FaTrash size="1.1em" />
              </button>
            </li>
          ))}
          {chatHistorySessions.length === 0 && <p className="no-history-message">No saved chat sessions.</p>}
        </ul>
      </div>

      <div className="chat-main-section">
        <div className="chat-messages-display">
          {activeChatMessages.length === 0 && !apiLoading && !error && user && !activeSessionId && (
            <p className="no-messages-placeholder">
              Select a chat from the left or click "New Chat" to begin!
            </p>
          )}
          {activeChatMessages.length === 0 && activeSessionId && !apiLoading && !error && user && (
            <p className="no-messages-placeholder">
              Start typing to begin your new chat session!
            </p>
          )}
          {activeChatMessages.map((msg, index) => (
            <div key={index} className={`chat-message-card ${msg.type}-message`}>
              <div className="message-content">
                {msg.filePreview && (
                  <div className="message-image-container">
                    <img
                      src={msg.filePreview}
                      alt="Uploaded image"
                      className="message-image"
                      onClick={() => handleImageDoubleClick(msg.filePreview)}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                )}
                {msg.fileName && !msg.filePreview && (
                  <div className="message-file-info">
                    <p>📄 {msg.fileName}</p>
                  </div>
                )}
                <ReactMarkdown>{msg.text}</ReactMarkdown>
                {msg.timestamp && (
                  <small className="message-timestamp">
                    {formatFirebaseTimestamp(msg.timestamp)}
                  </small>
                )}
              </div>
            </div>
          ))}
          {apiLoading && (
            <div className="chat-message-card ai-message">
              <div className="message-content">
                <p>AI is thinking...</p>
              </div>
            </div>
          )}
          <div ref={chatMessagesEndRef} />
        </div>

        <div className="chat-input-area">
          {filePreview && (
            <div className="file-preview-container" style={{ position: 'relative', display: 'inline-block' }}>
              <img src={filePreview} alt="Selected file" className="file-preview" style={{ maxWidth: '250px', maxHeight: '250px' }} />
              <button
                type="button"
                className="remove-image-button"
                onClick={handleRemoveFile}
                title="Remove file"
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-20px',
                  backgroundColor: '#e04958',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '10px',
                  height: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#e04958'}
              >
                ×
              </button>
            </div>
          )}
          {selectedFile && !filePreview && (
            <div className="file-info-container" style={{ position: 'relative', display: 'inline-block' }}>
              <p className="file-info">📄 {selectedFile.name}</p>
              <button
                type="button"
                className="remove-file-button"
                onClick={handleRemoveFile}
                title="Remove file"
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-20px',
                  backgroundColor: '#e04958',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '5px',
                  height: '5px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#e04958'}
              >
                ×
              </button>
            </div>
          )}
          <form onSubmit={handleGenerateContent} className="chat-input-form">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,.pdf,.docx,.txt,.pptx"
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" className="file-upload-button">
              <FaFileUpload color="#3458bb" size="1.5em"/>
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows="1"
              placeholder={user ? "Type your message or upload a file or image..." : "Please log in to chat."}
              disabled={apiLoading || !user || !activeSessionId}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerateContent(e);
                }
              }}
            ></textarea>
            <button className="send-button" disabled={apiLoading || !user || !activeSessionId || (!prompt.trim() && !selectedFile)}>
              {apiLoading ? <FaStop className="stop-icon" size="1.3em" /> : <FaPaperPlane className='send-icon' size="1.3em" />}
            </button>
          </form>
          {error && <p className="error-message">{error}</p>}
          {!user && !error && <p className="info-message">Please sign in to start chatting.</p>}
          {!activeSessionId && user && !error && <p className="info-message">Click "New Chat" or select a past chat to begin.</p>}
        </div>
      </div>

      {enlargedImage && (
        <div className="image-modal-overlay" onClick={handleCloseEnlargedImage}>
          <div className="image-modal-content">
            <img src={enlargedImage} alt="Enlarged" className="enlarged-image" />
            <button className="close-image-modal" onClick={handleCloseEnlargedImage}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chats;