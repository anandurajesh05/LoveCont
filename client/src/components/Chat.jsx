import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import { v4 as uuidv4 } from 'uuid';
import Login from './Login';
import './Chat.css';

const SOCKET_URL = 'http://localhost:3001';

const Chat = () => {
    const [socket, setSocket] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle');
    const [isConnected, setIsConnected] = useState(false);

    // Partner State
    const [partnerUserId, setPartnerUserId] = useState(null);
    const [partnerProfile, setPartnerProfile] = useState(null);

    const [friends, setFriends] = useState([]);

    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [view, setView] = useState('stranger');
    const [activeFriendId, setActiveFriendId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [friendRequest, setFriendRequest] = useState(null);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Refs for accessing fresh state in callbacks
    const viewRef = useRef(view);
    const activeFriendIdRef = useRef(activeFriendId);
    const partnerUserIdRef = useRef(partnerUserId);

    const getAvatar = (seed) => `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;

    // Update refs whenever state changes
    useEffect(() => {
        viewRef.current = view;
        activeFriendIdRef.current = activeFriendId;
        partnerUserIdRef.current = partnerUserId;
    }, [view, activeFriendId, partnerUserId]);

    // Load Profile on Mount
    useEffect(() => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) {
            setUserProfile(JSON.parse(storedProfile));
            setIsLoggedIn(true);
        }
        const storedFriends = JSON.parse(localStorage.getItem('friendsList') || '[]');
        setFriends(storedFriends);
    }, []);

    // Load/Save Chat Logic
    const loadChatHistory = (friendId) => {
        if (!friendId) return [];
        const allHistory = JSON.parse(localStorage.getItem('chatHistory') || '{}');
        return allHistory[friendId] || [];
    };

    const saveChatHistory = (friendId, msg) => {
        if (!friendId) return;
        const allHistory = JSON.parse(localStorage.getItem('chatHistory') || '{}');
        const friendHistory = allHistory[friendId] || [];
        friendHistory.push(msg);
        allHistory[friendId] = friendHistory;
        localStorage.setItem('chatHistory', JSON.stringify(allHistory));
    };

    // Load/Clear messages when switching active friend
    useEffect(() => {
        if (view === 'friend' && activeFriendId) {
            const history = loadChatHistory(activeFriendId);
            setMessages(history);
        } else if (view === 'friend' && !activeFriendId) {
            setMessages([]);
        } else if (view === 'stranger' && status !== 'connected') {
            // Keep messages empty/system state for stranger until connected
            // dependent on other logic, usually handled by socket listeners
        }
    }, [activeFriendId, view]); // Removed empty dependency array 

    useEffect(() => {
        if (!isLoggedIn || !userProfile) return;

        let userId = localStorage.getItem('userId');
        if (!userId) {
            userId = uuidv4();
            localStorage.setItem('userId', userId);
        }

        const newSocket = io(SOCKET_URL, {
            query: {
                userId,
                nickname: userProfile.nickname,
                age: userProfile.age,
                avatarSeed: userProfile.avatarSeed
            }
        });
        setSocket(newSocket);

        newSocket.on('connect', () => setIsConnected(true));
        newSocket.on('disconnect', () => setIsConnected(false));

        newSocket.on('chat_start', () => {
            setStatus('connected');
            setMessages([]);
            setPartnerUserId(null);
            setPartnerProfile(null);
            setView('stranger');
        });

        newSocket.on('partner_info', (data) => {
            setPartnerUserId(data.partnerUserId);
            setPartnerProfile({
                nickname: data.nickname,
                age: data.age,
                avatarSeed: data.avatarSeed
            });
        });

        newSocket.on('receive_message', (data) => {
            const currentView = viewRef.current;
            const currentFriendId = activeFriendIdRef.current;
            const currentPartnerId = partnerUserIdRef.current;

            let shouldShow = false;

            if (currentView === 'friend' && data.senderId === currentFriendId) {
                shouldShow = true;
            } else if (currentView === 'stranger' && currentPartnerId && (data.senderId === currentPartnerId || !data.senderId)) {
                shouldShow = true;
            }

            const msgObj = { ...data, sender: 'partner' };

            // Save if it's a friend message (even if we are not looking at it right now?)
            // For MVP: only save if we are friend with sender
            const friendsList = JSON.parse(localStorage.getItem('friendsList') || '[]');
            const isFriend = friendsList.find(f => f.id === data.senderId);
            if (isFriend) {
                saveChatHistory(data.senderId, msgObj);
            }

            // Only update UI if we should show it
            if (shouldShow) {
                setMessages((prev) => [...prev, msgObj]);

                // Emit Delivered
                newSocket.emit('message_status_update', {
                    msgId: data.msgId,
                    status: 'delivered',
                    toUserId: data.senderId
                });

                if (document.visibilityState === 'visible') {
                    newSocket.emit('message_status_update', {
                        msgId: data.msgId,
                        status: 'seen',
                        toUserId: data.senderId
                    });
                }
            }
        });

        newSocket.on('message_status_update', ({ msgId, status }) => {
            setMessages(prev => prev.map(msg =>
                msg.msgId === msgId ? { ...msg, status } : msg
            ));

            // Also update history if in friend mode
            if (activeFriendIdRef.current) {
                // Optimization: We'd need to update localStorage too.
                // This is tricky without reading it all back. 
                // For now, let's just update UI. Persistence of status updates might lag until reload/re-send.
                // To do it properly:
                const fid = activeFriendIdRef.current;
                const allHistory = JSON.parse(localStorage.getItem('chatHistory') || '{}');
                if (allHistory[fid]) {
                    const updatedHist = allHistory[fid].map(m => m.msgId === msgId ? { ...m, status } : m);
                    allHistory[fid] = updatedHist;
                    localStorage.setItem('chatHistory', JSON.stringify(allHistory));
                }
            }
        });

        newSocket.on('partner_disconnected', () => {
            setStatus('disconnected');
        });

        newSocket.on('searching', () => {
            setStatus('searching');
            setMessages([]);
            setPartnerUserId(null);
            setPartnerProfile(null);
        });

        newSocket.on('incoming_friend_request', (data) => setFriendRequest(data));

        newSocket.on('friend_request_accepted', (data) => {
            addFriendLocally(data);
            alert(`${data.nickname} accepted your friend request!`);
        });

        newSocket.on('friend_added', (data) => addFriendLocally(data));

        newSocket.on('friend_removed', ({ friendId }) => {
            setFriends(prev => {
                const updated = prev.filter(f => f.id !== friendId);
                localStorage.setItem('friendsList', JSON.stringify(updated));
                return updated;
            });
            // Also remove chat history? Optional. Let's keep it for now or delete.
            const allHistory = JSON.parse(localStorage.getItem('chatHistory') || '{}');
            if (allHistory[friendId]) {
                delete allHistory[friendId];
                localStorage.setItem('chatHistory', JSON.stringify(allHistory));
            }

            if (activeFriendIdRef.current === friendId) {
                setView('stranger');
                setActiveFriendId(null);
            }
        });

        return () => newSocket.close();
    }, [isLoggedIn, userProfile]);

    const addFriendLocally = (newFriend) => {
        setFriends(prev => {
            if (prev.find(f => f.id === newFriend.friendId)) return prev;
            const updated = [...prev, {
                id: newFriend.friendId,
                nickname: newFriend.nickname,
                avatarSeed: newFriend.avatarSeed
            }];
            localStorage.setItem('friendsList', JSON.stringify(updated));
            return updated;
        });
    };

    const handleLogin = (profileData) => {
        setUserProfile(profileData);
        localStorage.setItem('userProfile', JSON.stringify(profileData));
        setIsLoggedIn(true);
    };

    const findPartner = () => {
        if (socket) {
            setMessages([]);
            setStatus('searching');
            setView('stranger');
            socket.emit('join_queue');
        }
    };

    const nextPartner = () => {
        if (socket) {
            socket.emit('next_partner');
            setMessages([]);
            setStatus('searching');
            socket.emit('join_queue');
        }
    };

    const sendFriendRequest = () => {
        if (socket && partnerUserId) {
            socket.emit('send_friend_request', { toUserId: partnerUserId });
            alert("Friend request sent!");
        }
    };

    const removeFriend = () => {
        if (confirm("Are you sure you want to unfriend this user?")) {
            if (activeFriendId) {
                socket.emit('remove_friend', { friendId: activeFriendId });
            }
        }
    };

    const downloadChat = () => {
        if (!activeFriendId || messages.length === 0) return;
        const friend = friends.find(f => f.id === activeFriendId);
        const fileName = `chat_with_${friend?.nickname || 'friend'}.json`;
        const json = JSON.stringify(messages, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFriendResponse = (accepted) => {
        if (socket && friendRequest) {
            socket.emit('respond_friend_request', {
                fromUserId: friendRequest.fromUserId,
                accepted
            });
            setFriendRequest(null);
        }
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (input.trim() && socket) {
            const msgId = uuidv4();
            const msgData = {
                msgId,
                message: input,
                type: 'text',
                status: 'sent',
                senderId: userProfile.id
            };

            let canSend = false;

            if (view === 'friend' && activeFriendId) {
                msgData.toUserId = activeFriendId;
                canSend = true;
                // Save to history
                saveChatHistory(activeFriendId, { ...msgData, sender: 'me' });
            } else if (view === 'stranger' && status === 'connected') {
                canSend = true;
            }

            if (canSend) {
                socket.emit('send_message', msgData, (ack) => {
                    // Ack from server = Sent
                });
                setMessages((prev) => [...prev, { ...msgData, sender: 'me' }]);
                setInput('');
            }
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${SOCKET_URL}/upload`, { method: 'POST', body: formData });
            const data = await response.json();
            const msgId = uuidv4();
            const msgData = {
                msgId,
                message: file.name,
                type: 'file',
                url: data.url,
                fileType: data.type,
                status: 'sent',
                senderId: userProfile.id
            };

            let canSend = false;

            if (view === 'friend' && activeFriendId) {
                msgData.toUserId = activeFriendId;
                canSend = true;
                saveChatHistory(activeFriendId, { ...msgData, sender: 'me' });
            } else if (view === 'stranger' && status === 'connected') {
                canSend = true;
            }

            if (canSend) {
                socket.emit('send_message', msgData);
                setMessages((prev) => [...prev, { ...msgData, sender: 'me' }]);
            }
        } catch (error) {
            console.error('Upload failed', error);
        }
    };

    const handleEmojiClick = (emojiObject) => {
        setInput(prev => prev + emojiObject.emoji);
        setShowEmojiPicker(false);
    };

    // Mark seen on hover/focus (simplified for now)
    const handleChatClick = () => {
        if (socket && messages.length > 0) {
            const partnerMsgs = messages.filter(m => m.sender === 'partner' && m.status !== 'seen');
            partnerMsgs.forEach(m => {
                socket.emit('message_status_update', {
                    msgId: m.msgId,
                    status: 'seen',
                    toUserId: m.senderId
                });
            });
        }
    };

    const renderStatus = (status) => {
        if (status === 'sent') return <span className="msg-status">✓</span>;
        if (status === 'delivered') return <span className="msg-status">✓✓</span>;
        if (status === 'seen') return <span className="msg-status seen">✓✓</span>;
        return null;
    };

    const renderMessage = (msg) => {
        const isMe = msg.sender === 'me';
        let avatar = 'unknown';
        if (isMe && userProfile) {
            avatar = userProfile.avatarSeed;
        } else {
            if (view === 'friend' && activeFriendId) {
                const friend = friends.find(f => f.id === activeFriendId);
                if (friend) avatar = friend.avatarSeed;
            } else if (view === 'stranger' && partnerProfile) {
                avatar = partnerProfile.avatarSeed;
            }
        }

        return (
            <div className={`message-bubble ${isMe ? 'me' : 'partner'}`}>
                {!isMe && <img src={getAvatar(avatar)} alt="avatar" className="message-avatar" />}
                <div className="message-content">
                    {msg.type === 'file' ? (
                        <div className="media-content">
                            {msg.fileType.startsWith('image/') && <img src={msg.url} alt="uploaded" />}
                            {msg.fileType.startsWith('video/') && <video src={msg.url} controls />}
                            {!msg.fileType.startsWith('image/') && !msg.fileType.startsWith('video/') && (
                                <a href={msg.url} target="_blank" rel="noopener noreferrer" className="file-link">📎 {msg.message}</a>
                            )}
                        </div>
                    ) : (
                        <p>{msg.message}</p>
                    )}
                    <div className="message-meta">
                        <span className="message-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && renderStatus(msg.status)}
                    </div>
                </div>
            </div>
        );
    };

    if (!isLoggedIn) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <div className="app-container">
            <div className="bg-orb orb-1"></div>
            <div className="bg-orb orb-2"></div>

            <div className="glass-container">
                {/* Sidebar */}
                <div className="sidebar">
                    <div className="app-header">
                        <div className="logo-icon">💕</div>
                        <h2>LoveCont</h2>
                    </div>

                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input type="text" placeholder="Search friends..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>

                    <div className="sidebar-section">
                        <h3>My Friends</h3>
                        <div className="friend-list">
                            {friends.filter(f => f.nickname.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                                <div key={f.id} className={`friend-item ${activeFriendId === f.id ? 'active' : ''}`} onClick={() => { setActiveFriendId(f.id); setView('friend'); }}>
                                    <img src={getAvatar(f.avatarSeed)} alt="avatar" className="friend-avatar" />
                                    <div className="friend-info">
                                        <span className="friend-name">{f.nickname}</span>
                                        <span className="friend-status online">Friend</span>
                                    </div>
                                </div>
                            ))}
                            {friends.length === 0 && <p className="empty-state">No friends yet.</p>}
                        </div>
                    </div>

                    <div className="user-profile-mini">
                        <img src={getAvatar(userProfile?.avatarSeed)} alt="My Avatar" className="mini-avatar" />
                        <div className="my-info">
                            <span className="my-name">{userProfile?.nickname}</span>
                            <span className="my-status">Online</span>
                        </div>
                        <button onClick={() => {
                            if (confirm("Logout?")) {
                                localStorage.removeItem('userProfile');
                                setIsLoggedIn(false);
                                socket.disconnect();
                                setSocket(null);
                            }
                        }} className="logout-btn" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }} title="Logout">
                            🚪
                        </button>
                    </div>
                </div>

                {/* Chat Main */}
                <div className="chat-main" onClick={handleChatClick}>
                    <div className="chat-header">
                        <div className="header-info">
                            {view === 'friend' && activeFriendId ? (
                                (() => {
                                    const friend = friends.find(f => f.id === activeFriendId);
                                    if (!friend) return null;
                                    return (
                                        <>
                                            <img src={getAvatar(friend.avatarSeed)} alt="Friend" className="header-avatar" />
                                            <div className="header-text">
                                                <h3>{friend.nickname}</h3>
                                                <span className="status-text online">Friend</span>
                                            </div>
                                        </>
                                    );
                                })()
                            ) : status === 'connected' && partnerProfile ? (
                                <>
                                    <img src={getAvatar(partnerProfile.avatarSeed)} alt="Partner" className="header-avatar" />
                                    <div className="header-text">
                                        <h3>{partnerProfile.nickname}</h3>
                                        <span className="status-text online">{partnerProfile.age} years old • Online</span>
                                    </div>
                                </>
                            ) : (
                                <div className="header-text">
                                    <h3>Dashboard</h3>
                                    <span className="status-text">{status === 'searching' ? 'Searching...' : 'Idle'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="chat-content">
                        {status === 'idle' && view === 'stranger' && (
                            <div className="empty-chat-state">
                                <div className="empty-icon">👋</div>
                                <h2>Welcome {userProfile?.nickname}</h2>
                                <p>Find new friends anonymously on LoveCont.</p>
                                <button onClick={findPartner} className="cta-btn">Find a Stranger</button>
                            </div>
                        )}
                        {status === 'searching' && view === 'stranger' && (
                            <div className="empty-chat-state pulsating">
                                <div className="empty-icon">🔍</div>
                                <h2>Searching...</h2>
                                <p>Looking for a match...</p>
                            </div>
                        )}
                        {status === 'disconnected' && view === 'stranger' && (
                            <div className="empty-chat-state">
                                <div className="empty-icon">👋</div>
                                <h2>Disconnected</h2>
                                <p>The chat has ended.</p>
                                <button onClick={nextPartner} className="cta-btn">Find New Partner</button>
                            </div>
                        )}

                        {view === 'friend' && messages.length === 0 && (
                            <div className="empty-chat-state">
                                <p>Start a conversation with your friend!</p>
                            </div>
                        )}

                        <div className="messages-list">
                            {messages.map((msg, index) => renderMessage(msg))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {((view === 'stranger' && status === 'connected') || view === 'friend') && (
                        <div className="chat-input-area">
                            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="input-action-btn">😊</button>
                            {showEmojiPicker && (
                                <div className="emoji-picker-container">
                                    <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                            <button onClick={() => fileInputRef.current.click()} className="input-action-btn">📎</button>
                            <form onSubmit={sendMessage} className="input-form">
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onFocus={handleChatClick}
                                />
                                <button type="submit" className="send-btn">➤</button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div className="right-sidebar">
                    {view === 'friend' && activeFriendId ? (
                        // Friend View
                        (() => {
                            const friend = friends.find(f => f.id === activeFriendId);
                            if (!friend) return null;
                            return (
                                <>
                                    <div className="profile-large">
                                        <img src={getAvatar(friend.avatarSeed)} alt="Profile" className="large-avatar" />
                                        <h3>{friend.nickname}</h3>
                                        <p className="profile-bio">Friend</p>
                                    </div>
                                    <div className="actions-section">
                                        <button onClick={downloadChat} className="action-btn primary" style={{ marginBottom: '10px' }}>Download Chat</button>
                                        <button onClick={removeFriend} className="action-btn danger">Unfriend</button>
                                    </div>
                                </>
                            );
                        })()
                    ) : (
                        // Stranger View
                        status === 'connected' && partnerProfile ? (
                            <>
                                <div className="profile-large">
                                    <img src={getAvatar(partnerProfile.avatarSeed)} alt="Profile" className="large-avatar" />
                                    <h3>{partnerProfile.nickname}</h3>
                                    <p className="profile-bio">Age: {partnerProfile.age}</p>
                                </div>

                                <div className="actions-section">
                                    <button onClick={sendFriendRequest} className="action-btn primary">Add Friend</button>
                                    <button onClick={nextPartner} className="action-btn danger">Skip / Next</button>
                                </div>

                                <div className="media-section">
                                    <h3>Shared Media</h3>
                                    <div className="media-grid">
                                        {messages.filter(m => m.type === 'file' && m.fileType.startsWith('image/')).map((m, i) => (
                                            <img key={i} src={m.url} alt="media" className="media-item" />
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="profile-placeholder">
                                <h3>Profile Info</h3>
                                <p>Connect to see who you're talking to.</p>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Friend Request Modal */}
            {friendRequest && (
                <div className="modal-overlay">
                    <div className="modal-content glass-panel">
                        <img src={getAvatar(friendRequest.avatarSeed)} alt="avatar" className="modal-avatar" />
                        <h3>Friend Request!</h3>
                        <p><strong>{friendRequest.nickname}</strong> wants to be friends.</p>
                        <div className="modal-actions">
                            <button onClick={() => handleFriendResponse(true)} className="action-btn primary">Accept</button>
                            <button onClick={() => handleFriendResponse(false)} className="action-btn danger">Decline</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chat;
