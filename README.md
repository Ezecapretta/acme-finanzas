# Acme Finanzas

Sistema web de gestión de finanzas, tesorería y flujo de caja para una agencia
financiera: control de **cajas**, **cheques** y **cuentas de clientes**, con
trazabilidad total de ingresos, egresos, transferencias, operaciones de cambio
(FX) y compraventa de cheques. Incluye reportes de cierre diario y extractos por
cuenta.

> Proyecto de portfolio. Los datos de cliente fueron anonimizados; la marca real
> se reemplazó por el placeholder **Acme**.

## Demo en vivo

- **App:** [acme-finanzas-frontend.vercel.app](https://acme-finanzas-frontend.vercel.app)
- **API:** [acme-finanzas-api.onrender.com/health](https://acme-finanzas-api.onrender.com/health)

**Credenciales de acceso:**
- Email: `admin@acme.com`
- Password: `admin123`

> El backend está en el plan free de Render, que apaga el servicio tras
> ~15 min de inactividad. Si la app tarda en responder la primera vez (hasta
> ~50s), es normal: el servidor se está reactivando. Los pedidos siguientes
> son inmediatos.

## Stack

| Capa | Tecnología |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Recharts, lucide-react |
| **Backend** | Node.js + Express 4, TypeScript, REST API |
| **ORM / DB** | Prisma 6 sobre PostgreSQL 15 |
| **Auth** | JWT propio (`jsonwebtoken`) + hashing SHA-256, roles `ADMIN` / `OPERATOR` |
| **Validación** | Zod (schemas compartidos entre front y back) |
| **Reportes** | PDFKit (PDF) y ExcelJS (XLSX) |
| **Infra dev** | Docker Compose (PostgreSQL + pgAdmin) |
| **Monorepo** | npm workspaces |

## Estructura del monorepo

```
.
├── apps/
│   ├── backend/        # API REST (Express + Prisma)
│   │   └── prisma/     # schema, migraciones y seed de datos demo
│   └── frontend/       # App Next.js (dashboard)
├── packages/
│   └── shared/         # Tipos y schemas Zod compartidos (@acme/shared)
├── scripts/            # Utilidades (backup de la BD)
├── docker-compose.yml  # PostgreSQL + pgAdmin para desarrollo
└── Dockerfile          # Build de producción del backend
```

## Funcionalidades

- **Cuentas / Clientes**: alta, baja y modificación; ficha con saldo consolidado e historial de movimientos.
- **Cajas**: gestión de disponibilidades (ARS / USD), por agencia y por cliente.
- **Cheques**: registro de valores (número, banco, vencimiento, emisor) y estados (en cartera / entregado / depositado), incluida la compraventa entre clientes.
- **Transacciones**: ingresos, egresos, transferencias internas y operaciones de cambio (FX), con movimientos por partida doble (DEBIT / CREDIT).
- **Reportes**: cierre diario y extracto por cuenta, exportables a PDF y Excel.
- **Usuarios y roles**: administración de usuarios con roles `ADMIN` / `OPERATOR`.

## Requisitos

- Node.js 20+
- npm 10+
- Docker (para la base de datos local)

## Puesta en marcha (local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Levantar la base de datos

```bash
docker compose up -d
```

Esto inicia PostgreSQL en el puerto `5444` y pgAdmin en `http://localhost:5050`.

### 3. Variables de entorno

Copiá los ejemplos y ajustá si hace falta:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Los valores por defecto del `.env.example` ya coinciden con el `docker-compose.yml`.

### 4. Migraciones, cliente Prisma y datos demo

```bash
cd apps/backend
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts      # carga ~30 días de datos de prueba
cd ../..
```

### 5. Levantar la aplicación

En dos terminales:

```bash
npm run dev:backend     # API en http://localhost:4000
npm run dev:frontend    # App en http://localhost:3000
```

### Credenciales demo

Al arrancar, el backend crea automáticamente un usuario administrador (valores
configurables vía `ADMIN_EMAIL` / `ADMIN_PASSWORD`):

- **Email:** `admin@acme.com`
- **Password:** `admin123`

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev:frontend` | Levanta el frontend Next.js |
| `npm run dev:backend` | Levanta el backend Express en modo watch |
| `npm run build:frontend` | Build de producción del frontend |
| `npm run build:backend` | Compila el backend (TypeScript → `dist/`) |

## Arquitectura

<!-- TODO: completar la sección de arquitectura (diagrama, flujo de datos, decisiones de diseño). -->

## Capturas

<!-- TODO: agregar screenshots del dashboard, módulos de cheques/FX y reportes. -->
