import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAuthStatus from '../hooks/useAuthStatus';
import ReactMarkdown from 'react-markdown';
import { FaPaperPlane, FaStop, FaPlus, FaComments, FaTrash, FaImage } from 'react-icons/fa';
import {
  formatFirebaseTimestamp,
  generateUniqueId,
  fetchChatHistoryApi,
  saveChatEntryApi,
  deleteChatSessionApi,
  generateContentApi,
  processChatImageApi
} from '../utils/ChatHelpers';

function Chats() {
  const { user, loading: authLoading } = useAuthStatus();

  const [prompt, setPrompt] = useState('');
  const [activeChatMessages, setActiveChatMessages] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatHistorySessions, setChatHistorySessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
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
    setSelectedImage(null);
    setImagePreview(null);
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

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateContent = async (e) => {
    e.preventDefault();
    if (!prompt.trim() && !selectedImage) return;

    setApiLoading(true);
    setError('');

    if (!user) {
      setError("You must be logged in to chat.");
      setApiLoading(false);
      return;
    }

    const currentPrompt = prompt;
    const currentImage = selectedImage;
    const currentImagePreview = imagePreview;

    setPrompt('');
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const now = Date.now();
    const newTimestamp = {
      _seconds: Math.floor(now / 1000),
      _nanoseconds: (now % 1000) * 1_000_000
    };

    let currentConversationId = activeSessionId;
    if (!currentConversationId || activeChatMessages.length === 0) {
      currentConversationId = generateUniqueId();
      setActiveSessionId(currentConversationId);
    }

    // Handle image upload if present
    if (currentImage) {
      try {
        console.log('Chats.js: Processing image upload');
        const imageData = await processChatImageApi(user, currentImage, currentConversationId, currentPrompt || null);

        const newUserMessage = {
          type: 'user',
          text: currentPrompt
            ? `${currentPrompt}\n\n[Image uploaded] ${imageData.extractedText}`
            : `[Image uploaded] ${imageData.extractedText}`,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          imagePreview: currentImagePreview
        };
        setActiveChatMessages(prev => [...prev, newUserMessage]);

        const newAiMessage = {
          type: 'ai',
          text: imageData.aiResponse,
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
            session.messages = [...session.messages, newUserMessage, newAiMessage];
            if (session.title === 'New Chat' || session.title.startsWith('Chat from')) {
              session.title = 'Image Analysis Chat';
            }
            return updatedSessions;
          } else {
            return [{
              id: currentConversationId,
              title: 'Image Analysis Chat',
              messages: [newUserMessage, newAiMessage]
            }, ...prevSessions];
          }
        });

        await saveChatEntryApi(user, {
          prompt: newUserMessage.text,
          response: newAiMessage.text,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
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
            session.messages = [...session.messages, newUserMessage, newAiMessage];
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
    setSelectedImage(null);
    setImagePreview(null);
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
      <div className="chat-container">
        <p style={{ textAlign: 'center', marginTop: '50px', fontSize: '1.2em' }}>Loading user authentication...</p>
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
                {msg.imagePreview && (
                  <div className="message-image-container">
                    <img src={msg.imagePreview} alt="Uploaded" className="message-image" />
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
          {imagePreview && (
            <div className="image-preview-container">
              <img src={imagePreview} alt="Selected" className="image-preview" />
              <button
                type="button"
                className="remove-image-button"
                onClick={handleRemoveImage}
                title="Remove image"
              >
                ×
              </button>
            </div>
          )}
          <form onSubmit={handleGenerateContent} className="chat-input-form">
            <div className="input-with-image">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                style={{ display: 'none' }}
                id="image-upload"
              />
              <label htmlFor="image-upload" className="image-upload-button">
                <FaImage size="1.2em" />
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows="1"
                placeholder={user ? "Type your message or upload an image..." : "Please log in to chat."}
                disabled={apiLoading || !user || !activeSessionId}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateContent(e);
                  }
                }}
              ></textarea>
            </div>
            <button className="send-button" disabled={apiLoading || !user || !activeSessionId || (!prompt.trim() && !selectedImage)}>
              {apiLoading ? <FaStop className="stop-icon" size="1.3em" /> : <FaPaperPlane className='send-icon' size="1.3em" />}
            </button>
          </form>
          {error && <p className="error-message">{error}</p>}
          {!user && !error && <p className="info-message">Please log in to start chatting.</p>}
          {!activeSessionId && user && !error && <p className="info-message">Click "New Chat" or select a past chat to begin.</p>}
        </div>
      </div>
    </div>
  );
}

export default Chats;