# OpenAI integration setup

AI shape generation runs through the server-only `POST /api/generate-shape` route. The browser never receives the OpenAI credential.

## Environment variables

For local development, create `.env.local` in the project root:

```env
OPENAI_API_KEY=sk-your-project-key
# Optional; defaults to gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini
```

For Vercel, add `OPENAI_API_KEY` under **Project Settings → Environment Variables** for Production, Preview, and Development. Add `OPENAI_MODEL` only when you want to override the default. Redeploy after changing the variables.

Never use `NEXT_PUBLIC_OPENAI_API_KEY`. Any variable prefixed with `NEXT_PUBLIC_` is included in browser JavaScript and must be considered public.

## Request flow

1. The browser sends a description to `/api/generate-shape`.
2. The route validates its size and applies a best-effort per-IP rate limit.
3. The server calls the OpenAI Responses API with a strict JSON schema.
4. The route validates and closes the returned outline before sending shape coordinates to the browser.
5. If the route fails, the browser uses the existing procedural fallback.

The route accepts descriptions from 3 to 200 characters and allows 10 requests per IP during a 10-minute window per warm server instance. For stronger distributed enforcement, configure a Vercel Firewall rate-limit rule or use a shared data store.

## Secret rotation

If a key was ever configured as `NEXT_PUBLIC_OPENAI_API_KEY`, revoke it in the OpenAI dashboard, remove that variable from Vercel, create a replacement key, and store the replacement only as `OPENAI_API_KEY`. After redeployment, search the public JavaScript bundles to confirm the revoked key is absent.

