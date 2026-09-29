import { and, eq, sql } from "drizzle-orm";
import { after, NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { tutorConversations, tutorMessages } from "@/server/db/schema";
import { getOwnedSubject } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { processTutorMessage } from "@/server/tutor/process";
import { messageSchema, publicConversation, startTurn } from "../_shared";

export const maxDuration = 300;

type Ctx = { params: Promise<{ subjectId: string }> };

/** Empieza una conversación nueva con su primera pregunta (202; la respuesta se completa en segundo plano). */
export const POST = withRoute(async (request: NextRequest, { params }: Ctx) => {
  const userId = requireAuth(request);
  const subject = await getOwnedSubject((await params).subjectId, userId);
  if (!subject) return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pregunta no válida" }, { status: 400 });
  }
  const reply = await startTurn({ userId, subjectId: subject.id, conversation: null, message: parsed.data.message });
  if (reply.processId) {
    const id = reply.processId;
    after(() => processTutorMessage(id));
  }
  return NextResponse.json(reply.body, { status: reply.status });
});

/** Conversaciones de la materia, la más reciente primero. */
export const GET = withRoute(async (request: NextRequest, { params }: Ctx) => {
  const userId = requireAuth(request);
  const subject = await getOwnedSubject((await params).subjectId, userId);
  if (!subject) return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });
  const rows = await db
    .select({
      conversation: tutorConversations,
      // "tutor_conversations"."id" va calificado a mano: con una sola tabla Drizzle omite el prefijo.
      messageCount: sql<number>`(
        select count(*)::int from ${tutorMessages}
        where ${tutorMessages.conversationId} = "tutor_conversations"."id"
      )`,
    })
    .from(tutorConversations)
    .where(and(eq(tutorConversations.subjectId, subject.id), eq(tutorConversations.userId, userId)))
    .orderBy(sql`${tutorConversations.updatedAt} desc`)
    .limit(50);
  return NextResponse.json({
    conversations: rows.map((r) => ({ ...publicConversation(r.conversation), messageCount: r.messageCount })),
  });
});
