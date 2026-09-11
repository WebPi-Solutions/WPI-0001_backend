# Agentes — backend (NestJS)

Este repositorio es **solo el API**. Las reglas de Cursor viven en [`.cursor/rules/`](.cursor/rules/).

| Fichero | Alcance |
|---|---|
| [`.cursor/rules/general.mdc`](.cursor/rules/general.mdc) | Siempre (este repo es solo el API) |
| [`.cursor/rules/backend.mdc`](.cursor/rules/backend.mdc) | `src/**`, `test/**`, `docs/**` |

Documentación de referencia:

- Autorización multi-empresa: [`docs/enterprise-access.md`](docs/enterprise-access.md)
- Permisos de rol de empresa (RBAC): [`docs/enterprise-permissions.md`](docs/enterprise-permissions.md)
- Cómo ejecutar y ampliar tests: [`docs/tests.md`](docs/tests.md)

## No negociable

1. **Este API es la fuente de verdad de seguridad.** El frontend oculta UI; un atacante puede llamar HTTP a mano. Toda ruta nueva o cambiada debe cumplir las **tres** capas: Firebase Bearer, aislamiento por empresa y permiso de rol (`@RequirePermission`). Deny by default. Detalle: [`docs/enterprise-access.md`](docs/enterprise-access.md) y [`docs/enterprise-permissions.md`](docs/enterprise-permissions.md).
2. Un usuario de la empresa X **nunca** lee ni muta datos de Y, salvo `users.role === administrator` (admin global). Pertenecer a X no implica poder hacer todo en X: sin concesión en `enterprise_roles.permissions` → **403**.
3. Código en **inglés**; comentarios, JSDoc, logs, Swagger y textos de error en **español**.
4. No commitear ni pushear a menos que el usuario lo pida. No tocar `.env` ni secretos.

## Arranque rápido

```bash
npm test
npm run test:e2e   # Docker + Testcontainers; umbral 100%
```
