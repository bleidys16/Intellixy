import { and, eq, inArray } from "drizzle-orm";
import { after, NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/middleware";
import { db } from "@/server/db/client";
import { tutorMessages } from "@/server/db/schema";
import { isUuid } from "@/server/http/access";
import { withRoute } from "@/server/http/safe";
import { processTutorMessage } from "@/server/tutor/process";
import { recordUsage, refundUsage } from "@/server/usage";
import { checkQuota, getOwnedConversation, publicMessage } from "../../../../../_shared";

export const maxDuration = 300;

/** Vuelve a pedir una respuesta que falló (sin reescribir la pregunta). Gasta cuota otra vez. */
export const POST = withRoute(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ subjectId: string; conversationId: string; messageId: string }> },
  ) => {
    const userId = requireAuth(request);
    const { subjectId, conversationId, messageId } = await params;
    const conversation = await getOwnedConversation(subjectId, conversationId, userId);
    if (!conversation || !isUuid(messageId)) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
    }
    const messages = await db.query.tutorMessages.findMany({
      where: eq(tutorMessages.conversationId, conversation.id),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });
    const target = messages.at(-1);
    if (!target || target.id !== messageId || target.role !== "assistant" || target.status !== "error") {
      return NextResponse.json({ error: "Solo se puede reintentar la última respuesta si falló" }, { status: 409 });
    }
    const quota = await checkQuota(userId);
    if (quota) return NextResponse.json(quota.body, { status: quota.status });

    const usageEventId = await recordUsage(userId, "ai_tutor");
    try {
      const [retried] = await db
        .update(tutorMessages)
        .set({ status: "pendiente", errorMessage: null, usageEventId, updatedAt: new Date() })
        .where(and(eq(tutorMessages.id, target.id), inArray(tutorMessages.status, ["error"])))
        .returning();
      if (!retried) {
        await refundUsage(usageEventId).catch(() => {});
        return NextResponse.json({ error: "Esta respuesta ya se está reintentando" }, { status: 409 });
      }
      after(() => processTutorMessage(retried.id));
      return NextResponse.json({ message: publicMessage(retried) }, { status: 202 });
    } catch (err) {
      await refundUsage(usageEventId).catch(() => {});
      throw err;
    }
  },
);
