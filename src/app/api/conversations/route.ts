import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { getDb } from '@/lib/mongo';

export async function GET(req: NextRequest) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const conversationsCol = db.collection('conversations');
    const messagesCol = db.collection('messages');
    const personasCol = db.collection('personas');

    // get all conversations for user
    const conversations = await conversationsCol
      .find({ userId: session.userId })
      .sort({ updatedAt: -1 })
      .toArray();

    // get last message and persona info for each conversation
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessages = await messagesCol
          .find({ conversationId: conv.id })
          .sort({ timestamp: -1 })
          .limit(1)
          .toArray();

        const lastMessage = lastMessages[0] || null;

        let personaName = null;
        if (conv.personaId) {
          const persona = await personasCol.findOne({ id: conv.personaId });
          personaName = persona?.name || null;
        }

        return {
          id: conv.id,
          personaId: conv.personaId,
          personaName,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                timestamp: lastMessage.timestamp,
                role: lastMessage.role,
              }
            : null,
        };
      })
    );

    return NextResponse.json({ conversations: conversationsWithDetails });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
