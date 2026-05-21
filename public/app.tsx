import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useAgent } from 'agents/react';
import './styles.css';

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{id: string, role: string, content: string}>>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [userDetails, setUserDetails] = useState<{name: string, email: string, mobile: string} | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('anonymous');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasAutoSent = useRef(false);
  const pendingInitialMessage = useRef<string | null>(null);
  
  const urlParams = new URLSearchParams(window.location.search);
  
  const agent = useAgent({
    agent: 'OnboardingAgent',
    name: agentName,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, isThinking]);

  useEffect(() => {
    const initSession = async () => {
      const name = urlParams.get('name');
      const email = urlParams.get('email');
      const mobile = urlParams.get('mobile');
      const initialMessage = urlParams.get('msg');
      
      if (name && email && mobile) {
        const details = { name, email, mobile };
        setUserDetails(details);
        
        try {
          const initResponse = await fetch('/api/chat/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, mobile })
          });
          
          const initData = await initResponse.json();
          setConversationId(initData.conversationId);
          setAgentName(initData.conversationId);
          
          if (initialMessage && initialMessage.trim()) {
            pendingInitialMessage.current = initialMessage.trim();
          }
        } catch (error) {
          console.error('Session initialization error:', error);
        }
      }
      
      setIsLoading(false);
    };
    
    initSession();
  }, []);

  useEffect(() => {
    if (!isLoading && conversationId && pendingInitialMessage.current && !hasAutoSent.current) {
      const message = pendingInitialMessage.current;
      pendingInitialMessage.current = null;
      hasAutoSent.current = true;
      sendMessage(message, conversationId);
    }
  }, [isLoading, conversationId, agentName]);

  const sendMessage = async (messageText: string, convId?: string) => {
    if (!messageText.trim() || isThinking) return;

    const userMessage = { id: Date.now().toString(), role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    
    setInput('');
    setIsThinking(true);
    setStreamingMessage('');

    const currentConvId = convId || conversationId;

    try {
      const response = await agent.stub.sendMessage(messageText, currentConvId || undefined);
      
      const assistantMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, there was an error. Please try again.'
      }]);
    } finally {
      setIsThinking(false);
      setStreamingMessage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading your session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* User Info Header */}
      {userDetails && (
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-800 to-blue-600 flex items-center justify-center text-white font-semibold text-base">
            {userDetails.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-gray-900">
              {userDetails.name}
            </div>
            <div className="text-xs text-gray-500">
              {userDetails.email}
            </div>
          </div>
        </div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-10">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Client Onboarding Agent
            </h2>
            <p className="text-gray-500 text-base">
              Let's understand your project needs.
            </p>
          </div>
        )}

        <div className="space-y-5 max-w-3xl mx-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] px-4 py-2.5 rounded-2xl text-base leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-gray-100 text-gray-900 rounded-br-sm'
                    : 'bg-blue-800 text-white rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-blue-800 text-white text-base leading-relaxed whitespace-pre-wrap break-words">
                {streamingMessage}
                <span className="inline-block w-0.5 h-4 bg-white ml-0.5 animate-pulse" />
              </div>
            </div>
          )}

          {isThinking && !streamingMessage && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 flex gap-1.5 items-center bg-blue-800 rounded-2xl rounded-bl-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - Styled like webfolio chat widget */}
      <div className="pb-7 px-4 flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit}>
            <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-3xl border border-gray-200 bg-white/90 backdrop-blur-md p-2 shadow-2xl" style={{ minHeight: '62px' }}>
              <div className="flex w-full items-center justify-between">
                <input
                  className="h-10 w-full border-none bg-transparent px-4 outline-none text-gray-800 placeholder-gray-400"
                  type="text"
                  placeholder="Ask me anything..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isThinking}
                />
              </div>

              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="absolute bottom-2 right-2 flex items-center justify-center rounded-full border border-blue-200 bg-blue-600 hover:bg-blue-700 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{ width: '45px', height: '45px' }}
                aria-label="Send message"
              >
                <svg
                  className="w-5 h-5 text-white"
                  height="24"
                  width="24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              </button>

              {/* Colorful gradient blur effect */}
              <div
                className="absolute left-[-10%] top-0 flex h-10 w-[120%] pointer-events-none"
                style={{
                  opacity: 0.2,
                  transform: 'translateY(-200%)',
                }}
              >
                <div className="flex h-full w-full flex-col items-stretch -space-y-3">
                  <div className="w-full flex-1 bg-[#FC2BA3] blur-xl" />
                  <div className="w-full flex-1 bg-[#FC6D35] blur-xl" />
                  <div className="w-full flex-1 bg-[#F9C83D] blur-xl" />
                  <div className="w-full flex-1 bg-[#C2D6E1] blur-xl" />
                </div>
                <div className="flex h-full w-full flex-col items-stretch -space-y-3 -translate-y-2">
                  <div className="w-full flex-1 bg-[#FC2BA3] blur-xl" />
                  <div className="w-full flex-1 bg-[#FC6D35] blur-xl" />
                  <div className="w-full flex-1 bg-[#F9C83D] blur-xl" />
                  <div className="w-full flex-1 bg-[#C2D6E1] blur-xl" />
                </div>
                <div className="flex h-full w-full flex-col items-stretch -space-y-3">
                  <div className="w-full flex-1 bg-[#FC2BA3] blur-xl" />
                  <div className="w-full flex-1 bg-[#FC6D35] blur-xl" />
                  <div className="w-full flex-1 bg-[#F9C83D] blur-xl" />
                  <div className="w-full flex-1 bg-[#C2D6E1] blur-xl" />
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
