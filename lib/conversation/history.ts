import type { ConversationContext } from '@/types/conversation';

type ProjectEvolution = ConversationContext['projectEvolution'];
type MajorChange = ProjectEvolution['majorChanges'][number];

export const MAX_MAJOR_CHANGES = 20;

/**
 * Conversation state is process-global, so every append must be bounded;
 * only the most recent changes are useful as generation context anyway.
 */
export function recordMajorChange(evolution: ProjectEvolution, change: MajorChange, max = MAX_MAJOR_CHANGES): void {
  evolution.majorChanges.push(change);
  if (evolution.majorChanges.length > max) {
    evolution.majorChanges.splice(0, evolution.majorChanges.length - max);
  }
}
