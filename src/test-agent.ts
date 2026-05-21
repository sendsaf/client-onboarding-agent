/**
 * Simple test agent to verify the setup works
 */

import { Agent, callable } from "agents";
import type { Env } from "./types";

interface TestState {
  count: number;
  lastMessage: string;
}

export class TestAgent extends Agent<Env, TestState> {
  initialState: TestState = {
    count: 0,
    lastMessage: ''
  };

  @callable()
  sendMessage(message: string) {
    this.setState({
      count: this.state.count + 1,
      lastMessage: message
    });
    return `You said: "${message}". This is message #${this.state.count + 1}`;
  }

  @callable()
  getCount() {
    return this.state.count;
  }
}
