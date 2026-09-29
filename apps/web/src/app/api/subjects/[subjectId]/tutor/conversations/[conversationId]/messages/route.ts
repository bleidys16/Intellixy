import { after, NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { withRoute } from "@/server/http/safe";
import { processTutorMessage } from "@/server/tutor/process";
import { getOwnedConversation, messageSchema, startTurn } from "../../../_shared";

export const maxDuration = 300;

/** Una pregunta más en la conversación. */
export const POST = withRoute(
  async (request: NextRequest, { params }: { params: Promise<{ subjectId: string; conversationId: string }> }) => {
    const userId = requireAuth(request);
    const { subjectId, conversationId } = await params;
    const conversation = await getOwnedConversation(subjectId, conversationId, userId);
    if (!conversation) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    const parsed = messageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pregunta no válida" }, { status: 400 });
    }
    const reply = await startTurn({
      userId,
      subjectId: conversation.subjectId,
      conversation,
      message: parsed.data.message,
    });
    if (reply.processId) {
      const id = reply.processId;
      after(() => processTutorMessage(id));
    }
    return NextResponse.json(reply.body, { status: reply.status });
  },
);
