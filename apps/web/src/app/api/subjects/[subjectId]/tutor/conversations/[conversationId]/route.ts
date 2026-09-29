import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { tutorConversations } from "@/server/db/schema";
import { withRoute } from "@/server/http/safe";
import { ACTIVE_STATUSES, getOwnedConversation, publicConversation, publicMessage } from "../../_shared";

type Ctx = { params: Promise<{ subjectId: string; conversationId: string }> };

/** Una conversación con todos sus mensajes; el cliente la consulta mientras hay una respuesta pendiente. */
export const GET = withRoute(async (request: NextRequest, { params }: Ctx) => {
  const userId = requireAuth(request);
  const { subjectId, conversationId } = await params;
  const conversation = await getOwnedConversation(subjectId, conversationId, userId);
  if (!conversation) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  const messages = await db.query.tutorMessages.findMany({
    where: (m, { eq }) => eq(m.conversationId, conversation.id),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return NextResponse.json({
    conversation: publicConversation(conversation),
    messages: messages.map(publicMessage),
    pending: messages.some((m) => ACTIVE_STATUSES.includes(m.status)),
  });
});

export const DELETE = withRoute(async (request: NextRequest, { params }: Ctx) => {
  const userId = requireAuth(request);
  const { subjectId, conversationId } = await params;
  const conversation = await getOwnedConversation(subjectId, conversationId, userId);
  if (!conversation) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  await db.delete(tutorConversations).where(eq(tutorConversations.id, conversation.id));
  return NextResponse.json({ deleted: true });
});
