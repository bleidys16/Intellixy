<p align="center">
  <img src="brand/logo/intellixy-azul-transparente.png" alt="Intellixy" width="420" />
</p>

<p align="center">
  <strong>Tu material. Tu aprendizaje.</strong><br />
  Convierte tus PDF, fotos de apuntes y textos en quizzes, flashcards y un tutor con IA que siempre cita la fuente.
</p>

<p align="center">
  <a href="https://intellixy-web.vercel.app"><img alt="Web" src="https://img.shields.io/badge/web-intellixy--web.vercel.app-56DFCF?labelColor=37192C" /></a>
  <a href="https://github.com/bleidys16/Intellixy/releases/latest"><img alt="Android" src="https://img.shields.io/badge/Android-APK-56DFCF?labelColor=37192C&logo=android&logoColor=white" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-desplegado-000000?logo=vercel" />
</p>

---

## ¿Qué es Intellixy?

Intellixy no es "chatear con un PDF". Es el ciclo completo de estudio: subes lo que ya tienes, practicas, la app detecta en qué temas fallas y te dice qué repasar.

- **Sube tu material:** PDF, fotos de apuntes (con OCR) o texto pegado. Se organiza por materia.
- **Quizzes:** preguntas generadas desde tu material, con explicación y la fuente exacta (archivo y página).
- **Flashcards con repetición espaciada:** sistema Leitner de 5 cajas (1, 2, 4, 8 y 16 días) y un repaso diario que te dice qué toca hoy.
- **Tutor con citas:** responde solo con lo que está en tus apuntes y cita el fragmento. Si el tema no está, lo dice; el conocimiento general de internet se ofrece aparte y marcado como tal.
- **Progreso por tema:** dominio calculado a partir de tus respuestas y recomendaciones de qué repasar.
- **Web y Android:** misma cuenta y mismos datos en ambos.

> **Regla de la IA: sin fuente, no hay respuesta.** Si algo no está en tu material, Intellixy no se lo inventa.

## Descarga

| Plataforma | Enlace |
|---|---|
| Web | https://intellixy-web.vercel.app |
| Android (APK) | [Última versión](https://github.com/bleidys16/Intellixy/releases/latest) — requiere Android 7.0 o superior |

Para instalar el APK, permite la instalación de apps de origen desconocido en tu teléfono.

## Cómo funciona

```
Navegador / App Android (Capacitor)
            │
            ▼
   Next.js en Vercel ── /api/* (Route Handlers)
            │
   ┌────────┼──────────────┬───────────────┐
   ▼        ▼              ▼               ▼
 Neon    Vercel Blob     Groq (IA)     pdf.js + Tesseract
Postgres (archivos)   texto y visión    (extracción y OCR)
```

1. El navegador sube el archivo **directo a Vercel Blob** (las funciones de Vercel limitan el cuerpo de la petición a 4.5 MB).
2. `materials/finalize` valida el tipo real por bytes y las cuotas del plan, y crea el material como `pendiente`.
3. La extracción de texto corre en segundo plano con `waitUntil()` y deja el material `listo` con sus fragmentos, o en `error` con un mensaje claro.
4. Quizzes, flashcards y tutor se generan sobre esos fragmentos y guardan la cita (archivo, página, texto).

No hay servidor que se duerma: la API vive en el mismo proyecto que la web, como funciones serverless.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API | Route Handlers de Next.js bajo `/api`, validación con Zod |
| Base de datos | PostgreSQL en Neon (driver serverless) + Drizzle ORM |
| Archivos | Vercel Blob (privado) |
| IA | Groq — Qwen para texto y visión, `gpt-oss` para búsqueda web del tutor |
| Extracción | `pdfjs-dist` (PDF) y `tesseract.js` + `sharp` (imágenes) |
| Auth | JWT con token `Bearer` + bcrypt |
| Android | Capacitor 8 (WebView sobre la web desplegada) |
| Hosting | Vercel |

Identidad visual: ciruela `#37192C` y turquesa `#56DFCF`; tipografías Bricolage Grotesque (títulos) y Manrope (texto).

## Estructura

```
apps/
  web/        Next.js: interfaz + API (src/app/api) + lógica de servidor (src/server)
    android/  Proyecto Android de Capacitor
  api/        Servidor Express anterior (en Render). Reemplazado por apps/web/src/app/api
brand/        Logo, isotipo y recursos de Android
scripts/      Prueba de calidad de la IA (fase 0)
```

Dentro de `apps/web/src/server/`: `ai/` (Groq, prompts, búsqueda web), `auth/`, `db/` (esquema Drizzle), `extraction/` (PDF y OCR), `materials/`, `flashcards/` (Leitner), `questions/`, `tutor/`, `progress/` y `limits.ts` (límites por plan).

## Desarrollo local

Requisitos: Node.js 20 o superior, una base Postgres (por ejemplo en [Neon](https://neon.tech)) y un token de [Vercel Blob](https://vercel.com/docs/vercel-blob).

```bash
npm install
npm run dev:web        # http://localhost:3000
```

Crea `apps/web/.env.local`:

```env
DATABASE_URL=postgres://...           # Neon
JWT_SECRET=...                        # cadena larga y aleatoria
BLOB_READ_WRITE_TOKEN=...             # Vercel Blob
GROQ_API_KEY=...

# Opcionales (tienen valor por defecto)
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_VISION_MODEL=qwen/qwen3.8-27b
GROQ_WEB_MODEL=openai/gpt-oss-120b
GROQ_WEB_FALLBACK_MODEL=openai/gpt-oss-20b
TUTOR_WEB_SEARCH=off                  # desactiva la búsqueda en internet del tutor
```

Con el proyecto enlazado a Vercel, `vercel env pull` trae las variables por ti.

El esquema de la base se define con Drizzle en `apps/web/src/server/db/schema.ts`; las migraciones se aplican con `drizzle-kit` (configuración en `apps/api/drizzle.config.ts`).

## Despliegue

En Vercel, con **Root Directory** `apps/web` y las mismas variables de entorno. Desde la raíz del repositorio:

```bash
vercel deploy          # preview
vercel deploy --prod   # producción
```

## App Android

La app es un contenedor de Capacitor que carga la web desplegada (`apps/web/capacitor.config.json`), así que cada deploy actualiza también la app sin generar un APK nuevo. Solo hace falta un APK nuevo si cambia el ícono, los permisos o la configuración nativa.

Para compilarlo se necesita **JDK 21** y el SDK de Android:

```bash
cd apps/web
npx cap sync android
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

## Límites del plan gratis

Definidos en `apps/web/src/server/limits.ts` (valores provisionales, un único lugar para cambiarlos):

| Límite | Valor |
|---|---|
| Tamaño por archivo | 10 MB |
| Páginas por PDF | 50 |
| Materiales por materia | 10 |
| Almacenamiento por usuario | 100 MB |
| Generaciones de preguntas por día | 5 |
| Preguntas / tarjetas por generación | 10 / 15 |
| Preguntas al tutor por día | 20 |
| Imágenes con OCR por día | 5 |

## Hoja de ruta

- [x] Autenticación y materias
- [x] Materiales: PDF, imágenes con OCR y texto
- [x] Quizzes, flashcards con Leitner y tutor con citas
- [x] Progreso por tema y recomendaciones
- [x] Despliegue en Vercel y límites del plan gratis
- [x] APK de Android (Capacitor)
- [ ] Modo examen
- [ ] Planes de pago o anuncios
- [ ] App Android nativa (Kotlin + Compose) sobre la misma API
