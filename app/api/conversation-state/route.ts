import { ClientInputError, readJsonObject, publicErrorMessage } from '@/lib/security/input-validation';
import { authorizeOperatorRequest } from '@/lib/security/operator-access';
import { NextRequest, NextResponse } from 'next/server';
import type { ConversationState } from '@/types/conversation';

declare global {
  var conversationState: ConversationState | null;
}

// GET: Retrieve current conversation state
export async function GET(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    if (!global.conversationState) {
      return NextResponse.json({
        success: true,
        state: null,
        message: 'No active conversation'
      });
    }
    
    return NextResponse.json({
      success: true,
      state: global.conversationState
    });
  } catch (error) {
    console.error('[conversation-state] Error getting state:', error);
    return NextResponse.json({
      success: false,
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}

// POST: Reset or update conversation state
export async function POST(request: NextRequest) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    const { action, data } = await readJsonObject(request);
    
    switch (action) {
      case 'reset':
        global.conversationState = {
          conversationId: `conv-${Date.now()}`,
          startedAt: Date.now(),
          lastUpdated: Date.now(),
          context: {
            messages: [],
            edits: [],
            projectEvolution: { majorChanges: [] },
            userPreferences: {}
          }
        };
        
        console.log('[conversation-state] Reset conversation state');
        
        return NextResponse.json({
          success: true,
          message: 'Conversation state reset',
          state: global.conversationState
        });
        
      case 'clear-old':
        // Clear old conversation data but keep recent context
        if (!global.conversationState) {
          // Initialize conversation state if it doesn't exist
          global.conversationState = {
            conversationId: `conv-${Date.now()}`,
            startedAt: Date.now(),
            lastUpdated: Date.now(),
            context: {
              messages: [],
              edits: [],
              projectEvolution: { majorChanges: [] },
              userPreferences: {}
            }
          };
          
          console.log('[conversation-state] Initialized new conversation state for clear-old');
          
          return NextResponse.json({
            success: true,
            message: 'New conversation state initialized',
            state: global.conversationState
          });
        }
        
        // Keep only recent data
        global.conversationState.context.messages = global.conversationState.context.messages.slice(-5);
        global.conversationState.context.edits = global.conversationState.context.edits.slice(-3);
        global.conversationState.context.projectEvolution.majorChanges = 
          global.conversationState.context.projectEvolution.majorChanges.slice(-2);
        
        console.log('[conversation-state] Cleared old conversation data');
        
        return NextResponse.json({
          success: true,
          message: 'Old conversation data cleared',
          state: global.conversationState
        });
        
      case 'update':
        if (!global.conversationState) {
          return NextResponse.json({
            success: false,
            error: 'No active conversation to update'
          }, { status: 400 });
        }
        
        // Update specific fields if provided
        if (data) {
          if (typeof data.currentTopic === 'string') {
            global.conversationState.context.currentTopic = data.currentTopic.slice(0, 500);
          }
          if (data.userPreferences && typeof data.userPreferences === 'object' && !Array.isArray(data.userPreferences)) {
            const merged = {
              ...global.conversationState.context.userPreferences,
              ...data.userPreferences
            };
            // Preferences live in process memory for the lifetime of the server;
            // refuse growth past a small fixed budget instead of accumulating.
            if (Object.keys(merged).length > 50 || JSON.stringify(merged).length > 16_384) {
              throw new ClientInputError('User preferences exceed the allowed size');
            }
            global.conversationState.context.userPreferences = merged;
          }
          
          global.conversationState.lastUpdated = Date.now();
        }
        
        return NextResponse.json({
          success: true,
          message: 'Conversation state updated',
          state: global.conversationState
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use "reset" or "update"'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[conversation-state] Error:', error);
    return NextResponse.json({
      success: false,
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}

// DELETE: Clear conversation state
export async function DELETE(request: Request) {
  const accessDenied = await authorizeOperatorRequest(request);
  if (accessDenied) return accessDenied;
  try {
    global.conversationState = null;
    
    console.log('[conversation-state] Cleared conversation state');
    
    return NextResponse.json({
      success: true,
      message: 'Conversation state cleared'
    });
  } catch (error) {
    console.error('[conversation-state] Error clearing state:', error);
    return NextResponse.json({
      success: false,
      error: publicErrorMessage(error)
    }, { status: error instanceof ClientInputError ? 400 : 500 });
  }
}