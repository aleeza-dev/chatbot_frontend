import { useEffect, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { GoogleLogin } from "@react-oauth/google";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

const modes = [
  {
    id: "general",
    name: "General",
    icon: "💬",
  },
  {
    id: "coding",
    name: "Coding",
    icon: "👨‍💻",
  },
  {
    id: "study",
    name: "Study",
    icon: "📚",
  },
];

function App() {
  const [messages, setMessages] = useState(() => {
    try {
      const savedMessages = localStorage.getItem(
        "nexaai_current_chat"
      );

      return savedMessages
        ? JSON.parse(savedMessages)
        : [];
    } catch {
      return [];
    }
  });

  const [chatHistory, setChatHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState("general");
  const [loading, setLoading] = useState(false);

  // =====================================================
  // AUTH STATES
  // =====================================================

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // =====================================================
  // CURRENT USER
  // =====================================================

  const [user, setUser] = useState(() => {
    const savedUser =
      localStorage.getItem("nexaai_user");

    try {
      return savedUser
        ? JSON.parse(savedUser)
        : null;
    } catch {
      return null;
    }
  });

  // =====================================================
  // GET AUTH TOKEN
  // =====================================================

  const getToken = () => {
    return localStorage.getItem("nexaai_token");
  };

  // =====================================================
  // SAVE CURRENT CHAT
  // =====================================================

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(
          "nexaai_current_chat",
          JSON.stringify(messages)
        );
      }
    } catch (error) {
      console.error(
        "❌ Current chat save error:",
        error
      );
    }
  }, [messages]);

  // =====================================================
  // GET FRIENDLY API ERROR
  // =====================================================

  const getErrorMessage = (
    error,
    defaultMessage
  ) => {
    const status = error?.response?.status;

    const backendMessage =
      error?.response?.data?.message;

    if (status === 503) {
      return "NexaAI is temporarily busy right now. Please try again in a few seconds. 💙";
    }

    if (status === 429) {
      return "NexaAI is receiving too many requests right now. Please wait a moment and try again.";
    }

    if (status === 401) {
      return "Your session has expired. Please login again.";
    }

    if (
      typeof backendMessage === "string" &&
      backendMessage.trim()
    ) {
      return backendMessage;
    }

    if (error?.code === "ERR_NETWORK") {
      return "Unable to connect to NexaAI server. Please check your internet connection and try again.";
    }

    return defaultMessage;
  };

  // =====================================================
  // LOAD CHAT HISTORY
  // =====================================================

  const loadChatHistory = async () => {
    const token = getToken();

    if (!token) {
      setChatHistory([]);
      return;
    }

    setHistoryLoading(true);

    try {
      const response = await axios.get(
        `${API_URL}/api/history`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        setChatHistory(
          response.data.history || []
        );
      }
    } catch (error) {
      console.error(
        "❌ History Load Error:",
        error
      );

      if (error?.response?.status === 401) {
        localStorage.removeItem(
          "nexaai_token"
        );

        localStorage.removeItem(
          "nexaai_user"
        );

        setUser(null);
        setChatHistory([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  // =====================================================
  // LOAD HISTORY WHEN USER EXISTS
  // =====================================================

  useEffect(() => {
    if (user) {
      loadChatHistory();
    } else {
      setChatHistory([]);
    }
  }, [user]);

  // =====================================================
  // SEND MESSAGE
  // =====================================================

  const sendMessage = async () => {
    if (!input.trim() || loading) {
      return;
    }

    const token = getToken();

    if (!token) {
      setAuthMode("login");
      setAuthError("");
      setShowAuth(true);
      return;
    }

    const userMessage = input.trim();

    const userMessageObject = {
      role: "user",
      content: userMessage,
      mode,
    };

    const currentHistory = messages
      .filter(
        (message) =>
          message.role === "user" ||
          message.role === "assistant"
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setMessages((prev) => [
      ...prev,
      userMessageObject,
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/api/chat`,
        {
          message: userMessage,
          history: currentHistory,
          mode,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const aiMessage = {
        role: "assistant",
        content:
          response.data.reply ||
          "Sorry, NexaAI could not generate a response.",
        feedback: null,
        isFeedbackMessage: false,
        mode,
      };

      setMessages((prev) => [
        ...prev,
        aiMessage,
      ]);

      await loadChatHistory();
    } catch (error) {
      console.error(
        "❌ Chat Error:",
        error
      );

      if (error?.response?.status === 401) {
        localStorage.removeItem(
          "nexaai_token"
        );

        localStorage.removeItem(
          "nexaai_user"
        );

        setUser(null);
        setChatHistory([]);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Your session has expired. Please login again.",
            feedback: null,
            isFeedbackMessage: true,
          },
        ]);

        setShowAuth(true);
        setAuthMode("login");
      } else {
        const friendlyMessage =
          getErrorMessage(
            error,
            "❌ Unable to connect to NexaAI. Please try again."
          );

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: friendlyMessage,
            feedback: null,
            isFeedbackMessage: true,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // HANDLE FEEDBACK
  // =====================================================

  const handleFeedback = async (
    messageIndex,
    type
  ) => {
    const selectedMessage =
      messages[messageIndex];

    if (
      !selectedMessage ||
      selectedMessage.role !== "assistant" ||
      selectedMessage.isFeedbackMessage
    ) {
      return;
    }

    const userMessage =
      messages[messageIndex - 1];

    if (
      !userMessage ||
      userMessage.role !== "user"
    ) {
      console.error(
        "❌ User message not found for feedback."
      );
      return;
    }

    if (selectedMessage.feedback === type) {
      return;
    }

    setMessages((prev) =>
      prev.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              feedback: type,
            }
          : message
      )
    );

    try {
      const response = await axios.post(
        `${API_URL}/api/feedback`,
        {
          message: userMessage.content,
          aiResponse: selectedMessage.content,
          feedback: type,
          mode:
            selectedMessage.mode ||
            userMessage.mode ||
            mode,
        }
      );

      if (!response.data.success) {
        throw new Error(
          response.data.message ||
            "Failed to save feedback"
        );
      }

      console.log(
        "✅ Feedback saved successfully:",
        response.data
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            type === "like"
              ? "Thank you for your feedback! 💙"
              : "Thanks for letting me know. I'll try to improve! 💙",
          feedback: null,
          isFeedbackMessage: true,
        },
      ]);
    } catch (error) {
      console.error(
        "❌ Feedback save failed:",
        error
      );

      setMessages((prev) =>
        prev.map((message, index) =>
          index === messageIndex
            ? {
                ...message,
                feedback: null,
              }
            : message
        )
      );
    }
  };

  // =====================================================
  // OPEN AUTH MODAL
  // =====================================================

  const openAuth = (type = "login") => {
    setAuthMode(type);

    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");

    setShowAuth(true);
  };

  // =====================================================
  // CLOSE AUTH MODAL
  // =====================================================

  const closeAuth = () => {
    if (authLoading) {
      return;
    }

    setShowAuth(false);
    setAuthError("");
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
  };

  // =====================================================
  // HANDLE NORMAL AUTH
  // =====================================================

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    setAuthError("");

    if (
      !authEmail.trim() ||
      !authPassword.trim()
    ) {
      setAuthError(
        "Please enter your email and password."
      );
      return;
    }

    if (
      authMode === "signup" &&
      !authName.trim()
    ) {
      setAuthError(
        "Please enter your name."
      );
      return;
    }

    if (
      authMode === "signup" &&
      authPassword.length < 6
    ) {
      setAuthError(
        "Password must be at least 6 characters."
      );
      return;
    }

    setAuthLoading(true);

    try {
      const endpoint =
        authMode === "signup"
          ? `${API_URL}/api/auth/signup`
          : `${API_URL}/api/auth/login`;

      const requestData =
        authMode === "signup"
          ? {
              name: authName.trim(),
              email: authEmail.trim(),
              password: authPassword,
            }
          : {
              email: authEmail.trim(),
              password: authPassword,
            };

      const response = await axios.post(
        endpoint,
        requestData
      );

      if (!response.data.success) {
        throw new Error(
          response.data.message ||
            "Authentication failed."
        );
      }

      localStorage.setItem(
        "nexaai_token",
        response.data.token
      );

      localStorage.setItem(
        "nexaai_user",
        JSON.stringify(response.data.user)
      );

      setUser(response.data.user);

      setShowAuth(false);

      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      setAuthError("");

      console.log(
        "✅ Authentication successful:",
        response.data.user
      );

      await loadChatHistory();
    } catch (error) {
      console.error(
        "❌ Authentication Error:",
        error
      );

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Something went wrong. Please try again.";

      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  // =====================================================
  // GOOGLE LOGIN SUCCESS
  // =====================================================

  const handleGoogleSuccess = async (
    credentialResponse
  ) => {
    setAuthError("");
    setAuthLoading(true);

    console.log(
      "🔵 API_URL:",
      API_URL
    );

    console.log(
      "🔵 Google API URL:",
      `${API_URL}/api/auth/google`
    );

    try {
      if (!credentialResponse?.credential) {
        setAuthError(
          "Google authentication failed. No Google credential was received."
        );

        setAuthLoading(false);
        return;
      }

      console.log(
        "🔵 Google credential received successfully."
      );

      const googleApiUrl =
        `${API_URL}/api/auth/google`;

      const response = await axios.post(
        googleApiUrl,
        {
          credential:
            credentialResponse.credential,
        },
        {
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );

      console.log(
        "🟢 Google API Response:",
        response.data
      );

      if (!response.data.success) {
        throw new Error(
          response.data.message ||
            "Google authentication failed."
        );
      }

      // =================================================
      // SAVE JWT TOKEN
      // =================================================

      localStorage.setItem(
        "nexaai_token",
        response.data.token
      );

      // =================================================
      // SAVE USER
      // =================================================

      localStorage.setItem(
        "nexaai_user",
        JSON.stringify(response.data.user)
      );

      // =================================================
      // UPDATE USER STATE
      // =================================================

      setUser(response.data.user);

      // =================================================
      // CLOSE MODAL
      // =================================================

      setShowAuth(false);

      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      setAuthError("");

      console.log(
        "✅ Google Login successful:",
        response.data.user
      );

      // =================================================
      // LOAD EXISTING CHAT HISTORY
      // =================================================

      await loadChatHistory();
    } catch (error) {
      console.error(
        "❌ Google Login Error:",
        error
      );

      console.error(
        "❌ Google Error Status:",
        error?.response?.status
      );

      console.error(
        "❌ Google Error URL:",
        error?.config?.url
      );

      console.error(
        "❌ Google Error Response:",
        error?.response?.data
      );

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Google login failed. Please try again.";

      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  // =====================================================
  // GOOGLE LOGIN ERROR
  // =====================================================

  const handleGoogleError = () => {
    console.error(
      "❌ Google Login Failed"
    );

    setAuthError(
      "Google login was cancelled or failed. Please try again."
    );
  };

  // =====================================================
  // LOGOUT
  // =====================================================

  const handleLogout = () => {
    localStorage.removeItem(
      "nexaai_token"
    );

    localStorage.removeItem(
      "nexaai_user"
    );

    setUser(null);
    setChatHistory([]);
    setMessages([]);

    // Clear saved current chat on logout
    localStorage.removeItem(
      "nexaai_current_chat"
    );

    console.log(
      "👋 Logged out successfully."
    );
  };

  // =====================================================
  // OPEN HISTORY CHAT
  // =====================================================

  const openHistoryChat = (chat) => {
    setMessages([
      {
        role: "user",
        content: chat.message,
        mode: chat.mode || "general",
      },
      {
        role: "assistant",
        content: chat.aiResponse,
        feedback: null,
        isFeedbackMessage: false,
        mode: chat.mode || "general",
      },
    ]);

    setMode(chat.mode || "general");
  };

  // =====================================================
  // KEYBOARD
  // =====================================================

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  // =====================================================
  // CLEAR CURRENT CHAT
  // =====================================================

  const clearChat = () => {
    setMessages([]);

    localStorage.removeItem(
      "nexaai_current_chat"
    );
  };

  // =====================================================
  // CURRENT MODE
  // =====================================================

  const currentMode =
    modes.find(
      (item) => item.id === mode
    ) || modes[0];

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="app">

      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside className="sidebar">

        <div className="logo">

          <div className="logo-icon">
            ✦
          </div>

          <div>
            <h2>NexaAI</h2>

            <span>
              AI Assistant
            </span>
          </div>

        </div>

        <button
          className="new-chat"
          onClick={clearChat}
        >
          ＋ New Chat
        </button>

        {/* =================================================
            MODES
        ================================================= */}

        <div className="sidebar-section">

          <p className="section-title">
            MODES
          </p>

          {modes.map((item) => (

            <button
              key={item.id}
              className={`sidebar-mode ${
                mode === item.id
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setMode(item.id)
              }
            >
              <span>
                {item.icon}
              </span>

              {item.name}
            </button>

          ))}

        </div>

        {/* =================================================
            CHAT HISTORY
        ================================================= */}

        {user && (

          <div className="sidebar-section history-section">

            <p className="section-title">
              RECENT CHATS
            </p>

            {historyLoading ? (

              <p className="history-empty">
                Loading history...
              </p>

            ) : chatHistory.length === 0 ? (

              <p className="history-empty">
                No chats yet
              </p>

            ) : (

              <div className="history-list">

                {chatHistory
                  .slice(0, 10)
                  .map((chat) => (

                    <button
                      key={chat._id}
                      className="history-item"
                      onClick={() =>
                        openHistoryChat(chat)
                      }
                      title={chat.message}
                    >

                      <span className="history-icon">
                        💬
                      </span>

                      <span className="history-text">

                        {chat.message.length > 32
                          ? `${chat.message.substring(
                              0,
                              32
                            )}...`
                          : chat.message}

                      </span>

                    </button>

                  ))}

              </div>

            )}

          </div>

        )}

        {/* =================================================
            SIDEBAR BOTTOM
        ================================================= */}

        <div className="sidebar-bottom">

          <span className="status-dot"></span>

          <div>

            <strong>
              AI Online
            </strong>

            <small>
              Ready to help
            </small>

          </div>

        </div>

      </aside>

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main">

        {/* =================================================
            TOPBAR
        ================================================= */}

        <header className="topbar">

          <span className="mode-label">

            {currentMode.icon}{" "}
            {currentMode.name} Mode

          </span>

          <div className="topbar-actions">

            <button
              className="clear-chat"
              onClick={clearChat}
            >
              Clear
            </button>

            {!user ? (

              <button
                className="auth-btn"
                onClick={() =>
                  openAuth("login")
                }
              >
                Login / Sign Up
              </button>

            ) : (

              <div className="user-menu">

                <span className="user-name">
                  👤 {user.name}
                </span>

                <button
                  className="logout-btn"
                  onClick={handleLogout}
                >
                  Logout
                </button>

              </div>

            )}

          </div>

        </header>

        {/* =================================================
            CHAT AREA
        ================================================= */}

        <section className="chat-area">

          {messages.length === 0 ? (

            <div className="welcome">

              <div className="welcome-logo">
                ✦
              </div>

              <h1>
                What can I help you with?
              </h1>

              <p>
                Ask questions, write code,
                learn new topics and solve
                problems with AI.
              </p>

              <div className="suggestion-grid">

                <button
                  onClick={() =>
                    setInput(
                      "Explain JavaScript promises with an example."
                    )
                  }
                >

                  <span>
                    👨‍💻
                  </span>

                  <strong>
                    Explain Code
                  </strong>

                  <small>
                    Understand programming
                    concepts
                  </small>

                </button>

                <button
                  onClick={() =>
                    setInput(
                      "Explain artificial intelligence in simple words."
                    )
                  }
                >

                  <span>
                    🧠
                  </span>

                  <strong>
                    Learn Something
                  </strong>

                  <small>
                    Understand difficult
                    concepts
                  </small>

                </button>

                <button
                  onClick={() =>
                    setInput(
                      "Give me a Python coding problem for beginners."
                    )
                  }
                >

                  <span>
                    💡
                  </span>

                  <strong>
                    Practice
                  </strong>

                  <small>
                    Improve your skills
                  </small>

                </button>

                <button
                  onClick={() =>
                    setInput(
                      "Explain recursion like I am a beginner."
                    )
                  }
                >

                  <span>
                    📚
                  </span>

                  <strong>
                    Study
                  </strong>

                  <small>
                    Get help with studies
                  </small>

                </button>

              </div>

            </div>

          ) : (

            <div className="messages">

              {messages.map(
                (message, index) => (

                  <div
                    key={index}
                    className={`message ${
                      message.role === "user"
                        ? "user-message"
                        : "assistant-message"
                    }`}
                  >

                    <div className="message-avatar">

                      {message.role === "user"
                        ? "👤"
                        : "✦"}

                    </div>

                    <div className="message-body">

                      <div className="message-name">

                        {message.role === "user"
                          ? "You"
                          : "NexaAI"}

                      </div>

                      <div className="message-content">

                        {message.role === "assistant" ? (

                          <ReactMarkdown>
                            {message.content}
                          </ReactMarkdown>

                        ) : (

                          <div>
                            {message.content}
                          </div>

                        )}

                      </div>

                      {/* =================================================
                          FEEDBACK BUTTONS
                      ================================================= */}

                      {message.role === "assistant" &&
                        !message.isFeedbackMessage && (

                        <div className="feedback-buttons">

                          <button
                            className={`feedback-btn ${
                              message.feedback === "like"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleFeedback(
                                index,
                                "like"
                              )
                            }
                            title="Good response"
                          >
                            👍🏿
                          </button>

                          <button
                            className={`feedback-btn ${
                              message.feedback === "dislike"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleFeedback(
                                index,
                                "dislike"
                              )
                            }
                            title="Bad response"
                          >
                            👎🏿
                          </button>

                        </div>

                      )}

                    </div>

                  </div>

                )
              )}

              {/* =================================================
                  TYPING INDICATOR
              ================================================= */}

              {loading && (

                <div className="message assistant-message">

                  <div className="message-avatar">
                    ✦
                  </div>

                  <div className="message-body">

                    <div className="message-name">
                      NexaAI
                    </div>

                    <div className="typing">

                      <span></span>
                      <span></span>
                      <span></span>

                    </div>

                  </div>

                </div>

              )}

            </div>

          )}

        </section>

        {/* =================================================
            INPUT
        ================================================= */}

        <div className="input-wrapper">

          <div className="input-box">

            <button
              className="attach-btn"
              title="File upload coming soon"
            >
              ＋
            </button>

            <textarea
              value={input}
              onChange={(event) =>
                setInput(
                  event.target.value
                )
              }
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "coding"
                  ? "Ask a coding question..."
                  : mode === "study"
                  ? "Ask about your studies..."
                  : "Message NexaAI..."
              }
              rows="1"
            />

            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={
                loading ||
                !input.trim()
              }
            >
              ↑
            </button>

          </div>

          <p>
            NexaAI may make mistakes.
            Verify important information.
          </p>

        </div>

      </main>

      {/* =====================================================
          LOGIN / SIGN UP MODAL
      ===================================================== */}

      {showAuth && (

        <div
          className="auth-overlay"
          onClick={closeAuth}
        >

          <div
            className="auth-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="auth-close"
              onClick={closeAuth}
              disabled={authLoading}
            >
              ×
            </button>

            <div className="auth-logo">
              ✦
            </div>

            <h2>

              {authMode === "login"
                ? "Welcome Back"
                : "Create Your Account"}

            </h2>

            <p className="auth-subtitle">

              {authMode === "login"
                ? "Login to continue using NexaAI"
                : "Join NexaAI and start exploring AI"}

            </p>

            {/* =================================================
                GOOGLE LOGIN
            ================================================= */}

            {authMode === "login" && (

              <>

                <div className="google-login-container">

                  <GoogleLogin
                    onSuccess={
                      handleGoogleSuccess
                    }
                    onError={
                      handleGoogleError
                    }
                    useOneTap={false}
                    theme="outline"
                    size="large"
                    text="continue_with"
                    shape="rectangular"
                  />

                </div>

                <div className="auth-divider">
                  <span>OR</span>
                </div>

              </>

            )}

            {/* =================================================
                NORMAL EMAIL/PASSWORD AUTH
            ================================================= */}

            <form
              onSubmit={
                handleAuthSubmit
              }
              className="auth-form"
            >

              {authMode === "signup" && (

                <div className="auth-field">

                  <label>
                    Full Name
                  </label>

                  <input
                    type="text"
                    value={authName}
                    onChange={(event) =>
                      setAuthName(
                        event.target.value
                      )
                    }
                    placeholder="Enter your name"
                    disabled={authLoading}
                  />

                </div>

              )}

              <div className="auth-field">

                <label>
                  Email
                </label>

                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) =>
                    setAuthEmail(
                      event.target.value
                    )
                  }
                  placeholder="Enter your email"
                  disabled={authLoading}
                />

              </div>

              <div className="auth-field">

                <label>
                  Password
                </label>

                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) =>
                    setAuthPassword(
                      event.target.value
                    )
                  }
                  placeholder={
                    authMode === "signup"
                      ? "Minimum 6 characters"
                      : "Enter your password"
                  }
                  disabled={authLoading}
                />

              </div>

              {authError && (

                <div className="auth-error">
                  {authError}
                </div>

              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={authLoading}
              >

                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                  ? "Login"
                  : "Create Account"}

              </button>

            </form>

            <div className="auth-switch">

              {authMode === "login" ? (

                <>

                  <span>
                    Don't have an account?
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      openAuth("signup")
                    }
                    disabled={authLoading}
                  >
                    Create Account
                  </button>

                </>

              ) : (

                <>

                  <span>
                    Already have an account?
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      openAuth("login")
                    }
                    disabled={authLoading}
                  >
                    Login
                  </button>

                </>

              )}

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default App;