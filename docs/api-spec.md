# CloudCut — API specification

> Placeholder — replaced by auto-generated OpenAPI (utoipa) once Phase 3 lands.
> Live spec will be served at `GET /openapi.json`, Swagger UI at `/swagger-ui`.

## Planned endpoint groups

| Group | Routes | Phase |
|-------|--------|------:|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` | 3 |
| Workspaces | `POST/GET/PATCH/DELETE /workspaces[/...]` | 3 |
| Projects | `POST/GET/PATCH/DELETE /projects[/...]`, duplicate, versions | 3 |
| Assets | `POST /assets/presigned-url`, `POST /assets/confirm-upload`, list, delete | 3 + 4 |
| Timeline | tracks, clips, effects, transitions, text overlays | 3 |
| Exports | `POST /projects/:id/exports`, list, get, cancel | 3 + 4 |
| Collaboration | `GET /projects/:id/operations?afterSeq=` | 5 |
