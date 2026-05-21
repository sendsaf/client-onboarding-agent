/**
 * Client Onboarding Agent
 * 
 * A phase-based conversational agent that guides clients through:
 * - Discovery (understanding their needs)
 * - Requirements gathering
 * - Budget & scope alignment
 * - Contact collection
 */

import { Agent, callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { generateText, streamText } from "ai";
import type { Env } from "./types";
import { greetingPrompt, resumePrompt, businessBasicsPrompt, brandingPrompt, websiteGoalsPrompt, marketingPrompt, closePrompt, SERVICES_CONTEXT, BUSINESS_PROFILE, GUARDRAILS } from "./prompts";

// Phase definitions
type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface OnboardingState {
  phase: Phase;
  clientName: string;
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>;
  serviceTypes: string[];
  requirements: Record<string, any>;
  budget: number;
  timeline: 'rush' | 'normal' | 'flexible';
  complexity: 'simple' | 'medium' | 'complex';
  contactInfo: {
    email: string;
    phone?: string;
    company?: string;
  };
  selectedAddons: string[];
  estimatedTotal: number;
}

export class OnboardingAgent extends Agent<Env, OnboardingState> {
  
  // Initialize state
  initialState: OnboardingState = {
    phase: 0,
    clientName: '',
    conversationHistory: [],
    serviceTypes: [],
    requirements: {},
    budget: 0,
    timeline: 'normal',
    complexity: 'medium',
    contactInfo: { email: '' },
    selectedAddons: [],
    estimatedTotal: 0
  };

  /**
   * Get system prompt based on current phase
   */
  getSystemPrompt(): string {
    const { phase, clientName, contactInfo, serviceTypes, requirements } = this.state;
    const name = clientName || '';
    const company = contactInfo?.company || '';
    const collected = JSON.stringify({ serviceTypes, requirements, contactInfo }, null, 2);

    switch (phase) {
      case 1:  return greetingPrompt(name, contactInfo?.email || '', contactInfo?.phone || '', company);
      case 2:  return businessBasicsPrompt(name, company, collected);
      case 3:  return brandingPrompt(name, company, collected);
      case 4:  return websiteGoalsPrompt(name, company, collected);
      case 5:  return marketingPrompt(name, company, collected);
      case 6:  return closePrompt(name, company, collected);
      default: return `${BUSINESS_PROFILE}\n\n${GUARDRAILS}\n\n${SERVICES_CONTEXT}`;
    }
  }

  /**
   * Initialize or load user session
   */
  @callable()
  async initializeSession(email: string, name: string, mobile: string) {
    try {
      // Use the Durable Object's own name as the stable conversation ID
      const conversationId = this.name;

      // Check if user exists in DB
      const existing = await this.env.DB.prepare(`
        SELECT * FROM conversations WHERE email = ? ORDER BY updated_at DESC LIMIT 1
      `).bind(email).first();

      if (existing) {
        // Load saved state if available
        const data = await this.env.DB.prepare(`
          SELECT * FROM conversation_data WHERE conversation_id = ?
        `).bind(existing.id).first();

        if (data && data.json_data) {
          const savedState = JSON.parse(data.json_data as string);
          this.setState(savedState);
          return { isReturning: true, conversationId: existing.id, state: savedState };
        }
      }

      // New user — create DB record using stable DO name as ID
      await this.env.DB.prepare(`
        INSERT OR IGNORE INTO conversations (id, client_name, email, phone, status)
        VALUES (?, ?, ?, ?, 'active')
      `).bind(conversationId, name, email, mobile).run();

      this.setState({
        ...this.initialState,
        phase: 2,
        clientName: name,
        contactInfo: { email, phone: mobile },
      });

      return { isReturning: false, conversationId, state: this.state };
    } catch (error) {
      console.error('Session initialization error:', error);
      throw error;
    }
  }

  /**
   * Get conversation history for a user
   */
  @callable()
  async getConversationHistory(email: string) {
    try {
      const conversation = await this.env.DB.prepare(`
        SELECT * FROM conversations WHERE email = ? ORDER BY updated_at DESC LIMIT 1
      `).bind(email).first();

      if (!conversation) {
        return { messages: [], exists: false };
      }

      const messages = await this.env.DB.prepare(`
        SELECT role, content, timestamp FROM messages 
        WHERE conversation_id = ? 
        ORDER BY timestamp ASC
      `).bind(conversation.id).all();

      return {
        messages: messages.results || [],
        exists: true,
        conversationId: conversation.id
      };
    } catch (error) {
      console.error('Error loading history:', error);
      return { messages: [], exists: false };
    }
  }

  /**
   * Send a message and get AI response (non-streaming)
   */
  @callable()
  async sendMessage(userMessage: string, conversationId?: string) {
    // Ensure state is initialized
    if (!this.state.conversationHistory) {
      this.setState({
        ...this.initialState,
        conversationHistory: []
      });
    }

    // Handle silent greeting trigger — don't add to history as user message
    if (userMessage.startsWith('__greeting__')) {
      try {
        // Parse details from trigger: __greeting__:name:email:mobile
        const parts = userMessage.split(':');
        const name = parts[1] || this.state.clientName;
        const email = parts[2] || this.state.contactInfo?.email || '';
        const mobile = parts[3] || this.state.contactInfo?.phone || '';
        const company = parts[4] || this.state.contactInfo?.company || '';

        if (name && !this.state.clientName) {
          this.setState({
            ...this.state,
            phase: 1,
            clientName: name,
            contactInfo: { email, phone: mobile, company },
          });
        }

        const workersai = createWorkersAI({ binding: this.env.AI });
        const { text } = await generateText({
          model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
          system: greetingPrompt(name, email, mobile, company),
          messages: [{ role: 'user', content: `Please send your opening message to ${name}.` }],
          temperature: 0.7,
          maxOutputTokens: 256,
        });
        this.state.conversationHistory.push({ role: 'assistant', content: text });
        if (conversationId) {
          await this.env.DB.prepare(`INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)`)
            .bind(`${conversationId}_${Date.now()}`, conversationId, text).run();
        }
        await this.saveToDatabase();
        this.setState({ ...this.state });
        return text;
      } catch {
        const name = userMessage.split(':')[1] || this.state.clientName || 'there';
        return `Hi ${name}! Welcome. What services are you looking for?`;
      }
    }

    // Handle silent resume trigger for returning users
    if (userMessage === '__resume__') {
      try {
        const { clientName, serviceTypes, phase, conversationHistory } = this.state;
        const lastExchange = conversationHistory.slice(-4);
        const system = resumePrompt(clientName, serviceTypes, phase, lastExchange);

        const workersai = createWorkersAI({ binding: this.env.AI });
        const { text } = await generateText({
          model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
          system: system,
          messages: [{ role: 'user', content: 'resume' }],
          temperature: 0.7,
          maxOutputTokens: 256,
        });
        this.state.conversationHistory.push({ role: 'assistant', content: text });
        if (conversationId) {
          await this.env.DB.prepare(`INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)`)
            .bind(`${conversationId}_${Date.now()}`, conversationId, text).run();
        }
        await this.saveToDatabase();
        this.setState({ ...this.state });
        return text;
      } catch {
        return `Welcome back, ${this.state.clientName}! Ready to pick up where we left off?`;
      }
    }

    let actualMessage = userMessage;
    let userContext = null;
    
    if (userMessage.startsWith('[User:')) {
      const contextEnd = userMessage.indexOf(']\n');
      if (contextEnd !== -1) {
        const contextStr = userMessage.substring(0, contextEnd + 1);
        actualMessage = userMessage.substring(contextEnd + 2);
        
        // Parse user context
        const nameMatch = contextStr.match(/User: ([^,]+)/);
        const emailMatch = contextStr.match(/Email: ([^,]+)/);
        const mobileMatch = contextStr.match(/Mobile: ([^\]]+)/);
        
        if (nameMatch && emailMatch && mobileMatch) {
          userContext = {
            name: nameMatch[1].trim(),
            email: emailMatch[1].trim(),
            mobile: mobileMatch[1].trim()
          };
          
          // Update state with user info if not set
          if (!this.state.clientName) {
            this.state.clientName = userContext.name;
            this.state.contactInfo = {
              email: userContext.email,
              phone: userContext.mobile
            };
          }
        }
      }
    }

    // Add user message to history
    this.state.conversationHistory.push({
      role: 'user',
      content: actualMessage
    });

    // Save user message to database
    if (conversationId || this.state.contactInfo.email) {
      const convId = conversationId || `${this.state.contactInfo.email}_${Date.now()}`;
      await this.env.DB.prepare(`
        INSERT INTO messages (id, conversation_id, role, content)
        VALUES (?, ?, 'user', ?)
      `).bind(`${convId}_${Date.now()}`, convId, actualMessage).run();
    }

    try {
      const workersai = createWorkersAI({ binding: this.env.AI });
      
      const { text } = await generateText({
        model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
        system: this.getSystemPrompt(),
        messages: this.state.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: 0.7,
        maxOutputTokens: 512,
      });

      // Add AI response to history
      this.state.conversationHistory.push({
        role: 'assistant',
        content: text
      });

      // Auto-advance phase: move forward every ~3 user messages within a phase (phases 2–5)
      const userMsgCount = this.state.conversationHistory.filter(m => m.role === 'user').length;
      if (this.state.phase >= 2 && this.state.phase <= 5) {
        const msgsPerPhase = 3;
        const expectedPhase = 2 + Math.min(Math.floor((userMsgCount - 1) / msgsPerPhase), 3);
        if (expectedPhase > this.state.phase) {
          this.state.phase = expectedPhase as typeof this.state.phase;
        }
      }

      // Save assistant message to database
      if (conversationId || this.state.contactInfo.email) {
        const convId = conversationId || `${this.state.contactInfo.email}_${Date.now()}`;
        await this.env.DB.prepare(`
          INSERT INTO messages (id, conversation_id, role, content)
          VALUES (?, ?, 'assistant', ?)
        `).bind(`${convId}_${Date.now() + 1}`, convId, text).run();
      }

      // Save to database
      await this.saveToDatabase();

      // Update state
      this.setState({ ...this.state });

      return text;
    } catch (error) {
      console.error('AI generation error:', error);
      return "I'm having trouble connecting right now. Please try again.";
    }
  }

  /**
   * Send a message and stream AI response (for real-time updates)
   */
  @callable()
  async sendMessageStream(userMessage: string) {
    // Ensure state is initialized
    if (!this.state.conversationHistory) {
      this.setState({
        ...this.initialState,
        conversationHistory: []
      });
    }

    // Add user message to history
    this.state.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      const workersai = createWorkersAI({ binding: this.env.AI });
      
      const { textStream } = await streamText({
        model: workersai("@cf/meta/llama-3.1-8b-instruct-fp8"),
        system: this.getSystemPrompt(),
        messages: this.state.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: 0.7,
        maxOutputTokens: 512,
      });

      let fullText = '';
      
      // Stream the response
      for await (const chunk of textStream) {
        fullText += chunk;
        // Broadcast each chunk to connected clients
        this.broadcastChunk('message_chunk', { chunk });
      }

      // Add complete response to history
      this.state.conversationHistory.push({
        role: 'assistant',
        content: fullText
      });

      // Save to database
      await this.saveToDatabase();

      // Update state
      this.setState({ ...this.state });

      return fullText;
    } catch (error) {
      console.error('AI generation error:', error);
      return "I'm having trouble connecting right now. Please try again.";
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  private broadcastChunk(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      try {
        ws.send(message);
      } catch (error) {
        console.error('Error broadcasting:', error);
      }
    }
  }

  /**
   * Save conversation to D1 database
   */
  async saveToDatabase() {
    try {
      const conversationId = this.name;
      
      // Ensure conversation exists
      await this.env.DB.prepare(`
        INSERT OR IGNORE INTO conversations (id, client_name, phase_completed, status)
        VALUES (?, ?, ?, 'active')
      `).bind(conversationId, this.state.clientName || 'Unknown', this.state.phase).run();

      // Update conversation data
      await this.env.DB.prepare(`
        INSERT OR REPLACE INTO conversation_data (
          id, conversation_id, service_types, requirements, budget, 
          timeline, complexity, selected_addons, json_data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        conversationId,
        conversationId,
        JSON.stringify(this.state.serviceTypes),
        JSON.stringify(this.state.requirements),
        this.state.budget,
        this.state.timeline,
        this.state.complexity,
        JSON.stringify(this.state.selectedAddons),
        JSON.stringify(this.state)
      ).run();

    } catch (error) {
      console.error('Failed to save to database:', error);
    }
  }
}
